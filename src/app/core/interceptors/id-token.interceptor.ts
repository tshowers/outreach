import { HttpInterceptorFn } from '@angular/common/http';
import { getAuth } from 'firebase/auth';
import { from, switchMap } from 'rxjs';

/**
 * Proves who is calling the TODD backend: adds the signed-in person's
 * Firebase ID token (`Authorization: Bearer ...`) to every /api/ request
 * that doesn't already set its own Authorization header. The backend
 * verifies it - /send-email refuses unverified calls
 * (todd-backend/functions/middleware/sendEmailAuth.js), and more routes
 * will follow. Signed out, or outside the browser (prerendering), the
 * request goes out unchanged. getIdToken() is cached by Firebase and only
 * refreshes near expiry.
 */
/** Only our own backend ever sees the token - never a third-party API. */
function isToddBackend ( url: string ): boolean {
  if ( !url.includes( '/api/' ) ) return false;
  if ( url.startsWith( '/' ) ) return true;
  try {
    const host = new URL( url ).hostname;
    return host === 'taliferro.tech' || host.endsWith( '.taliferro.tech' ) || host.endsWith( '.run.app' ) ||
      host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

export const idTokenInterceptor: HttpInterceptorFn = ( req, next ) => {
  if ( typeof window === 'undefined' || req.headers.has( 'Authorization' ) || !isToddBackend( req.url ) ) {
    return next( req );
  }

  let user;
  try {
    user = getAuth().currentUser;
  } catch {
    user = null;
  }
  if ( !user ) return next( req );

  return from( user.getIdToken().catch( () => '' ) ).pipe(
    switchMap( ( token ) => next( token ? req.clone( { setHeaders: { Authorization: `Bearer ${token}` } } ) : req ) ),
  );
};
