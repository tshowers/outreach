import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { getAuth } from 'firebase/auth';

import { ComplianceStatus, FirstSend, FirstSendRow, FirstSendService, MailingAddress } from '../../services/first-send.service';
import { FormsModule } from '@angular/forms';
import { OutreachOnboardingService } from '../../services/outreach-onboarding.service';
import { BrowseNoticeComponent } from '../../shared/write-access/browse-notice.component';
import { WriteActionDirective } from '../../shared/write-access/write-action.directive';

const POLL_MS = 3000;

/**
 * The first email (design_handoff_outreach_onboarding 4): Maya's draft for
 * each contact Network sent over, a preview per person with why it's written
 * that way, then sending from the user's inbox a few minutes apart. The user
 * can leave while it sends; coming back shows where it's up to.
 */
@Component( {
  selector: 'app-first-email',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BrowseNoticeComponent, WriteActionDirective],
  templateUrl: './first-email.component.html',
  styleUrl: './first-email.component.css',
} )
export class FirstEmailComponent implements OnInit, OnDestroy {
  private readonly api = inject( FirstSendService );
  private readonly router = inject( Router );
  private readonly title = inject( Title );
  readonly setup = inject( OutreachOnboardingService );

  batch: FirstSend | null = null;
  compliance: ComplianceStatus | null = null;
  address: MailingAddress = { streetAddress: '', city: '', state: '', zip: '', country: 'US' };
  savingAddress = false;
  selected = 0;
  loading = true;
  working = false;
  /** Why there's nothing to review: no contacts yet, or drafting needs Outreach. */
  blocked: 'contacts' | 'subscription' | null = null;
  errorMessage = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  async ngOnInit (): Promise<void> {
    this.title.setTitle( 'Your first email — Outreach' );
    await getAuth().authStateReady();
    void this.setup.refresh();
    try {
      const { batch: latest, compliance } = await this.api.latest();
      this.compliance = compliance;
      const ids = this.setup.handoff()?.contactIds || [];
      if ( latest && ( latest.status !== 'draft' || !ids.length || this.sameContacts( latest, ids ) ) ) {
        this.show( latest );
      } else if ( ids.length ) {
        await this.draft( ids );
      } else {
        this.blocked = 'contacts';
      }
    } catch ( error: any ) {
      this.fail( error );
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy (): void {
    this.destroyed = true;
    if ( this.timer ) clearTimeout( this.timer );
  }

  get rows (): FirstSendRow[] {
    return ( this.batch?.rows || [] ).filter( ( row ) => row.status !== 'skipped' );
  }

  get current (): FirstSendRow | null {
    return this.rows[this.selected] || this.rows[0] || null;
  }

  get inboxConnected (): boolean {
    return !!this.setup.onboarding()?.steps.find( ( step ) => step.id === 'connectInbox' )?.done;
  }

  get fromAddress (): string {
    return this.batch?.mailboxAddress || this.setup.onboarding()?.mailboxAddress || 'your inbox';
  }

  get sentCount (): number {
    return this.rows.filter( ( row ) => row.status === 'sent' ).length;
  }

  get heading (): string {
    if ( this.batch?.status === 'done' ) return `${this.sentCount} ${this.sentCount === 1 ? 'email' : 'emails'} sent.`;
    if ( this.batch?.status === 'sending' ) return `Sending ${Math.min( this.sentCount + 1, this.rows.length )} of ${this.rows.length}…`;
    return 'Your first email, written by the Marketing Assistant';
  }

  get subline (): string {
    if ( this.batch?.status === 'done' ) return `Replies come back to ${this.fromAddress}, and Outreach reads them for you.`;
    if ( this.batch?.status === 'sending' ) return 'You can leave this page. Sending carries on.';
    return 'One personal email for each contact from Network, written from your profile and what Network knows about them. Click a name to see their version.';
  }

  /** Email law: every email's footer carries the company and a mailing address. */
  get needsAddress (): boolean {
    return !!this.compliance && !this.compliance.isComplete;
  }

  get needsCompanyName (): boolean {
    return !!this.compliance && !this.compliance.companyName;
  }

  async saveAddress (): Promise<void> {
    if ( this.savingAddress ) return;
    this.savingAddress = true;
    this.errorMessage = '';
    try {
      this.compliance = await this.api.saveAddress( this.address );
    } catch ( error: any ) {
      this.fail( error );
    } finally {
      this.savingAddress = false;
    }
  }

  get failedCount (): number {
    return this.rows.filter( ( row ) => row.status === 'failed' ).length;
  }

  paragraphs ( body: string ): string[] {
    return String( body || '' ).split( /\n\s*\n/ ).map( ( p ) => p.trim() ).filter( Boolean );
  }

  rowLabel ( row: FirstSendRow ): string {
    return { draft: 'Queued', queued: 'Queued', sending: 'Sending…', sent: 'Sent', failed: 'Didn’t send', skipped: 'Skipped' }[row.status];
  }

  async toggleTone (): Promise<void> {
    if ( !this.batch || this.working ) return;
    this.working = true;
    try {
      this.show( await this.api.redraft( this.batch.id, this.batch.tone === 'softer' ? 'default' : 'softer' ) );
    } catch ( error: any ) {
      this.fail( error );
    } finally {
      this.working = false;
    }
  }

  async send (): Promise<void> {
    if ( !this.batch || this.working ) return;
    this.working = true;
    try {
      this.show( await this.api.send( this.batch.id ) );
      void this.setup.refresh();
    } catch ( error: any ) {
      this.fail( error );
    } finally {
      this.working = false;
    }
  }

  /** Edit one in the composer: it leaves the batch so it isn't sent twice. */
  async editInComposer ( row: FirstSendRow ): Promise<void> {
    if ( !this.batch ) return;
    try {
      this.show( await this.api.skip( this.batch.id, row.contactId ) );
      await this.router.navigate( ['/compose-email'], { queryParams: { contactId: row.contactId, draftSubject: row.subject, draftBody: row.body } } );
    } catch ( error: any ) {
      this.fail( error );
    }
  }

  private async draft ( contactIds: string[] ): Promise<void> {
    this.working = true;
    try {
      this.show( await this.api.create( contactIds ) );
    } finally {
      this.working = false;
    }
  }

  private show ( batch: FirstSend ): void {
    this.batch = batch;
    this.blocked = null;
    this.errorMessage = '';
    if ( this.timer ) clearTimeout( this.timer );
    if ( batch.status === 'sending' && !this.destroyed ) {
      this.timer = setTimeout( () => void this.poll(), POLL_MS );
    }
    if ( batch.status === 'done' ) void this.setup.refresh();
  }

  private async poll (): Promise<void> {
    try {
      const { batch: latest } = await this.api.latest();
      if ( latest && !this.destroyed ) this.show( latest );
    } catch {
      if ( !this.destroyed ) this.timer = setTimeout( () => void this.poll(), POLL_MS );
    }
  }

  private sameContacts ( batch: FirstSend, ids: string[] ): boolean {
    const have = new Set( batch.rows.map( ( row ) => row.contactId ) );
    return ids.every( ( id ) => have.has( id ) );
  }

  private fail ( error: any ): void {
    if ( error?.status === 403 ) {
      this.blocked = 'subscription';
      return;
    }
    if ( error?.error?.code === 'missing_compliance_profile' && this.compliance ) {
      this.compliance = { ...this.compliance, isComplete: false };
    }
    this.errorMessage = error?.error?.message || error?.message || 'Something went wrong. Try again.';
  }
}
