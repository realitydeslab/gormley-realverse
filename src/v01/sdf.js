// GPU body SDF: smooth union of capsules uploaded each frame from Body.
import { Fn, float, uniform, uniformArray, Loop, clamp, dot, max, min, abs, length } from 'three/tsl';

export function createBodySDF( body ) {

	const capA = uniformArray( body.a, 'vec4' );
	const capB = uniformArray( body.b, 'vec4' );
	const blend = uniform( 0.05 );
	const inflate = uniform( 0.012 ); // thickens thin limbs so coarse lattices still catch them

	const bodySDF = Fn( ( [ p ] ) => {

		const d = float( 1e3 ).toVar();
		Loop( { start: 0, end: body.count, type: 'int', name: 'capsule' }, ( { capsule: i } ) => {

			const a = capA.element( i );
			const b = capB.element( i );
			const pa = p.sub( a.xyz );
			const ba = b.xyz.sub( a.xyz );
			const h = clamp( dot( pa, ba ).div( max( dot( ba, ba ), 1e-6 ) ), 0.0, 1.0 );
			const dc = length( pa.sub( ba.mul( h ) ) ).sub( a.w );
			// polynomial smooth-min keeps joints fleshy instead of tube-like
			const k = blend;
			const s = max( k.sub( abs( d.sub( dc ) ) ), 0.0 ).div( k );
			d.assign( min( d, dc ).sub( s.mul( s ).mul( k ).mul( 0.25 ) ) );

		} );
		return d.sub( inflate );

	} ); // inlined on purpose: a setLayout function breaks when shared across compute pipelines

	return { bodySDF, blend, inflate };

}
