// Per-frame GPU volume of the posed body.
// skin vertices -> signed surface crossings per voxel column (winding numbers, so overlapping
// shells union correctly) -> occupancy -> separable blur = smooth density (surface at 0.5)
// -> min-pooled mips.
// The window follows the figure but is snapped to whole voxels, so it is world-anchored.
import * as THREE from 'three/webgpu';
import {
	Fn, If, Loop, int, float, vec3, vec4, uniform, instancedArray, storage, instanceIndex, select,
	computeSkinning, atomicAdd, atomicLoad, atomicStore, min, max, clamp, floor, ceil, abs, sign,
} from 'three/tsl';

export const VOXEL = 0.02;
export const NX = 96, NY = 128, NZ = 96;
const N = NX * NY * NZ;

// a fixed irrational-ish offset keeps column centres off shared triangle edges
const EPS_X = 0.0137, EPS_Z = 0.0071;
const FACING = - 1; // flips the crossing sign if the mesh winding is opposite
export const TORSO_RADII = [ 0.125, 0.092 ]; // lateral, front-back (m) of the waist filler

export class BodyVolume {

	constructor( figure ) {

		this.figure = figure;
		this.origin = uniform( new THREE.Vector3() ); // world position of voxel (0,0,0) corner
		this.g0 = { x: uniform( 0, 'int' ), z: uniform( 0, 'int' ) }; // world voxel index of the window corner

		this.crossings = instancedArray( N, 'int' ).toAtomic(); // signed surface crossings per voxel
		this.occ = instancedArray( N, 'float' );
		this.tmp = instancedArray( N, 'float' );
		this.tmp2 = instancedArray( N, 'float' );
		this.density = instancedArray( N, 'float' );
		this.mips = [ 1, 2, 3 ].map( ( l ) => ( { level: l, nx: NX >> l, ny: NY >> l, nz: NZ >> l } ) );
		for ( const m of this.mips ) m.buf = instancedArray( m.nx * m.ny * m.nz, 'float' );
		// average-pooled copies: smooth coarse occupancy for inflated (Expansion) / eroded (Insiders) bodies
		this.avg = this.mips.map( ( m ) => ( { ...m, buf: instancedArray( m.nx * m.ny * m.nz, 'float' ) } ) );

		this.parts = figure.meshes.map( ( mesh ) => this.buildPart( mesh ) );
		this.torsoInv = uniform( new THREE.Matrix4() );
		this.torsoLen = uniform( 0.3 );
		this.fillTorso = Fn( () => {

			const v = int( instanceIndex );
			const x = v.mod( NX ), y = v.div( NX ).mod( NY ), z = v.div( NX * NY );
			const p = this.origin.add( vec3( float( x ), float( y ), float( z ) ).add( 0.5 ).mul( VOXEL ) );
			const q = this.torsoInv.mul( vec4( p, 1 ) ).xyz;
			const e = q.x.div( TORSO_RADII[ 0 ] ).pow( 2 ).add( q.z.div( TORSO_RADII[ 1 ] ).pow( 2 ) );
			If( q.y.greaterThanEqual( 0 ).and( q.y.lessThanEqual( this.torsoLen ) ).and( e.lessThanEqual( 1 ) ), () => {

				this.occ.element( v ).assign( 1 );

			} );

		} )().compute( N );

		this.clear = Fn( () => {

			atomicStore( this.crossings.element( instanceIndex ), int( 0 ) );

		} )().compute( N );
		this.kernels = [
			...this.parts.map( ( p ) => p.skin ),
			this.clear,
			...this.parts.map( ( p ) => p.voxelize ),
			this.decode(),
			this.fillTorso,
			this.blur( 0 ), this.blur( 1 ), this.blur( 2 ),
			...this.mips.map( ( m, i ) => this.pool( i === 0 ? { nx: NX, ny: NY, nz: NZ, buf: this.occ } : this.mips[ i - 1 ], m ) ),
			...this.avg.map( ( m, i ) => this.pool( i === 0 ? { nx: NX, ny: NY, nz: NZ, buf: this.occ } : this.avg[ i - 1 ], m, true ) ),
		];

	}

	buildPart( mesh ) {

		const vcount = mesh.geometry.attributes.position.count;
		const index = mesh.geometry.index.array;
		const tris = index.length / 3;
		const pos = instancedArray( vcount, 'vec3' );
		const idx = storage( new THREE.StorageBufferAttribute( new Uint32Array( index ), 1 ), 'uint', index.length ).toReadOnly();
		const crossings = this.crossings;
		const world = uniform( mesh.matrixWorld );

		const skin = Fn( () => {

			pos.element( instanceIndex ).assign( world.mul( computeSkinning( mesh ) ).xyz );

		} )().compute( vcount );

		const origin = this.origin;
		const voxelize = Fn( () => {

			const t = int( instanceIndex ).mul( 3 );
			// triangle in voxel units: column centres sit on integer (x, z)
			const toGrid = ( v ) => v.sub( origin ).div( VOXEL ).sub( 0.5 );
			const A = toGrid( pos.element( idx.element( t ) ) ).toVar();
			const B = toGrid( pos.element( idx.element( t.add( 1 ) ) ) ).toVar();
			const C = toGrid( pos.element( idx.element( t.add( 2 ) ) ) ).toVar();
			const det = B.x.sub( A.x ).mul( C.z.sub( A.z ) ).sub( C.x.sub( A.x ).mul( B.z.sub( A.z ) ) ).toVar();
			const i0 = max( int( ceil( min( A.x, min( B.x, C.x ) ).sub( EPS_X ) ) ), 0 );
			const i1 = min( int( floor( max( A.x, max( B.x, C.x ) ).sub( EPS_X ) ) ), NX - 1 );
			const k0 = max( int( ceil( min( A.z, min( B.z, C.z ) ).sub( EPS_Z ) ) ), 0 );
			const k1 = min( int( floor( max( A.z, max( B.z, C.z ) ).sub( EPS_Z ) ) ), NZ - 1 );

			If( abs( det ).greaterThan( 1e-9 ).and( i1.sub( i0 ).lessThan( 24 ) ).and( k1.sub( k0 ).lessThan( 24 ) ), () => {

				Loop( { start: i0, end: i1, condition: '<=', type: 'int', name: 'ci' }, ( { ci } ) => {

					Loop( { start: k0, end: k1, condition: '<=', type: 'int', name: 'ck' }, ( { ck } ) => {

						const px = float( ci ).add( EPS_X );
						const pz = float( ck ).add( EPS_Z );
						const l1 = px.sub( A.x ).mul( C.z.sub( A.z ) ).sub( C.x.sub( A.x ).mul( pz.sub( A.z ) ) ).div( det );
						const l2 = B.x.sub( A.x ).mul( pz.sub( A.z ) ).sub( px.sub( A.x ).mul( B.z.sub( A.z ) ) ).div( det );
						const l0 = float( 1 ).sub( l1 ).sub( l2 );

						If( l0.greaterThanEqual( 0 ).and( l1.greaterThanEqual( 0 ) ).and( l2.greaterThanEqual( 0 ) ), () => {

							// a downward ray entering the body (+1) or leaving it (-1) at height y;
							// recorded on the first voxel whose centre is below the crossing
							const y = A.y.mul( l0 ).add( B.y.mul( l1 ) ).add( C.y.mul( l2 ) );
							const j = int( ceil( y ) ).sub( 1 );
							If( j.greaterThanEqual( 0 ), () => {

								const jj = min( j, NY - 1 );
								atomicAdd( crossings.element( ci.add( jj.mul( NX ) ).add( ck.mul( NX * NY ) ) ), int( sign( det ) ).mul( FACING ) );

							} );

						} );

					} );

				} );

			} );

		} )().compute( tris );

		return { mesh, pos, skin, voxelize, vcount };

	}

	// winding number = sum of crossings above each voxel (scan each column top-down)
	decode() {

		return Fn( () => {

			const c = int( instanceIndex );
			const x = c.mod( NX ), z = c.div( NX );
			const w = int( 0 ).toVar();
			Loop( { start: NY - 1, end: 0, condition: '>=', type: 'int', name: 'yy' }, ( { yy } ) => {

				const v = x.add( yy.mul( NX ) ).add( z.mul( NX * NY ) );
				w.addAssign( atomicLoad( this.crossings.element( v ) ) );
				this.occ.element( v ).assign( float( w.greaterThan( 0 ) ) );

			} );

		} )().compute( NX * NZ );

	}

	// separable 5-tap binomial blur: occ -x-> tmp -y-> tmp2 -z-> density
	blur( axis ) {

		const src = [ this.occ, this.tmp, this.tmp2 ][ axis ];
		const dst = [ this.tmp, this.tmp2, this.density ][ axis ];
		const stride = [ 1, NX, NX * NY ][ axis ];
		const size = [ NX, NY, NZ ][ axis ];
		const weights = [ 1, 4, 6, 4, 1 ];
		return Fn( () => {

			const v = int( instanceIndex );
			const c = [ v.mod( NX ), v.div( NX ).mod( NY ), v.div( NX * NY ) ][ axis ];
			const acc = float( 0 ).toVar();
			weights.forEach( ( w, k ) => {

				const o = k - 2;
				const cc = c.add( o );
				If( cc.greaterThanEqual( 0 ).and( cc.lessThan( size ) ), () => {

					acc.addAssign( src.element( v.add( o * stride ) ).mul( w / 16 ) );

				} );

			} );
			dst.element( v ).assign( acc );

		} )().compute( N );

	}

	// min-pool 2x2x2 (a mip cell is 1 only if the whole block is inside), or average-pool
	pool( src, dst, average = false ) {

		return Fn( () => {

			const v = int( instanceIndex );
			const x = v.mod( dst.nx ).mul( 2 );
			const y = v.div( dst.nx ).mod( dst.ny ).mul( 2 );
			const z = v.div( dst.nx * dst.ny ).mul( 2 );
			const m = float( average ? 0 : 1 ).toVar();
			for ( let k = 0; k < 8; k ++ ) {

				const i = x.add( k & 1 ).add( y.add( ( k >> 1 ) & 1 ).mul( src.nx ) ).add( z.add( k >> 2 ).mul( src.nx * src.ny ) );
				if ( average ) m.addAssign( src.buf.element( i ).mul( 0.125 ) );
				else m.assign( min( m, src.buf.element( i ) ) );

			}

			dst.buf.element( v ).assign( m );

		} )().compute( dst.nx * dst.ny * dst.nz );

	}

	// ---- sampling helpers for style kernels (TSL) ----

	// trilinear density at a world position (0 outside the window)
	densityAt( p ) {

		return this.trilinear( this.density, NX, NY, NZ, VOXEL, p );

	}

	// trilinear average-pooled occupancy of mip `level` (coarse, smooth body)
	avgAt( level, p ) {

		const m = this.avg[ level - 1 ];
		return this.trilinear( m.buf, m.nx, m.ny, m.nz, VOXEL * ( 1 << level ), p );

	}

	trilinear( buf, NX, NY, NZ, cell, p ) {

		const g = p.sub( this.origin ).div( cell ).sub( 0.5 ).toVar();
		const b = floor( g ).toVar();
		const f = g.sub( b ).toVar();
		const bi = int( b.x ), bj = int( b.y ), bk = int( b.z );
		const acc = float( 0 ).toVar();
		for ( let k = 0; k < 8; k ++ ) {

			const dx = k & 1, dy = ( k >> 1 ) & 1, dz = k >> 2;
			const x = bi.add( dx ), y = bj.add( dy ), z = bk.add( dz );
			const w = ( dx ? f.x : float( 1 ).sub( f.x ) ).mul( dy ? f.y : float( 1 ).sub( f.y ) ).mul( dz ? f.z : float( 1 ).sub( f.z ) );
			const ok = x.greaterThanEqual( 0 ).and( x.lessThan( NX ) ).and( y.greaterThanEqual( 0 ) ).and( y.lessThan( NY ) ).and( z.greaterThanEqual( 0 ) ).and( z.lessThan( NZ ) );
			If( ok, () => {

				acc.addAssign( buf.element( x.add( y.mul( NX ) ).add( z.mul( NX * NY ) ) ).mul( w ) );

			} );

		}

		return acc;

	}

	// occlusion from the body itself: how much body surrounds p within radius r (1 = open, ~0.3 = deep crevice)
	occlusionAt( p, r = 0.06 ) {

		const dirs = [ [ 1, 0, 0 ], [ - 1, 0, 0 ], [ 0, 1, 0 ], [ 0, - 1, 0 ], [ 0, 0, 1 ], [ 0, 0, - 1 ],
			[ 0.577, 0.577, 0.577 ], [ - 0.577, 0.577, - 0.577 ] ];
		let sum = float( 0 );
		for ( const d of dirs ) sum = sum.add( this.densityAt( p.add( vec3( ...d ).mul( r ) ) ) );
		return clamp( float( 1.35 ).sub( sum.div( dirs.length ).mul( 1.3 ) ), 0.28, 1 );

	}

	// 1 if the whole mip cell (2^level voxels wide) containing world point p is inside
	fullAt( level, p ) {

		const m = this.mips[ level - 1 ];
		const g = vec3( p.sub( this.origin ).div( VOXEL * ( 1 << level ) ) ).toVar();
		const x = int( floor( g.x ) ), y = int( floor( g.y ) ), z = int( floor( g.z ) );
		const ok = x.greaterThanEqual( 0 ).and( x.lessThan( m.nx ) ).and( y.greaterThanEqual( 0 ) ).and( y.lessThan( m.ny ) ).and( z.greaterThanEqual( 0 ) ).and( z.lessThan( m.nz ) );
		return select( ok, m.buf.element( x.add( y.mul( m.nx ) ).add( z.mul( m.nx * m.ny ) ) ), float( 0 ) );

	}

	// ---- per frame ----

	update( renderer ) {

		const c = this.figure.center;
		// snap to 8 voxels so every mip level's cells stay world-aligned while the window moves
		const gx = Math.round( c.x / ( 8 * VOXEL ) ) * 8 - NX / 2;
		const gz = Math.round( c.z / ( 8 * VOXEL ) ) * 8 - NZ / 2;
		this.g0.x.value = gx;
		this.g0.z.value = gz;
		this.origin.value.set( gx * VOXEL, 0, gz * VOXEL );
		for ( const m of this.figure.meshes ) m.updateMatrixWorld();
		this.torsoLen.value = this.figure.constructor.torsoFrame( this.figure.torsoJointsWorld(), this.torsoInv.value );
		renderer.compute( this.kernels );

	}

}

export const VOLUME_DIMS = { NX, NY, NZ, VOXEL };
