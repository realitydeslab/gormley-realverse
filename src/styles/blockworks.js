// BLOCKWORKS (2003–07) and CAST / AGGREGATE BLOCKWORKS (2005–26).
// Octree-style fill of the posed body: the largest world-aligned cube that is fully
// inside becomes one block; the skin is made of small blocks, each stretched along
// one random axis so the surface bristles like the cast-iron originals.
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, int, float, vec3, instanceIndex, select } from 'three/tsl';
import { Style, hash3 } from './common.js';
import { InstancePool, boxMatrix } from '../gpu/instances.js';
import { VOXEL, NX, NY, NZ } from '../gpu/volume.js';

export class Blockworks extends Style {

	constructor( ctx, def ) {

		super( ctx, def );
		const p = this.p;
		p.fine ??= true; // 2 cm skin blocks (2003 Blockworks) vs 4 cm (Cast Blockworks)
		p.elong ??= 1.6; // max extra length along the random axis, in block sizes
		p.protrude ??= 0.35; // how far skin blocks may push outward, in block sizes
		p.gap ??= 0.0; // probability that a skin block is omitted
		p.shrink ??= 0.92; // < 1 leaves a seam between blocks
		p.coarse ??= 0.82; // density above which a skin cell becomes one 4 cm block
		p.levels ??= [ 2 ]; // interior block sizes: 3 = 16 cm, 2 = 8 cm
		this.pool = new InstancePool( { max: 90000, geometry: new THREE.BoxGeometry( 1, 1, 1 ), finish: def.finish, alt: def.alt, colors: true } );
		this.objects.push( this.pool.mesh );
		this.kernel = this.build();

	}

	build() {

		const vol = this.ctx.volume;
		const p = this.p;
		const n1 = { x: NX / 2, y: NY / 2, z: NZ / 2 };
		const s = VOXEL;

		// emits a block whose base cube has edge `e` (m) centred at c, jittered by world hash (gx,gy,gz)
		const block = ( c, e, gx, gy, gz, salt ) => {

			const r1 = hash3( gx, gy, gz, salt ), r2 = hash3( gx, gy, gz, salt + 1 ), r3 = hash3( gx, gy, gz, salt + 2 );
			const axis = int( r1.mul( 2.999 ) );
			const ax = vec3( select( axis.equal( 0 ), 1.0, 0.0 ), select( axis.equal( 1 ), 1.0, 0.0 ), select( axis.equal( 2 ), 1.0, 0.0 ) );
			const extra = r2.mul( p.elong ).mul( e );
			const size = vec3( e ).add( ax.mul( extra ) ).mul( p.shrink );
			const shift = ax.mul( extra.mul( r3.sub( 0.5 ) ) );
			const g = this.gain( c );
			const tint = float( 0.82 ).add( hash3( gx, gy, gz, salt + 3 ).mul( 0.3 ) ).mul( vol.occlusionAt( c, e * 1.5 + 0.02 ) );
			// Ataxia: a share of blocks in the alternate finish (rust + grey)
			const alt = select( hash3( gx, gy, gz, salt + 4 ).lessThan( p.altShare ?? 0 ), 1.0, 0.0 );
			If( g.greaterThan( 0.02 ), () => {

				this.pool.emit( boxMatrix( c.add( shift ), size.mul( g ) ), vec3( tint, alt, 0 ) );

			} );

		};

		return Fn( () => {

			const t = int( instanceIndex );
			const cx = t.mod( n1.x ), cy = t.div( n1.x ).mod( n1.y ), cz = t.div( n1.x * n1.y );
			// world voxel index of this 2x2x2 cell's min corner
			const gx = vol.g0.x.add( cx.mul( 2 ) ), gy = cy.mul( 2 ), gz = vol.g0.z.add( cz.mul( 2 ) );
			const corner = vec3( float( gx ), float( gy ), float( gz ) ).mul( s );
			const done = int( 0 ).toVar();

			// levels 3 (16 cm) and 2 (8 cm): only the anchor child emits the big block
			for ( const L of p.levels ) {

				const k = 1 << ( L - 1 ); // level-1 cells per side of the ancestor
				const anchor = cx.mod( k ).equal( 0 ).and( cy.mod( k ).equal( 0 ) ).and( cz.mod( k ).equal( 0 ) );
				const e = s * ( 1 << L );
				If( done.equal( 0 ).and( vol.fullAt( L, corner.add( s ) ).greaterThan( 0.5 ) ), () => {

					done.assign( 1 );
					If( anchor, () => {

						block( corner.add( e / 2 ), e, gx, gy, gz, L * 7 );

					} );

				} );

			}

			If( done.equal( 0 ), () => {

				const e1 = s * 2;
				const c1 = corner.add( s );
				const d1 = vol.densityAt( c1 );
				if ( p.fine ) {

					// 4 cm block if mostly inside, else the 2 cm voxels that are inside
					If( d1.greaterThan( p.coarse ), () => {

						block( c1, e1, gx, gy, gz, 1 );

					} ).Else( () => {

						Loop( { start: 0, end: 8, type: 'int', name: 'sub' }, ( { sub } ) => {

							const o = vec3( float( sub.bitAnd( 1 ) ), float( sub.shiftRight( 1 ).bitAnd( 1 ) ), float( sub.shiftRight( 2 ) ) );
							const c0 = corner.add( o.add( 0.5 ).mul( s ) );
							const sx = gx.add( sub.bitAnd( 1 ) ), sy = gy.add( sub.shiftRight( 1 ).bitAnd( 1 ) ), sz = gz.add( sub.shiftRight( 2 ) );
							const keep = hash3( sx, sy, sz, 99 ).greaterThanEqual( p.gap );
							If( vol.densityAt( c0 ).greaterThan( 0.5 - p.protrude * 0.25 ).and( keep ), () => {

								block( c0, s, sx, sy, sz, 0 );

							} );

						} );

					} );

				} else if ( p.skinLevel === 2 ) {

					// coarse skin: one 8 cm block per 2x2x2 group where the group's centre is inside;
					// otherwise (thin limbs) fall back to 4 cm blocks so shins and wrists survive
					const ox = cx.mod( 2 ), oy = cy.mod( 2 ), oz = cz.mod( 2 );
					const anchor = ox.equal( 0 ).and( oy.equal( 0 ) ).and( oz.equal( 0 ) );
					const agx = gx.sub( ox.mul( 2 ) ), agy = gy.sub( oy.mul( 2 ) ), agz = gz.sub( oz.mul( 2 ) );
					const c2 = vec3( float( agx ), float( agy ), float( agz ) ).mul( s ).add( s * 2 );
					const group = hash3( agx, agy, agz, 98 ).greaterThanEqual( p.gap ).and( vol.densityAt( c2 ).greaterThan( 0.5 - p.protrude * 0.3 ) );
					If( group, () => {

						If( anchor, () => {

							block( c2, s * 4, agx, agy, agz, 2 );

						} );

					} ).ElseIf( d1.greaterThan( 0.55 ), () => {

						block( c1, e1, gx, gy, gz, 1 );

					} );

				} else {

					const keep = hash3( gx, gy, gz, 98 ).greaterThanEqual( p.gap );
					If( d1.greaterThan( 0.5 - p.protrude * 0.3 ).and( keep ), () => {

						block( c1, e1, gx, gy, gz, 1 );

					} );

				}

			} );

		} )().compute( n1.x * n1.y * n1.z );

	}

	update( renderer ) {

		this.pool.run( renderer, [ this.kernel ] );

	}

}
