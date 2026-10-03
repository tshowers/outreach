import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { OutreachAuthService } from '../../services/outreach-auth.service';
import { OutreachDataService } from '../../services/outreach-data.service';
import { LoggerService } from '../../services/logger.service';
import { BackToTopComponent } from '../../shared/back-to-top/back-to-top.component';
import { EmailEditorComponent } from '../../shared/page/email-editor/email-editor.component';
import { PreloaderComponent } from '../../shared/preloader/preloader.component';
import { MailboxAccessService } from '../../services/mailbox-access.service';
import { MailboxConfigSummary, MailboxMessageListItem, MailboxProviderId } from '../../services/outreach-api.service';
import { DESIGN_PREVIEW_MAILBOX, DESIGN_PREVIEW_MESSAGES, isDesignPreview } from '../../shared/utils/design-preview';
import { cleanMessageText, MESSAGE_KIND_LABELS, MessageKind, messageKind } from '../../shared/utils/message-kind.util';

/**
 * Ported from features/email/pages/inbox-access/. Swapped AuthService for
 * OutreachAuthService and UserService.getLoggedInContactInfo() for
 * OutreachDataService.getContact(tenantId, userId) (same "read my own
 * contact doc for company name" pattern OutreachPricingComponent already
 * uses). Dropped openProfileSignature()/the "Signature Settings" buttons -
 * they navigated to '/update-profile', a page this standalone app doesn't
 * carry and has no equivalent for.
 */
@Component( {
  selector: 'app-inbox-access',
  standalone: true,
  imports: [
    CommonModule,
    EmailEditorComponent,
    FormsModule,
    PreloaderComponent,
    BackToTopComponent,
  ],
  providers: [MailboxAccessService],
  templateUrl: './inbox-access.component.html',
  styleUrl: './inbox-access.component.css'
} )
export class InboxAccessComponent implements OnInit, OnDestroy {
  activeTab: 'inbox' | 'settings' = 'inbox';
  /** Gmail: the password form stays tucked away unless asked for - Google
   * authorization is the way to connect. */
  showPasswordForm = false;
  isProcessing = false;

  private userId = '';
  private tenantId = '';
  private userEmail = '';
  private companyName = '';

  private userSubscription?: Subscription;
  private tenantSubscription?: Subscription;

  constructor (
    public mailboxAccess: MailboxAccessService,
    public router: Router,
    private route: ActivatedRoute,
    private authService: OutreachAuthService,
    private dataService: OutreachDataService,
    private logger: LoggerService
  ) { }

  /** Arrived from the Outreach wizard (sign-up, or the iOS app's "Connect
   * your inbox"), which passes the address they said they send from. */
  get cameFromSignUp (): boolean {
    return !!this.route.snapshot.queryParamMap.get( 'email' );
  }

  /** A Gmail / Google Workspace inbox that isn't connected yet. */
  get isNewGmail (): boolean {
    return !this.mailboxAccess.mailboxForm.id && this.mailboxAccess.mailboxForm.provider === 'gmail';
  }

  ngOnInit (): void {
    if ( isDesignPreview() ) {
      this.mailboxAccess.mailboxConfigs = [DESIGN_PREVIEW_MAILBOX] as any;
      this.mailboxAccess.connectedMailbox = DESIGN_PREVIEW_MAILBOX as any;
      this.mailboxAccess.mailboxMessages = DESIGN_PREVIEW_MESSAGES as any;
      this.mailboxAccess.selectedMailboxMessage = { ...DESIGN_PREVIEW_MESSAGES[0] } as any;
      this.mailboxAccess.mailboxReplyDraft.subject = `Re: ${ DESIGN_PREVIEW_MESSAGES[0].subject }`;
    }
    this.userSubscription = this.authService.getUser().subscribe( ( user ) => {
      if ( !user ) return;

      this.userId = user.uid;
      this.userEmail = user.email || '';
      this.syncMailboxContext();
    } );

    this.tenantSubscription = this.authService.getTenantId().subscribe( ( tenantId ) => {
      this.tenantId = tenantId || '';
      if ( this.tenantId && this.userId ) {
        this.dataService.getContact( this.tenantId, this.userId ).then( ( contact ) => {
          this.companyName = contact?.company?.name || '';
          this.syncMailboxContext();
        } ).catch( () => {
          this.syncMailboxContext();
        } );
      } else {
        this.syncMailboxContext();
      }
    } );
  }

  ngOnDestroy (): void {
    this.userSubscription?.unsubscribe();
    this.tenantSubscription?.unsubscribe();
  }

  selectTab ( tab: 'inbox' | 'settings' ): void {
    this.activeTab = tab;
  }

  selectMailbox ( mailbox: MailboxConfigSummary ): void {
    this.mailboxAccess.selectMailbox( mailbox );
    this.activeTab = 'inbox';
  }

  selectMailboxById ( mailboxId: string ): void {
    const mailbox = this.mailboxAccess.mailboxConfigs.find( (item) => item.id === mailboxId );
    if ( mailbox ) this.mailboxAccess.selectMailbox( mailbox );
  }

  startAddingMailbox (): void {
    this.mailboxAccess.startAddingMailbox();
    this.activeTab = 'settings';
  }

  get shouldShowConnectedHero (): boolean {
    return !this.mailboxAccess.connectedMailbox;
  }

  get shouldShowHeaderSendReply (): boolean {
    return this.activeTab === 'inbox'
      && !!this.mailboxAccess.selectedMailboxMessage
      && this.mailboxAccess.canSendMailboxReply;
  }

  openOutboxDrafts (): void {
    this.router.navigate( ['/signal-engine'], {
      queryParams: { tab: 'outbox' }
    } );
  }

  openSelectedMessageDraft (): void {
    const message = this.mailboxAccess.selectedMailboxMessage;
    const threadId = String( message?.threadId || '' ).trim();
    if ( !threadId ) return;

    this.router.navigate( ['/signal-engine'], {
      queryParams: {
        tab: this.getOutboxReviewTab( message ),
        threadId,
        openDraftReview: 1
      }
    } );
  }

  canOpenSelectedMessageDraft ( message: MailboxMessageListItem | null | undefined ): boolean {
    return this.hasLinkedOutboxDraft( message );
  }

  hasResponderDraft ( message: MailboxMessageListItem | null | undefined ): boolean {
    if ( !message ) return false;
    return String( message.responderDecision || '' ).trim().toLowerCase() === 'draft_only'
      && !!String( message.replyDraftBody || message.replyDraftSubject || '' ).trim();
  }

  hasLinkedOutboxDraft ( message: MailboxMessageListItem | null | undefined ): boolean {
    return this.hasResponderDraft( message ) && !!String( message?.threadId || '' ).trim();
  }

  isMailboxOnlyResponderDraft ( message: MailboxMessageListItem | null | undefined ): boolean {
    return this.hasResponderDraft( message ) && !String( message?.threadId || '' ).trim();
  }

  // Inbox (design 4f): filters, message-type tags and TODD's one-liner.
  inboxFilter: 'all' | 'replies' | 'auto' | 'bounces' = 'all';

  // Selecting several messages: the Select chip, ⌘/Ctrl-click to toggle one,
  // Shift-click for a range.
  selectMode = false;
  selectedMessageIds = new Set<string>();
  private lastClickedIndex: number | null = null;

  get selectionActive (): boolean {
    return this.selectMode || this.selectedMessageIds.size > 0;
  }

  onMessageClick ( message: MailboxMessageListItem, index: number, event: MouseEvent ): void {
    const list = this.filteredMessages;
    if ( event.shiftKey && this.lastClickedIndex !== null ) {
      const [from, to] = [Math.min( this.lastClickedIndex, index ), Math.max( this.lastClickedIndex, index )];
      list.slice( from, to + 1 ).forEach( item => this.selectedMessageIds.add( item.id ) );
      // A shift-click would otherwise also select the text in between.
      window.getSelection()?.removeAllRanges();
    } else if ( this.selectMode || event.metaKey || event.ctrlKey ) {
      if ( this.selectedMessageIds.has( message.id ) ) this.selectedMessageIds.delete( message.id );
      else this.selectedMessageIds.add( message.id );
      this.lastClickedIndex = index;
    } else {
      this.selectedMessageIds.clear();
      this.lastClickedIndex = index;
      this.mailboxAccess.openMailboxMessage( message );
    }
  }

  toggleSelectMode (): void {
    this.selectMode = !this.selectMode;
    if ( !this.selectMode ) this.clearSelection();
  }

  selectAllVisible (): void {
    const visible = this.filteredMessages;
    const allSelected = visible.every( message => this.selectedMessageIds.has( message.id ) );
    visible.forEach( message => allSelected ? this.selectedMessageIds.delete( message.id ) : this.selectedMessageIds.add( message.id ) );
  }

  clearSelection (): void {
    this.selectedMessageIds.clear();
    this.lastClickedIndex = null;
  }

  async deleteSelectedMessages (): Promise<void> {
    const ids = [...this.selectedMessageIds];
    if ( !ids.length ) return;
    if ( !window.confirm( `Delete ${ ids.length } message${ ids.length === 1 ? '' : 's' } from the connected mailbox?` ) ) return;
    await this.mailboxAccess.deleteMailboxMessages( ids );
    this.clearSelection();
    this.selectMode = false;
  }

  get filteredMessages (): MailboxMessageListItem[] {
    const messages = this.mailboxAccess.mailboxMessages || [];
    switch ( this.inboxFilter ) {
      case 'replies': return messages.filter( message => ['reply', 'forward'].includes( this.kindOf( message ) ) );
      case 'auto': return messages.filter( message => this.kindOf( message ) === 'outOfOffice' );
      case 'bounces': return messages.filter( message => this.kindOf( message ) === 'bounce' );
      default: return messages;
    }
  }

  kindOf ( message: MailboxMessageListItem ): MessageKind {
    return messageKind( message as any );
  }

  kindLabel ( message: MailboxMessageListItem ): string {
    return MESSAGE_KIND_LABELS[this.kindOf( message )];
  }

  /** TODD's read when there is one, else the message without headers or links. */
  summaryLine ( message: MailboxMessageListItem ): string {
    const summary = String( ( message as any ).signalSummary || '' ).trim();
    return summary || cleanMessageText( message.preview ).replace( /\n/g, ' ' );
  }

  readableBody ( message: { text?: string | null; } ): string {
    return cleanMessageText( message.text ) || String( message.text || '' );
  }

  initials ( name: string | null | undefined ): string {
    return String( name || '?' ).trim().split( /\s+/ ).slice( 0, 2 ).map( part => part[0] || '' ).join( '' ).toUpperCase();
  }

  syncedAgo ( iso: string | null | undefined ): string {
    const time = iso ? Date.parse( iso ) : NaN;
    if ( !Number.isFinite( time ) ) return '';
    const minutes = Math.round( ( Date.now() - time ) / 60000 );
    if ( minutes < 1 ) return 'Synced just now';
    if ( minutes < 60 ) return `Synced ${ minutes } min ago`;
    if ( minutes < 1440 ) return `Synced ${ Math.round( minutes / 60 ) } h ago`;
    return `Synced ${ Math.round( minutes / 1440 ) } d ago`;
  }

  trackMessage ( _: number, message: { id: string; } ): string {
    return message.id;
  }

  getResponderBadgeLabel ( message: MailboxMessageListItem | null | undefined ): string {
    const decision = String( message?.responderDecision || '' ).trim().toLowerCase();
    if ( decision === 'responded' ) return 'Responded';
    if ( decision === 'draft_only' ) {
      return this.getOutboxReviewTab( message ) === 'needs_you'
        ? 'Draft prepared • human review'
        : 'Draft prepared';
    }
    if ( decision === 'skipped' ) return 'Skipped';
    return '';
  }

  getResponderReasonLabel ( message: MailboxMessageListItem | null | undefined ): string {
    const reason = String( message?.responderReason || '' ).trim();
    if ( !reason ) return '';
    return reason.replace( /[_-]+/g, ' ' );
  }

  onReplyHtmlChange ( html: string ): void {
    this.mailboxAccess.updateReplyHtml( html );
  }

  onReplyTextFromHtmlChange ( text: string ): void {
    this.mailboxAccess.updateReplyTextFromHtml( text );
  }

  deleteSelectedMessage (): void {
    this.mailboxAccess.deleteSelectedMailboxMessage();
  }

  private getOutboxReviewTab ( message: MailboxMessageListItem | null | undefined ): 'drafts' | 'needs_you' {
    const classification = String( message?.classification || '' ).trim().toLowerCase();
    const recommendedAction = String( message?.recommendedAction || '' ).trim().toLowerCase();

    if ( classification === 'needs_human' || recommendedAction === 'needs_human' || recommendedAction === 'review' ) {
      return 'needs_you';
    }

    return 'drafts';
  }

  private syncMailboxContext (): void {
    if ( !this.userId || !this.tenantId ) return;

    this.mailboxAccess.initialize( {
      tenantId: this.tenantId,
      userId: this.userId,
      userEmail: this.userEmail || undefined,
      displayName: '',
      companyName: this.companyName,
      // Arriving from the Outreach app's "Connect your inbox" step: the
      // address (and provider) the wizard asked for pre-fill the form.
      // Never a password - that's only ever typed here, signed in.
      preferredEmail: ( this.route.snapshot.queryParamMap.get( 'email' ) || '' ).trim().toLowerCase() || undefined,
      preferredProvider: ( this.route.snapshot.queryParamMap.get( 'provider' ) || undefined ) as MailboxProviderId | undefined,
    } );

    if ( !this.mailboxAccess.connectedMailbox && !this.mailboxAccess.loadingMailboxes ) {
      this.activeTab = 'settings';
    } else if ( this.mailboxAccess.connectedMailbox && this.activeTab === 'settings' && this.mailboxAccess.mailboxMessages.length ) {
      this.activeTab = 'inbox';
    }

    this.logger.info( 'Inbox access context ready', {
      tenantId: this.tenantId,
      userId: this.userId,
      hasConnectedMailbox: this.mailboxAccess.hasMailboxConnection,
    } );
  }
}
