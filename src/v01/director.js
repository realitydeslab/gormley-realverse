// Behaviour: wander, walk to clicked targets, pause in a Gormley posture, and
// (in auto mode) keep mutating the construction language by itself.
import * as THREE from 'three/webgpu';
import { POSES, poseParams, walkParams, lerpParams, zeroParams } from './body.js';

const HOLD_POSES = [ 'swerve', 'crouch', 'kneel', 'sit', 'lie', 'fetal', 'reach', 'stand' ];
const WALK_SPEED = 0.62; // m/s
const STRIDE = 1.3; // m per full gait cycle
const ROOM = 4.5; // wander radius (m)

const smooth = ( x ) => x * x * ( 3 - 2 * x );

export class Director {

	constructor() {

		this.pos = new THREE.Vector2( 0, 0 );
		this.heading = 0;
		this.phase = 0;
		this.target = new THREE.Vector2( 1.5, 1.5 );
		this.mode = 'walk'; // walk | hold
		this.poseName = 'stand';
		this.hold = 0; // 0 walking, 1 fully in posture
		this.holdTimer = 0;
		this.auto = true;
		this.mutateTimer = 14;
		this.params = zeroParams();
		this.onMutate = null;

	}

	get label() {

		return this.mode === 'walk' || this.hold < 0.5 ? 'WALKING' : POSES[ this.poseName ].label;

	}

	walkTo( x, z ) {

		this.target.set( x, z );
		this.mode = 'walk';

	}

	strike( name ) {

		if ( name === 'walk' ) {

			this.pickTarget();
			this.mode = 'walk';
			return;

		}

		this.poseName = name;
		this.mode = 'hold';
		this.holdTimer = 10 + Math.random() * 6;

	}

	pickTarget() {

		const a = Math.random() * Math.PI * 2;
		const r = 1 + Math.random() * ROOM;
		this.target.set( Math.cos( a ) * r, Math.sin( a ) * r );

	}

	update( dt ) {

		// posture blend eases in/out over ~1.6 s
		const goal = this.mode === 'hold' ? 1 : 0;
		this.hold += THREE.MathUtils.clamp( goal - this.hold, - dt / 1.6, dt / 1.6 );
		const moving = 1 - smooth( this.hold );

		if ( this.mode === 'walk' ) {

			const to = this.target.clone().sub( this.pos );
			const dist = to.length();
			if ( dist < 0.25 ) {

				if ( this.auto && Math.random() < 0.6 ) this.strike( HOLD_POSES[ Math.floor( Math.random() * HOLD_POSES.length ) ] );
				else this.pickTarget();

			} else {

				// heading 0 faces +z; turn toward the target at a bounded rate
				const want = Math.atan2( to.x, to.y );
				let dh = want - this.heading;
				dh = Math.atan2( Math.sin( dh ), Math.cos( dh ) );
				this.heading += THREE.MathUtils.clamp( dh, - 1.2 * dt, 1.2 * dt );

			}

		} else if ( this.auto ) {

			this.holdTimer -= dt;
			if ( this.holdTimer <= 0 ) this.strike( 'walk' );

		}

		const speed = WALK_SPEED * moving;
		this.pos.x += Math.sin( this.heading ) * speed * dt;
		this.pos.y += Math.cos( this.heading ) * speed * dt;
		this.phase += ( speed / STRIDE ) * Math.PI * 2 * dt;

		const walk = walkParams( this.phase, Math.min( 1, moving * 1.2 ) );
		const posture = poseParams( this.poseName );
		lerpParams( walk, posture, smooth( this.hold ), this.params );
		this.params.spine += 0.015 * Math.sin( performance.now() * 0.0011 ); // breath

		if ( this.auto ) {

			this.mutateTimer -= dt;
			if ( this.mutateTimer <= 0 ) {

				this.mutateTimer = 16 + Math.random() * 10;
				if ( this.onMutate ) this.onMutate();

			}

		}

	}

}
