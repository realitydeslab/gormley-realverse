// BIG / CONSTRUCTED BEAMERS, HERMITAGE / ATAXIA, GRID WORKS, SCAFFOLDS.
// Bars on world-anchored lines, clipped where each line crosses the body's density field.
// 'courses': bars stacked in courses, x and z alternating, verticals through the gaps (Beamers).
// 'grid':    x, z and y rods meeting at shared nodes, a thin cage (Grid Works, Scaffolds).
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, int, float, vec3, instanceIndex, floor, max, min, abs, select } from 'three/tsl';
import { Style, hash3 } from './common.js';
import { InstancePool, boxMatrix } from '../gpu/instances.js';
import { VOXEL, NX, NY, NZ } from '../gpu/volume.js';

const SPAN_X = NX * VOXEL, SPAN_Y = NY * VOXEL, SPAN_Z = NZ * VOXEL;
const STEPS = 96;

export class Beamers extends Style {

	constructor( ctx, def ) {

		super( ctx, def );
		const p = this.p;
		p.pattern ??= 'courses';
		p.w ??= 0.045; // bar section (m)
		p.pitch ??= 0.06; // distance between parallel bars (m)
		p.vert ??= 0.4; // fraction of vertical bars kept
		p.keep ??= 1.0; // fraction of horizontal bars kept
		p.jitter ??= 0.0; // random shift of bar ends (m)
		p.overshoot ??= 0.0; // scaffolds: bars run past the skin (m)
		p.minLen ??= 0.0;
		p.iso ??= 0.5; // density threshold defining the skin
		this.pool = new InstancePool( { max: 30000, geometry: new THREE.BoxGeometry( 1, 1, 1 ), finish: def.finish, alt: def.alt, colors: true } );
		this.objects.push( this.pool.mesh );
		p.nodes ??= 0; // Mined Gridworks: cube welded at every lattice node inside the body (size, m)
		this.kernel = this.build();
		this.kernels = [ this.kernel ];
		if ( p.nodes > 0 ) this.kernels.push( this.buildNodes() );

	}

	buildNodes() {

		const vol = this.ctx.volume;
		const p = this.p;
		const { nh, layers } = this.lineCounts();
		return Fn( () => {

			const t = int( instanceIndex );
			const lx0 = int( floor( vol.origin.x.div( p.pitch ) ) ), lz0 = int( floor( vol.origin.z.div( p.pitch ) ) );
			const i = lx0.add( t.mod( nh ) ), k = lz0.add( t.div( nh ).mod( nh ) ), j = t.div( nh * nh );
			const c = vec3( float( i ).mul( p.pitch ), float( j ).add( 0.5 ).mul( p.pitch ), float( k ).mul( p.pitch ) );
			const g = this.gain( c );
			If( j.lessThan( layers ).and( vol.densityAt( c ).greaterThan( p.iso ) ).and( g.greaterThan( 0.02 ) ), () => {

				this.pool.emit( boxMatrix( c, vec3( p.nodes ).mul( g ) ), vec3( 0.9, 0, 0 ) );

			} );

		} )().compute( nh * nh * layers );

	}

	lineCounts() {

		const p = this.p;
		const nh = Math.ceil( SPAN_X / p.pitch ) + 1; // lines per course per direction
		const layerH = p.pattern === 'courses' ? p.w : p.pitch;
		const layers = Math.floor( SPAN_Y / layerH );
		return { nh, layers, cX: layers * nh, cZ: layers * nh, cY: nh * nh };

	}

	build() {

		const vol = this.ctx.volume;
		const p = this.p;
		const { nh, layers, cX, cZ, cY } = this.lineCounts();
		const pitch = p.pitch;
		const courses = p.pattern === 'courses';
		this.threads = cX + cZ + cY;

		return Fn( () => {

			const line = int( instanceIndex );
			// world lattice index of the window's first line (window moves in 16 cm steps)
			const lx0 = int( floor( vol.origin.x.div( pitch ) ) );
			const lz0 = int( floor( vol.origin.z.div( pitch ) ) );
			const org = vec3( 0 ).toVar();
			const dir = vec3( 0 ).toVar();
			const len = float( 0 ).toVar();
			const keep = float( 1 ).toVar();
			const id = vec3( 0 ).toVar(); // world lattice id for hashing
			const layerH = courses ? p.w : pitch;

			If( line.lessThan( cX ), () => {

				// X bars; in 'courses' only even layers carry X, odd layers are empty for X
				const j = line.div( nh ), k = lz0.add( line.mod( nh ) );
				const stagger = courses ? float( j.div( 2 ).mod( 2 ) ).mul( pitch * 0.5 ) : float( 0 );
				org.assign( vec3( vol.origin.x, float( j ).add( 0.5 ).mul( layerH ), float( k ).mul( pitch ).add( stagger ) ) );
				dir.assign( vec3( 1, 0, 0 ) );
				len.assign( SPAN_X );
				id.assign( vec3( 0, float( j ), float( k ) ) );
				if ( courses ) keep.assign( select( j.mod( 2 ).equal( 0 ), 1.0, 0.0 ) );

			} ).ElseIf( line.lessThan( cX + cZ ), () => {

				const l = line.sub( cX );
				const j = l.div( nh ), i = lx0.add( l.mod( nh ) );
				const stagger = courses ? float( j.div( 2 ).mod( 2 ) ).mul( pitch * 0.5 ) : float( 0 );
				org.assign( vec3( float( i ).mul( pitch ).add( stagger ), float( j ).add( 0.5 ).mul( layerH ), vol.origin.z ) );
				dir.assign( vec3( 0, 0, 1 ) );
				len.assign( SPAN_Z );
				id.assign( vec3( float( i ), float( j ), 1 ) );
				if ( courses ) keep.assign( select( j.mod( 2 ).equal( 1 ), 1.0, 0.0 ) );

			} ).Else( () => {

				const l = line.sub( cX + cZ );
				const i = lx0.add( l.div( nh ) ), k = lz0.add( l.mod( nh ) );
				// courses: verticals sit in the gaps between horizontal bars; grid: on the nodes
				const off = courses ? pitch * 0.5 : 0;
				org.assign( vec3( float( i ).mul( pitch ).add( off ), 0, float( k ).mul( pitch ).add( off ) ) );
				dir.assign( vec3( 0, 1, 0 ) );
				len.assign( SPAN_Y );
				id.assign( vec3( float( i ), 7, float( k ) ) );
				keep.assign( select( hash3( i, 3, k, 5 ).lessThan( p.vert ), 1.0, 0.0 ) );

			} );

			If( keep.greaterThan( 0.5 ), () => {

				const s = len.div( STEPS );
				const prev = vol.densityAt( org ).sub( p.iso ).toVar();
				const tIn = float( 0 ).toVar();
				const seg = int( 0 ).toVar();

				Loop( { start: 0, end: STEPS, type: 'int', name: 'st' }, ( { st } ) => {

					const t = float( st ).add( 1 ).mul( s );
					const d = vol.densityAt( org.add( dir.mul( t ) ) ).sub( p.iso ).toVar();
					// linear root between samples keeps bar ends continuous as the body moves
					const tc = t.sub( s ).add( s.mul( abs( prev ).div( max( abs( prev.sub( d ) ), 1e-6 ) ) ) );

					If( prev.lessThanEqual( 0 ).and( d.greaterThan( 0 ) ), () => {

						tIn.assign( tc );

					} );

					If( prev.greaterThan( 0 ).and( d.lessThanEqual( 0 ) ), () => {

						const hx = int( id.x ), hy = int( id.y ), hz = int( id.z ).add( seg.mul( 1000 ) );
						const a = tIn.sub( hash3( hx, hy, hz, 1 ).mul( p.overshoot ) ).add( hash3( hx, hy, hz, 2 ).sub( 0.5 ).mul( p.jitter ) );
						const b = tc.add( hash3( hx, hy, hz, 3 ).mul( p.overshoot ) ).add( hash3( hx, hy, hz, 4 ).sub( 0.5 ).mul( p.jitter ) );
						const L = max( b.sub( a ), 0 );
						const c = org.add( dir.mul( a.add( b ).mul( 0.5 ) ) );
						const g = this.gain( c );
						const kept = hash3( hx, hy, hz, 6 ).lessThan( p.keep ).and( L.greaterThan( p.minLen ) );
						If( kept.and( g.greaterThan( 0.02 ) ), () => {

							const thick = min( g.mul( 3 ), 1 ).mul( p.w );
							const size = dir.mul( L.mul( g ) ).add( vec3( 1 ).sub( dir ).mul( thick ) );
							const tint = float( 0.85 ).add( hash3( hx, hy, hz, 8 ).mul( 0.25 ) ).mul( vol.occlusionAt( c, p.pitch ) );
							const alt = select( hash3( hx, hy, hz, 9 ).lessThan( p.altShare ?? 0 ), 1.0, 0.0 );
							this.pool.emit( boxMatrix( c, size ), vec3( tint, alt, 0 ) );

						} );
						seg.addAssign( 1 );

					} );

					prev.assign( d );

				} );

			} );

		} )().compute( this.threads );

	}

	update( renderer ) {

		this.pool.run( renderer, this.kernels );

	}

}
