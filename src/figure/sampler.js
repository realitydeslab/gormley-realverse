// CPU-side view of the posed body: a subsample of skinned vertices, each tagged with
// its limb group. Used by styles that reason about the body as a few masses (boxes).
import * as THREE from 'three/webgpu';

const GROUPS = [ 'head', 'torso', 'armL', 'armR', 'legL', 'legR' ];

function groupOf( boneName ) {

	const n = boneName.replace( /^mixamorig:?/, '' );
	if ( /Head|Neck|Eye/.test( n ) ) return 0;
	if ( /^Left(Arm|ForeArm|Hand)/.test( n ) ) return 2;
	if ( /^Right(Arm|ForeArm|Hand)/.test( n ) ) return 3;
	if ( /^Left(UpLeg|Leg|Foot|Toe)/.test( n ) ) return 4;
	if ( /^Right(UpLeg|Leg|Foot|Toe)/.test( n ) ) return 5;
	return 1; // hips, spine, shoulders

}

export class BodySampler {

	constructor( figure, stride = 6 ) {

		this.figure = figure;
		this.items = []; // { mesh, index, group }
		for ( const mesh of figure.meshes ) {

			const g = mesh.geometry;
			const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
			const bones = mesh.skeleton.bones;
			for ( let i = 0; i < g.attributes.position.count; i += stride ) {

				let best = 0;
				for ( let k = 1; k < 4; k ++ ) if ( sw.getComponent( i, k ) > sw.getComponent( i, best ) ) best = k;
				this.items.push( { mesh, index: i, group: groupOf( bones[ si.getComponent( i, best ) ].name ) } );

			}

		}

		this.count = this.items.length;
		this.world = new Float32Array( this.count * 3 ); // posed, world space
		this.local = new Float32Array( this.count * 3 ); // posed, figure frame (heading removed)
		this.groups = new Uint8Array( this.items.map( ( it ) => it.group ) );
		this.frame = - 1;

	}

	static get GROUPS() {

		return GROUPS;

	}

	/** Skins the subsample on the CPU (once per frame, shared by all styles). */
	update( frameId ) {

		if ( frameId === this.frame ) return;
		this.frame = frameId;
		const v = new THREE.Vector3();
		const inv = new THREE.Matrix4().copy( this.figure.group.matrixWorld ).invert();
		for ( const m of this.figure.meshes ) m.updateMatrixWorld();
		this.items.forEach( ( it, i ) => {

			v.fromBufferAttribute( it.mesh.geometry.attributes.position, it.index );
			it.mesh.applyBoneTransform( it.index, v );
			v.applyMatrix4( it.mesh.matrixWorld );
			this.world.set( [ v.x, v.y, v.z ], i * 3 );
			v.applyMatrix4( inv );
			this.local.set( [ v.x, v.y, v.z ], i * 3 );

		} );

	}

}
