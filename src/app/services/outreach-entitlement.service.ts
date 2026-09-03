import { Injectable, inject } from '@angular/core';
import { Observable, of, combineLatest } from 'rxjs';
import { debounceTime, take, switchMap, map, catchError, startWith, shareReplay } from 'rxjs/operators';

import { AccountBillingService, AccountSummaryResponse } from './account-billing.service';
import { OutreachAuthService } from './outreach-auth.service';

/**
 * Ported from services/entitlement.service.ts - logic unchanged, only the
 * auth dependency is swapped for OutreachAuthService. This is generic
 * infrastructure (used by all 6 of TODD's paid modules, not Network-
 * specific), so it's a near-verbatim port rather than a trimmed
 * reimplementation.
 */
export interface Entitlements {
  network: boolean;
  moves: boolean;
  outreach: boolean;
  docs: boolean;
  knowledge: boolean;
  pulse: boolean;
  suite: boolean;
}

const DEFAULTS: Entitlements = {
  network: false,
  moves: false,
  outreach: false,
  docs: false,
  knowledge: false,
  pulse: false,
  suite: false,
};

@Injectable( { providedIn: 'root' } )
export class OutreachEntitlementService {
  private readonly authService = inject( OutreachAuthService );
  private readonly accountBillingService = inject( AccountBillingService );

  private cached$: Observable<Entitlements> | null = null;

  getEntitlements (): Observable<Entitlements> {
    if ( !this.cached$ ) {
      this.cached$ = this.fetchResolvedEntitlements().pipe(
        startWith( DEFAULTS ),
        shareReplay( { bufferSize: 1, refCount: false } ),
      );
    }
    return this.cached$;
  }

  getResolvedEntitlements (): Observable<Entitlements> {
    return this.fetchResolvedEntitlements();
  }

  resetCache (): void {
    this.cached$ = null;
  }

  private fetchResolvedEntitlements (): Observable<Entitlements> {
    return combineLatest( [
      this.authService.getTenantId(),
      this.authService.getUser(),
    ] ).pipe(
      debounceTime( 0 ),
      take( 1 ),
      switchMap( ( [tenantId, user] ) => {
        if ( !tenantId || !user?.uid ) return of( DEFAULTS );
        return this.accountBillingService
          .getSummary( {
            tenantId,
            userId: user.uid,
            userEmail: user.email ?? '',
          } )
          .pipe(
            map( ( res ) => this.mapToEntitlements( res ) ),
            catchError( () => of( DEFAULTS ) ),
          );
      } ),
    );
  }

  private mapToEntitlements ( res: AccountSummaryResponse ): Entitlements {
    const tenant = res?.data?.tenant;
    if ( !tenant ) return DEFAULTS;
    const suiteStatus = String( tenant['stripeToddSuiteSubscriptionStatus'] || '' ).trim().toLowerCase();
    const suite = !!tenant['toddSuitePaidAccess'] ||
      ['active', 'paid', 'trial', 'trialing'].includes( suiteStatus );
    return {
      suite,
      network: suite || !!tenant['networkPaidAccess'],
      moves: suite || !!tenant['movesPaidAccess'],
      outreach: suite || !!tenant['outreachPaidAccess'],
      docs: suite || !!tenant['docsPaidAccess'],
      knowledge: suite || !!tenant['knowledgePaidAccess'],
      pulse: suite || !!tenant['surveyPaidAccess'],
    };
  }
}
