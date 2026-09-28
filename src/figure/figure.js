// The body: Mixamo X Bot (realistic proportions, mocap idle/walk) driven by
// locomotion + Gormley postures. Exposes the skinned meshes for GPU voxelization.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { POSTURES, NEUTRAL } from './postures.js';

const AXES = { x: new THREE.Vector3( 1, 0, 0 ), y: new THREE.Vector3( 0, 1, 0 ), z: new THREE.Vector3( 0, 0, 1 ) };

// approximate flesh radius around joints, for grounding the lowest point on the floor
const GROUND_PROBES = [
	[ 'LeftToe_End', 0.02 ], [ 'RightToe_End', 0.02 ], [ 'LeftToeBase', 0.03 ], [ 'RightToeBase', 0.03 ],
	[ 'LeftFoot', 0.05 ], [ 'RightFoot', 0.05 ], [ 'LeftLeg', 0.06 ], [ 'RightLeg', 0.06 ],
	[ 'LeftUpLeg', 0.09 ], [ 'RightUpLeg', 0.09 ], [ 'Hips', 0.11 ], [ 'Spine1', 0.13 ], [ 'Spine2', 0.14 ],
	[ 'Neck', 0.06 ], [ 'Head', 0.1 ], [ 'HeadTop_End', 0.03 ], [ 'LeftShoulder', 0.08 ], [ 'RightShoulder', 0.08 ],
	[ 'LeftForeArm', 0.05 ], [ 'RightForeArm', 0.05 ], [ 'LeftHand', 0.04 ], [ 'RightHand', 0.04 ],
	[ 'LeftHandMiddle4', 0.015 ], [ 'RightHandMiddle4', 0.015 ],
];

export class Figure {

	static async load( url ) {

		const gltf = await new GLTFLoader().loadAsync( url );
		return new Figure( gltf );

	}

	constructor( gltf ) {

		this.group = new THREE.Group(); // world placement: position on floor + heading
		this.model = gltf.scene;
		this.group.add( this.model );
		this.meshes = [];
		this.model.traverse( ( o ) => {

			if ( o.isSkinnedMesh ) {

				o.frustumCulled = false;
				o.castShadow = true;
				o.receiveShadow = true;
				this.meshes.push( o );

			}

		} );
		// Beta_Surface first (the body), Beta_Joints second
		this.meshes.sort( ( a, b ) => ( a.name.includes( 'Surface' ) ? - 1 : 1 ) - ( b.name.includes( 'Surface' ) ? - 1 : 1 ) );
		this.skeleton = this.meshes[ 0 ].skeleton;
		this.bones = {};
		for ( const b of this.skeleton.bones ) this.bones[ b.name.replace( /^mixamorig:?/, '' ) ] = b;
		this.gormleyProportions();

		this.mixer = new THREE.AnimationMixer( this.model );
		const clip = ( n ) => gltf.animations.find( ( a ) => a.name === n );
		this.idle = this.mixer.clipAction( clip( 'idle' ) ).play();
		this.walk = this.mixer.clipAction( clip( 'walk' ) ).play();
		this.walk.timeScale = 0.8;
		this.walk.setEffectiveWeight( 0 );

		this.postureQuats = this.bakePostures();
		this.walkSpeed = this.measureWalkSpeed( clip( 'walk' ) ) * this.walk.timeScale;
		this.poseWeight = 0;
		this.posture = 'stand';
		this.center = new THREE.Vector3();
		this.bounds = new THREE.Box3();

	}

	bone( name ) {

		return this.bones[ name ];

	}

	/**
	 * X Bot is a broad-hipped mannequin; Gormley's casts are of a slim, straight male body.
	 * Reshape the bind-pose geometry once (before any GPU/CPU analysis reads it):
	 * narrower pelvis, thighs drawn toward the midline, smaller head.
	 */
	gormleyProportions() {

		const mesh = this.meshes[ 0 ];
		const at = ( name ) => {

			const i = this.skeleton.bones.findIndex( ( b ) => b.name.replace( /^mixamorig:?/, '' ) === name );
			return new THREE.Vector3().applyMatrix4( new THREE.Matrix4().copy( mesh.skeleton.boneInverses[ i ] ).invert() );

		};

		const knee = at( 'LeftLeg' ).y, hip = at( 'LeftUpLeg' ).y, waist = at( 'Spine1' ).y;
		const head = at( 'Head' ), headTop = at( 'HeadTop_End' );
		const smooth = ( a, b, x ) => {

			const t = Math.min( Math.max( ( x - a ) / ( b - a ), 0 ), 1 );
			return t * t * ( 3 - 2 * t );

		};

		for ( const m of this.meshes ) {

			const P = m.geometry.attributes.position;
			for ( let i = 0; i < P.count; i ++ ) {

				let x = P.getX( i ), y = P.getY( i ), z = P.getZ( i );
				// pelvis/thigh band: squeeze toward the midline, strongest at the hip joints
				const band = smooth( knee, hip, y ) * ( 1 - smooth( waist, waist + 0.12, y ) );
				x *= 1 - 0.13 * band;
				z *= 1 - 0.05 * band;
				// head: 8 % smaller around its centre
				if ( y > head.y - 0.02 ) {

					const c = head.clone().lerp( headTop, 0.4 );
					const k = 0.92 * smooth( head.y - 0.02, head.y + 0.04, y ) + ( 1 - smooth( head.y - 0.02, head.y + 0.04, y ) );
					x = c.x + ( x - c.x ) * k;
					y = c.y + ( y - c.y ) * k;
					z = c.z + ( z - c.z ) * k;

				}

				P.setXYZ( i, x, y, z );

			}

			P.needsUpdate = true;
			m.geometry.computeVertexNormals();
			m.geometry.computeBoundingSphere();

		}

	}

	/**
	 * Frame of the "torso filler": X Bot has a pinched mannequin waist, Gormley's own body
	 * (the source of all his casts) has a straight torso. Returns world->local and the length.
	 * @param {THREE.Vector3[]} j joint positions [hips, chest, leftHip, rightHip] in any common space
	 */
	static torsoFrame( [ hips, chest, lHip, rHip ], out = new THREE.Matrix4() ) {

		const y = chest.clone().sub( hips );
		const len = y.length();
		y.normalize();
		const x = lHip.clone().sub( rHip );
		x.addScaledVector( y, - x.dot( y ) ).normalize();
		const z = new THREE.Vector3().crossVectors( x, y );
		out.makeBasis( x, y, z ).setPosition( hips ).invert();
		return len;

	}

	torsoJointsWorld() {

		return [ 'Hips', 'Spine2', 'LeftUpLeg', 'RightUpLeg' ].map( ( n ) => this.bone( n ).getWorldPosition( new THREE.Vector3() ) );

	}

	// Mixamo bones have arbitrary local axes; rotate about the figure's own axes instead.
	rotateInFigureFrame( bone, axis, deg ) {

		const parentQ = bone.parent.getWorldQuaternion( new THREE.Quaternion() );
		const modelQ = this.model.getWorldQuaternion( new THREE.Quaternion() );
		const worldAxis = AXES[ axis ].clone().applyQuaternion( modelQ );
		const delta = new THREE.Quaternion().setFromAxisAngle( worldAxis, THREE.MathUtils.degToRad( deg ) );
		bone.quaternion.premultiply( parentQ.clone().invert().multiply( delta ).multiply( parentQ ) );
		bone.updateMatrixWorld( true );

	}

	// Sample the idle pose, apply each posture's rotations, store the resulting local quaternions.
	bakePostures() {

		this.mixer.update( 0 );
		this.model.updateMatrixWorld( true );
		const bones = this.skeleton.bones;
		const base = bones.map( ( b ) => b.quaternion.clone() );
		const baked = {};
		for ( const [ name, def ] of Object.entries( POSTURES ) ) {

			bones.forEach( ( b, i ) => b.quaternion.copy( base[ i ] ) );
			this.model.updateMatrixWorld( true );
			for ( const [ suffix, axis, deg ] of [ ...NEUTRAL, ...def.rot ] ) {

				if ( suffix.endsWith( '*' ) ) {

					const s = suffix.slice( 0, - 1 );
					this.rotateInFigureFrame( this.bone( 'Left' + s ), axis, deg );
					this.rotateInFigureFrame( this.bone( 'Right' + s ), axis, axis === 'x' ? deg : - deg );

				} else {

					this.rotateInFigureFrame( this.bone( suffix ), axis, deg );

				}

			}

			baked[ name ] = bones.map( ( b ) => b.quaternion.clone() );

		}

		bones.forEach( ( b, i ) => b.quaternion.copy( base[ i ] ) );
		return baked;

	}

	// The walk clip is in place: stride = how far a foot travels relative to the hips.
	measureWalkSpeed( clip ) {

		const action = this.walk;
		const foot = this.bone( 'LeftFoot' );
		action.setEffectiveWeight( 1 );
		this.idle.setEffectiveWeight( 0 );
		let min = Infinity, max = - Infinity;
		const p = new THREE.Vector3();
		for ( let i = 0; i <= 40; i ++ ) {

			action.time = ( i / 40 ) * clip.duration;
			this.mixer.update( 0 );
			this.model.updateMatrixWorld( true );
			foot.getWorldPosition( p );
			min = Math.min( min, p.z );
			max = Math.max( max, p.z );

		}

		action.setEffectiveWeight( 0 );
		this.idle.setEffectiveWeight( 1 );
		action.time = 0;
		// one cycle = two steps; foot sweeps (max-min) per step while planted
		return ( 2 * ( max - min ) ) / clip.duration;

	}

	/**
	 * @param {number} dt
	 * @param {number} moving 0..1 walk blend
	 * @param {number} hold 0..1 posture blend
	 * @param {string} posture key of POSTURES
	 */
	update( dt, moving, hold, posture ) {

		this.walk.setEffectiveWeight( moving );
		this.idle.setEffectiveWeight( 1 - moving );
		this.mixer.update( dt );

		if ( hold > 0 ) {

			const target = this.postureQuats[ posture ];
			this.skeleton.bones.forEach( ( b, i ) => b.quaternion.slerp( target[ i ], hold ) );

		}

		// keep the hips over the group origin (the clip drifts slightly) and ground the body
		const hips = this.bone( 'Hips' );
		hips.position.x = 0;
		hips.position.z = THREE.MathUtils.lerp( hips.position.z, 0, hold );
		this.model.position.y = 0;
		this.group.updateMatrixWorld( true );
		let minY = Infinity;
		const p = new THREE.Vector3();
		this.bounds.makeEmpty();
		for ( const [ name, r ] of GROUND_PROBES ) {

			const b = this.bone( name );
			if ( ! b ) continue;
			b.getWorldPosition( p );
			minY = Math.min( minY, p.y - r );
			this.bounds.expandByPoint( p );

		}

		this.model.position.y = - minY / this.group.scale.y; // minY is in world units; the model sits inside the scaled group
		this.group.updateMatrixWorld( true );
		this.bounds.min.y -= minY;
		this.bounds.max.y -= minY;
		this.bounds.expandByScalar( 0.12 );
		this.bounds.getCenter( this.center );
		for ( const m of this.meshes ) m.skeleton.update();

	}

}
