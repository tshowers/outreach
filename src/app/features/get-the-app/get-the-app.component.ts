import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Observable } from 'rxjs';
import {
  GET_THE_APP_PRODUCTS,
  GET_THE_APP_STEPS,
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

  async ngOnInit (): Promise<void> {
    const key = ( this.route.snapshot.data['product'] as GetTheAppProductKey | undefined ) || this.productKey;
    this.product = GET_THE_APP_PRODUCTS[key];
    this.faqs = getTheAppFaqs( this.product );
    this.state$ = this.writeAccess.state( key );
    this.title.setTitle( `Pricing — ${this.product.shortName} | Taliferro Tech` );
    this.isLive = await isLiveOnAppStore( this.product );
    this.appStoreLink = this.isLive ? appStoreUrl( this.product ) : '';
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
