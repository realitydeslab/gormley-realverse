import * as THREE from 'three/webgpu';
import { createStage } from './stage.js';
import { Figure } from './figure/figure.js';
import { Director } from './director.js';
import { BodyVolume } from './gpu/volume.js';
import { Sculpture, createContext } from './sculpture.js';
import { BodySampler } from './figure/sampler.js';
import { BindBody } from './figure/bind.js';
import { createUI } from './ui.js';

const stage = await createStage();
const figure = await Figure.load( '/models/Xbot.glb' );
stage.scene.add( figure.group );
for ( const m of figure.meshes ) m.visible = false; // the body only exists through the sculpture

const volume = new BodyVolume( figure );
const sampler = new BodySampler( figure );
const bind = new BindBody( figure );
const ctx = createContext( { scene: stage.scene, figure, volume, sampler, bind } );
const sculpture = new Sculpture( ctx );
const director = new Director( figure );
const updateUI = createUI( { stage, figure, director, sculpture, sampler, ctx } );

const START = new URLSearchParams( location.search ).get( 'style' ) || 'big-blockworks';
const follow = new THREE.Vector3();
let first = true;

function frame( dt ) {

	director.update( dt );
	ctx.frameId ++;
	volume.update( stage.renderer );
	if ( first ) {

		sculpture.transformTo( START, figure.center );
		follow.set( figure.group.position.x, 0, figure.group.position.z );
		first = false;

	}

	sculpture.update( stage.renderer, dt );

	// the camera drifts after the walking figure; the visitor can still orbit freely
	const target = new THREE.Vector3( figure.group.position.x, 0, figure.group.position.z );
	const delta = target.sub( follow ).multiplyScalar( Math.min( 1, dt * 1.2 ) );
	follow.add( delta );
	stage.controls.target.add( delta );
	stage.camera.position.add( delta );
	stage.controls.update();
	stage.follow( figure.group.position );
	updateUI();
	stage.pipeline.render();

}

const timer = new THREE.Timer();
stage.renderer.setAnimationLoop( () => {

	timer.update();
	frame( Math.min( timer.getDelta(), 1 / 20 ) );

} );

// a broken shader otherwise re-submits every frame and floods the console; stop at the first error
stage.renderer.backend.device?.addEventListener( 'uncapturederror', ( e ) => {

	console.error( '[antony] GPU error, animation stopped:', e.error.message.slice( 0, 400 ) );
	stage.renderer.setAnimationLoop( null );

}, { once: true } );

// debug handle: __antony.step( seconds ) advances the simulation without rAF
window.__antony = {
	stage, figure, director, volume, sculpture, ctx,
	step( s, fps = 30 ) {

		for ( let i = 0; i < s * fps; i ++ ) frame( 1 / fps );

	},
	// grab the current frame, cropped 4:3 around the figure, and save it under public/<path>
	async grab( path, W = 640 ) {

		const { px, w: CW, h: CH } = await stage.capturePixels();
		const src = document.createElement( 'canvas' );
		src.width = CW;
		src.height = CH;
		// GPU readback rows may be padded to 256 bytes
		const row = px.length / CH, data = new Uint8ClampedArray( CW * CH * 4 );
		for ( let y = 0; y < CH; y ++ ) data.set( px.subarray( y * row, y * row + CW * 4 ), y * CW * 4 );
		const img = new ImageData( data, CW, CH );
		src.getContext( '2d' ).putImageData( img, 0, 0 );
		// WebGPU render targets are stored top-down; no flip needed
		const b = figure.bounds.clone();
		const cam = stage.camera;
		const pts = [];
		for ( let k = 0; k < 8; k ++ ) pts.push( new THREE.Vector3( k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z ).project( cam ) );
		pts.push( new THREE.Vector3( b.getCenter( new THREE.Vector3() ).x, 0, b.getCenter( new THREE.Vector3() ).z ).project( cam ) );
		const xs = pts.map( ( q ) => ( q.x + 1 ) / 2 * src.width ), ys = pts.map( ( q ) => ( 1 - q.y ) / 2 * src.height );
		const cx = ( Math.min( ...xs ) + Math.max( ...xs ) ) / 2, cy = ( Math.min( ...ys ) + Math.max( ...ys ) ) / 2;
		let h = Math.max( ( Math.max( ...ys ) - Math.min( ...ys ) ) * 1.3, ( Math.max( ...xs ) - Math.min( ...xs ) ) * 1.3 * 0.75, src.height * 0.35 );
		h = Math.min( h, src.height );
		const w = h * 4 / 3;
		const c = document.createElement( 'canvas' );
		c.width = W;
		c.height = Math.round( W * 0.75 );
		c.getContext( '2d' ).drawImage( src, cx - w / 2, cy - h / 2, w, h, 0, 0, c.width, c.height );
		const blob = await new Promise( ( r ) => c.toBlob( r, 'image/webp', 0.86 ) );
		await fetch( '/__save?path=' + encodeURIComponent( path ), { method: 'POST', body: blob } );

	},
	async stills( from = 0, to = 999 ) {

		const { STYLE_DEFS } = await import( './styles/index.js' );
		for ( const d of STYLE_DEFS.slice( from, to ) ) {

			this.show( d.id, d.pose || 'stand', 0.35 );
			await this.grab( `report/still/${ d.id }.webp` );

		}

	},
	// background job: stills and/or walking clips for every style; progress in window.__job
	runAll( { stills = true, clips = true, from = 0 } = {} ) {

		const job = window.__job = { done: 0, total: 0, current: '', error: null, finished: false };
		( async () => {

			const { STYLE_DEFS } = await import( './styles/index.js' );
			const list = STYLE_DEFS.slice( from );
			job.total = list.length;
			for ( const d of list ) {

				job.current = d.id;
				try {

					if ( stills ) {

						this.show( d.id, d.pose || 'stand', 0.35 );
						await this.grab( `report/still/${ d.id }.webp` );

					}

					if ( clips ) await this.captureStyle( d.id, d.pose || 'stand', 32, false );

				} catch ( e ) {

					job.error = d.id + ': ' + e.message;

				}

				job.done ++;

			}

			job.finished = true;

		} )();
		return 'started';

	},
	// still + walking clip frames for one style
	async captureStyle( id, pose = 'stand', frames = 32, still = true ) {

		this.show( id, pose, 0.35 );
		if ( still ) await this.grab( `report/still/${ id }.webp` );
		// walk straight across the room; the camera keeps a fixed 3/4 offset from the figure
		Object.assign( director, { auto: false, mode: 'walk', hold: 0, moving: 1, heading: Math.PI / 2 } );
		director.pos.set( - 1.2, 0 );
		director.target.set( 60, 0 );
		sculpture.finish();
		// camera 55° off the walking direction, eye level, 6 m away: a 3/4 view where the stride reads
		const h = director.heading + 0.95;
		const off = new THREE.Vector3( Math.sin( h ) * 6, 0.3, Math.cos( h ) * 6 );
		for ( let f = 0; f < frames; f ++ ) {

			this.step( 2 / 30, 30 );
			const at = new THREE.Vector3( figure.group.position.x, 0.95, figure.group.position.z );
			stage.controls.target.copy( at );
			stage.camera.position.copy( at ).add( off );
			stage.camera.lookAt( at );
			follow.set( at.x, 0, at.z );
			await this.grab( `report/walk/${ id }/${ String( f ).padStart( 2, '0' ) }.webp`, 480 );

		}

	},
	// jump straight to a style + posture (used for screenshots)
	show( id, posture = 'stand', heading = 0.5, frameCamera = true ) {

		Object.assign( director, { auto: false, posture, mode: 'hold', hold: 1, moving: 0, heading } );
		if ( frameCamera ) {

			// same museum framing for every capture: figure at the origin, 60 mm eye-level view
			director.pos.set( 0, 0 );
			follow.set( 0, 0, 0 );
			stage.controls.target.set( 0, 0.95, 0 );
			stage.camera.position.set( 0.9, 1.25, 6.2 );

		}

		this.step( 0.3, 20 );
		sculpture.transformTo( id, figure.center );
		this.step( 3.4, 20 );

	},
};
