// Shared pieces for all styles: the transformation wave and world-stable hashing.
import { uniform, float, uint, int, hash, length, mix, smoothstep } from 'three/tsl';

export const WAVE_BAND = 0.35; // softness of the wave front (m)

export class Style {

	/**
	 * @param {object} ctx { volume, figure, bind, waveOrigin, scene }
	 * @param {object} def registry entry
	 */
	constructor( ctx, def ) {

		this.ctx = ctx;
		this.def = def;
		this.p = def.params || {};
		this.u = { radius: uniform( 1e3 ), incoming: uniform( 1 ) };
		this.objects = [];
		this.active = false;

	}

	// 0 on the outgoing side of the wave, 1 on the incoming side
	gain( p ) {

		const inside = float( 1 ).sub( smoothstep( this.u.radius.sub( WAVE_BAND ), this.u.radius, length( p.sub( this.ctx.waveOrigin ) ) ) );
		return mix( float( 1 ).sub( inside ), inside, this.u.incoming );

	}

	// CPU twin of gain() for styles generated on the CPU
	gainCPU( x, y, z ) {

		const o = this.ctx.waveOrigin.value;
		const d = Math.hypot( x - o.x, y - o.y, z - o.z );
		const r = this.u.radius.value;
		const t = Math.min( Math.max( ( d - ( r - WAVE_BAND ) ) / WAVE_BAND, 0 ), 1 );
		const inside = 1 - t * t * ( 3 - 2 * t );
		return this.u.incoming.value ? inside : 1 - inside;

	}

	setActive( on ) {

		this.active = on;
		for ( const o of this.objects ) o.visible = on;

	}

	/** Called every frame while active. */
	update( /* renderer, dt */ ) {}

}

// integer lattice hash -> [0,1); coordinates are world lattice indices (stable as the body moves)
export function hash3( x, y, z, salt = 0 ) {

	const s = uint( int( x ).add( 40000 ) ).mul( 73856093 )
		.bitXor( uint( int( y ).add( 40000 ) ).mul( 19349663 ) )
		.bitXor( uint( int( z ).add( 40000 ) ).mul( 83492791 ) )
		.add( uint( salt * 2654435761 >>> 0 ) );
	return hash( s );

}
