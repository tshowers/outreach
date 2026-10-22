import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import {
  GET_THE_APP_PRODUCTS,
  GET_THE_APP_STEPS,
  TODD_SUITE,
  GetTheAppProduct,
  GetTheAppProductKey,
  appStoreUrl,
  getTheAppFaqs,
  isLiveOnAppStore,
} from '@taliferro/ui/platform/get-the-app.model';
import { WriteAccessService, WriteAccessState } from '../../services/write-access.service';
import { WebCheckoutService } from '../../shared/write-access/web-checkout.service';
import { WriteAccessPromptService } from '../../shared/write-access/write-access-prompt.service';

/**
 * /pricing - "Browse free, subscribe to create." Same page on every TODD
 * web app; all wording, prices and App Store ids come from
 * @taliferro/ui/platform/get-the-app.model.ts. Subscribe opens the shared
 * write-access prompt (Stripe in a new tab); the App Store button shows
 * "Coming soon" until Apple's lookup finds the app live.
 */
@Component( {
  selector: 'app-get-the-app',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './get-the-app.component.html',
  styleUrl: './get-the-app.component.css',
} )
export class GetTheAppComponent implements OnInit {
  /** Set by the route's `data.product`, or directly. */
  @Input() productKey: GetTheAppProductKey = 'outreach';

  private readonly route = inject( ActivatedRoute );
  private readonly title = inject( Title );
  private readonly meta = inject( Meta );
  private readonly writeAccess = inject( WriteAccessService );
  private readonly prompts = inject( WriteAccessPromptService );
  private readonly checkout = inject( WebCheckoutService );
  manageMessage = '';

  product!: GetTheAppProduct;
  readonly steps = GET_THE_APP_STEPS;
  faqs = getTheAppFaqs( GET_THE_APP_PRODUCTS.outreach );
  state$!: Observable<WriteAccessState>;
  isLive = false;
  appStoreLink = '';
  readonly suite = TODD_SUITE;
  /** Already on TODD Suite (checked once signed in). */
  hasSuite = false;

  async ngOnInit (): Promise<void> {
    const key = ( this.route.snapshot.data['product'] as GetTheAppProductKey | undefined ) || this.productKey;
    this.product = GET_THE_APP_PRODUCTS[key];
    this.faqs = getTheAppFaqs( this.product );
    this.state$ = this.writeAccess.state( key );
    const title = `Pricing — ${this.product.shortName} | Taliferro Tech`;
    const description = `Browse ${this.product.shortName} free on the web. Subscribe to create and edit, on the web or in the iOS app.`;
    this.title.setTitle( title );
    this.meta.updateTag( { name: 'description', content: description } );
    this.meta.updateTag( { property: 'og:title', content: title } );
    this.meta.updateTag( { property: 'og:description', content: description } );
    this.isLive = await isLiveOnAppStore( this.product );
    this.appStoreLink = this.isLive ? appStoreUrl( this.product ) : '';
    // Prerendered pages have no browser session; signed out there's nothing to check.
    if ( typeof window !== 'undefined' && ( await firstValueFrom( this.state$ ) ) !== 'signedOut' ) {
      this.hasSuite = await this.checkout.hasAccess( TODD_SUITE.key );
    }
  }

  /** TODD Suite through the shared prompt: sign in first, then Stripe in a new tab. */
  async getSuite (): Promise<void> {
    const state = await firstValueFrom( this.state$ );
    this.prompts.open( state === 'signedOut' ?
      { state: 'signedOut', action: `get ${ TODD_SUITE.name }` } :
      { state: 'browsing', action: `get ${ TODD_SUITE.name }`, plan: 'suite' } );
  }

  subscribe (): void {
    this.prompts.open( { state: 'browsing', action: 'create and edit' } );
  }

  /** Stripe's billing page for web subscribers; App Store subscribers manage it on their iPhone. */
  async manage (): Promise<void> {
    this.manageMessage = '';
    try {
      await this.checkout.openPortal();
    } catch {
      this.manageMessage = `Your subscription is through the App Store: on your iPhone or iPad, Settings → your name → Subscriptions → ${this.product.appName}.`;
    }
  }
}
