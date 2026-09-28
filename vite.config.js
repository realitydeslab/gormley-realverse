// Dev-only endpoint used by the capture tooling: POST /__save?path=report/x.png writes the
// request body under ./public (paths are confined to that folder).
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const ROOT = path.resolve( 'public' );

function saveEndpoint() {

	return {
		name: 'antony-save-endpoint',
		configureServer( server ) {

			server.middlewares.use( '/__save', ( req, res ) => {

				const rel = new URL( req.url, 'http://x' ).searchParams.get( 'path' ) || '';
				const target = path.resolve( ROOT, rel );
				if ( req.method !== 'POST' || ! target.startsWith( ROOT + path.sep ) ) {

					res.statusCode = 400;
					res.end( 'bad request' );
					return;

				}

				const chunks = [];
				req.on( 'data', ( c ) => chunks.push( c ) );
				req.on( 'end', () => {

					fs.mkdirSync( path.dirname( target ), { recursive: true } );
					fs.writeFileSync( target, Buffer.concat( chunks ) );
					res.end( 'ok' );

				} );

			} );

		},
	};

}

export default defineConfig( { plugins: [ saveEndpoint() ] } );
