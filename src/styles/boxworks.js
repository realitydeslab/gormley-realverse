// BIG BLOCKWORKS / BUNKERS / OPEN BLOCKWORKS / FRAMERS.
// The body is reduced to a few masses: it is cut into courses along its long axis and every
// limb group in a course becomes one box (percentile bounds, so stray vertices don't inflate it).
// Boxes that overlap strongly are merged, as Gormley lets arm and torso fuse into one block.
import * as THREE from 'three/webgpu';
import { Style } from './common.js';
import { finishMaterial } from '../materials.js';

const rand = ( i, salt ) => {

	const x = Math.sin( i * 127.1 + salt * 311.7 ) * 43758.5453;
	return x - Math.floor( x );

};

function percentile( sorted, q ) {

	const i = Math.min( sorted.length - 1, Math.max( 0, Math.round( q * ( sorted.length - 1 ) ) ) );
	return sorted[ i ];

}

/**
 * @returns {Array<{min:number[], max:number[]}>} boxes in the figure frame
 */
export function decomposeBody( sampler, { course = [ 0.08, 0.22 ], q = 0.08, merge = 0.35, seed = 1, minHalf = 0.028, jitter = 0 } ) {

	const L = sampler.local, G = sampler.groups, n = sampler.count;
	// course axis = the figure-frame axis closest to the head-feet direction
	let hmin = [ Infinity, Infinity, Infinity ], hmax = [ - Infinity, - Infinity, - Infinity ];
	const head = [ 0, 0, 0 ], feet = [ 0, 0, 0 ];
	let nh = 0, nf = 0;
	for ( let i = 0; i < n; i ++ ) {

		for ( let k = 0; k < 3; k ++ ) {

			hmin[ k ] = Math.min( hmin[ k ], L[ i * 3 + k ] );
			hmax[ k ] = Math.max( hmax[ k ], L[ i * 3 + k ] );

		}

		const g = G[ i ];
		if ( g === 0 ) {

			nh ++;
			for ( let k = 0; k < 3; k ++ ) head[ k ] += L[ i * 3 + k ];

		} else if ( g >= 4 ) {

			nf ++;
			for ( let k = 0; k < 3; k ++ ) feet[ k ] += L[ i * 3 + k ];

		}

	}

	const axisVec = head.map( ( h, k ) => h / nh - feet[ k ] / nf );
	const A = [ 0, 1, 2 ].reduce( ( a, k ) => ( Math.abs( axisVec[ k ] ) > Math.abs( axisVec[ a ] ) ? k : a ), 1 );
	const B = ( A + 1 ) % 3, C = ( A + 2 ) % 3;

	// course boundaries: floor-anchored when upright, body-anchored when lying
	const start = A === 1 ? 0 : hmin[ A ];
	const bounds = [ start ];
	for ( let k = 0; bounds[ k ] < hmax[ A ]; k ++ ) bounds.push( bounds[ k ] + course[ 0 ] + ( course[ 1 ] - course[ 0 ] ) * rand( k, seed ) );

	const boxes = [];
	const buckets = new Map();
	for ( let i = 0; i < n; i ++ ) {

		const a = L[ i * 3 + A ];
		let c = 0;
		while ( c < bounds.length - 2 && a >= bounds[ c + 1 ] ) c ++;
		const key = c * 8 + G[ i ];
		if ( ! buckets.has( key ) ) buckets.set( key, [] );
		buckets.get( key ).push( i );

	}

	const perCourse = new Map();
	for ( const [ key, idx ] of buckets ) {

		if ( idx.length < 2 ) continue;
		const c = Math.floor( key / 8 );
		const box = { min: [ 0, 0, 0 ], max: [ 0, 0, 0 ], course: c };
		for ( const k of [ B, C ] ) {

			const vals = idx.map( ( i ) => L[ i * 3 + k ] ).sort( ( x, y ) => x - y );
			box.min[ k ] = percentile( vals, q );
			box.max[ k ] = percentile( vals, 1 - q );

		}

		// fill the whole course so blocks stack without gaps (clipped only at the body's ends)
		box.min[ A ] = Math.max( bounds[ c ], hmin[ A ] );
		box.max[ A ] = Math.min( bounds[ c + 1 ], hmax[ A ] );
		for ( const k of [ B, C ] ) {

			const mid = ( box.min[ k ] + box.max[ k ] ) / 2, half = Math.max( ( box.max[ k ] - box.min[ k ] ) / 2, minHalf );
			const j = ( rand( c * 7 + G[ idx[ 0 ] ], k + seed * 3 ) - 0.5 ) * jitter;
			box.min[ k ] = mid - half + j;
			box.max[ k ] = mid + half + j;

		}
		if ( ! perCourse.has( c ) ) perCourse.set( c, [] );
		perCourse.get( c ).push( box );

	}

	// merge boxes of one course whose cross-sections overlap strongly
	for ( const list of perCourse.values() ) {

		let merged = true;
		while ( merged ) {

			merged = false;
			outer: for ( let i = 0; i < list.length; i ++ ) for ( let j = i + 1; j < list.length; j ++ ) {

				const a = list[ i ], b = list[ j ];
				const ov = [ B, C ].map( ( k ) => Math.max( 0, Math.min( a.max[ k ], b.max[ k ] ) - Math.max( a.min[ k ], b.min[ k ] ) ) );
				const area = ( x ) => ( x.max[ B ] - x.min[ B ] ) * ( x.max[ C ] - x.min[ C ] );
				if ( ov[ 0 ] * ov[ 1 ] > merge * Math.min( area( a ), area( b ) ) ) {

					for ( let k = 0; k < 3; k ++ ) {

						a.min[ k ] = Math.min( a.min[ k ], b.min[ k ] );
						a.max[ k ] = Math.max( a.max[ k ], b.max[ k ] );

					}

					list.splice( j, 1 );
					merged = true;
					break outer;

				}

			}

		}

		boxes.push( ...list );

	}

	return { boxes, axis: A };

}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export class Boxworks extends Style {

	constructor( ctx, def ) {

		super( ctx, def );
		const p = this.p;
		p.mode ??= 'solid'; // solid | frame
		p.course ??= [ 0.08, 0.22 ];
		p.q ??= 0.08;
		p.merge ??= 0.35;
		p.inset ??= 0.004; // seam between stacked blocks (m)
		p.bar ??= 0.025; // frame bar section (m)
		p.extra ??= 0; // framers: additional jittered boxes per box
		p.aperture ??= false; // bunkers: dark square opening in the head block
		p.plates ??= 0; // open blockworks: fraction of faces closed by a plate
		p.minHalf ??= 0.028; // smallest half-width of a block (m)
		p.jitter ??= 0; // per-course sideways offset (m), breaks toy-like symmetry
		p.rotate ??= 0; // Cube Works / Cast Framers: random tilt of each box (radians, max)
		p.cube ??= false; // make every box a cube
		p.slabs ??= 0; // Slabworks: split each box into this many plates (0 = solid)
		p.double ??= false; // Double Blockworks: overlay a second decomposition
		p.extend ??= 0; // Extended Blockworks: number of long beams leaving the body
		p.extendLen ??= [ 0.4, 1.0 ];
		this.max = 600;
		const material = finishMaterial( def.finish );
		this.blocks = new THREE.InstancedMesh( new THREE.BoxGeometry( 1, 1, 1 ), material, this.max );
		this.bars = new THREE.InstancedMesh( new THREE.BoxGeometry( 1, 1, 1 ), material, this.max * 12 );
		const dark = new THREE.MeshStandardNodeMaterial( { color: 0x050505, roughness: 1 } );
		this.hole = new THREE.Mesh( new THREE.BoxGeometry( 1, 1, 1 ), dark );
		for ( const m of [ this.blocks, this.bars, this.hole ] ) {

			m.castShadow = m.receiveShadow = true;
			m.frustumCulled = false;
			this.objects.push( m );

		}

	}

	setActive( on ) {

		super.setActive( on );
		this.hole.visible = on && this.p.aperture;

	}

	// pieces in the figure frame: { c:[3], size:[3], rot:Quaternion }
	pieces() {

		const { sampler } = this.ctx;
		const p = this.p;
		const runs = [ p ];
		if ( p.double ) runs.push( { ...p, seed: 7, course: p.course.map( ( v ) => v * 1.35 ), jitter: p.jitter + 0.025 } );
		const out = [];
		let axis = 1;
		for ( const run of runs ) {

			const r = decomposeBody( sampler, run );
			axis = r.axis;
			r.boxes.forEach( ( b, i ) => {

				const list = [ b ];
				for ( let e = 0; e < p.extra; e ++ ) {

					// framers: wire boxes that drift off the body mass
					const s = 0.55 + 0.9 * rand( i * 3 + e, 7 );
					const c = [ 0, 1, 2 ].map( ( k ) => ( b.min[ k ] + b.max[ k ] ) / 2 + ( rand( i * 5 + e, k + 11 ) - 0.5 ) * 0.18 );
					const h = [ 0, 1, 2 ].map( ( k ) => ( b.max[ k ] - b.min[ k ] ) / 2 * ( k === axis ? 0.5 + rand( i, e + 3 ) : s ) );
					list.push( { min: c.map( ( v, k ) => v - h[ k ] ), max: c.map( ( v, k ) => v + h[ k ] ) } );

				}

				list.forEach( ( bb, j ) => {

					const id = i * 7 + j + ( run === p ? 0 : 5000 );
					const c = [ 0, 1, 2 ].map( ( k ) => ( bb.min[ k ] + bb.max[ k ] ) / 2 );
					let size = [ 0, 1, 2 ].map( ( k ) => Math.max( 0.005, bb.max[ k ] - bb.min[ k ] - p.inset ) );
					if ( p.cube ) {

						const e = Math.cbrt( size[ 0 ] * size[ 1 ] * size[ 2 ] ) * 1.05;
						size = [ e, e, e ];

					}

					const rot = new THREE.Quaternion();
					if ( p.rotate ) rot.setFromEuler( new THREE.Euler( ( rand( id, 31 ) - 0.5 ) * 2 * p.rotate, ( rand( id, 32 ) - 0.5 ) * 2 * p.rotate, ( rand( id, 33 ) - 0.5 ) * 2 * p.rotate ) );
					if ( p.slabs > 0 ) {

						// plates stacked across the thinnest horizontal axis, each slightly offset
						const k = [ 0, 2 ].reduce( ( a, x ) => ( size[ x ] < size[ a ] ? x : a ), 0 );
						const n = p.slabs;
						for ( let t = 0; t < n; t ++ ) {

							const cc = c.slice(), sz = size.slice();
							sz[ k ] = size[ k ] / n * 0.82;
							cc[ k ] += ( ( t + 0.5 ) / n - 0.5 ) * size[ k ];
							const k2 = k === 0 ? 2 : 0;
							cc[ k2 ] += ( rand( id * 3 + t, 41 ) - 0.5 ) * size[ k2 ] * 0.35;
							sz[ axis ] *= 0.75 + 0.3 * rand( id * 3 + t, 42 );
							out.push( { c: cc, size: sz, rot } );

						}

					} else out.push( { c, size, rot } );

				} );

			} );

		}

		// Extended Blockworks / Memes: long beams leaving the body horizontally
		for ( let e = 0; e < p.extend && out.length; e ++ ) {

			const src = out[ Math.floor( rand( e, 51 ) * out.length ) ];
			const dir = [ 0, 2 ][ Math.floor( rand( e, 52 ) * 2 ) ], sgn = rand( e, 53 ) < 0.5 ? - 1 : 1;
			const L = p.extendLen[ 0 ] + rand( e, 54 ) * ( p.extendLen[ 1 ] - p.extendLen[ 0 ] );
			const c = src.c.slice(), size = [ 0.05, 0.05, 0.05 ];
			size[ dir ] = L;
			c[ dir ] += sgn * L / 2;
			out.push( { c, size, rot: new THREE.Quaternion() } );

		}

		return { list: out, axis };

	}

	update() {

		const { sampler, figure } = this.ctx;
		sampler.update( this.ctx.frameId );
		const p = this.p;
		const { list, axis } = this.pieces();
		const toWorld = figure.group.matrixWorld;
		const frameQ = new THREE.Quaternion().setFromRotationMatrix( toWorld );
		const q = new THREE.Quaternion(), off = new THREE.Vector3();
		let nb = 0, ne = 0;
		let headBox = null;
		for ( const { c, size, rot } of list ) {

			_p.fromArray( c ).applyMatrix4( toWorld );
			const g = this.gainCPU( _p.x, _p.y, _p.z );
			if ( g < 0.01 ) continue;
			if ( ! headBox || c[ axis ] > headBox.c[ axis ] ) headBox = { c, size };
			q.copy( frameQ ).multiply( rot );

			if ( p.mode === 'solid' ) {

				_s.fromArray( size ).multiplyScalar( g );
				_m.compose( _p, q, _s );
				if ( nb < this.max ) this.blocks.setMatrixAt( nb ++, _m );
				continue;

			}

			// 12 edges of the box as square bars (in the box's own, possibly tilted, frame)
			const h = size.map( ( v ) => v / 2 );
			for ( let k = 0; k < 3; k ++ ) for ( const u of [ - 1, 1 ] ) for ( const v of [ - 1, 1 ] ) {

				const k1 = ( k + 1 ) % 3, k2 = ( k + 2 ) % 3;
				const o = [ 0, 0, 0 ];
				o[ k1 ] = u * h[ k1 ];
				o[ k2 ] = v * h[ k2 ];
				const sz = [ p.bar, p.bar, p.bar ];
				sz[ k ] = size[ k ] + p.bar;
				off.fromArray( o ).multiplyScalar( g ).applyQuaternion( q );
				_s.fromArray( sz ).multiplyScalar( g );
				_m.compose( off.add( _p ), q, _s );
				if ( ne < this.max * 12 ) this.bars.setMatrixAt( ne ++, _m );

			}

			// a few faces closed by thin plates (Open Blockworks, Stations, Proppers)
			for ( let f = 0; f < 6 && p.plates > 0; f ++ ) {

				if ( rand( nb * 6 + f + ne, 23 ) > p.plates ) continue;
				const k = f >> 1, sgn = f & 1 ? 1 : - 1;
				const o = [ 0, 0, 0 ];
				o[ k ] = sgn * h[ k ];
				const sz = size.slice();
				sz[ k ] = p.bar * 0.35;
				off.fromArray( o ).multiplyScalar( g ).applyQuaternion( q );
				_s.fromArray( sz ).multiplyScalar( g );
				_m.compose( off.add( _p ), q, _s );
				if ( nb < this.max ) this.blocks.setMatrixAt( nb ++, _m );

			}

		}

		this.blocks.count = nb;
		this.bars.count = ne;
		this.blocks.instanceMatrix.needsUpdate = true;
		this.bars.instanceMatrix.needsUpdate = true;

		if ( p.aperture && headBox ) {

			// Bunkers: a small square opening on the front of the topmost block
			const c = headBox.c.slice();
			c[ 2 ] += headBox.size[ 2 ] / 2 + 0.001;
			c[ 1 ] += headBox.size[ 1 ] * 0.08;
			_p.fromArray( c ).applyMatrix4( toWorld );
			const g = this.gainCPU( _p.x, _p.y, _p.z );
			_s.set( 0.032 * g, 0.032 * g, 0.004 );
			this.hole.matrix.compose( _p, frameQ, _s );
			this.hole.matrixAutoUpdate = false;
			this.hole.matrixWorldNeedsUpdate = true;

		}

	}

}
