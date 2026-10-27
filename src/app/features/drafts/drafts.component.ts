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
import { firstName, sendTimeLabel, sinceLabel } from '../../shared/mail/mail-time.util';

type DraftKind = 'outbound' | 'reply';

interface DraftCard {
  thread: MomentumThread;
  id: string;
  kind: DraftKind;
  name: string;
  company: string;
  subject: string;
  body: string;
  why: string;
  lastLine: string;
  kindPill: string;
  signalPill: { text: string; tint: 'yellow' | 'green'; } | null;
  warm: boolean;
  rewriting: boolean;
  rewritten: boolean;
  /** Emails this address got in the last 7 days. */
  sentThisWeek: number;
  /** The contact cap holds it: emailed in the last few days, no reply since. "" when it can send. */
  heldUntil: string;
}

const REWRITE_POLL_MS = 5000;
const REWRITE_GIVE_UP_MS = 120000;

/**
 * Drafts (design_handoff_outreach_mail 1e): what Maya wrote, people with
 * momentum first. Approve sends it to Outbox; Ask Maya to rewrite shows
 * progress until the new version lands in place; Discard can be undone for
 * five seconds.
 */
@Component( {
  selector: 'app-drafts',
  standalone: true,
  imports: [CommonModule, RouterModule, BrowseNoticeComponent, WriteActionDirective, PreloaderComponent, MailToastComponent],
  templateUrl: './drafts.component.html',
  styleUrls: ['../../shared/mail/mail-page.css', './drafts.component.css'],
} )
export class DraftsComponent implements OnInit, OnDestroy {
  private readonly auth = inject( OutreachAuthService );
  private readonly api = inject( OutreachApiService );
  private readonly counts = inject( NeedsYouCountService );
  private readonly router = inject( Router );
  private subscription?: Subscription;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingDiscard: { card: DraftCard; timer: ReturnType<typeof setTimeout>; } | null = null;

  private tenantId = '';
  private userId = '';
  private userEmail = '';

  loading = true;
  error = '';
  cards: DraftCard[] = [];
  warm: DraftCard[] = [];
  first: DraftCard[] = [];
  /** Drafts to people the contact cap is holding (todd-backend momentum.contact-cap.js). */
  held: DraftCard[] = [];
  confirmDiscardHeld = false;
  discardingHeld = false;
  private recentSends: Record<string, { count: number; lastSentAt: string; }> = {};
  private capDays = 3;
  expanded = new Set<string>();
  moreOpen = new Set<string>();
  working = new Map<string, string>();
  cardError = new Map<string, string>();
  testNote = new Map<string, string>();
  /** Rewrites in flight: contact id -> when it was asked. */
  private rewriting = new Map<string, number>();
  private rewritten = new Set<string>();
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
  }

  ngOnDestroy (): void {
    this.subscription?.unsubscribe();
    clearTimeout( this.pollTimer );
    // Leaving with an Undo still showing: it's discarded.
    this.commitDiscard();
  }

  private get opts () {
    return { tenantId: this.tenantId, userId: this.userId || undefined, userEmail: this.userEmail || undefined };
  }

  async load ( quiet = false ): Promise<void> {
    if ( !this.tenantId ) return;
    if ( !quiet ) this.loading = true;
    try {
      const [response, recent] = await Promise.all( [
        firstValueFrom( this.api.getSignalEngineBootstrap( this.opts ) ),
        firstValueFrom( this.api.getRecentSends( this.opts ) ).catch( () => null ),
      ] );
      if ( recent?.data ) {
        this.recentSends = recent.data.counts || {};
        this.capDays = Number( recent.data.capDays ) || 3;
      }
      const threads: MomentumThread[] = Array.isArray( response?.data?.threads ) ? response.data.threads : [];
      this.counts.setFromThreads( threads );
      this.build( threads );
      this.error = '';
    } catch ( error: any ) {
      if ( !quiet ) this.error = String( error?.error?.message || error?.message || 'Unable to load your drafts.' );
    } finally {
      this.loading = false;
    }
  }

  private build ( threads: MomentumThread[] ): void {
    const now = Date.now();
    const pendingId = this.pendingDiscard?.card.id;
    const cards: DraftCard[] = [];
    for ( const thread of threads ) {
      const id = String( thread.contactId || thread.id );
      if ( thread.userLane !== 'drafts' || id === pendingId ) continue;
      const rewriteAsked = this.rewriting.get( id );
      const stillRewriting = !!thread.rewriteQueueState || ( rewriteAsked !== undefined && !this.hasDraft( thread ) );
      if ( rewriteAsked !== undefined && !stillRewriting ) {
        this.rewriting.delete( id );
        this.rewritten.add( id );
      }
      if ( rewriteAsked !== undefined && stillRewriting && now - rewriteAsked > REWRITE_GIVE_UP_MS ) this.rewriting.delete( id );
      if ( !this.hasDraft( thread ) && !stillRewriting ) continue;
      cards.push( this.card( thread, id, stillRewriting ) );
    }
    // Most engaged first, then the newest draft.
    const score = ( card: DraftCard ) => ( card.thread.clickCount || 0 ) * 10 + ( card.thread.openCount || 0 );
    cards.sort( ( a, b ) => score( b ) - score( a ) || String( b.thread.lastUpdated || '' ).localeCompare( String( a.thread.lastUpdated || '' ) ) );
    this.cards = cards;
    this.warm = cards.filter( ( card ) => card.warm && !card.heldUntil );
    this.first = cards.filter( ( card ) => !card.warm && !card.heldUntil );
    this.held = cards.filter( ( card ) => !!card.heldUntil );
    if ( this.rewriting.size ) this.schedulePoll();
  }

  private hasDraft ( thread: MomentumThread ): boolean {
    return !!( String( thread.draftBody || '' ).trim() || String( thread.replyDraftBody || '' ).trim() );
  }

  private card ( thread: MomentumThread, id: string, rewriting: boolean ): DraftCard {
    const kind: DraftKind = !String( thread.draftBody || '' ).trim() && String( thread.replyDraftBody || '' ).trim() ? 'reply' : 'outbound';
    const touches = Number( thread.touchCount || 0 );
    const opens = Number( thread.openCount || 0 );
    const clicks = Number( thread.clickCount || 0 );
    const name = String( thread.contactName || thread.emailAddress || 'Unknown contact' ).trim();
    const recent = this.recentSends[String( thread.emailAddress || '' ).trim().toLowerCase()] || null;
    const lastSentIso = [recent?.lastSentAt, thread.lastSentAt].filter( Boolean ).sort().pop() || '';
    const lastSent = lastSentIso ? sinceLabel( lastSentIso ) : '';
    const sentThisWeek = recent?.count || 0;
    const heldUntil = this.heldUntil( thread, lastSentIso );
    const first = firstName( name );
    return {
      thread,
      id,
      kind,
      name,
      company: String( thread.companyName || '' ),
      subject: String( ( kind === 'reply' ? thread.replyDraftSubject : thread.draftSubject ) || '' ).trim() || '(no subject)',
      body: String( ( kind === 'reply' ? thread.replyDraftBody : thread.draftBody ) || '' ),
      why: String( ( kind === 'reply' ? thread.replyDraftRationale : '' ) || thread.strategySummary || thread.stopReason?.detail || '' ).trim(),
      lastLine: this.rewritten.has( id ) ? 'Rewritten by Maya just now.'
        : sentThisWeek > 1 ? `You emailed ${ first } ${ sentThisWeek } times this week, last ${ lastSent }.`
          : lastSent ? `Your last email went out ${ lastSent }.`
            : `Drafted ${ sinceLabel( thread.lastUpdated ) || 'recently' }. No emails yet.`,
      kindPill: kind === 'reply' ? 'Reply' : touches ? `Follow-up · email ${ touches + 1 }` : 'First email',
      signalPill: clicks ? { text: `Clicked ${ clicks }×`, tint: 'yellow' } : opens ? { text: `Opened ${ opens }×`, tint: 'green' } : null,
      warm: kind === 'reply' || clicks > 0 || opens > 0,
      rewriting,
      rewritten: this.rewritten.has( id ),
      sentThisWeek,
      heldUntil,
    };
  }

  /** The server's contact cap, mirrored so the page can show it: emailed within capDays, no reply since. */
  private heldUntil ( thread: MomentumThread, lastSentIso: string ): string {
    const last = Date.parse( lastSentIso || '' );
    if ( !last ) return '';
    const replied = Date.parse( String( ( thread as any ).latestReplyAt || '' ) ) || 0;
    if ( replied > last ) return '';
    const until = last + this.capDays * 86400000;
    if ( until <= Date.now() ) return '';
    return new Date( until ).toLocaleDateString( 'en-US', { weekday: 'short', month: 'short', day: 'numeric' } );
  }

  /** Clears every held draft at once, after a confirm. Maya writes a fresh one when the hold ends. */
  async discardAllHeld (): Promise<void> {
    if ( this.discardingHeld || !this.held.length ) return;
    this.discardingHeld = true;
    const held = [...this.held];
    let failed = 0;
    for ( const card of held ) {
      try {
        await firstValueFrom( this.api.discardMomentumDraft( card.id, this.opts ) );
      } catch {
        failed += 1;
      }
    }
    this.discardingHeld = false;
    this.confirmDiscardHeld = false;
    this.toast = { text: failed ? `Discarded ${ held.length - failed } drafts. ${ failed } couldn't be discarded.` : `Discarded ${ held.length } drafts to people you emailed recently.` };
    await this.load( true );
  }

  /** "If approved, sends …" - a reply goes at once; a new email waits for their business hours. */
  sendLine ( card: DraftCard ): string {
    if ( card.kind === 'reply' ) return 'If approved, this reply sends right away.';
    return `If approved, sends on a weekday during ${ firstName( card.name ) }'s business hours.`;
  }

  trackById ( _index: number, card: DraftCard ): string {
    return card.id;
  }

  toggleExpanded ( card: DraftCard ): void {
    if ( this.expanded.has( card.id ) ) this.expanded.delete( card.id );
    else this.expanded.add( card.id );
  }

  toggleMore ( card: DraftCard ): void {
    if ( this.moreOpen.has( card.id ) ) this.moreOpen.delete( card.id );
    else this.moreOpen.add( card.id );
  }

  private remove ( card: DraftCard ): void {
    this.build( this.cards.map( ( item ) => item.thread ).filter( ( thread ) => String( thread.contactId || thread.id ) !== card.id ) );
  }

  async approve ( card: DraftCard ): Promise<void> {
    if ( this.working.has( card.id ) ) return;
    this.working.set( card.id, 'approve' );
    this.cardError.delete( card.id );
    try {
      if ( card.kind === 'reply' ) {
        await firstValueFrom( this.api.sendManualMomentumReplyDraft( { contactId: card.id }, this.opts ) );
        this.remove( card );
        this.toast = { text: `Reply sent to ${ card.name }.`, action: { label: 'View in Sent', link: '/sent' } };
      } else {
        const response = await firstValueFrom( this.api.approveMomentumDraft( card.id, this.opts ) );
        const scheduledAt = ( response as any )?.data?.scheduledAt;
        this.remove( card );
        this.toast = { text: `Approved. Sends ${ scheduledAt ? sendTimeLabel( new Date( scheduledAt ) ) : 'during their business hours' }.`, action: { label: 'View in Outbox', link: '/outbox' } };
      }
      void this.load( true );
    } catch ( error: any ) {
      this.failed( card, error, 'Unable to approve this draft.' );
    } finally {
      this.working.delete( card.id );
    }
  }

  async edit ( card: DraftCard ): Promise<void> {
    if ( this.working.has( card.id ) ) return;
    this.working.set( card.id, 'edit' );
    this.cardError.delete( card.id );
    try {
      const response = await firstValueFrom( this.api.createMomentumComposerHandoff( card.id, {
        draftSubject: card.subject,
        draftBody: card.body,
        companyName: card.company,
        returnRoute: '/drafts',
        returnThreadId: card.id,
        draftKind: card.kind,
      }, this.opts ) );
      const reviewRoute = String( ( response as any )?.data?.reviewRoute || '' );
      if ( reviewRoute ) {
        // The server sends a full URL; open its path and query in the app.
        const url = new URL( reviewRoute, window.location.origin );
        await this.router.navigateByUrl( `${ url.pathname }${ url.search }` );
      }
    } catch ( error: any ) {
      this.failed( card, error, 'Unable to open this draft in the composer.' );
    } finally {
      this.working.delete( card.id );
    }
  }

  async rewrite ( card: DraftCard ): Promise<void> {
    if ( this.working.has( card.id ) ) return;
    this.working.set( card.id, 'rewrite' );
    this.cardError.delete( card.id );
    try {
      await firstValueFrom( this.api.rejectMomentumDraft( card.id, card.kind === 'reply'
        ? { draftKind: 'reply' }
        : { draftKind: 'outbound', rejectedDraftSubject: card.subject, rejectedDraftBody: card.body, rejectionReason: 'Rewrite requested in Drafts - please try a different angle.' },
      this.opts ) );
      this.rewritten.delete( card.id );
      this.rewriting.set( card.id, Date.now() );
      card.rewriting = true;
      this.moreOpen.delete( card.id );
      this.schedulePoll();
    } catch ( error: any ) {
      this.failed( card, error, 'Unable to ask Maya for a rewrite.' );
    } finally {
      this.working.delete( card.id );
    }
  }

  private schedulePoll (): void {
    clearTimeout( this.pollTimer );
    this.pollTimer = setTimeout( () => void this.load( true ), REWRITE_POLL_MS );
  }

  async sendTest ( card: DraftCard ): Promise<void> {
    if ( this.working.has( card.id ) ) return;
    this.working.set( card.id, 'test' );
    this.testNote.delete( card.id );
    try {
      const response = await firstValueFrom( this.api.sendMomentumDraftTest( card.id, {}, this.opts ) );
      this.testNote.set( card.id, `Test sent to ${ response?.data?.recipientEmail || 'your inbox' }.` );
    } catch ( error: any ) {
      this.testNote.set( card.id, String( error?.error?.message || error?.message || 'Unable to send that test.' ) );
    } finally {
      this.working.delete( card.id );
    }
  }

  discard ( card: DraftCard ): void {
    this.commitDiscard();
    this.remove( card );
    this.pendingDiscard = { card, timer: setTimeout( () => this.commitDiscard(), 5000 ) };
    this.toast = { text: `Discarded the draft for ${ card.name }.`, action: { label: 'Undo' } };
  }

  undoDiscard (): void {
    const pending = this.pendingDiscard;
    if ( !pending ) return;
    clearTimeout( pending.timer );
    this.pendingDiscard = null;
    this.build( [...this.cards.map( ( item ) => item.thread ), pending.card.thread] );
  }

  private commitDiscard (): void {
    const pending = this.pendingDiscard;
    if ( !pending ) return;
    clearTimeout( pending.timer );
    this.pendingDiscard = null;
    firstValueFrom( this.api.discardMomentumDraft( pending.card.id, this.opts ) ).catch( () => {
      // It didn't go through: put it back so nothing is silently lost.
      this.build( [...this.cards.map( ( item ) => item.thread ), pending.card.thread] );
      this.toast = { text: `Couldn't discard the draft for ${ pending.card.name }.` };
    } );
  }

  private failed ( card: DraftCard, error: any, fallback: string ): void {
    // Already approved or rewritten elsewhere: just refresh.
    if ( error?.error?.error === 'not_a_draft' ) {
      void this.load( true );
      return;
    }
    this.cardError.set( card.id, String( error?.error?.message || error?.message || fallback ) );
  }
}
