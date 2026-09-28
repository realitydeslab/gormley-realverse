// Material finishes seen in Gormley's work. Procedural (no textures); patina is
// driven by world-space noise. Instanced styles pass a per-instance tint node:
// tint.x = brightness / baked occlusion, tint.y = 0..1 blend toward an alternate finish.
import * as THREE from 'three/webgpu';
import { color, mix, smoothstep, positionWorld, mx_fractal_noise_float, mx_noise_float, float } from 'three/tsl';

export const FINISHES = {
	// Blockworks, Big Blockworks, Domains: graphite cast iron with faint rust bloom
	iron: { base: '#1d1d1e', mid: '#302f2d', rust: '#46332a', rough: 0.6, metal: 0.42, bloom: 0.03, scale: 5 },
	// weathered Corten / rusted iron: the orange of Big Double Blockworks, Strapworks, Knotworks
	corten: { base: '#5b2a0f', mid: '#8a4217', rust: '#b0581c', rough: 0.86, metal: 0.12, bloom: 0.5, scale: 3.2 },
	// dark rust: Cast Blockworks, Hermitage, Cast Beamers
	rust: { base: '#2a170b', mid: '#5a3016', rust: '#7f4719', rough: 0.86, metal: 0.15, bloom: 0.5, scale: 3.2 },
	// mild steel bar: Big Beamers, Constructed Ataxia — blue-grey mill scale
	steel: { base: '#3d3f43', mid: '#5b5e63', rust: '#6a5646', rough: 0.5, metal: 0.62, bloom: 0.04, scale: 6 },
	// stainless: Quantum Clouds, Voids, Drift, Net Polyhedra
	stainless: { base: '#8d9094', mid: '#b3b6ba', rust: '#9a9da1', rough: 0.3, metal: 1.0, bloom: 0.0, scale: 8 },
	// black-patinated steel: Framers, Liners, Rooters, Domains, Feeling Material
	black: { base: '#141414', mid: '#212121', rust: '#2e2a26', rough: 0.45, metal: 0.55, bloom: 0.05, scale: 8 },
	// Bunkers, Concrete Works
	concrete: { base: '#b3b0aa', mid: '#cfccc6', rust: '#a29e97', rough: 0.9, metal: 0.0, bloom: 0.3, scale: 2.5 },
	// lead bodycases, Lead Blockworks, Box Works
	lead: { base: '#4a4c50', mid: '#62656a', rust: '#7a7c80', rough: 0.62, metal: 0.5, bloom: 0.2, scale: 2 },
	// Plaster Works
	plaster: { base: '#e3e0da', mid: '#efece6', rust: '#cfc8bb', rough: 0.95, metal: 0.0, bloom: 0.25, scale: 2 },
	// Big Stone Blockworks (dark granite), Man Rock and Planets (pale limestone)
	granite: { base: '#2c2c2d', mid: '#434344', rust: '#58585a', rough: 0.7, metal: 0.0, bloom: 0.35, scale: 9 },
	limestone: { base: '#c9c6bd', mid: '#dcd9d0', rust: '#b3aea2', rough: 0.92, metal: 0.0, bloom: 0.3, scale: 3 },
	// Clay Works, Big Double Clay Slabworks: fired pink clay
	clay: { base: '#c9867a', mid: '#dca69a', rust: '#b56f63', rough: 0.9, metal: 0.0, bloom: 0.4, scale: 2.5 },
	// Terracotta and Lead Works
	terracotta: { base: '#a8532f', mid: '#c46a42', rust: '#8e4426', rough: 0.9, metal: 0.0, bloom: 0.4, scale: 3 },
	// Early Blockworks: green-black patinated iron
	verdigris: { base: '#1b231c', mid: '#2e3a2c', rust: '#465a3e', rough: 0.62, metal: 0.35, bloom: 0.35, scale: 5 },
	// wood beam (Suspended and Gravity Works)
	wood: { base: '#5a4431', mid: '#7a5d42', rust: '#4a3626', rough: 0.8, metal: 0.0, bloom: 0.5, scale: 1.5 },
};

export function finishLayers( name ) {

	return layers( FINISHES[ name ] );

}

function layers( f ) {

	const p = positionWorld;
	const broad = mx_fractal_noise_float( p.mul( f.scale ), 4, 2.0, 0.5 );
	const fine = mx_noise_float( p.mul( f.scale * 9 ) );
	const rust = smoothstep( 0.62 - f.bloom, 0.95, broad.mul( 0.5 ).add( 0.5 ).add( fine.mul( 0.1 ) ) );
	const base = mix( color( f.base ), color( f.mid ), smoothstep( - 0.55, 0.55, broad.add( fine.mul( 0.15 ) ) ) );
	return {
		color: mix( base, color( f.rust ), rust ),
		rough: float( f.rough ).add( fine.mul( 0.06 ) ).add( rust.mul( 0.12 ) ),
		metal: mix( float( f.metal ), float( 0.1 ), rust ),
	};

}

/**
 * @param {keyof FINISHES} name
 * @param {object} [opts] { side, tint: Node<vec3>|null, alt: keyof FINISHES|null }
 */
export function finishMaterial( name, opts = {} ) {

	const m = new THREE.MeshStandardNodeMaterial( { side: opts.side ?? THREE.FrontSide } );
	let L = layers( FINISHES[ name ] );
	if ( opts.alt && opts.tint ) {

		const B = layers( FINISHES[ opts.alt ] );
		const t = opts.tint.y;
		L = { color: mix( L.color, B.color, t ), rough: mix( L.rough, B.rough, t ), metal: mix( L.metal, B.metal, t ) };

	}

	m.colorNode = opts.tint ? L.color.mul( opts.tint.x ) : L.color;
	m.roughnessNode = L.rough.clamp( 0.05, 1 );
	m.metalnessNode = L.metal;
	if ( opts.tint ) m.aoNode = opts.tint.x.clamp( 0, 1 );
	return m;

}

export const FINISH_LABEL = {
	iron: 'cast iron', corten: 'Corten steel', rust: 'rusted cast iron', steel: 'mild steel', stainless: 'stainless steel',
	black: 'black steel', concrete: 'concrete', lead: 'lead', plaster: 'plaster', granite: 'granite', limestone: 'limestone',
	clay: 'fired clay', terracotta: 'terracotta', verdigris: 'patinated iron', wood: 'wood',
};
