import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription, combineLatest, firstValueFrom } from 'rxjs';

import { MomentumThread } from '../../models/momentum-thread.model';
import { OutreachApiService } from '../../services/outreach-api.service';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { cleanMessageText } from '../../shared/utils/message-kind.util';
import { DESIGN_PREVIEW_NEEDS_YOU, isDesignPreview } from '../../shared/utils/design-preview';
import {
  NEEDS_YOU_KIND_LABELS, NEEDS_YOU_KIND_TINTS, NeedsYouKind, hasMayaReply, isNeedsYou, needsNoAnswer, needsYouKind, needsYouWhy, readableReply
} from '../../shared/utils/needs-you.util';

/**
 * Needs You: the people waiting on a decision from you - someone replied, or
 * Maya stopped and handed the conversation back. Separate from Plan (everything
 * Maya is still working on by herself). Same threads and wording as the iOS
 * app and the server's /mobile/outreach/needs-you.
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
  private readonly route = inject( ActivatedRoute );
  private readonly router = inject( Router );
  private subscription?: Subscription;

  tenantId = '';
  userId = '';
  userEmail = '';
  loading = true;
  error = '';
  items: MomentumThread[] = [];
  selectedId: string | null = null;

  // The open conversation.
  replyMode: 'maya' | 'own' | null = null;
  replySubject = '';
  replyBody = '';
  working: 'send' | 'done' | 'compose' | null = null;
  notice = '';

  readonly labels = NEEDS_YOU_KIND_LABELS;
  readonly tints = NEEDS_YOU_KIND_TINTS;

  ngOnInit (): void {
    this.selectedId = this.route.snapshot.queryParamMap.get( 'contact' );
    if ( isDesignPreview() ) {
      this.items = DESIGN_PREVIEW_NEEDS_YOU as unknown as MomentumThread[];
      this.loading = false;
      this.selectedId = this.selectedId || this.items[0]?.contactId || null;
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
  }

  private get opts () {
    return { tenantId: this.tenantId, userId: this.userId || undefined, userEmail: this.userEmail || undefined };
  }

  async load (): Promise<void> {
    this.loading = true;
    try {
      const response = await firstValueFrom( this.api.getSignalEngineBootstrap( this.opts ) );
      const threads: MomentumThread[] = Array.isArray( response?.data?.threads ) ? response.data.threads : [];
      this.items = threads
        .filter( isNeedsYou )
        .sort( ( a, b ) => String( b.latestReplyAt || '' ).localeCompare( String( a.latestReplyAt || '' ) ) );
      this.error = '';
      if ( !this.items.some( item => item.contactId === this.selectedId ) ) {
        this.select( this.items[0] || null );
      }
    } catch ( error: any ) {
      this.error = String( error?.error?.message || error?.message || 'Unable to load Needs You.' );
    } finally {
      this.loading = false;
    }
  }

  get selected (): MomentumThread | null {
    return this.items.find( item => item.contactId === this.selectedId ) || null;
  }

  select ( item: MomentumThread | null ): void {
    this.selectedId = item?.contactId || null;
    this.replyMode = null;
    this.notice = '';
  }

  kind ( item: MomentumThread ): NeedsYouKind {
    return needsYouKind( item );
  }

  why ( item: MomentumThread ) {
    return needsYouWhy( item );
  }

  reply ( item: MomentumThread ): string {
    return readableReply( item );
  }

  /** One line for the list: Maya's read for automated mail, else their words. */
  preview ( item: MomentumThread ): string {
    const summary = String( item.replySummary || '' ).trim();
    if ( this.kind( item ) === 'automated' && summary ) return summary;
    return cleanMessageText( item.latestReplyText ).replace( /\n/g, ' ' ) || summary;
  }

  noAnswer ( item: MomentumThread ): boolean {
    return needsNoAnswer( this.kind( item ) );
  }

  hasMayaReply ( item: MomentumThread ): boolean {
    return hasMayaReply( item );
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

  startReply ( item: MomentumThread, mode: 'maya' | 'own' ): void {
    this.replyMode = mode;
    const subject = String( item.lastSubject || '' ).trim();
    this.replySubject = mode === 'maya' && item.replyDraftSubject
      ? String( item.replyDraftSubject )
      : ( /^re:/i.test( subject ) ? subject : subject ? `Re: ${ subject }` : '' );
    this.replyBody = mode === 'maya' ? cleanMessageText( String( item.replyDraftBody || '' ).replace( /<br\s*\/?>/gi, '\n' ).replace( /<\/p>/gi, '\n\n' ).replace( /<[^>]+>/g, '' ) ) : '';
    this.notice = '';
  }

  async sendReply ( item: MomentumThread ): Promise<void> {
    if ( !this.replyBody.trim() || this.working ) return;
    this.working = 'send';
    try {
      const html = this.replyBody.trim().split( /\n{2,}/ ).map( part => `<p>${ this.escape( part ).replace( /\n/g, '<br>' ) }</p>` ).join( '' );
      await firstValueFrom( this.api.sendManualMomentumReplyDraft( { contactId: item.contactId, draftSubject: this.replySubject, draftBody: html }, this.opts ) );
      this.removeAndAdvance( item, `Sent to ${ item.contactName || 'them' }.` );
    } catch ( error: any ) {
      this.notice = String( error?.error?.message || error?.message || 'Unable to send this reply.' );
    } finally {
      this.working = null;
    }
  }

  async markDone ( item: MomentumThread ): Promise<void> {
    if ( this.working ) return;
    this.working = 'done';
    try {
      await firstValueFrom( this.api.dismissMomentumThreadFromPlan( item.contactId, this.opts ) );
      this.removeAndAdvance( item, 'Marked done.' );
    } catch ( error: any ) {
      this.notice = String( error?.error?.message || error?.message || 'Unable to mark this done.' );
    } finally {
      this.working = null;
    }
  }

  /** The full composer, for a longer reply. */
  async openInComposer ( item: MomentumThread ): Promise<void> {
    if ( this.working ) return;
    this.working = 'compose';
    try {
      const response: any = await firstValueFrom( this.api.createMomentumComposerHandoff( item.contactId, {
        draftSubject: this.replySubject || String( item.replyDraftSubject || '' ),
        draftBody: String( item.replyDraftBody || '' ),
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

  private removeAndAdvance ( item: MomentumThread, note: string ): void {
    const index = this.items.indexOf( item );
    this.items = this.items.filter( other => other !== item );
    this.select( this.items[Math.min( index, this.items.length - 1 )] || null );
    this.notice = note;
  }

  private escape ( text: string ): string {
    return text.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
  }
}
