// CAST BODY family: bodycases, Another Place / Event Horizon, Expansion, Insiders, Polyhedra,
// lead cases with solder seams, Three Part cases, A Case for an Angel, Extended Works,
// Concrete Works, Blanket Drawings, Man Rock and Planets, props (beam, house, blanket).
// The posed body is ray-marched as an isosurface of the GPU volume, so it reads as one cast.
import * as THREE from 'three/webgpu';
import {
	Fn, If, Loop, Break, Discard, int, float, vec3, vec4, uniform, normalize, min, max, floor, abs, fract, mix, smoothstep, color,
	cameraPosition, positionWorld, cameraViewMatrix, cameraNear, cameraFar, viewZToPerspectiveDepth, hash, mx_noise_float, select,
} from 'three/tsl';
import { Style } from './common.js';
import { finishMaterial, finishLayers } from '../materials.js';

const MAX_PROPS = 4, MAX_CUTS = 2;

export class CastBody extends Style {

	constructor( ctx, def ) {

		super( ctx, def );
		const p = this.p;
		p.field ??= 'fine'; // fine | inflate | erode | rock
		p.iso ??= 0.5;
		p.step ??= 0.012;
		p.facets ??= 0; // Polyhedra: facet size (m); 0 = smooth
		p.margin ??= 0.12;
		p.seams ??= false; // lead cases: soldered seam lines
		p.flatten ??= 0; // Blanket Drawings: body pressed to this thickness factor (0 = off)
		p.block ??= false; // Concrete Works: body as a void inside a concrete block
		p.cuts ??= []; // Three Part cases: cut planes at these joints
		p.props ??= []; // [{ bone|'root', offset:[x,y,z] (m, figure frame), size:[x,y,z], alt, finish }]
		this.lo = uniform( new THREE.Vector3() );
		this.hi = uniform( new THREE.Vector3() );
		this.toLocal = uniform( new THREE.Matrix4() );
		this.toWorld = uniform( new THREE.Matrix4() );
		this.propU = Array.from( { length: MAX_PROPS }, () => ( { inv: uniform( new THREE.Matrix4() ), half: uniform( new THREE.Vector3() ) } ) );
		this.cutU = Array.from( { length: MAX_CUTS }, () => ( { o: uniform( new THREE.Vector3( 0, - 99, 0 ) ), n: uniform( new THREE.Vector3( 0, 1, 0 ) ) } ) );
		const material = finishMaterial( def.finish, { side: THREE.BackSide } );
		this.buildMaterial( material );
		this.proxy = new THREE.Mesh( new THREE.BoxGeometry( 1, 1, 1 ), material );
		this.proxy.frustumCulled = false;
		this.objects.push( this.proxy );

		// shadows come from the skinned mesh itself, drawn into the shadow map only
		this.shadowCaster = new THREE.MeshBasicNodeMaterial( { colorWrite: false, depthWrite: false } );

	}

	bodyField( q ) {

		const vol = this.ctx.volume;
		const p = this.p;
		if ( p.flatten ) {

			// sample the volume at a point stretched in local depth: the body becomes a relief
			const l = this.toLocal.mul( vec4( q, 1 ) ).xyz;
			const s = this.toWorld.mul( vec4( l.x, l.y, l.z.div( p.flatten ), 1 ) ).xyz;
			return vol.densityAt( s );

		}

		if ( p.field === 'inflate' ) return vol.avgAt( 2, q ).add( vol.avgAt( 3, q ) ).mul( 0.5 );
		if ( p.field === 'rock' ) return vol.avgAt( 3, q ).add( mx_noise_float( q.mul( 5 ) ).mul( 0.05 ) );
		if ( p.field === 'erode' ) return vol.densityAt( q ).add( vol.avgAt( 1, q ) ).mul( 0.5 );
		return vol.densityAt( q );

	}

	// 1 inside an oriented box prop, 0 outside (soft over 5 mm)
	propField( q, i ) {

		const u = this.propU[ i ];
		const d = abs( u.inv.mul( vec4( q, 1 ) ).xyz ).sub( u.half );
		return smoothstep( 0.005, - 0.005, max( max( d.x, d.y ), d.z ) );

	}

	// vec3( field, isAltFinish, 0 )
	field( q ) {

		const p = this.p;
		let f = this.bodyField( q );
		if ( p.block ) {

			// Concrete Works: a block around the body; where the body reaches the surface it shows as a void
			const d = max( this.lo.sub( q ), q.sub( this.hi ) );
			const inBox = smoothstep( 0.01, - 0.01, max( max( d.x, d.y ), d.z ) );
			f = inBox.mul( float( 1 ).sub( smoothstep( 0.45, 0.6, f ).mul( 0.95 ) ) );

		}

		p.cuts.forEach( ( name, i ) => {

			const c = this.cutU[ i ];
			f = f.mul( smoothstep( 0.008, 0.016, abs( q.sub( c.o ).dot( c.n ) ) ) );

		} );

		let alt = float( 0 );
		p.props.forEach( ( pr, i ) => {

			const pf = this.propField( q, i );
			if ( pr.alt ) alt = select( pf.greaterThan( f ), float( 1 ), alt );
			f = max( f, pf );

		} );
		return vec3( f.mul( this.gain( q ) ), alt, 0 );

	}

	buildMaterial( m ) {

		const p = this.p;
		const iso = float( p.iso ), step = float( p.step );
		const STEPS = 240;

		const hit = Fn( () => {

			const ro = cameraPosition;
			const rd = normalize( positionWorld.sub( ro ) ).toVar();
			const inv = vec3( 1 ).div( rd );
			const ta = this.lo.sub( ro ).mul( inv ), tb = this.hi.sub( ro ).mul( inv );
			const t0 = max( max( min( ta.x, tb.x ), min( ta.y, tb.y ) ), min( ta.z, tb.z ) ).max( 0 );
			const t1 = min( min( max( ta.x, tb.x ), max( ta.y, tb.y ) ), max( ta.z, tb.z ) );
			const t = t0.toVar(), found = int( 0 ).toVar();
			Loop( { start: 0, end: STEPS, type: 'int', name: 'rm' }, () => {

				If( t.greaterThan( t1 ), () => {

					Break();

				} );
				If( this.field( ro.add( rd.mul( t ) ) ).x.greaterThan( iso ), () => {

					found.assign( 1 );
					Break();

				} );
				t.addAssign( step );

			} );
			If( found.equal( 0 ), () => {

				Discard();

			} );
			const a = t.sub( step ).toVar(), b = t.toVar();
			Loop( { start: 0, end: 6, type: 'int', name: 'bis' }, () => {

				const mid = a.add( b ).mul( 0.5 );
				If( this.field( ro.add( rd.mul( mid ) ) ).x.greaterThan( iso ), () => {

					b.assign( mid );

				} ).Else( () => {

					a.assign( mid );

				} );

			} );
			return ro.add( rd.mul( b ) );

		} )().toVar( 'castHit' );

		const normalAt = ( q ) => {

			const e = 0.012;
			const f = ( o ) => this.field( q.add( vec3( ...o ) ) ).x;
			return normalize( vec3(
				f( [ - e, 0, 0 ] ).sub( f( [ e, 0, 0 ] ) ),
				f( [ 0, - e, 0 ] ).sub( f( [ 0, e, 0 ] ) ),
				f( [ 0, 0, - e ] ).sub( f( [ 0, 0, e ] ) ) ) );

		};

		let site = hit;
		if ( p.facets > 0 ) {

			site = Fn( () => {

				const c = floor( hit.div( p.facets ) ).toVar();
				const best = vec3( 0 ).toVar(), bd = float( 1e9 ).toVar();
				for ( let k = 0; k < 27; k ++ ) {

					const o = vec3( ( k % 3 ) - 1, ( ( k / 3 | 0 ) % 3 ) - 1, ( k / 9 | 0 ) - 1 );
					const cell = c.add( o );
					const seed = cell.x.mul( 73.0 ).add( cell.y.mul( 157.0 ) ).add( cell.z.mul( 311.0 ) ).add( 1e6 );
					const jitter = vec3( hash( seed ), hash( seed.add( 11.3 ) ), hash( seed.add( 23.9 ) ) );
					const s = cell.add( jitter ).mul( p.facets );
					const d = s.sub( hit ).length();
					If( d.lessThan( bd ), () => {

						bd.assign( d );
						best.assign( s );

					} );

				}

				return best;

			} )();

		}

		const nWorld = Fn( () => normalAt( site ) )();
		m.normalNode = cameraViewMatrix.mul( vec4( nWorld, 0 ) ).xyz.normalize();
		const view = cameraViewMatrix.mul( vec4( hit, 1 ) );
		m.depthNode = viewZToPerspectiveDepth( view.z, cameraNear, cameraFar );

		// colour: alternate finish on props, solder seams on lead cases, dark voids in concrete
		let col = m.colorNode;
		const altName = p.props.find( ( pr ) => pr.alt )?.finish;
		if ( altName ) col = mix( col, finishLayers( altName ).color, Fn( () => this.field( hit ).y )() );
		if ( p.seams ) {

			const l = this.toLocal.mul( vec4( hit, 1 ) ).xyz;
			const ring = abs( fract( l.y.div( 0.34 ) ).sub( 0.5 ) ).mul( 0.34 );
			const seam = max( smoothstep( 0.004, 0.0015, abs( l.x ) ), smoothstep( 0.163, 0.168, ring ) );
			col = mix( col, color( '#9a9ea3' ), seam.mul( 0.8 ) );

		}

		if ( p.block ) {

			const inside = smoothstep( 0.3, 0.45, Fn( () => this.ctx.volume.densityAt( hit ) )() );
			col = mix( col, color( '#0b0b0b' ), inside );

		}

		m.colorNode = col;

	}

	setActive( on ) {

		super.setActive( on );
		for ( const mesh of this.ctx.figure.meshes ) {

			if ( on ) {

				this.saved ??= mesh.material;
				mesh.material = this.shadowCaster;

			}

			mesh.visible = on;
			mesh.castShadow = on;

		}

	}

	update() {

		const fig = this.ctx.figure;
		const p = this.p;
		this.toWorld.value.copy( fig.group.matrixWorld );
		this.toLocal.value.copy( fig.group.matrixWorld ).invert();

		// props follow a bone (or the figure root), oriented with the figure
		const box = fig.bounds.clone();
		const m = new THREE.Matrix4(), one = new THREE.Vector3( 1, 1, 1 );
		const q = new THREE.Quaternion().setFromRotationMatrix( fig.group.matrixWorld );
		p.props.forEach( ( pr, i ) => {

			const pos = pr.bone === 'root'
				? new THREE.Vector3( ...pr.offset ).applyMatrix4( fig.group.matrixWorld )
				: fig.bone( pr.bone ).getWorldPosition( new THREE.Vector3() ).add( new THREE.Vector3( ...pr.offset ).applyQuaternion( q ) );
			m.compose( pos, q, one );
			this.propU[ i ].inv.value.copy( m ).invert();
			this.propU[ i ].half.value.set( ...pr.size ).multiplyScalar( 0.5 );
			const r = Math.hypot( ...pr.size ) * 0.5;
			box.expandByPoint( pos.clone().addScalar( r ) ).expandByPoint( pos.clone().subScalar( r ) );

		} );

		p.cuts.forEach( ( name, i ) => {

			const bone = fig.bone( name ), child = bone.children.find( ( c ) => c.isBone ) || bone;
			const o = bone.getWorldPosition( new THREE.Vector3() );
			const n = child.getWorldPosition( new THREE.Vector3() ).sub( o ).normalize();
			this.cutU[ i ].o.value.copy( o );
			this.cutU[ i ].n.value.copy( n );

		} );

		let mg = p.field === 'inflate' || p.field === 'rock' ? p.margin + 0.12 : p.margin;
		if ( p.block ) mg = - 0.11; // shrink the block so limbs break its surface as voids
		this.lo.value.copy( box.min ).subScalar( mg );
		this.hi.value.copy( box.max ).addScalar( mg );
		this.lo.value.y = Math.max( 0, this.lo.value.y );
		this.proxy.position.addVectors( this.lo.value, this.hi.value ).multiplyScalar( 0.5 );
		this.proxy.scale.subVectors( this.hi.value, this.lo.value ).addScalar( 0.02 );

	}

}
