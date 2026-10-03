import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription, combineLatest, firstValueFrom } from 'rxjs';

import { MomentumThread } from '../../models/momentum-thread.model';
import { NeedsYouCountService } from '../../services/needs-you-count.service';
import { OutreachApiService } from '../../services/outreach-api.service';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { OutreachDataService } from '../../services/outreach-data.service';
import { DESIGN_PREVIEW_NEEDS_YOU, isDesignPreview } from '../../shared/utils/design-preview';
import { cleanMessageText } from '../../shared/utils/message-kind.util';
import {
  NEEDS_YOU_KIND_LABELS, NEEDS_YOU_KIND_TINTS, NeedsYouAction, NeedsYouKind, hasMayaReply, isNeedsYou, needsAnswer,
  needsYouKind, outOfOfficeDetails, primaryAction, readableReply, whyItsHere
} from '../../shared/utils/needs-you.util';

interface PendingDone {
  items: MomentumThread[];
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Needs you (design 5e): the people waiting on a decision from you, split
 * into "needs an answer" and "nothing to answer", with one person open at a
 * time beside the list. The goal is zero. Plan - everything Maya is still
 * handling herself - is separate.
 */
@Component( {
  selector: 'app-needs-you',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './needs-you.component.html',
  styleUrl: './needs-you.component.css'
} )
export class NeedsYouComponent implements OnInit, OnDestroy {
  private readonly api = inject( OutreachApiService );
  private readonly auth = inject( OutreachAuthService );
  private readonly data = inject( OutreachDataService );
  private readonly route = inject( ActivatedRoute );
  private readonly router = inject( Router );
  private readonly count = inject( NeedsYouCountService );
  private subscription?: Subscription;

  tenantId = '';
  userId = '';
  userEmail = '';
  loading = true;
  error = '';
  items: MomentumThread[] = [];
  planCount = 0;
  selectedId: string | null = null;
  phone = '';

  /** The reply being edited - Maya's, one she just wrote, or the user's own. */
  draftOpen = false;
  draftSubject = '';
  draftBody = '';
  working: 'send' | 'help' | 'compose' | null = null;
  notice = '';
  showOriginal = false;

  /** "Marked Dana done · Undo" - the done call waits until the toast goes. */
  toast: { text: string; canUndo: boolean; } | null = null;
  private pendingDone: PendingDone | null = null;
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly labels = NEEDS_YOU_KIND_LABELS;
  readonly tints = NEEDS_YOU_KIND_TINTS;

  ngOnInit (): void {
    this.selectedId = this.route.snapshot.queryParamMap.get( 'contact' );
    if ( isDesignPreview() ) {
      this.items = this.sorted( DESIGN_PREVIEW_NEEDS_YOU as unknown as MomentumThread[] );
      this.planCount = 309;
      this.count.set( this.items.length );
      this.loading = false;
      this.select( this.items.find( item => item.contactId === this.selectedId ) || this.items[0] || null );
      return;
    }
    this.subscription = combineLatest( [this.auth.getTenantId(), this.auth.getUser()] ).subscribe( ( [tenantId, user] ) => {
      this.tenantId = String( tenantId || '' );
      this.userId = String( user?.uid || '' );
      this.userEmail = String( user?.email || '' );
      if ( this.tenantId ) void this.load();
    } );
  }

  ngOnDestroy (): void {
    this.subscription?.unsubscribe();
    // Leaving with an Undo still showing: it's done.
    this.commitPendingDone();
    clearTimeout( this.toastTimer );
  }

  private get opts () {
    return { tenantId: this.tenantId, userId: this.userId || undefined, userEmail: this.userEmail || undefined };
  }

  async load (): Promise<void> {
    this.loading = true;
    try {
      const response = await firstValueFrom( this.api.getSignalEngineBootstrap( this.opts ) );
      const threads: MomentumThread[] = Array.isArray( response?.data?.threads ) ? response.data.threads : [];
      const pendingIds = new Set( ( this.pendingDone?.items || [] ).map( item => item.contactId ) );
      this.items = this.sorted( threads.filter( thread => isNeedsYou( thread ) && !pendingIds.has( thread.contactId ) ) );
      this.planCount = threads.filter( thread => thread.userLane === 'plan' && !isNeedsYou( thread ) ).length;
      this.count.set( this.items.length );
      this.error = '';
      const current = this.items.find( item => item.contactId === this.selectedId );
      this.select( current || this.items[0] || null );
    } catch ( error: any ) {
      this.error = String( error?.error?.message || error?.message || 'Unable to load Needs you.' );
    } finally {
      this.loading = false;
    }
  }

  /** Needs an answer first, then newest reply first. */
  private sorted ( items: MomentumThread[] ): MomentumThread[] {
    return [...items].sort( ( a, b ) =>
      Number( needsAnswer( b ) ) - Number( needsAnswer( a ) )
      || String( b.latestReplyAt || '' ).localeCompare( String( a.latestReplyAt || '' ) ) );
  }

  get answerItems (): MomentumThread[] {
    return this.items.filter( needsAnswer );
  }

  get clearItems (): MomentumThread[] {
    return this.items.filter( item => !needsAnswer( item ) );
  }

  get selected (): MomentumThread | null {
    return this.items.find( item => item.contactId === this.selectedId ) || null;
  }

  get selectedIndex (): number {
    return this.items.findIndex( item => item.contactId === this.selectedId );
  }

  get next (): MomentumThread | null {
    const index = this.selectedIndex;
    return index >= 0 && index + 1 < this.items.length ? this.items[index + 1] : null;
  }

  get previous (): MomentumThread | null {
    const index = this.selectedIndex;
    return index > 0 ? this.items[index - 1] : null;
  }

  select ( item: MomentumThread | null ): void {
    this.selectedId = item?.contactId || null;
    this.notice = '';
    this.showOriginal = false;
    this.phone = '';
    // Maya's reply is open and editable from the start (5e); otherwise nothing yet.
    if ( item && hasMayaReply( item ) ) {
      this.openDraft( String( item.replyDraftSubject || '' ), this.htmlToText( String( item.replyDraftBody || '' ) ) );
    } else {
      this.draftOpen = false;
      this.draftSubject = '';
      this.draftBody = '';
    }
    if ( item ) void this.loadPhone( item );
  }

  private async loadPhone ( item: MomentumThread ): Promise<void> {
    if ( !this.tenantId ) return;
    const contact = await this.data.getContact( this.tenantId, item.contactId ).catch( () => null );
    if ( this.selectedId !== item.contactId ) return;
    this.phone = String( contact?.phoneNumbers?.find( entry => entry?.phoneNumber )?.phoneNumber || '' ).trim();
  }

  // MARK: - Presentation

  kind ( item: MomentumThread ): NeedsYouKind {
    return needsYouKind( item );
  }

  kindLabel ( item: MomentumThread ): string {
    const label = this.labels[this.kind( item )];
    const back = this.kind( item ) === 'out_of_office' ? this.outOfOffice( item ).returnDate : null;
    return back ? `${ label } · back ${ back.toLocaleDateString( undefined, { month: 'short', day: 'numeric' } ) }` : label;
  }

  why ( item: MomentumThread ): string {
    return whyItsHere( item );
  }

  reply ( item: MomentumThread ): string {
    return readableReply( item );
  }

  action ( item: MomentumThread ): NeedsYouAction {
    return primaryAction( item );
  }

  answers ( item: MomentumThread ): boolean {
    return needsAnswer( item );
  }

  hasMayaReply ( item: MomentumThread ): boolean {
    return hasMayaReply( item );
  }

  outOfOffice ( item: MomentumThread ) {
    return outOfOfficeDetails( this.reply( item ) );
  }

  firstName ( item: MomentumThread ): string {
    return String( item.contactName || item.emailAddress || 'They' ).trim().split( /\s+/ )[0];
  }

  preview ( item: MomentumThread ): string {
    const summary = String( item.replySummary || '' ).trim();
    if ( this.kind( item ) === 'automated' && summary ) return summary;
    return cleanMessageText( item.latestReplyText ).replace( /\n/g, ' ' ) || summary;
  }

  initials ( name: string | undefined ): string {
    return String( name || '?' ).trim().split( /\s+/ ).slice( 0, 2 ).map( part => part[0] || '' ).join( '' ).toUpperCase();
  }

  age ( iso: string | undefined ): string {
    const time = iso ? Date.parse( iso ) : NaN;
    if ( !Number.isFinite( time ) ) return '';
    const minutes = Math.max( 0, ( Date.now() - time ) / 60000 );
    if ( minutes < 60 ) return `${ Math.max( 1, Math.round( minutes ) ) }m`;
    if ( minutes < 1440 ) return `${ Math.round( minutes / 60 ) }h`;
    return `${ Math.round( minutes / 1440 ) }d`;
  }

  // MARK: - Actions

  writeOwn ( item: MomentumThread ): void {
    const subject = String( item.lastSubject || '' ).trim();
    this.openDraft( /^re:/i.test( subject ) ? subject : subject ? `Re: ${ subject }` : '', '' );
  }

  async helpMeWrite ( item: MomentumThread ): Promise<void> {
    if ( this.working ) return;
    this.working = 'help';
    this.notice = '';
    try {
      const response = await firstValueFrom( this.api.draftAssistMomentumReply( item.contactId, this.opts ) );
      const draft = response?.data || {};
      const subject = String( draft.replyDraftSubject || draft.draftSubject || draft.subject || '' );
      const body = String( draft.replyDraftBody || draft.draftBody || draft.body || '' );
      if ( !body.trim() ) throw new Error( "Maya couldn't write this one. Try writing your own." );
      if ( this.selectedId === item.contactId ) this.openDraft( subject || `Re: ${ item.lastSubject || '' }`, this.htmlToText( body ) );
    } catch ( error: any ) {
      this.notice = String( error?.error?.message || error?.message || "Maya couldn't write this one." );
    } finally {
      this.working = null;
    }
  }

  async send ( item: MomentumThread ): Promise<void> {
    if ( !this.draftBody.trim() || this.working ) return;
    this.working = 'send';
    this.notice = '';
    try {
      const html = this.draftBody.trim().split( /\n{2,}/ ).map( part => `<p>${ this.escape( part ).replace( /\n/g, '<br>' ) }</p>` ).join( '' );
      await firstValueFrom( this.api.sendManualMomentumReplyDraft( { contactId: item.contactId, draftSubject: this.draftSubject, draftBody: html }, this.opts ) );
      this.removeAndAdvance( [item] );
      this.showToast( `Sent to ${ this.firstName( item ) }`, false );
    } catch ( error: any ) {
      this.notice = String( error?.error?.message || error?.message || 'Unable to send this reply.' );
    } finally {
      this.working = null;
    }
  }

  markDone ( items: MomentumThread[] ): void {
    if ( !items.length ) return;
    this.commitPendingDone();
    this.removeAndAdvance( items );
    this.pendingDone = { items, timer: setTimeout( () => this.commitPendingDone(), 5000 ) };
    this.showToast( items.length === 1 ? `Marked ${ items[0].contactName || 'them' } done` : `Marked ${ items.length } done`, true );
  }

  undo (): void {
    const pending = this.pendingDone;
    if ( !pending ) return;
    clearTimeout( pending.timer );
    this.pendingDone = null;
    this.items = this.sorted( [...this.items, ...pending.items] );
    this.count.set( this.items.length );
    this.select( pending.items[0] );
    this.toast = null;
  }

  private commitPendingDone (): void {
    const pending = this.pendingDone;
    if ( !pending ) return;
    clearTimeout( pending.timer );
    this.pendingDone = null;
    if ( isDesignPreview() ) return;
    for ( const item of pending.items ) {
      firstValueFrom( this.api.dismissMomentumThreadFromPlan( item.contactId, this.opts ) ).catch( () => {
        // It didn't go through: put them back so nothing is silently lost.
        this.items = this.sorted( [...this.items, item] );
        this.count.set( this.items.length );
        this.showToast( `Couldn't mark ${ item.contactName || 'them' } done`, false );
      } );
    }
  }

  async openInComposer ( item: MomentumThread ): Promise<void> {
    if ( this.working ) return;
    this.working = 'compose';
    try {
      const response: any = await firstValueFrom( this.api.createMomentumComposerHandoff( item.contactId, {
        draftSubject: this.draftSubject || String( item.replyDraftSubject || '' ),
        draftBody: this.draftBody ? this.draftBody.split( /\n{2,}/ ).map( part => `<p>${ this.escape( part ) }</p>` ).join( '' ) : String( item.replyDraftBody || '' ),
        companyName: item.companyName,
        returnRoute: `/needs-you?contact=${ encodeURIComponent( item.contactId ) }`,
        returnTab: 'needs_you',
        returnThreadId: item.contactId,
        draftKind: 'reply'
      }, this.opts ) );
      const reviewRoute = String( response?.data?.reviewRoute || '' );
      if ( reviewRoute ) {
        const url = new URL( reviewRoute, window.location.origin );
        await this.router.navigateByUrl( `${ url.pathname }${ url.search }` );
      }
    } catch ( error: any ) {
      this.notice = String( error?.error?.message || error?.message || 'Unable to open the composer.' );
    } finally {
      this.working = null;
    }
  }

  /** ⌘↵ send · W write my own · D done · ← → previous / next. */
  @HostListener( 'document:keydown', ['$event'] )
  onKeydown ( event: KeyboardEvent ): void {
    const item = this.selected;
    if ( !item ) return;
    if ( event.key === 'Enter' && ( event.metaKey || event.ctrlKey ) ) {
      if ( this.draftOpen ) {
        event.preventDefault();
        void this.send( item );
      }
      return;
    }
    const target = event.target as HTMLElement | null;
    if ( event.metaKey || event.ctrlKey || event.altKey ) return;
    if ( target && ( target.isContentEditable || /^(input|textarea|select)$/i.test( target.tagName ) ) ) return;
    const key = event.key.toLowerCase();
    if ( key === 'w' ) this.writeOwn( item );
    else if ( key === 'd' ) this.markDone( [item] );
    else if ( event.key === 'ArrowRight' && this.next ) this.select( this.next );
    else if ( event.key === 'ArrowLeft' && this.previous ) this.select( this.previous );
    else return;
    event.preventDefault();
  }

  private openDraft ( subject: string, body: string ): void {
    this.draftOpen = true;
    this.draftSubject = subject;
    this.draftBody = body;
  }

  /** The next person takes their place; the list empties to the "zero" view. */
  private removeAndAdvance ( removed: MomentumThread[] ): void {
    const ids = new Set( removed.map( item => item.contactId ) );
    const index = Math.max( 0, this.selectedIndex );
    this.items = this.items.filter( item => !ids.has( item.contactId ) );
    this.count.set( this.items.length );
    if ( !this.selectedId || ids.has( this.selectedId ) ) this.select( this.items[Math.min( index, this.items.length - 1 )] || null );
  }

  private showToast ( text: string, canUndo: boolean ): void {
    clearTimeout( this.toastTimer );
    this.toast = { text, canUndo };
    this.toastTimer = setTimeout( () => this.toast = null, 5000 );
  }

  private htmlToText ( html: string ): string {
    return cleanMessageText( html.replace( /<br\s*\/?>/gi, '\n' ).replace( /<\/p>/gi, '\n\n' ).replace( /<[^>]+>/g, '' ).replace( /&nbsp;/g, ' ' ).replace( /&amp;/g, '&' ) );
  }

  private escape ( text: string ): string {
    return text.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
  }
}
