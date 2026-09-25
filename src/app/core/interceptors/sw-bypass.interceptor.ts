import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Keeps backend API calls out of the Angular service worker. ngsw-config.json
 * has no dataGroups, so the worker never caches these - it only proxies them,
 * and when the browser's fetch fails at the network level (dropped connection,
 * reset stream) the worker fabricates a "504 Gateway Timeout" response. That
 * made a transient network blip mid-Catalyst look like a backend timeout even
 * though the request never reached Cloud Run. Bypassing the worker lets the
 * real failure surface as status 0. The query-param form is used instead of
 * the `ngsw-bypass` header so it doesn't need a CORS allow-headers change.
 */
export const swBypassInterceptor: HttpInterceptorFn = ( req, next ) => {
  if ( !req.url.startsWith( environment.backendURL ) ) {
    return next( req );
  }

  return next( req.clone( { setParams: { 'ngsw-bypass': 'true' } } ) );
};
