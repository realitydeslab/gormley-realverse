// Holds every style, runs the active one(s), and animates the transformation wave
// that turns one construction language into another from a clicked point.
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { STYLE_DEFS } from './styles/index.js';

export class Sculpture {

	constructor( ctx ) {

		this.ctx = ctx;
		this.waveLocal = new THREE.Vector3(); // wave origin in figure-local space (travels with the body)
		this.defs = STYLE_DEFS;
		this.styles = new Map(); // created lazily: pipelines compile on first use
		this.current = null;
		this.previous = null;
		this.radius = 0;

	}

	get(id) {

		if ( ! this.styles.has( id ) ) {

			const def = this.defs.find( ( d ) => d.id === id );
			const style = new def.Class( this.ctx, def );
			for ( const o of style.objects ) this.ctx.scene.add( o );
			style.setActive( false );
			this.styles.set( id, style );

		}

		return this.styles.get( id );

	}

	get currentIndex() {

		return this.current ? this.defs.indexOf( this.current.def ) : - 1;

	}

	transformTo( id, worldPoint ) {

		this.finish();
		const next = this.get( id );
		if ( next === this.current ) return;
		this.waveLocal.copy( worldPoint );
		this.ctx.figure.group.worldToLocal( this.waveLocal );
		const companion = next.def.companion ? this.get( next.def.companion ) : null;
		for ( const s of [ next, companion ] ) {

			if ( ! s ) continue;
			s.u.incoming.value = 1;
			s.u.radius.value = 0;
			s.setActive( true );

		}

		if ( this.current ) {

			for ( const s of [ this.current, this.currentCompanion ] ) {

				if ( ! s || s === next || s === companion ) continue;
				s.u.incoming.value = 0;
				s.u.radius.value = 0;

			}

			this.previous = [ this.current, this.currentCompanion ].filter( ( s ) => s && s !== next && s !== companion );

		}

		this.current = next;
		this.currentCompanion = companion;
		this.targetScale = next.def.scale ?? 1;
		this.radius = 0;
		this.transitioning = true;

	}

	finish() {

		for ( const s of this.previous || [] ) s.setActive( false );
		this.previous = null;
		// a deactivated cast style hides the shared skinned body; restore it for the live ones
		for ( const s of [ this.current, this.currentCompanion ] ) if ( s ) s.setActive( true );
		for ( const s of [ this.current, this.currentCompanion ] ) if ( s ) s.u.radius.value = 1e3;
		this.transitioning = false;

	}

	get live() {

		return [ ...( this.previous || [] ), this.current, this.currentCompanion ].filter( Boolean );

	}

	update( renderer, dt ) {

		const origin = this.ctx.waveOrigin.value.copy( this.waveLocal );
		const group = this.ctx.figure.group;
		group.localToWorld( origin );
		// Memes / Small Blockworks are small figures: ease the body scale during the wave
		const s = group.scale.x + ( ( this.targetScale ?? 1 ) - group.scale.x ) * Math.min( 1, dt * 2.5 );
		group.scale.setScalar( s );
		if ( this.transitioning ) {

			this.radius += dt * 0.9 * Math.max( 0.5, s );
			for ( const st of this.live ) st.u.radius.value = this.radius;
			if ( this.radius > 2.8 ) this.finish();

		}

		for ( const st of this.live ) if ( st.active ) st.update( renderer, dt );

	}

}

export function createContext( { scene, figure, volume, sampler, bind } ) {

	return { scene, figure, volume, sampler, bind, frameId: 0, waveOrigin: uniform( new THREE.Vector3() ) };

}
