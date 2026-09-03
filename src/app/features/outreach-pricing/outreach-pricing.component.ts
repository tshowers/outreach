import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AfterViewInit, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { OutreachDataService } from '../../services/outreach-data.service';
import { OutreachPurchaseFlowService } from '../../services/outreach-purchase-flow.service';
import { OUTREACH_PURCHASE_FLOW } from '../../services/purchase-flow.config';
import { Product } from '../../models/product.model';
import { ClickSoundDirective } from '../../shared/directives/click-sound.directive';

const DEFAULT_PRICE = '$19/month';
const DEFAULT_HIGHLIGHTS = [
  'TODD evaluates your campaign idea before a single email is sent.',
  'Multi-step sequences are built automatically with conditional follow-up logic.',
  'Signal Engine keeps pressure after the first send using opens, clicks, and silence.',
  'The campaign cockpit tracks momentum, open rates, and reply activity from one place.'
];
const DEFAULT_NOTES = [
  'You can explore the campaign idea form and see evaluations before subscribing.',
  'Sending and provisioning activate after you subscribe and your domain is verified.',
  'Campaign sequences, Signal Engine routing, and cockpit telemetry all require an active Outreach subscription.',
  'Enterprise customers can use the shared TODD pricing page for multi-user deployment.'
];

/**
 * Ported from features/email/pages/outreach-pricing/. Dropped
 * EntitlementService's `entitlements$` (fed a Suite-pricing upsell link
 * this standalone app has no `/suite/pricing` route for) and
 * ToddAssistantBusService's signalState$ (fed an indicator the template
 * never rendered) - both unused-in-practice, same trims Network's
 * PricingComponent already made for this exact pattern.
 */
@Component( {
  selector: 'app-outreach-pricing',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ClickSoundDirective],
  templateUrl: './outreach-pricing.component.html',
  styleUrl: './outreach-pricing.component.css'
} )
export class OutreachPricingComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly purchaseFlowConfig = OUTREACH_PURCHASE_FLOW;
  private authService = inject( OutreachAuthService );
  private router = inject( Router );
  private dataService = inject( OutreachDataService );

  tenantIdSubscription!: Subscription;
  userSubscription!: Subscription;

  private tenantProduct: Product | null = null;

  email = '';
  tenantId = '';
  isStartingCheckout = false;
  checkoutError = '';
  requiresLogin = false;

  get monthlyPrice (): string {
    return this.tenantProduct?.priceLabel || DEFAULT_PRICE;
  }

  get highlights (): string[] {
    const d = this.tenantProduct?.shortDescription;
    return d ? [d] : DEFAULT_HIGHLIGHTS;
  }

  get notes (): string[] {
    const d = this.tenantProduct?.description;
    return d ? [d] : DEFAULT_NOTES;
  }

  constructor ( private purchaseFlowService: OutreachPurchaseFlowService ) { }

  ngOnInit (): void {
    this.userSubscription = this.authService.getUser().subscribe( firebaseUser => {
      this.email = firebaseUser?.email || '';
      this.requiresLogin = !firebaseUser;
    } );

    this.tenantIdSubscription = this.authService.getTenantId().subscribe( async tenantId => {
      this.tenantId = tenantId || '';
      if ( this.tenantId ) {
        await this.loadTenantProduct( 'outreach' );
      }
    } );
  }

  ngOnDestroy (): void {
    if ( this.userSubscription ) this.userSubscription.unsubscribe();
    if ( this.tenantIdSubscription ) this.tenantIdSubscription.unsubscribe();
  }

  ngAfterViewInit (): void {
    window.scrollTo( 0, 0 );
  }

  goToLogin (): void {
    void this.purchaseFlowService.goToLogin( this.router, this.purchaseFlowConfig );
  }

  private async loadTenantProduct ( productName: string ): Promise<void> {
    try {
      const contact = await this.dataService.getContact( this.tenantId, this.tenantId );
      const products: Product[] = ( contact as any )?.company?.products || [];
      this.tenantProduct = products.find(
        p => p.active !== false && p.discontinued !== true &&
             p.name?.toLowerCase().includes( productName )
      ) || null;
    } catch {
      this.tenantProduct = null;
    }
  }

  async startCheckout (): Promise<void> {
    this.checkoutError = '';
    this.requiresLogin = !this.email;

    if ( this.requiresLogin ) {
      this.checkoutError = 'Please sign in before purchasing Outreach access.';
      return;
    }

    const tenantId = this.tenantId.trim();
    const email = this.email.trim().toLowerCase();

    if ( !tenantId ) {
      this.checkoutError = 'We could not find you. Please sign in again and try once more.';
      return;
    }

    if ( !email ) {
      this.checkoutError = 'Email is required before checkout.';
      return;
    }

    this.isStartingCheckout = true;

    try {
      const checkoutUrl = await this.purchaseFlowService.startCheckout(
        this.purchaseFlowConfig,
        {
          tenantId,
          email,
          priceId: this.tenantProduct?.stripePriceIdMonthly || ''
        },
        'Unable to start Outreach checkout.'
      );

      this.purchaseFlowService.redirectToCheckout( checkoutUrl );
    } catch ( error: any ) {
      this.checkoutError = error?.message || 'Unable to start Outreach checkout.';
      this.isStartingCheckout = false;
    }
  }
}
