// Body-attached element sets (bars, straps, wires, spheres) generated once in the
// T-pose, skinned on the GPU each frame, then drawn as compacted instances.
import * as THREE from 'three/webgpu';
import { Fn, If, vec3, instanceIndex, storage, mat4, vec4, select } from 'three/tsl';
import { Style } from './common.js';
import { InstancePool, barMatrix } from '../gpu/instances.js';
import { SkinnedPoints, packPoints } from '../gpu/skinpoints.js';
import { makeRng } from '../figure/bind.js';

export class SkinnedElements extends Style {

	constructor( ctx, def ) {

		super( ctx, def );
		const data = def.generate( ctx.bind, makeRng( def.seed ?? 7 ), this.p, ctx.figure );
		this.points = new SkinnedPoints( ctx.figure, packPoints( ctx.bind, data.points ) );
		this.kernels = [ this.points.kernel ];
		this.pools = [];

		if ( data.segs?.length ) {

			const n = data.segs.length;
			const ids = new Uint32Array( n * 4 ), dims = new Float32Array( n * 2 );
			data.segs.forEach( ( [ a, b, t, w, u ], i ) => {

				ids.set( [ a, b, u < 0 ? a : u, u < 0 ? 0 : 1 ], i * 4 );
				dims.set( [ t, w ], i * 2 );

			} );
			const idN = storage( new THREE.StorageBufferAttribute( ids, 4 ), 'uvec4', n ).toReadOnly();
			const dimN = storage( new THREE.StorageBufferAttribute( dims, 2 ), 'vec2', n ).toReadOnly();
			const pool = new InstancePool( { max: n, geometry: this.segmentGeometry(), finish: def.finish } );
			const extend = this.p.cap ?? 0; // lengthen bars (in widths) so folded straps close their corners
			const P = this.points;
			const kernel = Fn( () => {

				const id = idN.element( instanceIndex ), dim = dimN.element( instanceIndex );
				const a = P.at( id.x ).toVar(), b = P.at( id.y ).toVar();
				const dir = b.sub( a ).normalize();
				const a2 = a.sub( dir.mul( dim.y.mul( extend ) ) ), b2 = b.add( dir.mul( dim.y.mul( extend ) ) );
				const up = select( id.w.equal( 1 ), P.at( id.z ).sub( a ), vec3( 0, 1, 0 ) );
				const g = this.gain( a.add( b ).mul( 0.5 ) );
				If( g.greaterThan( 0.02 ), () => {

					// the wave grows each bar from its middle
					const m = a2.add( b2 ).mul( 0.5 );
					pool.emit( barMatrix( m.add( a2.sub( m ).mul( g ) ), m.add( b2.sub( m ).mul( g ) ), dim.x.mul( g.min( 1 ) ), dim.y, up ) );

				} );

			} )().compute( n );
			this.pools.push( [ pool, kernel ] );

		}

		if ( data.spheres?.length ) {

			const n = data.spheres.length;
			const ids = new Uint32Array( n ), rad = new Float32Array( n );
			data.spheres.forEach( ( [ i, r ], k ) => {

				ids[ k ] = i;
				rad[ k ] = r;

			} );
			const idN = storage( new THREE.StorageBufferAttribute( ids, 1 ), 'uint', n ).toReadOnly();
			const rN = storage( new THREE.StorageBufferAttribute( rad, 1 ), 'float', n ).toReadOnly();
			const pool = new InstancePool( { max: n, geometry: new THREE.IcosahedronGeometry( 0.5, 2 ), finish: def.finish } );
			const P = this.points;
			const kernel = Fn( () => {

				const c = P.at( idN.element( instanceIndex ) ).toVar();
				const d = rN.element( instanceIndex ).mul( 2 ).mul( this.gain( c ) );
				If( d.greaterThan( 0.001 ), () => {

					pool.emit( mat4( vec4( d, 0, 0, 0 ), vec4( 0, d, 0, 0 ), vec4( 0, 0, d, 0 ), vec4( c, 1 ) ) );

				} );

			} )().compute( n );
			this.pools.push( [ pool, kernel ] );

		}

		for ( const [ pool ] of this.pools ) this.objects.push( pool.mesh );
		this.stats = { points: data.points.length, segs: data.segs?.length ?? 0, spheres: data.spheres?.length ?? 0 };

	}

	// element shape: square bar by default, ellipsoid rolls for Clay Works
	segmentGeometry() {

		return this.p.shape === 'roll' ? new THREE.SphereGeometry( 0.5, 14, 10 ) : new THREE.BoxGeometry( 1, 1, 1 );

	}

	update( renderer ) {

		renderer.compute( this.points.kernel );
		for ( const [ pool, kernel ] of this.pools ) pool.run( renderer, [ kernel ] );

	}

}

