import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { OutreachPurchaseFlowService } from '../../services/outreach-purchase-flow.service';
import { OUTREACH_PURCHASE_FLOW } from '../../services/purchase-flow.config';
import { ClickSoundDirective } from '../../shared/directives/click-sound.directive';

/**
 * Ported from features/email/pages/outreach-paid-success/. Dropped
 * ToddAssistantBusService's signalState$ subscription - it fed a signal
 * indicator the template never actually rendered (same dead-weight this
 * extraction's precedent, Network's PaidSuccessComponent, already
 * trimmed).
 */
@Component( {
  selector: 'app-outreach-paid-success',
  standalone: true,
  imports: [CommonModule, RouterLink, ClickSoundDirective],
  templateUrl: './outreach-paid-success.component.html',
  styleUrl: './outreach-paid-success.component.css'
} )
export class OutreachPaidSuccessComponent implements OnInit {
  private readonly purchaseFlowConfig = OUTREACH_PURCHASE_FLOW;
  private route = inject( ActivatedRoute );
  private router = inject( Router );

  isConfirming = true;
  isSuccess = false;
  errorMessage = '';

  constructor ( private purchaseFlowService: OutreachPurchaseFlowService ) { }

  async ngOnInit (): Promise<void> {
    const sessionId = ( this.route.snapshot.queryParamMap.get( 'session_id' ) || '' ).trim();

    if ( !sessionId ) {
      this.isConfirming = false;
      this.errorMessage = 'Missing session information. Please try again.';
      return;
    }

    try {
      await this.purchaseFlowService.confirmCheckout( this.purchaseFlowConfig, sessionId );
      this.isSuccess = true;
    } catch ( err: any ) {
      this.errorMessage = err?.message || 'Something went wrong confirming your purchase.';
    } finally {
      this.isConfirming = false;
    }
  }

  goToOutreach (): void {
    void this.router.navigate( [this.purchaseFlowConfig.postConfirmRoute] );
  }
}
