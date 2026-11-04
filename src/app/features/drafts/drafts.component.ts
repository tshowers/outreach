import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Observable, Subscription, catchError, combineLatest, firstValueFrom, from, map, mergeMap, of, take, toArray } from 'rxjs';

import { OutreachAuthService } from '../../services/outreach-auth.service';
import { OutreachApiService } from '../../services/outreach-api.service';
import { NeedsYouCountService } from '../../services/needs-you-count.service';
import { MomentumThread } from '../../models/momentum-thread.model';
import { BrowseNoticeComponent } from '../../shared/write-access/browse-notice.component';
import { WriteActionDirective } from '../../shared/write-access/write-action.directive';
import { PreloaderComponent } from '../../shared/preloader/preloader.component';
import { MailToast, MailToastComponent } from '../../shared/mail/mail-toast.component';
import { firstName, sendTimeLabel, sinceLabel } from '../../shared/mail/mail-time.util';
import { stripAiFooter } from '../../shared/mail/ai-footer.util';
import { scrubEmailHtml } from '../../shared/utils/email-html.util';

type DraftKind = 'outbound' | 'reply';

interface DraftCard {
  thread: MomentumThread;
  id: string;
  kind: DraftKind;
  name: string;
  company: string;
  subject: string;
  body: string;
  /** body, scrubbed and trusted, so its inline styles (the signature) show as sent. */
  bodyHtml: SafeHtml;
  why: string;
  lastLine: string;
  kindPill: string;
  signalPill: { text: string; tint: 'yellow' | 'green'; } | null;
  warm: boolean;
  rewriting: boolean;
  /** What the rewriting bar says: queued batch rewrites take hours, a single rewrite seconds. */
  rewritingText: string;
  rewritten: boolean;
  /** Emails this address got in the last 7 days. */
  sentThisWeek: number;
  /** The contact cap holds it: emailed in the last few days, no reply since. "" when it can send. */
  heldUntil: string;
  /** They really wrote back: only then is it labeled and sent as a Reply (Ty, 2026-11-04). */
  replied: boolean;
  /** What happens on Approve, precomputed for the template. */
  sendLine: string;
}

const REWRITE_POLL_MS = 5000;
// Queued rewrites finish about five every 12 minutes, so check once a minute.
const REWRITE_QUEUE_POLL_MS = 60000;
const REWRITE_GIVE_UP_MS = 120000;

/**
 * Drafts (design_handoff_outreach_mail 1e): what Maya wrote, people with
 * momentum first. Approve sends it to Outbox; Ask Maya to rewrite shows
 * progress until the new version lands in place; Discard can be undone for
 * five seconds. Select (Ty, 2026-10-31, as in Docs) checks many drafts to
 * approve & send or delete together.
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
  private readonly sanitizer = inject( DomSanitizer );
  private subscription?: Subscription;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingDiscard: { card: DraftCard; timer: ReturnType<typeof setTimeout>; } | null = null;
  /** Drafts discarded on this visit: an older load can't bring them back (Ty, 2026-11-04). */
  private readonly discarded = new Set<string>();

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

  /** Select mode: each card gets a checkbox, and the select bar acts on the checked ones. */
  selecting = false;
  checkedIds = new Set<string>();
  /** Kept in step with checkedIds by syncChecked(), for the template. */
  checkedCount = 0;
  checkedApprovable = 0;
  checkedRewritable = 0;
  allChecked = false;
  confirmBulk: 'approve' | 'discard' | 'rewrite' | null = null;
  bulkWorking: 'approve' | 'discard' | 'rewrite' | null = null;

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
      if ( thread.userLane !== 'drafts' || id === pendingId || this.discarded.has( id ) ) continue;
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
    this.syncChecked();
    if ( this.rewriting.size ) this.schedulePoll();
    else if ( cards.some( ( card ) => !!card.thread.rewriteQueueState ) ) this.schedulePoll( REWRITE_QUEUE_POLL_MS );
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
    // An open or click can write a draft into the reply fields; it's only a Reply if they wrote back.
    const replied = kind === 'reply' && !!( String( thread.latestReplyText || '' ).trim() || thread.latestReplyAt );
    const body = stripAiFooter( String( ( kind === 'reply' ? thread.replyDraftBody : thread.draftBody ) || '' ) );
    return {
      thread,
      id,
      kind,
      name,
      company: String( thread.companyName || '' ),
      subject: String( ( kind === 'reply' ? thread.replyDraftSubject : thread.draftSubject ) || '' ).trim() || '(no subject)',
      body,
      bodyHtml: this.sanitizer.bypassSecurityTrustHtml( scrubEmailHtml( body ) || '<p>(no message yet)</p>' ),
      why: String( ( kind === 'reply' ? thread.replyDraftRationale : '' ) || thread.strategySummary || thread.stopReason?.detail || '' ).trim(),
      lastLine: this.rewritten.has( id ) ? 'Rewritten by the Marketing Assistant just now.'
        : sentThisWeek > 1 ? `You emailed ${ first } ${ sentThisWeek } times this week, last ${ lastSent }.`
          : lastSent ? `Your last email went out ${ lastSent }.`
            : `Drafted ${ sinceLabel( thread.lastUpdated ) || 'recently' }. No emails yet.`,
      kindPill: replied ? 'Reply' : touches ? `Follow-up · email ${ touches + 1 }` : kind === 'reply' ? 'Follow-up' : 'First email',
      signalPill: clicks ? { text: `Clicked ${ clicks }×`, tint: 'yellow' } : opens ? { text: `Opened ${ opens }×`, tint: 'green' } : null,
      warm: kind === 'reply' || clicks > 0 || opens > 0,
      rewriting,
      rewritingText: thread.rewriteQueueState === 'pending' ? 'Waiting its turn to be rewritten. The Marketing Assistant does about five every 12 minutes.'
        : thread.rewriteQueueState === 'processing' ? 'The Marketing Assistant is rewriting this now.'
          : 'The Marketing Assistant is rewriting this with a different angle. About 20 seconds.',
      rewritten: this.rewritten.has( id ),
      sentThisWeek,
      heldUntil,
      replied,
      sendLine: sendLine( kind, replied, first, heldUntil ),
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
      const response = await firstValueFrom( this.approveCall( card ) );
      if ( card.kind === 'reply' ) {
        this.remove( card );
        this.toast = { text: `Reply sent to ${ card.name }.`, action: { label: 'View in Sent', link: '/sent' } };
      } else {
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

  /** The one call behind Approve, for a single card and for Approve & send on the checked ones. */
  private approveCall ( card: DraftCard ): Observable<unknown> {
    return card.kind === 'reply'
      ? this.api.sendManualMomentumReplyDraft( { contactId: card.id }, this.opts )
      : this.api.approveMomentumDraft( card.id, this.opts );
  }

  startSelecting (): void {
    this.selecting = true;
    this.checkedIds = new Set();
    this.confirmBulk = null;
    this.syncChecked();
  }

  stopSelecting (): void {
    if ( this.bulkWorking ) return;
    this.selecting = false;
    this.checkedIds = new Set();
    this.confirmBulk = null;
    this.syncChecked();
  }

  toggleChecked ( card: DraftCard ): void {
    if ( this.checkedIds.has( card.id ) ) this.checkedIds.delete( card.id );
    else this.checkedIds.add( card.id );
    this.confirmBulk = null;
    this.syncChecked();
  }

  /** Checks every draft on the page, or clears them when all are. */
  toggleAll (): void {
    this.checkedIds = this.allChecked ? new Set() : new Set( this.cards.map( ( card ) => card.id ) );
    this.confirmBulk = null;
    this.syncChecked();
  }

  /** Drops ids that left the page and recounts. Held and rewriting drafts can be deleted but not approved. */
  private syncChecked (): void {
    const checked = this.cards.filter( ( card ) => this.checkedIds.has( card.id ) );
    this.checkedIds = new Set( checked.map( ( card ) => card.id ) );
    this.checkedCount = checked.length;
    this.checkedApprovable = checked.filter( ( card ) => this.approvable( card ) ).length;
    this.checkedRewritable = checked.filter( ( card ) => !card.rewriting && !this.working.has( card.id ) ).length;
    this.allChecked = this.cards.length > 0 && checked.length === this.cards.length;
  }

  private approvable ( card: DraftCard ): boolean {
    return !card.heldUntil && !card.rewriting && !this.working.has( card.id );
  }

  /** Approve & send, Delete or Rewrite on the checked drafts, after the select bar's confirm. */
  async runBulk ( action: 'approve' | 'discard' | 'rewrite' ): Promise<void> {
    if ( this.bulkWorking ) return;
    if ( action === 'rewrite' ) return this.rewriteChecked();
    const checked = this.cards.filter( ( card ) => this.checkedIds.has( card.id ) );
    const cards = action === 'approve' ? checked.filter( ( card ) => this.approvable( card ) ) : checked;
    if ( !cards.length ) return;
    // An Undo still showing is committed first, so the reload can't bring it back.
    this.commitDiscard();
    this.confirmBulk = null;
    this.bulkWorking = action;
    const call = ( card: DraftCard ) => action === 'approve' ? this.approveCall( card ) : this.api.discardMomentumDraft( card.id, this.opts );
    const failed = await this.eachFourAtATime( cards, call );
    const done = cards.length - failed.length;
    this.bulkWorking = null;
    // Ones that failed stay checked, so trying again only retries those.
    this.checkedIds = new Set( failed );
    if ( !failed.length ) this.selecting = false;
    this.syncChecked();
    const drafts = ( count: number ) => `${ count } ${ count === 1 ? 'draft' : 'drafts' }`;
    if ( action === 'approve' ) {
      this.toast = failed.length
        ? { text: `Approved ${ drafts( done ) }. ${ failed.length } couldn't be approved and are still checked.` }
        : { text: `Approved ${ drafts( done ) }. Replies send now; new emails send during each person's business hours.`, action: { label: 'View in Outbox', link: '/outbox' } };
    } else {
      this.toast = { text: failed.length ? `Deleted ${ drafts( done ) }. ${ failed.length } couldn't be deleted and are still checked.` : `Deleted ${ drafts( done ) }.` };
    }
    await this.load( true );
  }

  /**
   * The Marketing Assistant rewrites the checked drafts (2026-11-02): they
   * join the rewrite queue (momentum.rewrite-queue.js), which redrafts about
   * five every 12 minutes, and come back to Drafts as they finish.
   */
  private async rewriteChecked (): Promise<void> {
    const cards = this.cards.filter( ( card ) => this.checkedIds.has( card.id ) && !card.rewriting && !this.working.has( card.id ) );
    if ( !cards.length ) return;
    this.commitDiscard();
    this.confirmBulk = null;
    this.bulkWorking = 'rewrite';
    const failed: string[] = [];
    // The backend takes up to 100 at a time.
    for ( let start = 0; start < cards.length; start += 100 ) {
      const ids = cards.slice( start, start + 100 ).map( ( card ) => card.id );
      try {
        const response = await firstValueFrom( this.api.rejectRewriteMomentumDraftsBatch( ids, this.opts ) );
        for ( const result of response.data?.results || [] ) if ( !result.success && result.error !== 'already_queued' ) failed.push( result.contactId );
      } catch {
        failed.push( ...ids );
      }
    }
    const done = cards.length - failed.length;
    this.bulkWorking = null;
    this.checkedIds = new Set( failed );
    if ( !failed.length ) this.selecting = false;
    this.syncChecked();
    const drafts = ( count: number ) => `${ count } ${ count === 1 ? 'draft' : 'drafts' }`;
    const hours = Math.max( 1, Math.round( Math.ceil( done / 5 ) * 12 / 60 ) );
    const pace = `About five are done every 12 minutes, so this takes about ${ hours } ${ hours === 1 ? 'hour' : 'hours' }.`;
    this.toast = failed.length
      ? { text: `The Marketing Assistant is rewriting ${ drafts( done ) }. ${ failed.length } couldn't be queued and are still checked.` }
      : { text: `The Marketing Assistant is rewriting ${ drafts( done ) }. ${ pace }` };
    await this.load( true );
  }

  /** Runs call on every card, four at a time; resolves with the ids that failed. */
  private async eachFourAtATime ( cards: DraftCard[], call: ( card: DraftCard ) => Observable<unknown> ): Promise<string[]> {
    const results = await firstValueFrom( from( cards ).pipe(
      mergeMap( ( card ) => call( card ).pipe(
        map( () => ( { id: card.id, ok: true } ) ),
        catchError( () => of( { id: card.id, ok: false } ) ),
      ), 4 ),
      toArray(),
    ) );
    return results.filter( ( result ) => !result.ok ).map( ( result ) => result.id );
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
      this.failed( card, error, 'Unable to ask Marketing Assistant for a rewrite.' );
    } finally {
      this.working.delete( card.id );
    }
  }

  private schedulePoll ( ms = REWRITE_POLL_MS ): void {
    clearTimeout( this.pollTimer );
    this.pollTimer = setTimeout( () => void this.load( true ), ms );
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
    this.discarded.add( pending.card.id );
    firstValueFrom( this.api.discardMomentumDraft( pending.card.id, this.opts ) ).catch( ( error: any ) => {
      // Already out of Drafts (discarded, sent, or stopped): that's done, not a failure.
      if ( error?.error?.error === 'not_a_draft' ) return;
      // It didn't go through: put it back so nothing is silently lost.
      this.discarded.delete( pending.card.id );
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
    // Stopped for silence: the server took the draft out of Drafts, so the card goes with the reason.
    if ( error?.error?.error === 'no_engagement' ) {
      this.discarded.add( card.id );
      this.remove( card );
      this.toast = { text: String( error.error.message || `Stopped emailing ${ card.name }.` ) };
      return;
    }
    this.cardError.set( card.id, String( error?.error?.message || error?.message || fallback ) );
  }
}

/** "If approved, sends …": held until the cap ends; a real reply goes at once; anything else waits for their business hours. */
function sendLine ( kind: DraftKind, replied: boolean, first: string, heldUntil: string ): string {
  if ( heldUntil ) return `Held until ${ heldUntil } so ${ first } doesn't get too many emails. You can approve it then.`;
  if ( replied ) return 'If approved, this reply sends right away.';
  if ( kind === 'reply' ) return 'If approved, this sends right away.';
  return `If approved, sends on a weekday during ${ first }'s business hours.`;
}

