import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { getAuth } from 'firebase/auth';

import { OutreachOnboardingService } from './outreach-onboarding.service';

/**
 * Network's links into Outreach (`/compose-email?contactIds=…&source=network`,
 * from Network's Home, Ready screen and emails): remember the contacts, and
 * while setup isn't done (inbox, profile, first email) open Arrive on Home
 * instead of the composer - design_handoff_outreach_onboarding 1. Once set
 * up, the composer opens as usual with the contacts selected.
 */
export const networkArrivalGuard: CanActivateFn = async ( route ) => {
  if ( route.queryParamMap.get( 'source' ) !== 'network' || !isPlatformBrowser( inject( PLATFORM_ID ) ) ) return true;
  const onboarding = inject( OutreachOnboardingService );
  const router = inject( Router );
  onboarding.rememberHandoff( String( route.queryParamMap.get( 'contactIds' ) || '' ).split( ',' ) );
  await getAuth().authStateReady();
  const state = await onboarding.refresh();
  return state && !state.requiredDone ? router.createUrlTree( ['/app'], { queryParams: { from: 'network' } } ) : true;
};
