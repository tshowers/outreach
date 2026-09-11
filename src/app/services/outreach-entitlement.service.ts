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

  /**
   * Reads access off `data.products` rather than re-deriving it from raw
   * Stripe/tenant booleans. The backend's buildProductEntitlements()
   * (todd-backend/functions/accountRoutes.js) already folds in the
   * internal-override allowlist - @taliferro.tech/@taliferro.com emails,
   * admin/founder/owner roles, and an explicit UID/email allowlist all
   * grant free access to outreach/moves/docs/knowledge/network there,
   * with no Stripe fields ever set on the tenant doc. Re-deriving from
   * `tenant['outreachPaidAccess']` etc. (the old approach) silently
   * drops that override and paywalls every internal/master account.
   */
  private mapToEntitlements ( res: AccountSummaryResponse ): Entitlements {
    const products = res?.data?.products;
    if ( !Array.isArray( products ) ) return DEFAULTS;

    const hasAccess = ( key: string ): boolean =>
      !!products.find( ( product ) => product?.key === key )?.access;

    return {
      suite: hasAccess( 'todd_suite' ),
      network: hasAccess( 'todd_suite' ) || hasAccess( 'network' ),
      moves: hasAccess( 'todd_suite' ) || hasAccess( 'moves' ),
      outreach: hasAccess( 'todd_suite' ) || hasAccess( 'outreach' ),
      docs: hasAccess( 'todd_suite' ) || hasAccess( 'docs' ),
      knowledge: hasAccess( 'todd_suite' ) || hasAccess( 'knowledge' ),
      pulse: hasAccess( 'todd_suite' ) || hasAccess( 'survey_publish' ),
    };
  }
}
