// Room-scale series that are not built from the body. They are shown as the space the
// walking figure moves through, paired with a companion body style (def.companion).
//   coordinate — Co-ordinate Works: three lines along the room axes crossing at the figure's heart
//   run        — Run: large orthogonal loops of steel standing in the room (world-fixed)
//   trail      — Natural Selection: a line of small cast objects laid along the figure's path
//   room       — Room Series (interpretation): a square traced on the floor around the figure
import * as THREE from 'three/webgpu';
import { Style } from './common.js';
import { finishMaterial } from '../materials.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

function rand( i, salt ) {

	const x = Math.sin( i * 127.1 + salt * 311.7 ) * 43758.5453;
	return x - Math.floor( x );

}

export class EnvWorks extends Style {

	constructor( ctx, def ) {

		super( ctx, def );
		this.mode = def.params.mode;
		this.max = 2000;
		this.mesh = new THREE.InstancedMesh( new THREE.BoxGeometry( 1, 1, 1 ), finishMaterial( def.finish ), this.max );
		this.mesh.castShadow = this.mesh.receiveShadow = true;
		this.mesh.frustumCulled = false;
		this.objects.push( this.mesh );
		this.trail = [];
		if ( this.mode === 'run' ) this.buildRun();

	}

	// Run: ~24 rectangular loops of square tube, world-fixed, between 1.5 m and 3 m high
	buildRun() {

		this.bars = [];
		const t = 0.05;
		for ( let i = 0; i < 26; i ++ ) {

			const cx = ( rand( i, 1 ) - 0.5 ) * 9, cz = ( rand( i, 2 ) - 0.5 ) * 9;
			const w = 1.2 + rand( i, 3 ) * 2.4, h = 1.5 + rand( i, 4 ) * 1.6;
			const alongX = rand( i, 5 ) < 0.5;
			const y0 = rand( i, 6 ) < 0.3 ? 0.4 + rand( i, 7 ) * 0.8 : 0;
			const a = ( x, y ) => ( alongX ? [ cx + x, y, cz ] : [ cx, y, cz + x ] );
			const pts = [ a( - w / 2, y0 ), a( w / 2, y0 ), a( w / 2, y0 + h ), a( - w / 2, y0 + h ) ];
			for ( let k = 0; k < 4; k ++ ) this.bars.push( [ pts[ k ], pts[ ( k + 1 ) % 4 ], t ] );

		}

	}

	bar( n, a, b, t, g ) {

		const A = new THREE.Vector3( ...a ), B = new THREE.Vector3( ...b );
		_p.addVectors( A, B ).multiplyScalar( 0.5 );
		const d = B.clone().sub( A );
		const len = d.length();
		_q.setFromUnitVectors( new THREE.Vector3( 1, 0, 0 ), d.normalize() );
		_s.set( ( len + t ) * g, t * g, t * g );
		_m.compose( _p, _q, _s );
		this.mesh.setMatrixAt( n, _m );

	}

	update() {

		const fig = this.ctx.figure;
		const c = fig.bone( 'Spine2' ).getWorldPosition( new THREE.Vector3() );
		const g = this.gainCPU( c.x, c.y, c.z );
		let n = 0;
		if ( this.mode === 'coordinate' ) {

			const t = 0.006;
			this.bar( n ++, [ c.x - 11, c.y, c.z ], [ c.x + 11, c.y, c.z ], t, g );
			this.bar( n ++, [ c.x, c.y, c.z - 11 ], [ c.x, c.y, c.z + 11 ], t, g );
			this.bar( n ++, [ c.x, 0, c.z ], [ c.x, 7, c.z ], t, g );

		} else if ( this.mode === 'run' ) {

			for ( const [ a, b, t ] of this.bars ) {

				const gg = this.gainCPU( ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2, ( a[ 2 ] + b[ 2 ] ) / 2 );
				if ( gg > 0.01 ) this.bar( n ++, a, b, t, gg );

			}

		} else if ( this.mode === 'trail' ) {

			// drop an object every 25 cm of walking; sizes shrink along the line like the 1981 row
			const f = fig.group.position;
			const last = this.trail[ this.trail.length - 1 ];
			if ( ! last || Math.hypot( f.x - last[ 0 ], f.z - last[ 2 ] ) > 0.25 ) this.trail.push( [ f.x, 0, f.z ] );
			if ( this.trail.length > 60 ) this.trail.shift();
			this.trail.forEach( ( q, i ) => {

				const k = i / this.trail.length;
				const s = 0.02 + 0.07 * k;
				const long = rand( i + this.trail.length, 9 ) < 0.4;
				_p.set( q[ 0 ], s / 2, q[ 2 ] );
				_q.setFromEuler( new THREE.Euler( 0, rand( i, 3 ) * 3, 0 ) );
				_s.set( long ? s * 3 : s, s, s );
				_m.compose( _p, _q, _s.multiplyScalar( this.gainCPU( q[ 0 ], 0.5, q[ 2 ] ) ) );
				this.mesh.setMatrixAt( n ++, _m );

			} );

		} else if ( this.mode === 'room' ) {

			const f = fig.group.position, r = 1.1, t = 0.03;
			const pts = [ [ - r, - r ], [ r, - r ], [ r, r ], [ - r, r ] ].map( ( [ x, z ] ) => [ f.x + x, t / 2, f.z + z ] );
			for ( let k = 0; k < 4; k ++ ) this.bar( n ++, pts[ k ], pts[ ( k + 1 ) % 4 ], t, g );

		}

		this.mesh.count = n;
		this.mesh.instanceMatrix.needsUpdate = true;

	}

}
