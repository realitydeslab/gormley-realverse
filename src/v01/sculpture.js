// Three Gormley construction languages, each a compute kernel that rebuilds an
// instanced mesh from the body SDF every frame (the WebGPU stand-in for a geometry shader).
// All lattices are anchored to world space: the room's grid "builds" the moving body.
import * as THREE from 'three/webgpu';
import {
	Fn, If, Loop, float, int, uint, vec3, uniform, instancedArray, instanceIndex,
	hash, length, max, min, mix, select, smoothstep, step,
} from 'three/tsl';
import { createMetalMaterial } from './materials.js';

const R = 1.05; // window half-extent (m) around the body's bounding-box centre
const H = 2.4; // window height (m)
const BAND = 0.35; // softness of the transformation wave front (m)

export const STYLES = [
	{ id: 'beamer', label: 'BEAMER', note: 'mild steel bar, three Cartesian axes', finish: 'steel', unit: [ 0.03, 0.042 ] },
	{ id: 'block', label: 'BLOCKWORK', note: 'cast iron, stacked blocks', finish: 'iron', unit: [ 0.06, 0.085 ] },
	{ id: 'open', label: 'OPEN BLOCKWORK', note: '8 mm Corten plate, open cells', finish: 'corten', unit: [ 0.075, 0.1 ] },
];

function uintSeed( gx, gy, gz ) {

	return uint( gx.add( 20000 ) ).mul( 7919 ).add( uint( gy.add( 100 ) ).mul( 104729 ) ).add( uint( gz.add( 20000 ) ).mul( 1299709 ) );

}

class StyleLayer {

	constructor( def, bodySDF, waveOrigin ) {

		this.def = def;
		this.bodySDF = bodySDF;
		this.waveOrigin = waveOrigin;
		this.u = {
			unit: uniform( def.unit[ 0 ] ),
			m: uniform( 0, 'int' ),
			layers: uniform( 0, 'int' ),
			gx0: uniform( 0, 'int' ),
			gz0: uniform( 0, 'int' ),
			radius: uniform( 0 ),
			incoming: uniform( 1 ),
		};
		this.state = 'hidden'; // hidden | in | out | steady
		this.threads = this.maxThreads( def.unit[ 0 ] );
		this.instances = this.threads * this.perThread;
		this.offset = instancedArray( this.instances, 'vec3' );
		this.scale = instancedArray( this.instances, 'vec3' );
		this.kernel = this.buildKernel().compute( this.threads );

		const mat = createMetalMaterial( def.finish, this.offset, this.scale, instanceIndex );
		this.mesh = new THREE.InstancedMesh( new THREE.BoxGeometry( 1, 1, 1 ), mat, this.instances );
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = true;
		this.mesh.receiveShadow = true;
		this.mesh.visible = false;
		this.setUnit( def.unit[ 0 ] );

	}

	// 0 at the outgoing side of the wave, 1 at the incoming side.
	gain( p ) {

		const inside = float( 1 ).sub( smoothstep( this.u.radius.sub( BAND ), this.u.radius, length( p.sub( this.waveOrigin ) ) ) );
		return mix( float( 1 ).sub( inside ), inside, this.u.incoming );

	}

	randomizeUnit() {

		const [ lo, hi ] = this.def.unit;
		this.setUnit( lo + Math.random() * ( hi - lo ) );

	}

	// Moves the lattice window with the body, snapped to whole lattice steps.
	follow( center ) {

		const step = this.windowStep();
		this.u.gx0.value = Math.round( center.x / step ) - this.u.m.value;
		this.u.gz0.value = Math.round( center.z / step ) - this.u.m.value;

	}

	update( renderer ) {

		if ( this.state === 'hidden' ) return;
		renderer.compute( this.kernel );

	}

}

// BEAMER: bars along x and z in alternating courses, verticals threading the gaps.
class Beamer extends StyleLayer {

	get perThread() { return 4; } // max intervals kept per lattice line

	maxThreads( h ) {

		const w2 = 2 * Math.floor( R / ( 2 * h ) ) + 1;
		return 2 * Math.floor( H / ( 2 * h ) ) * w2 + w2 * w2;

	}

	windowStep() { return 2 * this.u.unit.value; }

	setUnit( h ) {

		this.u.unit.value = h;
		this.u.m.value = Math.floor( R / ( 2 * h ) );
		this.u.layers.value = Math.floor( H / ( 2 * h ) );

	}

	buildKernel() {

		const { unit: h, m, layers, gx0, gz0 } = this.u;
		const K = this.perThread;
		const STEPS = 96;
		return Fn( () => {

			const line = int( instanceIndex );
			const base = line.mul( K );
			Loop( { start: 0, end: K, type: 'int', name: 'slot' }, ( { slot } ) => {

				this.scale.element( base.add( slot ) ).assign( vec3( 0 ) );

			} );

			const h2 = h.mul( 2 );
			const w2 = m.mul( 2 ).add( 1 );
			const cX = layers.mul( w2 );
			const span = float( w2 ).mul( h2 );

			If( line.lessThan( cX.mul( 2 ).add( w2.mul( w2 ) ) ), () => {

				const org = vec3( 0 ).toVar();
				const dir = vec3( 0 ).toVar();
				const len = float( 0 ).toVar();
				const keep = float( 1 ).toVar();

				If( line.lessThan( cX ), () => {

					// course 2j: bars along x at z = 2k·h
					const j = line.div( w2 );
					const k = gz0.add( line.mod( w2 ) );
					org.assign( vec3( float( gx0 ).mul( h2 ).sub( h ), float( j ).mul( h2 ).add( h.mul( 0.5 ) ), float( k ).mul( h2 ) ) );
					dir.assign( vec3( 1, 0, 0 ) );
					len.assign( span );

				} ).ElseIf( line.lessThan( cX.mul( 2 ) ), () => {

					// course 2j+1: bars along z at x = (2i+1)·h
					const l = line.sub( cX );
					const j = l.div( w2 );
					const i = gx0.add( l.mod( w2 ) );
					org.assign( vec3( float( i ).mul( h2 ).add( h ), float( j ).mul( h2 ).add( h.mul( 1.5 ) ), float( gz0 ).mul( h2 ).sub( h ) ) );
					dir.assign( vec3( 0, 0, 1 ) );
					len.assign( span );

				} ).Else( () => {

					// verticals at (2i·h, (2k+1)·h) pass through both courses' gaps
					const l = line.sub( cX.mul( 2 ) );
					const i = gx0.add( l.div( w2 ) );
					const k = gz0.add( l.mod( w2 ) );
					org.assign( vec3( float( i ).mul( h2 ), 0, float( k ).mul( h2 ).add( h ) ) );
					dir.assign( vec3( 0, 1, 0 ) );
					len.assign( H );
					keep.assign( step( hash( uintSeed( i, int( 0 ), k ) ), 0.45 ) );

				} );

				const s = len.div( STEPS );
				const prevD = this.bodySDF( org ).toVar();
				const tEnter = float( 0 ).toVar();
				const count = int( 0 ).toVar();
				const w = h.mul( 0.92 );

				Loop( { start: 0, end: STEPS, type: 'int', name: 'marchStep' }, ( { marchStep } ) => {

					const t = float( marchStep ).add( 1 ).mul( s );
					const d = this.bodySDF( org.add( dir.mul( t ) ) ).toVar();
					// linear root between samples keeps bar ends continuous as the body moves
					const tc = t.sub( s ).add( s.mul( prevD.div( max( prevD.sub( d ).abs(), 1e-6 ) ).abs() ) );

					If( prevD.greaterThanEqual( 0 ).and( d.lessThan( 0 ) ), () => {

						tEnter.assign( tc );

					} );

					If( prevD.lessThan( 0 ).and( d.greaterThanEqual( 0 ) ).and( count.lessThan( K ) ), () => {

						const c = org.add( dir.mul( tEnter.add( tc ).mul( 0.5 ) ) );
						const g = this.gain( c ).mul( keep );
						const thick = w.mul( min( g.mul( 3 ), 1 ) );
						const L = tc.sub( tEnter ).mul( g );
						this.scale.element( base.add( count ) ).assign( dir.mul( L ).add( vec3( 1 ).sub( dir ).mul( thick ) ) );
						this.offset.element( base.add( count ) ).assign( c );
						count.addAssign( 1 );

					} );

					prevD.assign( d );

				} );

			} );

		} )();

	}

}

// Shared cell indexing for the voxel-based styles.
class CellLayer extends StyleLayer {

	windowStep() { return this.u.unit.value; }

	cellCounts( b ) {

		const m = Math.ceil( R / b );
		return { m, n: 2 * m + 1, layers: Math.floor( H / ( b * this.yScale ) ) };

	}

	maxThreads( b ) {

		const { n, layers } = this.cellCounts( b );
		return n * n * layers * this.orientations;

	}

	setUnit( b ) {

		const { m, layers } = this.cellCounts( b );
		this.u.unit.value = b;
		this.u.m.value = m;
		this.u.layers.value = layers;

	}

	// tid -> global cell ints (gx, gy, gz) plus orientation o; valid=false past the window
	cell( tid ) {

		const { m, layers, gx0, gz0 } = this.u;
		const n = m.mul( 2 ).add( 1 );
		const o = tid.mod( this.orientations );
		const c = tid.div( this.orientations );
		const gx = gx0.add( c.mod( n ) );
		const gz = gz0.add( c.div( n ).mod( n ) );
		const gy = c.div( n.mul( n ) );
		return { gx, gy, gz, o, valid: gy.lessThan( layers ) };

	}

}

// BLOCKWORK: brick-bonded blocks, long axis alternating x/z by course.
class Blockwork extends CellLayer {

	get perThread() { return 1; }
	get orientations() { return 1; }
	get yScale() { return 0.65; }

	buildKernel() {

		const b = this.u.unit;
		return Fn( () => {

			const tid = int( instanceIndex );
			const { gx, gy, gz, valid } = this.cell( tid );
			const by = b.mul( this.yScale );
			const center = vec3( float( gx ).add( 0.5 ).mul( b ), float( gy ).add( 0.5 ).mul( by ), float( gz ).add( 0.5 ).mul( b ) );
			const d = this.bodySDF( center );
			const seed = uintSeed( gx, gy, gz );
			const r1 = hash( seed );
			const r2 = hash( seed.add( 17 ) );
			const r3 = hash( seed.add( 31 ) );
			const ext = b.mul( r1.mul( 1.3 ).add( 1 ) );
			const shift = r2.sub( 0.5 ).mul( ext.sub( b ) );
			const parity = float( gy.mod( 2 ) );
			const dims = mix( vec3( ext, by.mul( 0.95 ), b.mul( 0.93 ) ), vec3( b.mul( 0.93 ), by.mul( 0.95 ), ext ), parity );
			const off = mix( vec3( shift, 0, 0 ), vec3( 0, 0, shift ), parity );
			// shrink toward the skin so the surface reads as graded block sizes; cull deep interior
			const f = smoothstep( b.mul( 0.3 ), b.mul( - 0.3 ), d ).mul( step( b.mul( - 2.5 ), d ) ).mul( this.gain( center ) );
			const s = select( valid, f.mul( r3.mul( 0.15 ).add( 0.85 ) ), float( 0 ) );
			this.scale.element( tid ).assign( dims.mul( s ) );
			this.offset.element( tid ).assign( center.add( off ) );

		} )();

	}

}

// OPEN BLOCKWORK: thin plates on the lattice planes near the skin -> an open cellular shell.
class OpenBlockwork extends CellLayer {

	get perThread() { return 1; }
	get orientations() { return 3; }
	get yScale() { return 1; }

	buildKernel() {

		const c = this.u.unit;
		return Fn( () => {

			const tid = int( instanceIndex );
			const { gx, gy, gz, o, valid } = this.cell( tid );
			const e = vec3( select( o.equal( 0 ), 1.0, 0.0 ), select( o.equal( 1 ), 1.0, 0.0 ), select( o.equal( 2 ), 1.0, 0.0 ) );
			const corner = vec3( float( gx ), float( gy ), float( gz ) ).mul( c );
			const center = corner.add( vec3( 1 ).sub( e ).mul( c.mul( 0.5 ) ) );
			const t = c.mul( 0.1 );
			const dims = vec3( 1 ).sub( e ).mul( c.add( t ) ).add( e.mul( t ) );
			const d = this.bodySDF( center );
			const shell = c.mul( 1.1 );
			const keep = step( hash( uintSeed( gx, gy, gz ).mul( 3 ).add( uint( o ) ) ), select( o.equal( 1 ), 0.55, 0.8 ) );
			const f = smoothstep( c.mul( 0.18 ), c.mul( 0.06 ), d ) // narrow band: plates snap rather than shrink into debris
				.mul( smoothstep( shell.negate().sub( 0.1 ), shell.negate(), d ) ).mul( keep ).mul( this.gain( center ) );
			this.scale.element( tid ).assign( dims.mul( select( valid, f, float( 0 ) ) ) );
			this.offset.element( tid ).assign( center );

		} )();

	}

}

const CLASSES = { beamer: Beamer, block: Blockwork, open: OpenBlockwork };

export class Sculpture {

	constructor( bodySDF ) {

		this.waveOrigin = uniform( new THREE.Vector3() );
		this.waveLocal = new THREE.Vector3(); // origin stored relative to the walking body
		this.layers = STYLES.map( ( def ) => new CLASSES[ def.id ]( def, bodySDF, this.waveOrigin ) );
		this.group = new THREE.Group();
		for ( const l of this.layers ) this.group.add( l.mesh );
		this.current = null;
		this.previous = null;
		this.radius = 0;

	}

	get currentIndex() { return this.layers.indexOf( this.current ); }

	// Starts a transformation wave from a world point (attached to the body).
	transformTo( index, worldPoint, bodyRoot ) {

		this.finishTransition();
		const next = this.layers[ index ];
		if ( next === this.current ) return;
		this.waveLocal.copy( worldPoint );
		bodyRoot.worldToLocal( this.waveLocal );
		next.randomizeUnit();
		next.state = 'in';
		next.u.incoming.value = 1;
		next.mesh.visible = true;
		if ( this.current ) {

			this.current.state = 'out';
			this.current.u.incoming.value = 0;
			this.previous = this.current;

		}

		this.current = next;
		this.radius = 0;

	}

	finishTransition() {

		if ( this.previous ) {

			this.previous.state = 'hidden';
			this.previous.mesh.visible = false;
			this.previous = null;

		}

		if ( this.current ) {

			this.current.state = 'steady';
			this.current.u.radius.value = 1e3;

		}

	}

	update( renderer, dt, bodyRoot, center ) {

		this.waveOrigin.value.copy( this.waveLocal );
		bodyRoot.localToWorld( this.waveOrigin.value );
		if ( this.current && this.current.state === 'in' ) {

			this.radius += dt * 0.85;
			for ( const l of [ this.current, this.previous ] ) if ( l ) l.u.radius.value = this.radius;
			if ( this.radius > 2.6 ) this.finishTransition();

		}

		for ( const l of this.layers ) {

			l.follow( center );
			l.update( renderer );

		}

	}

}
