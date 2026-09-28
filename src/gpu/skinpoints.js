// Linear blend skinning on the GPU for arbitrary bind-space points (generated elements),
// using the body's own skeleton so they move exactly like the skin.
import * as THREE from 'three/webgpu';
import { Fn, vec4, uniform, instancedArray, storage, buffer, instanceIndex } from 'three/tsl';

export class SkinnedPoints {

	/**
	 * @param {import('../figure/figure.js').Figure} figure
	 * @param {{ pos: Float32Array, idx: Uint32Array, wts: Float32Array }} data bind-space points
	 */
	constructor( figure, data ) {

		const mesh = figure.meshes[ 0 ];
		this.mesh = mesh;
		this.count = data.pos.length / 3;
		const pos = storage( new THREE.StorageBufferAttribute( data.pos, 3 ), 'vec3', this.count ).toReadOnly();
		const si = storage( new THREE.StorageBufferAttribute( data.idx, 4 ), 'uvec4', this.count ).toReadOnly();
		const sw = storage( new THREE.StorageBufferAttribute( data.wts, 4 ), 'vec4', this.count ).toReadOnly();
		this.out = instancedArray( this.count, 'vec3' );
		const bones = buffer( mesh.skeleton.boneMatrices, 'mat4', mesh.skeleton.bones.length );
		const bind = uniform( mesh.bindMatrix, 'mat4' );
		const bindInv = uniform( mesh.bindMatrixInverse, 'mat4' );
		const world = uniform( mesh.matrixWorld, 'mat4' );

		this.kernel = Fn( () => {

			const i = instanceIndex;
			const b = bind.mul( vec4( pos.element( i ), 1 ) );
			const s = si.element( i ), w = sw.element( i );
			const skinned = bones.element( s.x ).mul( b ).mul( w.x )
				.add( bones.element( s.y ).mul( b ).mul( w.y ) )
				.add( bones.element( s.z ).mul( b ).mul( w.z ) )
				.add( bones.element( s.w ).mul( b ).mul( w.w ) );
			this.out.element( i ).assign( world.mul( bindInv.mul( skinned ) ).xyz );

		} )().compute( this.count );

	}

	/** world position of point i (TSL) */
	at( i ) {

		return this.out.element( i );

	}

}

/** Packs generated bind-space points with their skin weights. */
export function packPoints( bind, points ) {

	const n = points.length;
	const pos = new Float32Array( n * 3 ), idx = new Uint32Array( n * 4 ), wts = new Float32Array( n * 4 );
	points.forEach( ( p, i ) => {

		pos.set( p, i * 3 );
		const w = p.weights || bind.weightsAt( p[ 0 ], p[ 1 ], p[ 2 ] );
		idx.set( w.idx, i * 4 );
		wts.set( w.wts, i * 4 );

	} );
	return { pos, idx, wts };

}
