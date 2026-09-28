// Gallery-label caption + style/posture picker + pointer interaction.
import * as THREE from 'three/webgpu';
import { FAMILIES, STYLE_DEFS } from './styles/index.js';
import { POSTURES, POSTURE_ORDER } from './figure/postures.js';
import { FINISH_LABEL } from './materials.js';

export function createUI( { stage, figure, director, sculpture, sampler, ctx } ) {

	const $ = ( s ) => document.querySelector( s );
	const panel = $( '#panel' );
	const styleButtons = new Map();

	for ( const fam of FAMILIES ) {

		const h = document.createElement( 'h3' );
		h.textContent = fam.label;
		const row = document.createElement( 'div' );
		row.className = 'row';
		for ( const def of STYLE_DEFS.filter( ( d ) => d.family === fam.id ) ) {

			const b = document.createElement( 'button' );
			b.textContent = def.label;
			b.title = def.series;
			b.onclick = () => transform( def.id, figure.center );
			row.appendChild( b );
			styleButtons.set( def.id, b );

		}

		panel.append( h, row );

	}

	const ph = document.createElement( 'h3' );
	ph.textContent = 'Posture';
	const prow = document.createElement( 'div' );
	prow.className = 'row';
	const postureButtons = new Map();
	for ( const name of [ 'walk', ...POSTURE_ORDER ] ) {

		const b = document.createElement( 'button' );
		b.textContent = name === 'walk' ? 'walk' : POSTURES[ name ].label;
		b.onclick = () => director.strike( name );
		prow.appendChild( b );
		postureButtons.set( name, b );

	}

	const ah = document.createElement( 'h3' );
	ah.textContent = 'Evolution';
	const arow = document.createElement( 'div' );
	arow.className = 'row';
	const auto = document.createElement( 'button' );
	auto.textContent = 'auto evolve';
	auto.classList.toggle( 'on', director.auto );
	auto.onclick = () => {

		director.auto = ! director.auto;
		auto.classList.toggle( 'on', director.auto );

	};
	arow.appendChild( auto );
	panel.append( ph, prow, ah, arow );

	function transform( id, point ) {

		sculpture.transformTo( id, point );

	}

	// next style: prefer another family so consecutive works contrast
	function nextId( step = 1 ) {

		const i = sculpture.currentIndex;
		return STYLE_DEFS[ ( i + step + STYLE_DEFS.length ) % STYLE_DEFS.length ].id;

	}

	function randomOtherFamily() {

		const cur = sculpture.current?.def.family;
		const pool = STYLE_DEFS.filter( ( d ) => d.family !== cur );
		return pool[ Math.floor( Math.random() * pool.length ) ].id;

	}

	director.onMutate = () => {

		// the change starts at a random point of the body and travels through it
		sampler.update( ctx.frameId );
		const k = Math.floor( Math.random() * sampler.count );
		transform( randomOtherFamily(), new THREE.Vector3().fromArray( sampler.world, k * 3 ) );

	};

	// pointer: click the body = transform from the hit point; click the floor = walk there
	const raycaster = new THREE.Raycaster();
	const ndc = new THREE.Vector2();
	let down = null;
	const canvas = stage.renderer.domElement;
	canvas.addEventListener( 'pointerdown', ( e ) => ( down = [ e.clientX, e.clientY ] ) );
	canvas.addEventListener( 'pointerup', ( e ) => {

		if ( ! down || Math.hypot( e.clientX - down[ 0 ], e.clientY - down[ 1 ] ) > 6 ) return;
		ndc.set( ( e.clientX / innerWidth ) * 2 - 1, - ( e.clientY / innerHeight ) * 2 + 1 );
		raycaster.setFromCamera( ndc, stage.camera );
		const hit = pickBody( raycaster.ray );
		if ( hit ) {

			transform( randomOtherFamily(), hit );
			return;

		}

		const p = raycaster.ray.intersectPlane( new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), 0 ), new THREE.Vector3() );
		if ( p ) director.walkTo( p.x, p.z );

	} );

	// nearest skinned sample to the ray, within 7 cm of it (the body silhouette)
	function pickBody( ray ) {

		sampler.update( ctx.frameId );
		const W = sampler.world;
		const v = new THREE.Vector3();
		let best = null, bestT = Infinity;
		for ( let i = 0; i < sampler.count; i ++ ) {

			v.fromArray( W, i * 3 );
			if ( ray.distanceSqToPoint( v ) < 0.07 * 0.07 ) {

				const t = v.clone().sub( ray.origin ).dot( ray.direction );
				if ( t < bestT ) {

					bestT = t;
					best = v.clone();

				}

			}

		}

		return best;

	}

	addEventListener( 'keydown', ( e ) => {

		if ( e.key === 'ArrowRight' ) transform( nextId( 1 ), figure.center );
		if ( e.key === 'ArrowLeft' ) transform( nextId( - 1 ), figure.center );
		if ( e.key === ' ' ) transform( randomOtherFamily(), figure.center );

	} );

	const title = $( '#title' ), series = $( '#series' ), meta = $( '#meta' );
	let last = '';
	return function update() {

		const def = sculpture.current?.def;
		if ( ! def ) return;
		const posture = director.mode === 'walk' && director.hold < 0.5 ? 'walk' : director.posture;
		const key = def.id + posture;
		if ( key === last ) return;
		last = key;
		title.innerHTML = `${ def.label } <span>— ${ posture === 'walk' ? 'WALKING' : POSTURES[ posture ].label }</span>`;
		series.textContent = `after ${ def.series }`;
		meta.textContent = `${ FINISH_LABEL[ def.finish ] }${ posture !== 'walk' ? ' · posture after ' + POSTURES[ posture ].ref : '' }`;
		for ( const [ id, b ] of styleButtons ) b.classList.toggle( 'on', id === def.id );
		for ( const [ n, b ] of postureButtons ) b.classList.toggle( 'on', n === posture );

	};

}
