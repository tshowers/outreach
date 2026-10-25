import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Subscription, combineLatest, firstValueFrom, take } from 'rxjs';

import { OutreachAuthService } from '../../services/outreach-auth.service';
import { OutreachApiService } from '../../services/outreach-api.service';
import { NeedsYouCountService } from '../../services/needs-you-count.service';
import { MomentumThread } from '../../models/momentum-thread.model';
import { BrowseNoticeComponent } from '../../shared/write-access/browse-notice.component';
import { WriteActionDirective } from '../../shared/write-access/write-action.directive';
import { PreloaderComponent } from '../../shared/preloader/preloader.component';
import { MailToast, MailToastComponent } from '../../shared/mail/mail-toast.component';
import { countdownLabel, sendTimeLabel } from '../../shared/mail/mail-time.util';

interface OutboxRow {
  thread: MomentumThread;
  id: string;
  name: string;
  company: string;
  subject: string;
  origin: string;
  body: string;
  sending: boolean;
  countdown: string;
  when: string;
}

/**
 * Outbox (design_handoff_outreach_mail 1g): approved emails waiting for their
 * send time. Open one to send it now, edit it, or move it back to Drafts.
 * The scheduled send checks the thread when it fires, so a moved-back email
 * never goes out (todd-backend isApprovedSendStillDue).
 */
@Component( {
  selector: 'app-outbox',
  standalone: true,
  imports: [CommonModule, RouterModule, BrowseNoticeComponent, WriteActionDirective, PreloaderComponent, MailToastComponent],
  templateUrl: './outbox.component.html',
  styleUrls: ['../../shared/mail/mail-page.css', './outbox.component.css'],
} )
export class OutboxComponent implements OnInit, OnDestroy {
  private readonly auth = inject( OutreachAuthService );
  private readonly api = inject( OutreachApiService );
  private readonly counts = inject( NeedsYouCountService );
  private readonly router = inject( Router );
  private subscription?: Subscription;
  private refreshTimer: ReturnType<typeof setInterval> | undefined;

  private tenantId = '';
  private userId = '';
  private userEmail = '';

  loading = true;
  error = '';
  rows: OutboxRow[] = [];
  openId = '';
  working = new Map<string, string>();
  rowError = new Map<string, string>();
  toast: MailToast | null = null;

  ngOnInit (): void {
    this.auth.isLoggedIn().pipe( take( 1 ) ).subscribe( ( signedIn ) => {
      if ( !signedIn ) this.loading = false;
    } );
    this.subscription = combineLatest( [this.auth.getTenantId(), this.auth.getUser()] ).subscribe( ( [tenantId, user] ) => {
      this.userId = String( user?.uid || '' );
      this.userEmail = String( user?.email || '' );
      const next = String( tenantId || '' );
      if ( !next || next === this.tenantId ) return;
      this.tenantId = next;
      void this.load();
    } );
    // Countdowns move and sends finish while the page is open.
    this.refreshTimer = setInterval( () => void this.load( true ), 60000 );
  }

  ngOnDestroy (): void {
    this.subscription?.unsubscribe();
    clearInterval( this.refreshTimer );
  }

  private get opts () {
    return { tenantId: this.tenantId, userId: this.userId || undefined, userEmail: this.userEmail || undefined };
  }

  async load ( quiet = false ): Promise<void> {
    if ( !this.tenantId ) return;
    if ( !quiet ) this.loading = true;
    try {
      const response = await firstValueFrom( this.api.getSignalEngineBootstrap( this.opts ) );
      const threads: MomentumThread[] = Array.isArray( response?.data?.threads ) ? response.data.threads : [];
      this.counts.setFromThreads( threads );
      this.rows = threads
        .filter( ( thread ) => thread.userLane === 'outbox' )
        .map( ( thread ) => this.row( thread ) )
        .sort( ( a, b ) => String( a.thread.scheduledAt || '' ).localeCompare( String( b.thread.scheduledAt || '' ) ) );
      this.error = '';
    } catch ( error: any ) {
      if ( !quiet ) this.error = String( error?.error?.message || error?.message || 'Unable to load your Outbox.' );
    } finally {
      this.loading = false;
    }
  }

  private row ( thread: MomentumThread ): OutboxRow {
    const id = String( thread.contactId || thread.id );
    const at = new Date( String( thread.scheduledAt || '' ) );
    const known = !Number.isNaN( at.getTime() );
    const touches = Number( thread.touchCount || 0 );
    return {
      thread,
      id,
      name: String( thread.contactName || thread.emailAddress || 'Unknown contact' ).trim(),
      company: String( thread.companyName || '' ),
      subject: String( thread.draftSubject || thread.lastSubject || '' ).trim() || '(no subject)',
      origin: `${ touches > 1 ? 'Follow-up' : 'First email' } · you approved it`,
      body: String( thread.draftBody || '' ),
      sending: thread.queueState === 'sending' || this.working.get( id ) === 'now',
      countdown: known ? countdownLabel( at ) : 'Soon',
      when: known ? sendTimeLabel( at ) : 'During business hours',
    };
  }

  trackById ( _index: number, row: OutboxRow ): string {
    return row.id;
  }

  toggle ( row: OutboxRow ): void {
    this.openId = this.openId === row.id ? '' : row.id;
  }

  timingNote ( row: OutboxRow ): string {
    return `Sends ${ row.when } your time. Emails only go out on weekdays during the recipient's business hours.`;
  }

  async sendNow ( row: OutboxRow ): Promise<void> {
    if ( this.working.has( row.id ) ) return;
    this.working.set( row.id, 'now' );
    this.rowError.delete( row.id );
    row.sending = true;
    try {
      await firstValueFrom( this.api.sendApprovedNow( row.id, this.opts ) );
      this.rows = this.rows.filter( ( item ) => item.id !== row.id );
      this.toast = { text: `Sending to ${ row.name } now.`, action: { label: 'View in Sent', link: '/sent' } };
      void this.load( true );
    } catch ( error: any ) {
      row.sending = false;
      this.failed( row, error, 'Unable to send this now.' );
    } finally {
      this.working.delete( row.id );
    }
  }

  async moveBack ( row: OutboxRow ): Promise<void> {
    if ( this.working.has( row.id ) ) return;
    this.working.set( row.id, 'back' );
    this.rowError.delete( row.id );
    try {
      await firstValueFrom( this.api.returnApprovedToDrafts( row.id, this.opts ) );
      this.rows = this.rows.filter( ( item ) => item.id !== row.id );
      this.toast = { text: "Moved back to Drafts. It won't send until you approve it again.", action: { label: 'View in Drafts', link: '/drafts' } };
      void this.load( true );
    } catch ( error: any ) {
      this.failed( row, error, 'Unable to move this back to Drafts.' );
    } finally {
      this.working.delete( row.id );
    }
  }

  /** Edit pulls it back to Drafts first, so the old version can't go out meanwhile. */
  async edit ( row: OutboxRow ): Promise<void> {
    if ( this.working.has( row.id ) ) return;
    this.working.set( row.id, 'edit' );
    this.rowError.delete( row.id );
    try {
      await firstValueFrom( this.api.returnApprovedToDrafts( row.id, this.opts ) );
      const response = await firstValueFrom( this.api.createMomentumComposerHandoff( row.id, {
        draftSubject: row.subject,
        draftBody: row.body,
        companyName: row.company,
        returnRoute: '/drafts',
        returnThreadId: row.id,
        draftKind: 'outbound',
      }, this.opts ) );
      const reviewRoute = String( ( response as any )?.data?.reviewRoute || '' );
      if ( reviewRoute ) {
        const url = new URL( reviewRoute, window.location.origin );
        await this.router.navigateByUrl( `${ url.pathname }${ url.search }` );
      }
    } catch ( error: any ) {
      this.failed( row, error, 'Unable to open this email in the composer.' );
    } finally {
      this.working.delete( row.id );
    }
  }

  private failed ( row: OutboxRow, error: any, fallback: string ): void {
    // It sent (or moved) in the meantime: show the Outbox as it is now.
    if ( error?.error?.error === 'not_in_outbox' ) {
      this.toast = { text: String( error?.error?.message || "This email isn't waiting in Outbox any more." ) };
      void this.load( true );
      return;
    }
    this.rowError.set( row.id, String( error?.error?.message || error?.message || fallback ) );
  }
}
