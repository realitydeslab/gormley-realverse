// Procedural metal finishes (no textures): Corten plate, mild steel bar, cast iron.
import * as THREE from 'three/webgpu';
import { color, mix, smoothstep, positionWorld, positionLocal, mx_fractal_noise_float, mx_noise_float } from 'three/tsl';

const FINISHES = {
	// weathered Corten: deep brown with orange bloom
	corten: { dark: '#2e160b', mid: '#6b3016', bright: '#a3521f', rough: 0.88, metal: 0.25, bloom: 0.55 },
	// mild steel bar: blue-black mill scale with rust at edges
	steel: { dark: '#242427', mid: '#48443f', bright: '#6b3d22', rough: 0.58, metal: 0.6, bloom: 0.16 },
	// cast iron: dense graphite grey, faint rust
	iron: { dark: '#1b1a19', mid: '#34302d', bright: '#583624', rough: 0.72, metal: 0.55, bloom: 0.18 },
};

// Instance transform lives in storage buffers written by compute kernels.
export function createMetalMaterial( finish, offsetBuf, scaleBuf, instanceIndex ) {

	const f = FINISHES[ finish ];
	const m = new THREE.MeshStandardNodeMaterial();
	m.positionNode = positionLocal.mul( scaleBuf.element( instanceIndex ) ).add( offsetBuf.element( instanceIndex ) );

	const p = positionWorld;
	const broad = mx_fractal_noise_float( p.mul( 3.1 ), 4, 2.0, 0.5 );
	const fine = mx_noise_float( p.mul( 38.0 ) );
	const rust = smoothstep( 0.55 - f.bloom, 0.9, broad.mul( 0.5 ).add( 0.5 ).add( fine.mul( 0.12 ) ) );
	const base = mix( color( f.dark ), color( f.mid ), smoothstep( - 0.5, 0.5, broad ) );
	m.colorNode = mix( base, color( f.bright ), rust );
	m.roughnessNode = smoothstep( - 1.0, 1.0, fine ).mul( 0.18 ).add( f.rough - 0.09 ).add( rust.mul( 0.1 ) );
	m.metalnessNode = mix( f.metal, 0.1, rust );
	return m;

}

export function createFloorMaterial() {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const n = mx_fractal_noise_float( p.mul( 0.9 ), 3, 2.0, 0.5 ).mul( 0.5 ).add( mx_noise_float( p.mul( 14 ) ).mul( 0.08 ) );
	m.colorNode = mix( color( '#bdb9b2' ), color( '#d4d1cb' ), smoothstep( - 0.6, 0.6, n ) );
	m.roughness = 0.94;
	m.metalness = 0.0;
	return m;

}
