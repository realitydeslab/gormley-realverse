// Procedural body: an FK skeleton whose bones become capsules.
// The capsule list feeds both the GPU SDF (sdf.js) and the CPU raycast below.
import * as THREE from 'three/webgpu';

// Postures taken from the works in INEXTRICABLE (angles in radians).
// flex = forward rotation, abd = outward rotation, knee/elbow = bend.
export const POSES = {
	stand: { label: 'STAND' },
	swerve: { label: 'SWERVE', roll: 0.05, side: 0.12, head: 0.25, lHipAbd: 0.1, rKnee: 0.2, rHip: 0.12, lSh: 0.05, rSh: -0.1 },
	crouch: { label: 'COTCH', hip: 2.15, knee: 2.35, spine: 0.75, head: 0.45, sh: 0.95, elbow: 1.5, shAbd: 0.25 },
	kneel: { label: 'STAY', hip: 0.2, knee: 1.6, spine: 0.95, head: 0.6, sh: 0.55, elbow: 0.35, ankle: -1.5 },
	sit: { label: 'SLUMP', hip: 1.45, knee: 0.15, spine: 0.55, head: 0.45, sh: 0.35, elbow: 0.45, shAbd: 0.12 },
	lie: { label: 'LIE', pitch: -1.5708, knee: 0.12, hip: 0.08, shAbd: 0.12, head: -0.1 },
	fetal: { label: 'HOLD', roll: 1.5708, hip: 1.65, knee: 1.95, spine: 0.7, head: 0.55, sh: 1.25, elbow: 1.7 },
	reach: { label: 'PLUCK', sh: 2.95, shAbd: 0.12, elbow: 0.08, head: -0.35, spine: -0.12 },
};

const PARAM_KEYS = [ 'pitch', 'roll', 'spine', 'side', 'twist', 'head',
	'hip', 'knee', 'lHip', 'rHip', 'lKnee', 'rKnee', 'lHipAbd', 'ankle',
	'sh', 'shAbd', 'elbow', 'lSh', 'rSh', 'lElbow', 'rElbow' ];

export function zeroParams() {

	const p = {};
	for ( const k of PARAM_KEYS ) p[ k ] = 0;
	return p;

}

export function poseParams( name ) {

	return { ...zeroParams(), ...POSES[ name ], label: undefined };

}

// Walk cycle at phase phi; amp scales the stride.
export function walkParams( phi, amp ) {

	const p = zeroParams();
	const s = Math.sin( phi );
	p.lHip = 0.42 * s * amp;
	p.rHip = - 0.42 * s * amp;
	p.lKnee = ( 0.08 + 0.62 * Math.max( 0, Math.cos( phi - 0.35 ) ) ** 1.5 ) * amp; // peak just after mid-swing
	p.rKnee = ( 0.08 + 0.62 * Math.max( 0, - Math.cos( phi - 0.35 ) ) ** 1.5 ) * amp;
	p.lSh = - 0.32 * s * amp;
	p.rSh = 0.32 * s * amp;
	p.elbow = 0.25 * amp;
	p.shAbd = 0.06;
	p.twist = 0.1 * s * amp;
	p.roll = 0.03 * Math.cos( 2 * phi ) * amp;
	p.spine = 0.06 * amp;
	p.head = 0.05;
	return p;

}

export function lerpParams( a, b, t, out = zeroParams() ) {

	for ( const k of PARAM_KEYS ) out[ k ] = a[ k ] + ( b[ k ] - a[ k ] ) * t;
	return out;

}

function joint( parent, x, y, z ) {

	const o = new THREE.Object3D();
	o.position.set( x, y, z );
	parent.add( o );
	return o;

}

export class Body {

	constructor() {

		// root: world placement (position + heading). pelvis: posture pitch/roll.
		this.root = new THREE.Object3D();
		const j = this.j = {};
		j.pelvis = joint( this.root, 0, 1.0, 0 );
		j.chest = joint( j.pelvis, 0, 0.26, 0 );
		j.sternum = joint( j.chest, 0, 0.15, 0 );
		j.neck = joint( j.sternum, 0, 0.12, 0 );
		j.head = joint( j.neck, 0, 0.13, 0.02 );
		for ( const [ side, sx ] of [ [ 'l', 1 ], [ 'r', - 1 ] ] ) {

			j[ side + 'Sh' ] = joint( j.sternum, 0.18 * sx, 0.07, 0 );
			j[ side + 'El' ] = joint( j[ side + 'Sh' ], 0, - 0.29, 0 );
			j[ side + 'Wr' ] = joint( j[ side + 'El' ], 0, - 0.26, 0 );
			j[ side + 'Hd' ] = joint( j[ side + 'Wr' ], 0, - 0.17, 0 );
			j[ side + 'Hip' ] = joint( j.pelvis, 0.095 * sx, - 0.06, 0 );
			j[ side + 'Kn' ] = joint( j[ side + 'Hip' ], 0, - 0.44, 0 );
			j[ side + 'An' ] = joint( j[ side + 'Kn' ], 0, - 0.42, 0 );
			j[ side + 'Toe' ] = joint( j[ side + 'An' ], 0, - 0.05, 0.16 );

		}

		// [from, to, radius]; a sphere is a capsule with from === to.
		this.bones = [
			[ 'pelvis', 'chest', 0.125 ], [ 'chest', 'sternum', 0.14 ], [ 'lSh', 'rSh', 0.065 ],
			[ 'sternum', 'neck', 0.055 ], [ 'head', 'head', 0.105 ], [ 'lHip', 'rHip', 0.11 ],
			[ 'lHip', 'lKn', 0.078 ], [ 'rHip', 'rKn', 0.078 ], [ 'lKn', 'lAn', 0.054 ], [ 'rKn', 'rAn', 0.054 ],
			[ 'lAn', 'lToe', 0.042 ], [ 'rAn', 'rToe', 0.042 ], [ 'lSh', 'lEl', 0.05 ], [ 'rSh', 'rEl', 0.05 ],
			[ 'lEl', 'lWr', 0.04 ], [ 'rEl', 'rWr', 0.04 ], [ 'lWr', 'lHd', 0.033 ], [ 'rWr', 'rHd', 0.033 ],
		];
		this.count = this.bones.length;
		this.a = Array.from( { length: this.count }, () => new THREE.Vector4() );
		this.b = Array.from( { length: this.count }, () => new THREE.Vector4() );
		this._v = new THREE.Vector3();
		this.center = new THREE.Vector3();

	}

	// Applies posture params, places the lowest point on the floor, fills capsules.
	update( p, x, z, heading ) {

		const j = this.j;
		this.root.position.set( x, 0, z );
		this.root.rotation.set( 0, heading, 0 );
		j.pelvis.position.y = 1.0;
		j.pelvis.rotation.set( p.pitch, 0, p.roll, 'YXZ' );
		j.chest.rotation.set( p.spine * 0.5, p.twist, p.side );
		j.sternum.rotation.set( p.spine * 0.5, p.twist * 0.5, 0 );
		j.neck.rotation.set( p.head, 0, 0 );
		for ( const [ s, sx ] of [ [ 'l', 1 ], [ 'r', - 1 ] ] ) {

			const hip = p.hip + p[ s + 'Hip' ];
			const knee = p.knee + p[ s + 'Knee' ];
			j[ s + 'Hip' ].rotation.set( - hip, 0, s === 'l' ? p.lHipAbd : 0 );
			j[ s + 'Kn' ].rotation.set( knee, 0, 0 );
			j[ s + 'An' ].rotation.set( hip - knee + p.ankle, 0, 0 ); // keeps feet level
			j[ s + 'Sh' ].rotation.set( - ( p.sh + p[ s + 'Sh' ] ), 0, p.shAbd * sx );
			j[ s + 'El' ].rotation.set( - ( p.elbow + p[ s + 'Elbow' ] ), 0, 0 );

		}

		this.root.updateMatrixWorld( true );
		let minY = Infinity;
		const pos = {};
		for ( const name in j ) {

			pos[ name ] = j[ name ].getWorldPosition( new THREE.Vector3() );

		}

		this.bones.forEach( ( [ f, t, r ], i ) => {

			this.a[ i ].set( pos[ f ].x, pos[ f ].y, pos[ f ].z, r );
			this.b[ i ].set( pos[ t ].x, pos[ t ].y, pos[ t ].z, 0 );
			minY = Math.min( minY, pos[ f ].y - r, pos[ t ].y - r );

		} );

		for ( let i = 0; i < this.count; i ++ ) {

			this.a[ i ].y -= minY;
			this.b[ i ].y -= minY;

		}

		this.floorOffset = minY;
		this.center.copy( pos.chest ).setY( pos.chest.y - minY );

	}

	// CPU mirror of the GPU SDF (plain min; used only for picking).
	sdf( p ) {

		let d = Infinity;
		const pa = new THREE.Vector3(), ba = new THREE.Vector3();
		for ( let i = 0; i < this.count; i ++ ) {

			const a = this.a[ i ], b = this.b[ i ];
			pa.set( p.x - a.x, p.y - a.y, p.z - a.z );
			ba.set( b.x - a.x, b.y - a.y, b.z - a.z );
			const h = THREE.MathUtils.clamp( pa.dot( ba ) / Math.max( ba.dot( ba ), 1e-6 ), 0, 1 );
			d = Math.min( d, pa.sub( ba.multiplyScalar( h ) ).length() - a.w );

		}

		return d - 0.012; // matches the GPU inflate in sdf.js

	}

	raycast( ray, maxDist = 30 ) {

		let t = 0;
		const p = new THREE.Vector3();
		for ( let i = 0; i < 128 && t < maxDist; i ++ ) {

			ray.at( t, p );
			const d = this.sdf( p );
			if ( d < 0.004 ) return p.clone();
			t += d;

		}

		return null;

	}

}
