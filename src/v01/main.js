import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Body } from './body.js';
import { createBodySDF } from './sdf.js';
import { Sculpture, STYLES } from './sculpture.js';
import { Director } from './director.js';
import { createFloorMaterial } from './materials.js';

const BG = 0xdedbd5;

const renderer = new THREE.WebGPURenderer( { antialias: true } );
renderer.setPixelRatio( Math.min( devicePixelRatio, 2 ) );
renderer.setSize( innerWidth, innerHeight );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild( renderer.domElement );
await renderer.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color( BG );
scene.fog = new THREE.Fog( BG, 9, 26 );

const camera = new THREE.PerspectiveCamera( 35, innerWidth / innerHeight, 0.05, 100 );
camera.position.set( 2.7, 1.55, 3.3 );
const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 1.5;
controls.maxDistance = 14;
controls.target.set( 0, 0.9, 0 );

scene.add( new THREE.HemisphereLight( 0xfaf8f4, 0x8d877f, 1.6 ) );
const sun = new THREE.DirectionalLight( 0xfff6ea, 3.2 );
sun.castShadow = true;
sun.shadow.mapSize.set( 2048, 2048 );
Object.assign( sun.shadow.camera, { left: - 2.2, right: 2.2, top: 2.6, bottom: - 1.2, near: 0.5, far: 14 } );
sun.shadow.bias = - 0.0004;
sun.shadow.normalBias = 0.015;
scene.add( sun, sun.target );

const floor = new THREE.Mesh( new THREE.PlaneGeometry( 80, 80 ), createFloorMaterial() );
floor.rotation.x = - Math.PI / 2;
floor.receiveShadow = true;
scene.add( floor );

const body = new Body();
const { bodySDF } = createBodySDF( body );
const sculpture = new Sculpture( bodySDF );
scene.add( sculpture.group );
const director = new Director();

// --- UI ---------------------------------------------------------------------
const $ = ( s ) => document.querySelector( s );
const styleRow = $( '#styles' );
const poseRow = $( '#poses' );
STYLES.forEach( ( s, i ) => {

	const b = document.createElement( 'button' );
	b.textContent = s.label;
	b.onclick = () => mutate( i, body.center );
	styleRow.appendChild( b );

} );
for ( const name of [ 'walk', 'stand', 'swerve', 'crouch', 'kneel', 'sit', 'lie', 'fetal', 'reach' ] ) {

	const b = document.createElement( 'button' );
	b.textContent = name;
	b.onclick = () => director.strike( name );
	poseRow.appendChild( b );

}

const autoBtn = $( '#auto' );
autoBtn.onclick = () => {

	director.auto = ! director.auto;
	autoBtn.classList.toggle( 'on', director.auto );

};

$( '#backend' ).textContent = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2 fallback';

function mutate( index, worldPoint ) {

	sculpture.transformTo( index ?? ( sculpture.currentIndex + 1 ) % STYLES.length, worldPoint, body.root );

}

director.onMutate = () => {

	// start the wave from a random joint so the change travels through the figure
	const i = Math.floor( Math.random() * body.count );
	const a = body.a[ i ];
	mutate( null, new THREE.Vector3( a.x, a.y, a.z ) );

};

// --- input: click body = transform from that point, click floor = walk there ---
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;
renderer.domElement.addEventListener( 'pointerdown', ( e ) => ( down = [ e.clientX, e.clientY ] ) );
renderer.domElement.addEventListener( 'pointerup', ( e ) => {

	if ( ! down || Math.hypot( e.clientX - down[ 0 ], e.clientY - down[ 1 ] ) > 6 ) return;
	ndc.set( ( e.clientX / innerWidth ) * 2 - 1, - ( e.clientY / innerHeight ) * 2 + 1 );
	raycaster.setFromCamera( ndc, camera );
	const hit = body.raycast( raycaster.ray );
	if ( hit ) {

		mutate( null, hit );
		return;

	}

	const p = raycaster.ray.intersectPlane( new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), 0 ), new THREE.Vector3() );
	if ( p ) director.walkTo( p.x, p.z );

} );

addEventListener( 'keydown', ( e ) => {

	if ( e.key >= '1' && e.key <= String( STYLES.length ) ) mutate( Number( e.key ) - 1, body.center );
	if ( e.key === ' ' ) mutate( null, body.center );

} );

addEventListener( 'resize', () => {

	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( innerWidth, innerHeight );

} );

// --- loop -------------------------------------------------------------------
const timer = new THREE.Timer();
const caption = $( '#caption' );
const prevCenter = new THREE.Vector3();
let first = true;

function frame( dt ) {

	director.update( dt );
	body.update( director.params, director.pos.x, director.pos.y, director.heading );

	if ( first ) {

		mutate( 0, body.center );
		prevCenter.copy( body.center );
		first = false;

	}

	// camera travels with the figure; the user still orbits freely
	const follow = new THREE.Vector3( body.root.position.x, 0, body.root.position.z );
	const delta = follow.clone().sub( prevCenter.setY( 0 ) ).multiplyScalar( Math.min( 1, dt * 1.5 ) );
	prevCenter.add( delta );
	controls.target.add( delta );
	camera.position.add( delta );
	controls.update();

	sun.position.set( follow.x + 3.5, 6.5, follow.z + 2.5 );
	sun.target.position.copy( follow );

	sculpture.update( renderer, dt, body.root, body.center );
	renderer.render( scene, camera );

	const style = sculpture.current?.def;
	if ( style ) caption.innerHTML = `<b>${ style.label }</b> — ${ director.label }<br><span>${ style.note } · lattice ${ ( sculpture.current.u.unit.value * 100 ).toFixed( 1 ) } cm</span>`;

}

renderer.setAnimationLoop( () => {

	timer.update();
	frame( Math.min( timer.getDelta(), 1 / 20 ) );

} );

// debug handle: __antony.step( seconds ) advances the simulation without rAF
window.__antony = { body, director, sculpture, camera, controls, renderer, mutate,
	step( seconds, fps = 30 ) {

		for ( let i = 0; i < seconds * fps; i ++ ) frame( 1 / fps );

	} };
