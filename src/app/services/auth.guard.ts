import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { map, take } from 'rxjs/operators';

import { OutreachAuthService } from './outreach-auth.service';
import { LoggerService } from './logger.service';

/**
 * Trimmed stand-in for TODD's authGuard (auth.guard.ts, 130+ lines) which
 * also gates on subscription/trial status via UserService + a full
 * Contact fetch. This app doesn't carry UserService/Contact-subscription
 * machinery - subscription/paywall UI for the `outreach` entitlement is
 * handled inside OutreachHomeComponent itself (see
 * outreach-entitlement.service.ts), not at the route level. This guard
 * only answers one question: is someone signed in at all? If not, it
 * sends them to TODD's hosted login (the same redirect
 * OutreachAuthService.signIn() uses everywhere else in this app) rather
 * than leaving them on a route with nothing to render.
 */
export const authGuard: CanActivateFn = ( _route, state ) => {
  const authService = inject( OutreachAuthService );
  const logger = inject( LoggerService );

  return authService.getUser().pipe(
    take( 1 ),
    map( ( user ) => {
      if ( user ) return true;

      logger.log( 'authGuard - no user, redirecting to hosted login', state.url );
      authService.signIn( state.url );
      return false;
    } ),
  );
};
