// Bind-space (T-pose) generators for body-attached series. Each returns
// { points: [[x,y,z](,weights)], segs: [[a, b, thick, width, up]], spheres: [[c, r]] }.
// Points are later skinned on the GPU, so everything moves with the walking body.
import * as THREE from 'three/webgpu';

const unit = ( rng ) => {

	const z = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt( 1 - z * z );
	return [ r * Math.cos( a ), r * Math.sin( a ), z ];

};

const add = ( a, b, s = 1 ) => [ a[ 0 ] + b[ 0 ] * s, a[ 1 ] + b[ 1 ] * s, a[ 2 ] + b[ 2 ] * s ];
const dist = ( a, b ) => Math.hypot( a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] );

// a bar whose ends move rigidly with its centre (needles, cloud bars)
function rigidBar( out, bind, c, dir, len, thick ) {

	const w = bind.weightsAt( ...c );
	const a = add( c, dir, - len / 2 ), b = add( c, dir, len / 2 );
	a.weights = w;
	b.weights = w;
	out.points.push( a, b );
	out.segs.push( [ out.points.length - 2, out.points.length - 1, thick, thick, - 1 ] );

}

/** DOMAINS: short bars joining near neighbours inside the body, denser at the skin. */
export function domains( bind, rng, p ) {

	const out = { points: [], segs: [] };
	const nodes = [];
	for ( let i = 0; i < p.nodes; i ++ ) {

		if ( p.outward ) {

			// Drift Works: cells float off the skin into a cloud around the body
			const { p: q, n } = bind.randomSurface( rng );
			nodes.push( add( q, n, Math.pow( rng(), p.falloff ?? 1.5 ) * p.outward - 0.02 ) );

		} else nodes.push( rng() < p.shell ? bind.randomInside( rng, 0.004, 0.045 ) : bind.randomInside( rng, 0.045 ) );

	}
	out.points = nodes;
	const seen = new Set();
	nodes.forEach( ( a, i ) => {

		const near = nodes.map( ( b, j ) => [ dist( a, b ), j ] ).filter( ( [ d, j ] ) => j !== i && d < p.maxLen ).sort( ( x, y ) => x[ 0 ] - y[ 0 ] ).slice( 0, p.k );
		for ( const [ , j ] of near ) {

			const key = i < j ? i + '_' + j : j + '_' + i;
			if ( seen.has( key ) ) continue;
			const m = add( a, nodes[ j ] ).map( ( v ) => v / 2 );
			if ( ! p.outward && ! bind.isInside( ...m ) ) continue;
			seen.add( key );
			// bars run slightly past the nodes, as the welded originals do
			const d = [ 0, 1, 2 ].map( ( k ) => nodes[ j ][ k ] - a[ k ] );
			const L = Math.hypot( ...d );
			const u = d.map( ( v ) => v / L );
			const a2 = add( a, u, - p.overrun * rng() ), b2 = add( nodes[ j ], u, p.overrun * rng() );
			out.points.push( a2, b2 );
			out.segs.push( [ out.points.length - 2, out.points.length - 1, p.bar, p.bar, - 1 ] );

		}

	} );
	return out;

}

/** Vertex clustering of the skin: a coarse polyhedral net (primal) or its cell dual. */
function clusterNet( bind, cell ) {

	const P = bind.pos, T = bind.tris;
	const key = ( i ) => `${ Math.floor( P[ i * 3 ] / cell ) },${ Math.floor( P[ i * 3 + 1 ] / cell ) },${ Math.floor( P[ i * 3 + 2 ] / cell ) }`;
	const N = bind.normals;
	const ids = new Map(), sums = [], nsum = [];
	// skin shell + joint rings (the rings close the shell's gaps at waist, knees, elbows)
	const cid = new Int32Array( bind.vcount );
	for ( let i = 0; i < bind.vcount; i ++ ) {

		const k = key( i );
		if ( ! ids.has( k ) ) {

			ids.set( k, sums.length );
			sums.push( [ 0, 0, 0, 0 ] );
			nsum.push( [ 0, 0, 0 ] );

		}

		const c = ids.get( k );
		cid[ i ] = c;
		for ( let d = 0; d < 3; d ++ ) {

			sums[ c ][ d ] += P[ i * 3 + d ];
			nsum[ c ][ d ] += N[ i * 3 + d ];

		}

		sums[ c ][ 3 ] ++;

	}

	const nodes = sums.map( ( s ) => [ s[ 0 ] / s[ 3 ], s[ 1 ] / s[ 3 ], s[ 2 ] / s[ 3 ] ] );
	const normals = nsum.map( ( n ) => {

		const L = Math.hypot( ...n ) || 1;
		return n.map( ( v ) => v / L );

	} );
	const tris = new Map();
	for ( let t = 0; t < T.length; t += 3 ) {

		const a = cid[ T[ t ] ], b = cid[ T[ t + 1 ] ], c = cid[ T[ t + 2 ] ];
		if ( a === b || b === c || a === c ) continue;
		const k = [ a, b, c ].sort( ( x, y ) => x - y ).join( '_' );
		tris.set( k, [ a, b, c ] );

	}

	return { nodes, normals, tris: [ ...tris.values() ] };

}

/** NET POLYHEDRA / TRANSFUSERS: edges of the clustered skin (triangulated net). */
export function polyNet( bind, rng, p ) {

	const { nodes, normals, tris } = clusterNet( bind, p.cell );
	// Open Expansion Works: the net swells away from the skin
	if ( p.push ) nodes.forEach( ( n, i ) => {

		const d = add( n, normals[ i ], p.push * ( 0.6 + 0.8 * rng() ) );
		n[ 0 ] = d[ 0 ];
		n[ 1 ] = d[ 1 ];
		n[ 2 ] = d[ 2 ];

	} );
	const out = { points: nodes, segs: [] };
	const seen = new Set();
	for ( const [ a, b, c ] of tris ) for ( const [ x, y ] of [ [ a, b ], [ b, c ], [ c, a ] ] ) {

		const k = x < y ? x + '_' + y : y + '_' + x;
		if ( seen.has( k ) ) continue;
		seen.add( k );
		out.segs.push( [ x, y, p.bar, p.bar, - 1 ] );

	}

	return out;

}

/** APERTURE / HIVE: the dual of the clustered skin -> pentagon/hexagon openings, in two shells. */
export function aperture( bind, rng, p ) {

	const out = { points: [], segs: [] };
	for ( const [ layer, cell ] of p.cells.entries() ) {

		const { nodes, tris } = clusterNet( bind, cell );
		const base = out.points.length;
		const shrink = layer * p.layerDepth;
		// dual node = triangle centroid, pushed inward for inner shells
		const cent = tris.map( ( [ a, b, c ] ) => [ 0, 1, 2 ].map( ( k ) => ( nodes[ a ][ k ] + nodes[ b ][ k ] + nodes[ c ][ k ] ) / 3 ) );
		const edgeTris = new Map();
		tris.forEach( ( [ a, b, c ], t ) => {

			for ( const [ x, y ] of [ [ a, b ], [ b, c ], [ c, a ] ] ) {

				const k = x < y ? x + '_' + y : y + '_' + x;
				if ( ! edgeTris.has( k ) ) edgeTris.set( k, [] );
				edgeTris.get( k ).push( t );

			}

		} );
		cent.forEach( ( c ) => {

			if ( shrink > 0 ) {

				// move toward the local core by walking against the depth gradient
				for ( let s = 0; s < 10; s ++ ) {

					const d0 = bind.depthAt( ...c );
					if ( d0 >= shrink ) break;
					let best = null, bd = d0;
					for ( const dir of [ [ 1, 0, 0 ], [ - 1, 0, 0 ], [ 0, 1, 0 ], [ 0, - 1, 0 ], [ 0, 0, 1 ], [ 0, 0, - 1 ] ] ) {

						const q = add( c, dir, 0.01 );
						const dq = bind.depthAt( ...q );
						if ( dq > bd ) {

							bd = dq;
							best = q;

						}

					}

					if ( ! best ) break;
					c[ 0 ] = best[ 0 ];
					c[ 1 ] = best[ 1 ];
					c[ 2 ] = best[ 2 ];

				}

			}

			out.points.push( c );

		} );
		for ( const list of edgeTris.values() ) {

			if ( list.length !== 2 ) continue;
			out.segs.push( [ base + list[ 0 ], base + list[ 1 ], p.bar, p.bar, - 1 ] );

		}

	}

	return out;

}

/** QUANTUM CLOUDS / VOIDS: short straight bars; dense body core and a sparse halo, or halo only. */
export function quantum( bind, rng, p ) {

	const out = { points: [], segs: [] };
	for ( let i = 0; i < p.bars; i ++ ) {

		let c, dir = unit( rng );
		if ( rng() < p.core ) c = bind.randomInside( rng );
		else {

			const { p: s, n } = bind.randomSurface( rng );
			const off = Math.pow( rng(), p.falloff ) * p.halo;
			c = add( s, n, p.gap + off );
			if ( p.tangent && off < p.tangent ) {

				const dn = dir[ 0 ] * n[ 0 ] + dir[ 1 ] * n[ 1 ] + dir[ 2 ] * n[ 2 ];
				dir = add( dir, n, - dn );
				const L = Math.hypot( ...dir ) || 1;
				dir = dir.map( ( x ) => x / L );

			}

		}

		rigidBar( out, bind, c, dir, p.len[ 0 ] + rng() * ( p.len[ 1 ] - p.len[ 0 ] ), p.bar );

	}

	return out;

}

/** UNDER MY SKIN: long needles through the body in random directions. */
export function needles( bind, rng, p ) {

	const out = { points: [], segs: [] };
	for ( let i = 0; i < p.count; i ++ ) {

		rigidBar( out, bind, bind.randomInside( rng, 0.02 ), unit( rng ), p.len[ 0 ] + rng() * ( p.len[ 1 ] - p.len[ 0 ] ), p.bar );

	}

	return out;

}

// bind-space joint positions of the skeleton
function bindJoints( figure ) {

	const mesh = figure.meshes[ 0 ];
	const res = {};
	mesh.skeleton.bones.forEach( ( b, i ) => {

		// glTF inverse bind matrices already map mesh (bind) space -> joint space
		const m = new THREE.Matrix4().copy( mesh.skeleton.boneInverses[ i ] ).invert();
		const v = new THREE.Vector3().applyMatrix4( m );
		res[ b.name.replace( /^mixamorig:?/, '' ) ] = v.toArray();

	} );
	return res;

}

// limb segments: [from joint, to joint, bones allowed to drive elements around this segment]
const CHAINS = [ [ 'Hips', 'Spine2', [ 'Hips', 'Spine', 'Spine1', 'Spine2' ] ], [ 'Spine2', 'Neck', [ 'Spine1', 'Spine2', 'Neck', 'LeftShoulder', 'RightShoulder' ] ],
	[ 'Neck', 'HeadTop_End', [ 'Neck', 'Head' ] ],
	[ 'LeftUpLeg', 'LeftLeg', [ 'LeftUpLeg' ] ], [ 'LeftLeg', 'LeftFoot', [ 'LeftLeg', 'LeftFoot' ] ],
	[ 'RightUpLeg', 'RightLeg', [ 'RightUpLeg' ] ], [ 'RightLeg', 'RightFoot', [ 'RightLeg', 'RightFoot' ] ],
	[ 'LeftArm', 'LeftForeArm', [ 'LeftArm' ] ], [ 'LeftForeArm', 'LeftHand', [ 'LeftForeArm', 'LeftHand' ] ],
	[ 'RightArm', 'RightForeArm', [ 'RightArm' ] ], [ 'RightForeArm', 'RightHand', [ 'RightForeArm', 'RightHand' ] ] ];

function boneSet( figure, names ) {

	const bones = figure.meshes[ 0 ].skeleton.bones.map( ( b ) => b.name.replace( /^mixamorig:?/, '' ) );
	return new Set( names.map( ( n ) => bones.indexOf( n ) ).filter( ( i ) => i >= 0 ) );

}

/** FEELING MATERIAL: one wire per limb looping round it in tilted, loose circles. */
export function coils( bind, rng, p, figure ) {

	const J = bindJoints( figure );
	const out = { points: [], segs: [] };
	for ( const [ from, to, drivers ] of CHAINS ) {

		const A = J[ from ], B = J[ to ];
		if ( ! A || ! B ) continue;
		const allow = boneSet( figure, drivers );
		const axis = new THREE.Vector3( ...B ).sub( new THREE.Vector3( ...A ) );
		const len = axis.length();
		axis.normalize();
		const u = new THREE.Vector3().crossVectors( axis, Math.abs( axis.y ) > 0.9 ? new THREE.Vector3( 1, 0, 0 ) : new THREE.Vector3( 0, 1, 0 ) ).normalize();
		const v = new THREE.Vector3().crossVectors( axis, u );
		const loops = Math.max( 2, Math.round( len / p.pitch ) );
		let prev = - 1; // one wire per limb: never bridge to the next limb
		for ( let l = 0; l < loops; l ++ ) {

			// each loop: its own tilt, phase and looseness; occasionally a big flying loop
			const t = ( l + rng() * 0.8 ) / loops;
			const tilt = new THREE.Quaternion().setFromAxisAngle( u.clone().multiplyScalar( Math.cos( rng() * 6.28 ) ).addScaledVector( v, Math.sin( rng() * 6.28 ) ).normalize(), ( rng() - 0.5 ) * p.tilt );
			const fly = rng() < p.loose ? 1 + rng() * p.looseR : 1;
			const phase = rng() * 6.28;
			const steps = p.perLoop;
			for ( let k = 0; k <= steps; k ++ ) {

				const th = phase + ( k / steps ) * 6.28;
				const dir = u.clone().multiplyScalar( Math.cos( th ) ).addScaledVector( v, Math.sin( th ) ).applyQuaternion( tilt );
				const base = new THREE.Vector3( ...A ).addScaledVector( axis, t * len );
				let r = 0;
				while ( r < 0.3 && bind.isInside( ...base.clone().addScaledVector( dir, r ).toArray() ) ) r += 0.008;
				// a ray running down a neighbouring limb never exits: treat it as a typical torso radius
				if ( r >= 0.3 ) r = 0.15;
				const q = base.addScaledVector( dir, ( r + p.gap * ( 0.6 + 0.8 * rng() ) ) * fly ).toArray();
				q.weights = bind.weightsAt( ...q, allow );
				const i = out.points.push( q ) - 1;
				if ( prev >= 0 ) out.segs.push( [ prev, i, p.bar, p.bar, - 1 ] );
				prev = i;

			}

		}

	}

	return out;

}

/** BALL WORKS: the skin covered in iron spheres of mixed sizes. */
export function balls( bind, rng, p ) {

	const out = { points: [], spheres: [] };
	for ( let i = 0; i < p.count; i ++ ) {

		const { p: s, n } = bind.randomSurface( rng );
		const r = p.r[ 0 ] + Math.pow( rng(), 2.2 ) * ( p.r[ 1 ] - p.r[ 0 ] );
		out.points.push( add( s, n, - r * 0.55 ) );
		out.spheres.push( [ out.points.length - 1, r ] );

	}

	return out;

}

const AXES = [ [ 1, 0, 0 ], [ - 1, 0, 0 ], [ 0, 1, 0 ], [ 0, - 1, 0 ], [ 0, 0, 1 ], [ 0, 0, - 1 ] ];

/** STRAPWORKS / KNOTWORKS (/ EXTENDED): one continuous orthogonal strap folded through the body. */
export function straps( bind, rng, p ) {

	const out = { points: [], segs: [] };
	const insideAlong = ( a, d, L ) => {

		for ( let s = 0; s <= L; s += 0.01 ) if ( bind.depthAt( ...add( a, d, s ) ) < p.margin ) return false;
		return true;

	};

	// restart strands where the body is least covered (farthest-point sampling)
	const placed = [];
	const freshStart = () => {

		// Branchers: new strands sprout from the existing structure
		if ( p.branch && placed.length && rng() < p.branch ) return placed[ Math.floor( rng() * placed.length ) ].slice();
		let best = null, bestD = - 1;
		for ( let c = 0; c < 40; c ++ ) {

			const q = bind.randomInside( rng, p.margin + 0.004 );
			let d = Infinity;
			for ( let i = 0; i < placed.length; i += 2 ) d = Math.min( d, dist( q, placed[ i ] ) );
			if ( d > bestD ) {

				bestD = d;
				best = q;

			}

		}

		return best;

	};

	let cur = freshStart(), axis = 2, made = 0, guard = 0, strand = 0;
	const path = [ cur ];
	while ( made < p.segments && guard ++ < p.segments * 40 ) {

		const cands = AXES.map( ( d, k ) => [ d, k ] ).filter( ( [ , k ] ) => ( k >> 1 ) !== ( axis >> 1 ) );
		for ( let i = cands.length - 1; i > 0; i -- ) {

			const j = Math.floor( rng() * ( i + 1 ) );
			[ cands[ i ], cands[ j ] ] = [ cands[ j ], cands[ i ] ];

		}

		let moved = false;
		for ( const [ d, k ] of cands ) {

			if ( strand >= p.strand ) break;
			if ( rng() < p.extend ) {

				// extended loop: out beyond the skin, across, and back in
				const L1 = 0.3 + rng() * 0.7, L2 = 0.1 + rng() * 0.35;
				const side = AXES[ ( ( k >> 1 ) * 2 + 2 + Math.floor( rng() * 3 ) * 2 ) % 6 ];
				const a1 = add( cur, d, L1 ), a2 = add( a1, side, L2 ), a3 = add( a2, d, - L1 );
				if ( bind.depthAt( ...a3 ) < p.margin ) continue;
				// the loop moves rigidly with the point it leaves from, so it stays rectangular
				a1.weights = a2.weights = bind.weightsAt( ...cur );
				path.push( a1, a2, a3 );
				cur = a3;
				axis = k;
				made += 3;
				strand += 3;
				moved = true;
				break;

			}

			for ( let tries = 0; tries < 3; tries ++ ) {

				const L = p.len[ 0 ] + rng() * ( p.len[ 1 ] - p.len[ 0 ] ) * ( 1 - tries * 0.3 );
				if ( insideAlong( cur, d, L ) ) {

					cur = add( cur, d, L );
					path.push( cur );
					placed.push( cur );
					axis = k;
					made ++;
					strand ++;
					moved = true;
					break;

				}

			}

			if ( moved ) break;

		}

		if ( ! moved ) {

			// dead end or strand long enough: start a new strand in the emptiest region
			flush();
			cur = freshStart();
			path.length = 0;
			path.push( cur );
			strand = 0;

		}

	}

	flush();
	return out;

	function flush() {

		for ( let i = 0; i + 1 < path.length; i ++ ) {

			const a = path[ i ], b = path[ i + 1 ], c = path[ i + 2 ] || path[ i - 1 ] || add( a, [ 0, 0, 1 ] );
			// strap lies in the plane of the fold: its thin axis is the fold normal
			const d1 = [ 0, 1, 2 ].map( ( k ) => b[ k ] - a[ k ] ), d2 = [ 0, 1, 2 ].map( ( k ) => c[ k ] - b[ k ] );
			const nrm = new THREE.Vector3( ...d1 ).cross( new THREE.Vector3( ...d2 ) ).normalize();
			if ( nrm.lengthSq() < 0.5 ) nrm.set( 0, 0, 1 );
			const copy = ( q ) => Object.assign( q.slice(), q.weights ? { weights: q.weights } : {} );
			const ia = out.points.push( copy( a ) ) - 1;
			const ib = out.points.push( copy( b ) ) - 1;
			const up = add( a, nrm.toArray(), 0.03 );
			up.weights = a.weights || bind.weightsAt( ...a );
			const iu = out.points.push( up ) - 1;
			out.segs.push( [ ia, ib, p.t, p.w, iu ] );

		}

	}

}

function orthoPath( A, B, step, jog, rng ) {

	// axis-aligned walk from A to B: long moves along the dominant axis, short jogs sideways
	const pts = [ A.slice() ];
	let cur = A.slice();
	for ( let guard = 0; guard < 60; guard ++ ) {

		const d = [ 0, 1, 2 ].map( ( k ) => B[ k ] - cur[ k ] );
		const k = [ 0, 1, 2 ].reduce( ( a, x ) => ( Math.abs( d[ x ] ) > Math.abs( d[ a ] ) ? x : a ), 0 );
		if ( Math.abs( d[ k ] ) < 0.01 ) break;
		const next = cur.slice();
		next[ k ] += Math.sign( d[ k ] ) * Math.min( Math.abs( d[ k ] ), step * ( 0.6 + 0.8 * rng() ) );
		pts.push( next );
		cur = next;
		if ( jog && rng() < 0.35 ) {

			const s = ( k + 1 + Math.floor( rng() * 2 ) ) % 3;
			const j = cur.slice();
			j[ s ] += ( rng() < 0.5 ? - 1 : 1 ) * jog;
			pts.push( j );
			cur = j;

		}

	}

	return pts;

}

function polyline( out, pts, t, w, weights = null ) {

	let prev = - 1;
	for ( const q of pts ) {

		const pt = q.slice();
		if ( weights ) pt.weights = weights;
		const i = out.points.push( pt ) - 1;
		if ( prev >= 0 ) out.segs.push( [ prev, i, t, w, - 1 ] );
		prev = i;

	}

}

/** ROOTERS: the figure drawn once in square bar — a line down each limb and a box for the torso. */
export function rooter( bind, rng, p, figure ) {

	const J = bindJoints( figure );
	const out = { points: [], segs: [] };
	for ( const [ from, to, drivers ] of CHAINS ) {

		if ( from === 'Hips' || ! J[ from ] || ! J[ to ] ) continue;
		const allow = boneSet( figure, drivers );
		const pts = orthoPath( J[ from ], J[ to ], p.step, p.jog, rng );
		for ( const q of pts ) q.weights = bind.weightsAt( ...q, allow );
		for ( let i = 0; i + 1 < pts.length; i ++ ) {

			const a = out.points.push( pts[ i ] ) - 1, b = out.points.push( pts[ i + 1 ] ) - 1;
			out.segs.push( [ a, b, p.t, p.w, - 1 ] );

		}

	}

	// torso: a frontal rectangle from shoulders to hips
	const L = J.LeftArm, R = J.RightArm, hl = J.LeftUpLeg, hr = J.RightUpLeg;
	const corners = [ [ L[ 0 ], L[ 1 ], L[ 2 ] ], [ R[ 0 ], R[ 1 ], R[ 2 ] ], [ hr[ 0 ], hr[ 1 ], hr[ 2 ] ], [ hl[ 0 ], hl[ 1 ], hl[ 2 ] ] ];
	corners.push( corners[ 0 ] );
	const pts = corners.map( ( q ) => Object.assign( q.slice(), { weights: bind.weightsAt( ...q ) } ) );
	for ( let i = 0; i < 4; i ++ ) {

		const a = out.points.push( pts[ i ] ) - 1, b = out.points.push( pts[ i + 1 ] ) - 1;
		out.segs.push( [ a, b, p.t, p.w, - 1 ] );

	}

	return out;

}

/** BUBBLE WORKS: wire rings of mixed sizes packed inside the body. */
export function bubbles( bind, rng, p ) {

	const out = { points: [], segs: [] };
	for ( let b = 0; b < p.count; b ++ ) {

		const c = bind.randomInside( rng, 0.02 );
		const r = Math.min( bind.depthAt( ...c ) * 1.3, p.r[ 0 ] + rng() * ( p.r[ 1 ] - p.r[ 0 ] ) );
		const n = new THREE.Vector3( ...unit( rng ) );
		const u = new THREE.Vector3().crossVectors( n, Math.abs( n.y ) > 0.9 ? new THREE.Vector3( 1, 0, 0 ) : new THREE.Vector3( 0, 1, 0 ) ).normalize();
		const v = new THREE.Vector3().crossVectors( n, u );
		const w = bind.weightsAt( ...c );
		const ring = [];
		for ( let k = 0; k <= p.perRing; k ++ ) {

			const a = ( k / p.perRing ) * Math.PI * 2;
			ring.push( [ c[ 0 ] + ( u.x * Math.cos( a ) + v.x * Math.sin( a ) ) * r, c[ 1 ] + ( u.y * Math.cos( a ) + v.y * Math.sin( a ) ) * r, c[ 2 ] + ( u.z * Math.cos( a ) + v.z * Math.sin( a ) ) * r ] );

		}

		polyline( out, ring, p.bar, p.bar, w );

	}

	return out;

}

// rings around each limb at the skin (+gap): rings[chain][ring][k] = point
function limbRings( bind, rng, p, figure ) {

	const J = bindJoints( figure );
	const all = [];
	for ( const [ from, to, drivers ] of CHAINS ) {

		const A = J[ from ], B = J[ to ];
		if ( ! A || ! B ) continue;
		const allow = boneSet( figure, drivers );
		const axis = new THREE.Vector3( ...B ).sub( new THREE.Vector3( ...A ) );
		const len = axis.length();
		axis.normalize();
		const u = new THREE.Vector3().crossVectors( axis, Math.abs( axis.y ) > 0.9 ? new THREE.Vector3( 1, 0, 0 ) : new THREE.Vector3( 0, 1, 0 ) ).normalize();
		const v = new THREE.Vector3().crossVectors( axis, u );
		const rings = [];
		const n = Math.max( 2, Math.round( len / p.pitch ) );
		for ( let l = 0; l <= n; l ++ ) {

			const base = new THREE.Vector3( ...A ).addScaledVector( axis, ( l / n ) * len );
			const ring = [];
			for ( let k = 0; k < p.perRing; k ++ ) {

				const a = ( k / p.perRing ) * Math.PI * 2;
				const dir = u.clone().multiplyScalar( Math.cos( a ) ).addScaledVector( v, Math.sin( a ) );
				let r = 0;
				while ( r < 0.3 && bind.isInside( ...base.clone().addScaledVector( dir, r ).toArray() ) ) r += 0.006;
				if ( r >= 0.3 ) r = 0.15;
				const q = base.clone().addScaledVector( dir, r + p.gap ).toArray();
				q.weights = bind.weightsAt( ...q, allow );
				ring.push( q );

			}

			rings.push( ring );

		}

		all.push( rings );

	}

	return all;

}

/** CAGE WORKS: horizontal wire hoops round each limb joined by vertical wires. */
export function cage( bind, rng, p, figure ) {

	const out = { points: [], segs: [] };
	for ( const rings of limbRings( bind, rng, p, figure ) ) {

		for ( const ring of rings ) polyline( out, [ ...ring, ring[ 0 ] ], p.bar, p.bar );
		for ( let k = 0; k < p.perRing; k += p.meridian ) polyline( out, rings.map( ( r ) => r[ k ] ), p.bar, p.bar );

	}

	return out;

}

/** CLAY WORKS: the body built from rolled clay — parallel rolls along every limb. */
export function clay( bind, rng, p, figure ) {

	const out = { points: [], segs: [] };
	for ( const rings of limbRings( bind, rng, { ...p, gap: - p.roll * 0.4 }, figure ) ) {

		for ( let k = 0; k < p.perRing; k ++ ) {

			// a roll runs a random stretch of the limb, then the next one takes over
			let start = Math.floor( rng() * 2 );
			while ( start < rings.length - 1 ) {

				const len = 1 + Math.floor( rng() * 3 );
				const end = Math.min( rings.length - 1, start + len );
				const a = out.points.push( rings[ start ][ k ].slice() ) - 1;
				out.points[ a ].weights = rings[ start ][ k ].weights;
				const b = out.points.push( rings[ end ][ k ].slice() ) - 1;
				out.points[ b ].weights = rings[ end ][ k ].weights;
				out.segs.push( [ a, b, p.roll, p.roll, - 1 ] );
				start = end + ( rng() < 0.3 ? 1 : 0 );

			}

		}

	}

	return out;

}

/** OBJECT WORKS (interpretation): each limb becomes a separate rounded object. */
export function objects( bind, rng, p, figure ) {

	const J = bindJoints( figure );
	const out = { points: [], segs: [] };
	for ( const [ from, to, drivers ] of CHAINS ) {

		if ( ! J[ from ] || ! J[ to ] ) continue;
		const allow = boneSet( figure, drivers );
		const a = Object.assign( J[ from ].slice(), { weights: bind.weightsAt( ...J[ from ], allow ) } );
		const b = Object.assign( J[ to ].slice(), { weights: bind.weightsAt( ...J[ to ], allow ) } );
		const ia = out.points.push( a ) - 1, ib = out.points.push( b ) - 1;
		const r = Math.min( 0.16, Math.max( 0.05, bind.depthAt( ...add( a, b ).map( ( v ) => v / 2 ) ) * 1.6 ) );
		out.segs.push( [ ia, ib, r, r, - 1 ] );

	}

	return out;

}
