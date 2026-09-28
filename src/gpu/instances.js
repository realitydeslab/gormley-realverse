// Compacted GPU instances: kernels append mat4 transforms through an atomic counter
// that doubles as the indirect draw's instanceCount, so only live elements are drawn.
import * as THREE from 'three/webgpu';
import { Fn, If, uint, vec4, mat4, storage, atomicAdd, atomicStore, atomicLoad, min, normalize, cross, abs, select, vec3, length, varying, instanceIndex } from 'three/tsl';
import { finishMaterial } from '../materials.js';

export class InstancePool {

	/**
	 * @param {object} o { max, geometry, finish, alt?, colors? } — with colors, each instance carries
	 *   a tint (x = brightness/occlusion, y = blend toward the `alt` finish)
	 */
	constructor( { max, geometry, finish, alt = null, colors = false } ) {

		this.max = max;
		this.matrices = new THREE.StorageInstancedBufferAttribute( max, 16 );
		this.matrixNode = storage( this.matrices, 'mat4', max );
		let tint = null;
		if ( colors ) {

			this.colors = new THREE.StorageInstancedBufferAttribute( max, 3 );
			this.colorNode = storage( this.colors, 'vec3', max );
			tint = varying( this.colorNode.element( instanceIndex ) );

		}

		this.mesh = new THREE.InstancedMesh( geometry, finishMaterial( finish, { tint, alt } ), max );
		this.mesh.instanceMatrix = this.matrices;

		this.mesh.frustumCulled = false;
		this.mesh.castShadow = true;
		this.mesh.receiveShadow = true;
		const indexCount = geometry.index ? geometry.index.count : geometry.attributes.position.count;
		this.indirect = new THREE.IndirectStorageBufferAttribute( new Uint32Array( [ indexCount, 0, 0, 0, 0 ] ), 5 );
		geometry.setIndirect( this.indirect );
		this.args = storage( this.indirect, 'uint', 5 ).toAtomic();

		this.reset = Fn( () => {

			atomicStore( this.args.element( 1 ), uint( 0 ) );

		} )().compute( 1 );
		// counter may overshoot when the pool is full; clamp before drawing
		this.clamp = Fn( () => {

			atomicStore( this.args.element( 1 ), min( atomicLoad( this.args.element( 1 ) ), uint( max ) ) );

		} )().compute( 1 );

	}

	/** Append one instance (call inside a compute Fn). */
	emit( matrix, color = null ) {

		const slot = atomicAdd( this.args.element( 1 ), uint( 1 ) ).toVar();
		If( slot.lessThan( uint( this.max ) ), () => {

			this.matrixNode.element( slot ).assign( matrix );
			if ( color && this.colorNode ) this.colorNode.element( slot ).assign( color );

		} );

	}

	/** Runs reset -> producers -> clamp. */
	run( renderer, producers ) {

		renderer.compute( [ this.reset, ...producers, this.clamp ] );

	}

}

/** Axis-aligned box of full size `size` centred at `c` (unit-box geometry). */
export function boxMatrix( c, size ) {

	return mat4(
		vec4( size.x, 0, 0, 0 ),
		vec4( 0, size.y, 0, 0 ),
		vec4( 0, 0, size.z, 0 ),
		vec4( c, 1 ),
	);

}

/**
 * Oriented bar from a to b (unit-box geometry scaled along its X axis).
 * `up` sets the orientation of the bar's width (for flat straps); thickness t (Y), width w (Z).
 */
export function barMatrix( a, b, t, w, up = vec3( 0, 1, 0 ) ) {

	const d = b.sub( a );
	const len = length( d );
	const dir = d.div( len.max( 1e-6 ) );
	const ref = select( abs( dir.dot( up ) ).greaterThan( 0.95 ), vec3( 1, 0, 0 ), up );
	const side = normalize( cross( dir, ref ) );
	const norm = cross( side, dir );
	return mat4(
		vec4( dir.mul( len ), 0 ),
		vec4( norm.mul( t ), 0 ),
		vec4( side.mul( w ), 0 ),
		vec4( a.add( b ).mul( 0.5 ), 1 ),
	);

}
