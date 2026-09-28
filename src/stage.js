// Gallery staging modelled on Gormley's installation photos: white walls, pale
// polished concrete, soft overhead daylight, ambient occlusion, long lens.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, color, mix, smoothstep, positionWorld, mx_fractal_noise_float, mx_noise_float, vec3, float, renderOutput, texture, uv } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ROOM = { w: 22, h: 7, d: 22 };

function concreteMaterial() {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const cloud = mx_fractal_noise_float( p.mul( 0.35 ), 4, 2.0, 0.55 );
	const grain = mx_noise_float( p.mul( 22 ) ).mul( 0.04 );
	m.colorNode = mix( color( '#b9b5ae' ), color( '#d3d0ca' ), smoothstep( - 0.55, 0.55, cloud ) ).add( grain );
	// polished concrete: slightly glossy so the figure gets a faint reflection
	m.roughnessNode = float( 0.46 ).add( cloud.mul( 0.12 ) );
	m.metalness = 0;
	return m;

}

function wallMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { side: THREE.BackSide } );
	m.colorNode = vec3( 0.93, 0.925, 0.915 );
	// gallery walls read as near-white in the photographs; lift them independent of the key light
	m.emissiveNode = vec3( 0.42, 0.418, 0.412 );
	m.roughness = 0.95;
	return m;

}

export async function createStage() {

	const renderer = new THREE.WebGPURenderer( { antialias: false } );
	renderer.setPixelRatio( Math.min( devicePixelRatio, 2 ) );
	renderer.setSize( innerWidth, innerHeight );
	renderer.toneMapping = THREE.AgXToneMapping;
	renderer.toneMappingExposure = 1.05;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;
	document.body.appendChild( renderer.domElement );
	await renderer.init();

	const scene = new THREE.Scene();
	scene.background = new THREE.Color( 0xecebe8 );
	const pmrem = new THREE.PMREMGenerator( renderer );
	scene.environment = pmrem.fromScene( new RoomEnvironment(), 0.03 ).texture;
	scene.environmentIntensity = 0.45;

	// room: floor + walls (inside of a box)
	const floor = new THREE.Mesh( new THREE.PlaneGeometry( ROOM.w, ROOM.d ), concreteMaterial() );
	floor.rotation.x = - Math.PI / 2;
	floor.receiveShadow = true;
	const walls = new THREE.Mesh( new THREE.BoxGeometry( ROOM.w, ROOM.h, ROOM.d ), wallMaterial() );
	walls.position.y = ROOM.h / 2 - 0.001;
	walls.receiveShadow = true;
	scene.add( floor, walls );

	// daylight from a skylight: one soft key + sky fill
	scene.add( new THREE.HemisphereLight( 0xffffff, 0xa39d94, 0.35 ) );
	const sun = new THREE.DirectionalLight( 0xfffaf2, 3.2 );
	sun.castShadow = true;
	sun.shadow.mapSize.set( 2048, 2048 );
	sun.shadow.radius = 6;
	sun.shadow.bias = - 0.0003;
	sun.shadow.normalBias = 0.02;
	Object.assign( sun.shadow.camera, { left: - 2.4, right: 2.4, top: 2.4, bottom: - 2.4, near: 0.5, far: 16 } );
	scene.add( sun, sun.target );

	// ~60 mm lens at chest height, like the gallery photographs
	const camera = new THREE.PerspectiveCamera( 26, innerWidth / innerHeight, 0.05, 60 );
	camera.position.set( 0.9, 1.25, 6.2 );
	const controls = new OrbitControls( camera, renderer.domElement );
	controls.target.set( 0, 0.95, 0 );
	controls.enableDamping = true;
	controls.maxPolarAngle = Math.PI * 0.495;
	controls.minDistance = 1.6;
	controls.maxDistance = 12;

	// post: single MRT pass -> GTAO -> multiply (contact darkening like the photos)
	const pipeline = new THREE.RenderPipeline( renderer );
	const scenePass = pass( scene, camera );
	scenePass.setMRT( mrt( { output, normal: normalView } ) );
	const aoPass = ao( scenePass.getTextureNode( 'depth' ), scenePass.getTextureNode( 'normal' ), camera );
	aoPass.resolutionScale = 0.5;
	aoPass.radius.value = 0.22;
	aoPass.distanceExponent.value = 1.0;
	aoPass.thickness.value = 2.0;
	aoPass.scale.value = 2.4;
	aoPass.samples.value = 16;
	const aoTerm = aoPass.getTextureNode().r;
	const withAO = scenePass.getTextureNode( 'output' ).mul( aoTerm );
	// GTAO frosts thin metal in this setup; occlusion is baked per element from the body volume instead
	pipeline.outputNode = scenePass.getTextureNode( 'output' );
	const setAO = ( on ) => {

		pipeline.outputNode = on ? withAO : scenePass.getTextureNode( 'output' );
		pipeline.needsUpdate = true;

	};

	addEventListener( 'resize', () => {

		camera.aspect = innerWidth / innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize( innerWidth, innerHeight );

	} );

	// light + shadow frustum follow the figure
	function follow( target ) {

		sun.position.set( target.x + 1.6, 7.5, target.z + 2.4 );
		sun.target.position.set( target.x, 0.6, target.z );

	}

	// offscreen capture: render the scene into an HDR target, tone-map it into an 8-bit target,
	// read it back. Works in hidden tabs, where the canvas is never presented.
	const hdrRT = new THREE.RenderTarget( 1, 1, { type: THREE.HalfFloatType, samples: 4 } );
	const ldrRT = new THREE.RenderTarget( 1, 1 );
	const captureQuad = new THREE.QuadMesh( new THREE.MeshBasicNodeMaterial( {
		colorNode: renderOutput( texture( hdrRT.texture, uv() ), THREE.AgXToneMapping, THREE.SRGBColorSpace ),
	} ) );
	async function capturePixels() {

		const w = renderer.domElement.width, h = renderer.domElement.height;
		for ( const rt of [ hdrRT, ldrRT ] ) if ( rt.width !== w || rt.height !== h ) rt.setSize( w, h );
		const prev = renderer.getRenderTarget();
		renderer.setRenderTarget( hdrRT );
		renderer.render( scene, camera );
		renderer.setRenderTarget( ldrRT );
		captureQuad.render( renderer );
		renderer.setRenderTarget( prev );
		const px = await renderer.readRenderTargetPixelsAsync( ldrRT, 0, 0, w, h );
		return { px, w, h };

	}

	return { renderer, scene, camera, controls, pipeline, follow, sun, aoPass, setAO, capturePixels };

}
