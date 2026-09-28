// Behaviour: wander, walk to clicked targets, pause in a Gormley posture, and
// (in auto mode) keep mutating the construction language by itself.
import * as THREE from 'three/webgpu';
import { POSTURE_ORDER } from './figure/postures.js';

const ROOM = 4.2; // wander radius (m)
const smooth = ( x ) => x * x * ( 3 - 2 * x );

export class Director {

	constructor( figure ) {

		this.figure = figure;
		this.pos = new THREE.Vector2( 0, 0 );
		this.heading = 0;
		this.target = new THREE.Vector2( 0, 0 );
		this.mode = 'hold'; // walk | hold
		this.posture = 'stand';
		this.hold = 1; // 0 walking, 1 fully in posture
		this.holdTimer = 9;
		this.auto = true;
		this.mutateTimer = 20;
		this.onMutate = null;
		this.moving = 0;

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

		this.posture = name;
		this.mode = 'hold';
		this.holdTimer = 9 + Math.random() * 7;

	}

	pickTarget() {

		const a = Math.random() * Math.PI * 2;
		const r = 1 + Math.random() * ROOM;
		this.target.set( Math.cos( a ) * r, Math.sin( a ) * r );

	}

	update( dt ) {

		// posture blend eases over ~1.4 s; a new posture is only entered from walking/standing
		const goal = this.mode === 'hold' ? 1 : 0;
		this.hold = THREE.MathUtils.clamp( this.hold + Math.sign( goal - this.hold ) * dt / 1.4, 0, 1 );

		if ( this.mode === 'walk' ) {

			const to = this.target.clone().sub( this.pos );
			if ( to.length() < 0.3 ) {

				if ( this.auto && Math.random() < 0.65 ) this.strike( POSTURE_ORDER[ Math.floor( Math.random() * POSTURE_ORDER.length ) ] );
				else this.pickTarget();

			} else if ( this.hold < 0.05 ) {

				// heading 0 faces +z; turn toward the target at a bounded rate
				let dh = Math.atan2( to.x, to.y ) - this.heading;
				dh = Math.atan2( Math.sin( dh ), Math.cos( dh ) );
				this.heading += THREE.MathUtils.clamp( dh, - 1.1 * dt, 1.1 * dt );

			}

		} else if ( this.auto ) {

			this.holdTimer -= dt;
			if ( this.holdTimer <= 0 ) this.strike( 'walk' );

		}

		const wantMove = this.mode === 'walk' && this.hold < 0.05 ? 1 : 0;
		this.moving = THREE.MathUtils.clamp( this.moving + Math.sign( wantMove - this.moving ) * dt / 0.6, 0, 1 );
		const speed = this.figure.walkSpeed * this.moving * this.figure.group.scale.x;
		this.pos.x += Math.sin( this.heading ) * speed * dt;
		this.pos.y += Math.cos( this.heading ) * speed * dt;

		this.figure.group.position.set( this.pos.x, 0, this.pos.y );
		this.figure.group.rotation.y = this.heading;
		this.figure.update( dt, smooth( this.moving ), smooth( this.hold ), this.posture );

		if ( this.auto ) {

			this.mutateTimer -= dt;
			if ( this.mutateTimer <= 0 ) {

				this.mutateTimer = 18 + Math.random() * 10;
				if ( this.onMutate ) this.onMutate();

			}

		}

	}

}
