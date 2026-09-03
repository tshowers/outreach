import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { OutreachEntitlementService } from './outreach-entitlement.service';
import { ProductPurchaseFlowConfig } from './purchase-flow.config';

export interface ProductCheckoutRequest {
  tenantId: string;
  email: string;
  priceId?: string;
  referrerUid?: string;
}

/**
 * Trimmed from services/purchase-flow.service.ts - same checkout/confirm
 * calls against the same todd-backend endpoints (nothing about billing
 * changes), but drops MarketingFunnelService's trackCheckoutStarted /
 * trackPaidConversion calls, which are fire-and-forget marketing-funnel
 * analytics, not core to completing a purchase - and MarketingFunnelService
 * itself pulls in TODD's full AuthService/UserService, which isn't worth
 * carrying over for an analytics side-effect.
 */
@Injectable( {
  providedIn: 'root'
} )
export class OutreachPurchaseFlowService {
  constructor ( private entitlementService: OutreachEntitlementService ) {}

  goToLogin ( router: Router, config: ProductPurchaseFlowConfig ): Promise<boolean> {
    return router.navigate( ['/login'], {
      queryParams: { returnUrl: config.loginReturnUrl }
    } );
  }

  async startCheckout (
    config: ProductPurchaseFlowConfig,
    payload: ProductCheckoutRequest,
    fallbackMessage: string
  ): Promise<string> {
    const response = await fetch( `${environment.backendURL}${config.checkoutEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...( config.checkoutCredentials ? { credentials: config.checkoutCredentials } : {} ),
      body: JSON.stringify( {
        tenantId: payload.tenantId,
        email: payload.email,
        ...( payload.priceId ? { priceId: payload.priceId } : {} ),
        ...( payload.referrerUid ? { referrerUid: payload.referrerUid } : {} ),
      } )
    } );

    const result = await response.json();
    const redirectField = config.checkoutUrlField || 'url';
    const redirectUrl = typeof result?.[redirectField] === 'string'
      ? result[redirectField].trim()
      : '';

    if ( !response.ok || !result?.success || !redirectUrl ) {
      throw new Error( result?.message || fallbackMessage );
    }

    return redirectUrl;
  }

  async confirmCheckout<T = any> (
    config: ProductPurchaseFlowConfig,
    sessionId: string,
    fallbackMessage = 'Unable to confirm subscription.'
  ): Promise<T> {
    const response = await fetch( `${environment.backendURL}${config.confirmEndpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      ...( config.confirmCredentials ? { credentials: config.confirmCredentials } : {} ),
      body: JSON.stringify( { sessionId } )
    } );

    const result = await response.json();

    if ( !response.ok || !result?.success ) {
      throw new Error( result?.message || fallbackMessage );
    }

    this.entitlementService.resetCache();

    if ( config.legacyAccessStorageKey ) {
      localStorage.setItem( config.legacyAccessStorageKey, 'true' );
      sessionStorage.setItem( config.legacyAccessStorageKey, 'true' );
    }

    return result as T;
  }

  redirectToCheckout ( checkoutUrl: string ): void {
    window.location.assign( checkoutUrl );
  }
}
