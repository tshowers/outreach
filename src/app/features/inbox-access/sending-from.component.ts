import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, combineLatest, firstValueFrom } from 'rxjs';

import { OutreachApiService, SendingSettings, SendingStatus } from '../../services/outreach-api.service';
import { OutreachAuthService } from '../../services/outreach-auth.service';

/**
 * "Sending from" (Ty, 2026-10-26): the address drips, Catalyst and Maya send
 * From, kept apart from the inbox replies come to. It used to be set silently
 * by connecting an inbox - a taliferro.com inbox made every drip fail DMARC.
 * An address SendGrid can't send as still works: it goes "Name via TODD"
 * with replies to it (todd-backend sendingIdentity.service.js).
 */
@Component( {
  selector: 'app-sending-from',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule],
  template: `
    <section class="sending" *ngIf="settings" aria-labelledby="sending-title" data-cy="sending-from">
      <h2 id="sending-title">Sending from</h2>
      <p class="sending__lead">The address your drips, Catalyst runs and the Marketing Assistant's emails come from. Replies come to {{ settings.repliesTo || 'your connected inbox' }}.</p>

      <label class="sending__pick">
        <span class="visually-hidden">Send from</span>
        <select [ngModel]="settings.sendsFrom" (ngModelChange)="choose($event)" [disabled]="saving" data-cy="sending-from-select">
          <option *ngIf="!settings.sendsFrom" value="">Choose an address</option>
          <option *ngFor="let option of settings.options" [value]="option.email">{{ option.email }} - {{ label(option.status) }}</option>
        </select>
      </label>

      <p class="sending__status" [attr.data-status]="settings.sendsFromStatus" data-cy="sending-from-status">
          <span *ngIf="settings.sendsFromStatus === 'ready'"><strong>Ready to send.</strong> Mail goes out as {{ settings.sendsFrom }}.</span>
          <span *ngIf="settings.sendsFromStatus === 'not_ready'"><strong>Not set up for sending.</strong> Until {{ domainOf(settings.sendsFrom) }} is authenticated, mail goes out as "{{ nameHint }} via 16Ahead" from {{ settings.relayFrom }}, and replies still come to {{ settings.sendsFrom }}. To send as it directly, ask us to authenticate {{ domainOf(settings.sendsFrom) }} (a few DNS records), or pick an address marked Ready.</span>
          <span *ngIf="settings.sendsFromStatus === 'unknown'">Couldn't check this address right now. Mail still sends.</span>
          <span *ngIf="settings.sendsFromStatus === 'none'">No sending address yet. Pick one above.</span>
      </p>
      <p class="sending__error" *ngIf="error" role="alert">{{ error }}</p>
    </section>
  `,
  styles: [`
    .sending {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 0 0 20px;
      padding: 18px 20px;
      border-radius: 20px;
      background: var(--surface);
      color: var(--text);
    }
    .sending h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
    }
    .sending__lead,
    .sending__status,
    .sending__error {
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
    }
    .sending__lead {
      color: var(--muted);
    }
    .sending__pick select {
      width: 100%;
      max-width: 520px;
      height: 44px;
      padding: 0 14px;
      border: 0;
      border-radius: 14px;
      background: var(--bg);
      color: var(--text);
      font: 700 15px var(--font);
    }
    .sending__status {
      padding: 10px 14px;
      border-radius: 14px;
      background: var(--bg);
    }
    .sending__status[data-status="ready"] {
      background: var(--t-green);
      color: var(--t-green-fg);
    }
    .sending__status[data-status="not_ready"] {
      background: var(--t-yellow);
      color: var(--t-yellow-fg);
    }
    .sending__error {
      color: var(--danger);
    }
  `],
} )
export class SendingFromComponent implements OnInit, OnDestroy {
  private readonly api = inject( OutreachApiService );
  private readonly auth = inject( OutreachAuthService );
  private subscription?: Subscription;
  private opts: { tenantId?: string; userId?: string; userEmail?: string; } = {};

  settings: SendingSettings | null = null;
  saving = false;
  error = '';
  nameHint = 'You';

  ngOnInit (): void {
    this.subscription = combineLatest( [this.auth.getTenantId(), this.auth.getUser()] ).subscribe( ( [tenantId, user] ) => {
      if ( !tenantId || !user ) return;
      this.opts = { tenantId: String( tenantId ), userId: user.uid, userEmail: user.email || undefined };
      this.nameHint = String( user.displayName || '' ).trim() || 'You';
      void this.load();
    } );
  }

  ngOnDestroy (): void {
    this.subscription?.unsubscribe();
  }

  private async load (): Promise<void> {
    try {
      this.settings = ( await firstValueFrom( this.api.getSendingSettings( this.opts ) ) ).data;
    } catch {
      this.settings = null;
    }
  }

  async choose ( email: string ): Promise<void> {
    if ( !email || email === this.settings?.sendsFrom ) return;
    this.saving = true;
    this.error = '';
    try {
      this.settings = ( await firstValueFrom( this.api.setSendsFrom( email, this.opts ) ) ).data;
    } catch ( error: any ) {
      this.error = String( error?.error?.message || error?.message || "Couldn't change the sending address." );
      await this.load();
    } finally {
      this.saving = false;
    }
  }

  label ( status: SendingStatus ): string {
    return status === 'ready' ? 'Ready to send' : status === 'not_ready' ? 'Not set up (sends via 16Ahead)' : 'Not checked';
  }

  domainOf ( email: string ): string {
    return String( email || '' ).split( '@' )[1] || 'that domain';
  }
}
