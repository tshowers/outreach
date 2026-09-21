import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { OutreachAuthService } from '../../services/outreach-auth.service';
import { OutreachDataService } from '../../services/outreach-data.service';
import { LoggerService } from '../../services/logger.service';
import { BackToTopComponent } from '../../shared/back-to-top/back-to-top.component';
import { EmailEditorComponent } from '../../shared/page/email-editor/email-editor.component';
import { PreloaderComponent } from '../../shared/preloader/preloader.component';
import { MailboxAccessService } from '../../services/mailbox-access.service';
import { MailboxConfigSummary, MailboxMessageListItem } from '../../services/outreach-api.service';

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
    private authService: OutreachAuthService,
    private dataService: OutreachDataService,
    private logger: LoggerService
  ) { }

  ngOnInit (): void {
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
      queryParams: { tab: 'drafts' }
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
