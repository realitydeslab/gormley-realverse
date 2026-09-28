// CPU analysis of the body in its bind pose (T-pose), done once at load:
// a solid voxel grid (winding numbers, like the GPU volume), a distance-to-skin field,
// and skin weights for any point, so generated elements can be skinned with the body.
import * as THREE from 'three/webgpu';
import { TORSO_RADII } from '../gpu/volume.js';

const RES = 0.015;

export class BindBody {

	constructor( figure ) {

		this.figure = figure;
		this.meshes = figure.meshes;
		this.collectVertices();
		this.voxelize();
		this.fillTorso();
		this.distanceField();

	}

	collectVertices() {

		const pos = [], idx = [], wts = [], tris = [], nrm = [];
		let base = 0;
		for ( const mesh of this.meshes ) {

			const g = mesh.geometry;
			const P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
			const NN = g.attributes.normal;
			for ( let i = 0; i < P.count; i ++ ) {

				pos.push( P.getX( i ), P.getY( i ), P.getZ( i ) );
				nrm.push( NN.getX( i ), NN.getY( i ), NN.getZ( i ) );
				for ( let k = 0; k < 4; k ++ ) {

					idx.push( SI.getComponent( i, k ) );
					wts.push( SW.getComponent( i, k ) );

				}

			}

			const I = g.index.array;
			for ( let t = 0; t < I.length; t ++ ) tris.push( I[ t ] + base );
			base += P.count;
			// the first mesh is the skin shell (Beta_Surface); nets are built from it alone
			if ( this.surfaceVerts === undefined ) {

				this.surfaceVerts = P.count;
				this.surfaceTris = I.length;

			}

		}

		this.pos = new Float32Array( pos );
		this.normals = new Float32Array( nrm );
		this.skinIndex = new Uint32Array( idx );
		this.skinWeight = new Float32Array( wts );
		this.tris = new Uint32Array( tris );
		this.vcount = this.pos.length / 3;

		const box = new THREE.Box3();
		for ( let i = 0; i < this.vcount; i ++ ) box.expandByPoint( new THREE.Vector3().fromArray( this.pos, i * 3 ) );
		box.expandByScalar( 0.04 );
		this.box = box;
		this.dims = [ 0, 1, 2 ].map( ( k ) => Math.ceil( ( box.max.getComponent( k ) - box.min.getComponent( k ) ) / RES ) );

		// spatial hash of vertices for nearest-vertex skin weights
		this.hashCell = 0.05;
		this.hash = new Map();
		for ( let i = 0; i < this.vcount; i ++ ) {

			const key = this.cellKey( this.pos[ i * 3 ], this.pos[ i * 3 + 1 ], this.pos[ i * 3 + 2 ] );
			if ( ! this.hash.has( key ) ) this.hash.set( key, [] );
			this.hash.get( key ).push( i );

		}

	}

	dominantBone( i ) {

		let k = 0;
		for ( let j = 1; j < 4; j ++ ) if ( this.skinWeight[ i * 4 + j ] > this.skinWeight[ i * 4 + k ] ) k = j;
		return this.skinIndex[ i * 4 + k ];

	}

	cellKey( x, y, z ) {

		const c = this.hashCell;
		return `${ Math.floor( x / c ) },${ Math.floor( y / c ) },${ Math.floor( z / c ) }`;

	}

	// solid voxelization by signed crossings along +Y columns (same scheme as the GPU volume)
	voxelize() {

		const [ nx, ny, nz ] = this.dims;
		const o = this.box.min;
		const cross = new Int16Array( nx * ny * nz );
		const P = this.pos, T = this.tris;
		const g = ( i, k ) => ( P[ i * 3 + k ] - o.getComponent( k ) ) / RES - 0.5;
		for ( let t = 0; t < T.length; t += 3 ) {

			const a = T[ t ], b = T[ t + 1 ], c = T[ t + 2 ];
			const ax = g( a, 0 ), ay = g( a, 1 ), az = g( a, 2 );
			const bx = g( b, 0 ), by = g( b, 1 ), bz = g( b, 2 );
			const cx = g( c, 0 ), cy = g( c, 1 ), cz = g( c, 2 );
			const det = ( bx - ax ) * ( cz - az ) - ( cx - ax ) * ( bz - az );
			if ( Math.abs( det ) < 1e-12 ) continue;
			const s = - Math.sign( det );
			const i0 = Math.max( 0, Math.ceil( Math.min( ax, bx, cx ) - 0.0137 ) ), i1 = Math.min( nx - 1, Math.floor( Math.max( ax, bx, cx ) - 0.0137 ) );
			const k0 = Math.max( 0, Math.ceil( Math.min( az, bz, cz ) - 0.0071 ) ), k1 = Math.min( nz - 1, Math.floor( Math.max( az, bz, cz ) - 0.0071 ) );
			for ( let i = i0; i <= i1; i ++ ) for ( let k = k0; k <= k1; k ++ ) {

				const px = i + 0.0137, pz = k + 0.0071;
				const l1 = ( ( px - ax ) * ( cz - az ) - ( cx - ax ) * ( pz - az ) ) / det;
				const l2 = ( ( bx - ax ) * ( pz - az ) - ( px - ax ) * ( bz - az ) ) / det;
				const l0 = 1 - l1 - l2;
				if ( l0 < 0 || l1 < 0 || l2 < 0 ) continue;
				const y = ay * l0 + by * l1 + cy * l2;
				const j = Math.min( Math.ceil( y ) - 1, ny - 1 );
				if ( j >= 0 ) cross[ i + j * nx + k * nx * ny ] += s;

			}

		}

		this.inside = new Uint8Array( nx * ny * nz );
		for ( let i = 0; i < nx; i ++ ) for ( let k = 0; k < nz; k ++ ) {

			let w = 0;
			for ( let j = ny - 1; j >= 0; j -- ) {

				const v = i + j * nx + k * nx * ny;
				w += cross[ v ];
				this.inside[ v ] = w > 0 ? 1 : 0;

			}

		}

	}

	// same waist filler as the GPU volume, in bind space (see Figure.torsoFrame)
	fillTorso() {

		const mesh = this.meshes[ 0 ];
		const at = ( name ) => {

			const i = mesh.skeleton.bones.findIndex( ( b ) => b.name.replace( /^mixamorig:?/, '' ) === name );
			return new THREE.Vector3().applyMatrix4( new THREE.Matrix4().copy( mesh.skeleton.boneInverses[ i ] ).invert() );

		};

		const inv = new THREE.Matrix4();
		const len = this.figure.constructor.torsoFrame( [ at( 'Hips' ), at( 'Spine2' ), at( 'LeftUpLeg' ), at( 'RightUpLeg' ) ], inv );
		const [ nx, ny, nz ] = this.dims;
		const o = this.box.min, q = new THREE.Vector3();
		const [ rx, rz ] = TORSO_RADII;
		for ( let k = 0; k < nz; k ++ ) for ( let j = 0; j < ny; j ++ ) for ( let i = 0; i < nx; i ++ ) {

			q.set( o.x + ( i + 0.5 ) * RES, o.y + ( j + 0.5 ) * RES, o.z + ( k + 0.5 ) * RES ).applyMatrix4( inv );
			if ( q.y >= 0 && q.y <= len && ( q.x / rx ) ** 2 + ( q.z / rz ) ** 2 <= 1 ) this.inside[ i + j * nx + k * nx * ny ] = 1;

		}

	}

	// chamfer distance (m) from each inside voxel to the skin; 0 outside
	distanceField() {

		const [ nx, ny, nz ] = this.dims;
		const D = new Float32Array( nx * ny * nz );
		for ( let v = 0; v < D.length; v ++ ) D[ v ] = this.inside[ v ] ? 1e3 : 0;
		const nb = [];
		for ( let dz = - 1; dz <= 1; dz ++ ) for ( let dy = - 1; dy <= 1; dy ++ ) for ( let dx = - 1; dx <= 1; dx ++ ) {

			if ( dx || dy || dz ) nb.push( [ dx, dy, dz, Math.hypot( dx, dy, dz ) * RES ] );

		}

		const fwd = nb.filter( ( [ dx, dy, dz ] ) => dz < 0 || ( dz === 0 && ( dy < 0 || ( dy === 0 && dx < 0 ) ) ) );
		const bwd = nb.filter( ( n ) => ! fwd.includes( n ) );
		const pass = ( list, dir ) => {

			const r = ( n ) => ( dir > 0 ? [ ...Array( n ).keys() ] : [ ...Array( n ).keys() ].reverse() );
			for ( const k of r( nz ) ) for ( const j of r( ny ) ) for ( const i of r( nx ) ) {

				const v = i + j * nx + k * nx * ny;
				if ( D[ v ] === 0 ) continue;
				let d = D[ v ];
				for ( const [ dx, dy, dz, w ] of list ) {

					const x = i + dx, y = j + dy, z = k + dz;
					if ( x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ) {

						d = Math.min( d, w );
						continue;

					}

					d = Math.min( d, D[ x + y * nx + z * nx * ny ] + w );

				}

				D[ v ] = d;

			}

		};

		pass( fwd, 1 );
		pass( bwd, - 1 );
		this.depth = D;

	}

	voxelOf( x, y, z ) {

		const o = this.box.min;
		const i = Math.floor( ( x - o.x ) / RES ), j = Math.floor( ( y - o.y ) / RES ), k = Math.floor( ( z - o.z ) / RES );
		const [ nx, ny, nz ] = this.dims;
		if ( i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ) return - 1;
		return i + j * nx + k * nx * ny;

	}

	/** depth below the skin at a bind-space point (m); 0 outside */
	depthAt( x, y, z ) {

		const v = this.voxelOf( x, y, z );
		return v < 0 ? 0 : this.depth[ v ];

	}

	isInside( x, y, z ) {

		const v = this.voxelOf( x, y, z );
		return v >= 0 && this.inside[ v ] === 1;

	}

	/** uniformly random point inside the body, optionally within a depth band */
	randomInside( rng, minDepth = 0, maxDepth = Infinity ) {

		const b = this.box;
		for ( let tries = 0; tries < 20000; tries ++ ) {

			const x = b.min.x + rng() * ( b.max.x - b.min.x );
			const y = b.min.y + rng() * ( b.max.y - b.min.y );
			const z = b.min.z + rng() * ( b.max.z - b.min.z );
			const d = this.depthAt( x, y, z );
			if ( d > 0 && d >= minDepth && d <= maxDepth ) return [ x, y, z ];

		}

		return [ 0, 1, 0 ];

	}

	/**
	 * skin weights for a bind-space point: blend of the 3 nearest vertices, top 4 bones.
	 * `allow` (Set of bone indices) keeps only vertices driven by those bones, so an element
	 * that belongs to one limb is not captured by a neighbouring limb in the T-pose.
	 */
	weightsAt( x, y, z, allow = null ) {

		const best = [];
		const c = this.hashCell;
		for ( let r = 1; r <= 6 && best.length < 3; r ++ ) {

			best.length = 0;
			const cx = Math.floor( x / c ), cy = Math.floor( y / c ), cz = Math.floor( z / c );
			for ( let dx = - r; dx <= r; dx ++ ) for ( let dy = - r; dy <= r; dy ++ ) for ( let dz = - r; dz <= r; dz ++ ) {

				const list = this.hash.get( `${ cx + dx },${ cy + dy },${ cz + dz }` );
				if ( ! list ) continue;
				for ( const i of list ) {

					if ( allow && ! allow.has( this.dominantBone( i ) ) ) continue;
					const d = Math.hypot( this.pos[ i * 3 ] - x, this.pos[ i * 3 + 1 ] - y, this.pos[ i * 3 + 2 ] - z );
					best.push( [ d, i ] );

				}

			}

		}

		// nothing driven by the allowed bones nearby: fall back to plain nearest vertices
		if ( allow && best.length === 0 ) return this.weightsAt( x, y, z );
		// far from the skin (halo elements, flying loops): scan every vertex
		if ( best.length === 0 ) {

			for ( let i = 0; i < this.vcount; i ++ ) {

				best.push( [ Math.hypot( this.pos[ i * 3 ] - x, this.pos[ i * 3 + 1 ] - y, this.pos[ i * 3 + 2 ] - z ), i ] );

			}

		}
		best.sort( ( a, b ) => a[ 0 ] - b[ 0 ] );
		const acc = new Map();
		for ( const [ d, i ] of best.slice( 0, 3 ) ) {

			const w = 1 / ( d + 0.01 );
			for ( let k = 0; k < 4; k ++ ) {

				const bone = this.skinIndex[ i * 4 + k ], bw = this.skinWeight[ i * 4 + k ];
				if ( bw > 0 ) acc.set( bone, ( acc.get( bone ) || 0 ) + bw * w );

			}

		}

		const top = [ ...acc.entries() ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 4 );
		const sum = top.reduce( ( s, [ , w ] ) => s + w, 0 ) || 1;
		const idx = [ 0, 0, 0, 0 ], wts = [ 0, 0, 0, 0 ];
		top.forEach( ( [ b, w ], k ) => {

			idx[ k ] = b;
			wts[ k ] = w / sum;

		} );
		return { idx, wts };

	}

	/** random point on the skin (area weighted) with its outward normal */
	randomSurface( rng ) {

		if ( ! this.cdf ) {

			const T = this.tris, P = this.pos;
			this.cdf = new Float32Array( T.length / 3 );
			let acc = 0;
			const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
			for ( let t = 0; t < T.length; t += 3 ) {

				a.fromArray( P, T[ t ] * 3 );
				b.fromArray( P, T[ t + 1 ] * 3 ).sub( a );
				c.fromArray( P, T[ t + 2 ] * 3 ).sub( a );
				acc += b.cross( c ).length() / 2;
				this.cdf[ t / 3 ] = acc;

			}

		}

		const r = rng() * this.cdf[ this.cdf.length - 1 ];
		let lo = 0, hi = this.cdf.length - 1;
		while ( lo < hi ) {

			const m = ( lo + hi ) >> 1;
			if ( this.cdf[ m ] < r ) lo = m + 1;
			else hi = m;

		}

		const T = this.tris, P = this.pos;
		const a = new THREE.Vector3().fromArray( P, T[ lo * 3 ] * 3 );
		const b = new THREE.Vector3().fromArray( P, T[ lo * 3 + 1 ] * 3 );
		const c = new THREE.Vector3().fromArray( P, T[ lo * 3 + 2 ] * 3 );
		let u = rng(), v = rng();
		if ( u + v > 1 ) {

			u = 1 - u;
			v = 1 - v;

		}

		const p = a.clone().add( b.clone().sub( a ).multiplyScalar( u ) ).add( c.clone().sub( a ).multiplyScalar( v ) );
		const n = b.clone().sub( a ).cross( c.clone().sub( a ) ).normalize();
		return { p: p.toArray(), n: n.toArray() };

	}

}

/** deterministic PRNG (mulberry32) */
export function makeRng( seed = 1 ) {

	let a = seed >>> 0;
	return () => {

		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}
