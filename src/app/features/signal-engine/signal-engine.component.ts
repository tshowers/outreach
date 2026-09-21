import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';

import { OutreachAuthService } from '../../services/outreach-auth.service';
import { OutreachApiService } from '../../services/outreach-api.service';
import { OutreachDataService } from '../../services/outreach-data.service';
import { OutreachAssistantSignalService } from '../../services/outreach-assistant-signal.service';
import { MomentumThread } from '../../models/momentum-thread.model';
import { Contact } from '../../models/contact.model';
import { EmailSentComponent, EmailSentAssistantContext } from './email-sent/email-sent.component';
import { TabBarComponent, TabBarItem } from '../../shared/tab-bar/tab-bar.component';
import { PreloaderComponent } from '../../shared/preloader/preloader.component';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { ContactPreviewCardComponent } from '../../shared/contact-preview-card/contact-preview-card.component';
import { BackToTopComponent } from '../../shared/back-to-top/back-to-top.component';

type DraftKind = 'outbound' | 'reply' | 'none';
type SignalLane = 'drafts' | 'outbox' | 'sent' | 'plan';

/**
 * Ported from features/email/pages/signal-engine/. Swapped AuthService for
 * OutreachAuthService, ToddAssistantBusService for
 * OutreachAssistantSignalService (a same-shaped no-op stub - this app
 * doesn't carry TODD's assistant bus), and DataService.getDocument
 * ('CONTACTS', contactId, userId) for OutreachDataService.getContact
 * (tenantId, contactId) (a one-time Promise fetch instead of a realtime
 * Observable - a hover-preview card doesn't need live updates).
 *
 * Signal Engine is a clean, from-scratch replacement for outbox-cockpit's
 * core loop (which this extraction deliberately does NOT port - see the
 * skip list), not a rename of it - see the original file's own header
 * comment for the full rationale.
 */
@Component( {
  selector: 'app-signal-engine',
  standalone: true,
  imports: [CommonModule, RouterModule, EmailSentComponent, TabBarComponent, PreloaderComponent, RelativeTimePipe, ContactPreviewCardComponent, BackToTopComponent],
  templateUrl: './signal-engine.component.html',
  styleUrl: './signal-engine.component.css',
} )
export class SignalEngineComponent implements OnInit, OnDestroy {
  private readonly authService = inject( OutreachAuthService );
  private readonly outreachApi = inject( OutreachApiService );
  private readonly dataService = inject( OutreachDataService );
  private readonly route = inject( ActivatedRoute );
  private readonly router = inject( Router );
  private readonly assistantBus = inject( OutreachAssistantSignalService );

  activeLane: SignalLane = 'drafts';

  private userSubscription: Subscription | null = null;
  private tenantSubscription: Subscription | null = null;
  tenantId: string | null = null;
  userId = '';
  private pendingRestoreThreadId: string | null = null;

  loading = true;
  loadError = '';
  threads: MomentumThread[] = [];
  summary: {
    activeThreads?: number;
    queuedActions?: number;
    sending?: number;
    hotLeads?: number;
    draftReady?: number;
    stalledWaiting?: number;
    needsHuman?: number;
  } | null = null;

  pendingContactIds = new Set<string>();
  actionErrorByContactId = new Map<string, string>();
  testSendingContactIds = new Set<string>();
  selectedDraftContactIds = new Set<string>();
  batchApproving = false;
  batchRejecting = false;
  batchDiscarding = false;

  private readonly MAX_BATCH_ACTION_SIZE = 100;

  private chunkContactIds ( contactIds: string[] ): string[][] {
    const chunks: string[][] = [];
    for ( let i = 0; i < contactIds.length; i += this.MAX_BATCH_ACTION_SIZE ) {
      chunks.push( contactIds.slice( i, i + this.MAX_BATCH_ACTION_SIZE ) );
    }
    return chunks;
  }

  hoveredContact: Contact | null = null;
  hoverPosition = { x: 0, y: 0 };
  private hoveredContactId = '';
  private contactCache = new Map<string, Contact>();

  async showContactHover ( thread: MomentumThread, event: MouseEvent ): Promise<void> {
    this.hoverPosition = { x: event.clientX + 12, y: Math.max( 12, event.clientY + 12 ) };
    this.hoveredContactId = thread.contactId;
    const cached = this.contactCache.get( thread.contactId );
    if ( cached ) {
      this.hoveredContact = cached;
      return;
    }

    this.hoveredContact = null;
    if ( !thread.contactId || !this.tenantId ) return;
    try {
      const contact = await this.dataService.getContact( this.tenantId, thread.contactId );
      if ( !contact ) return;
      this.contactCache.set( thread.contactId, contact );
      if ( this.hoveredContactId === thread.contactId ) {
        this.hoveredContact = contact;
      }
    } catch {
      // No preview if the fetch fails - not worth surfacing an error for a hover.
    }
  }

  hideContactHover (): void {
    this.hoveredContactId = '';
    this.hoveredContact = null;
  }
  testSendStatusByContactId = new Map<string, string>();

  sentCount: number | null = null;
  /** Fed by EmailSentComponent's assistantContextChange - used to embed
   * email-sent detail (follow-up/warm/cold recipients, top subjects) into
   * this page's own assistant context so the assistant box's email-sent
   * intercept has something to read, same as how email-processor embeds
   * its catalystAssistantContext into its own page context. */
  emailSentContext: EmailSentAssistantContext | null = null;
  signalTabs: TabBarItem[] = [];

  sentLoading = false;

  planNeedsYouOnly = false;

  ngOnInit (): void {
    const params = this.route.snapshot.queryParamMap;
    const restoreTab = String( params.get( 'tab' ) || '' ).trim() as SignalLane;
    if ( restoreTab === 'drafts' || restoreTab === 'outbox' || restoreTab === 'sent' || restoreTab === 'plan' ) {
      this.activeLane = restoreTab;
    }
    this.pendingRestoreThreadId = params.get( 'threadId' ) || null;
    if ( params.has( 'tab' ) || params.has( 'threadId' ) ) {
      void this.router.navigate( [], { relativeTo: this.route, queryParams: {}, replaceUrl: true } );
    }
    this.recomputeSignalTabs();
    this.publishPageContext();

    this.userSubscription = this.authService.getUser().subscribe( ( user ) => {
      this.userId = String( ( user && user.uid ) || '' ).trim();
    } );

    this.tenantSubscription = this.authService.getTenantId().subscribe( ( nextTenantId ) => {
      if ( !nextTenantId ) {
        this.tenantId = null;
        return;
      }
      if ( nextTenantId === this.tenantId ) return;
      this.tenantId = nextTenantId;
      void this.loadBootstrap();
    } );
  }

  ngOnDestroy (): void {
    this.userSubscription?.unsubscribe();
    this.tenantSubscription?.unsubscribe();
    this.assistantBus.clearPageContext();
  }

  private publishPageContext (): void {
    this.assistantBus.setPageContext( {
      feature: 'outreach',
      page: 'signal-engine',
      route: this.router.url,
      mode: 'dashboard',
      title: 'Signal Engine',
      description: 'Review, approve, and reject drafts and replies that need a human decision before they go out.',
      allowedActions: [
        'review_draft',
        'approve_draft',
        'reject_draft',
        'edit_draft',
        'view_outbox',
        'view_sent',
        'view_plan'
      ],
      summary: {
        activeLane: this.activeLane,
        threadCount: this.threads.length,
        draftReady: this.summary?.draftReady ?? 0,
        needsHuman: this.summary?.needsHuman ?? 0,
        outboxCount: this.outboxThreads.length,
        sentCount: this.sentCount,
        planCount: this.planThreads.length,
        activeThreads: this.summary?.activeThreads ?? 0,
        queuedActions: this.summary?.queuedActions ?? 0,
        stalledWaiting: this.summary?.stalledWaiting ?? 0,
        hotLeads: this.summary?.hotLeads ?? 0,
        emailOpenRate: this.emailSentContext?.openRate ?? null,
        emailClickThroughRate: this.emailSentContext?.clickThroughRate ?? null,
        followUpNowCount: this.emailSentContext?.followUpNow?.length ?? null,
        warmRecipientsCount: this.emailSentContext?.warmRecipients?.length ?? null,
        coldRecipientsCount: this.emailSentContext?.coldRecipients?.length ?? null,
      },
      dataPreview: this.emailSentContext ? {
        totalEmails: this.emailSentContext.totalEmails,
        openedEmails: this.emailSentContext.openedEmails,
        unopenedEmails: this.emailSentContext.unopenedEmails,
        clickedEmails: this.emailSentContext.clickedEmails,
        followUpNow: this.emailSentContext.followUpNow.slice( 0, 5 ),
        warmRecipients: this.emailSentContext.warmRecipients.slice( 0, 5 ),
        coldRecipients: this.emailSentContext.coldRecipients.slice( 0, 5 ),
        topSubjects: this.emailSentContext.topSubjects.slice( 0, 3 ),
      } : undefined
    } );
  }

  draftThreads: MomentumThread[] = [];
  queuedForRewriteCount = 0;
  outboxThreads: MomentumThread[] = [];
  planThreads: MomentumThread[] = [];

  /**
   * These were getters that filtered `this.threads` fresh on every access -
   * Angular property bindings/interpolations re-run on every change-detection
   * pass (which fires constantly app-wide), so each one allocated a new
   * array every single check, and any *ngFor reading them with no trackBy
   * would destroy/recreate every row on every check too. Computed once here
   * instead, and only recomputed (via recomputeSignalTabs, which every
   * threads/planNeedsYouOnly mutation site already calls) when the
   * underlying data actually changes.
   */
  private recomputeThreadLanes (): void {
    this.draftThreads = this.threads.filter( ( thread ) => thread.userLane === 'drafts' && !thread.rewriteQueueState );
    this.queuedForRewriteCount = this.threads.filter( ( thread ) => !!thread.rewriteQueueState ).length;
    this.outboxThreads = this.threads.filter( ( thread ) => thread.userLane === 'outbox' );
    const planLane = this.threads.filter( ( thread ) => thread.userLane === 'plan' );
    this.planThreads = this.planNeedsYouOnly ? planLane.filter( ( thread ) => thread.bucket === 'needs_you' ) : planLane;
  }

  trackByThreadId ( _index: number, thread: MomentumThread ): string {
    return thread.id;
  }

  getDraftKind ( thread: MomentumThread ): DraftKind {
    if ( String( thread.draftSubject || '' ).trim() || String( thread.draftBody || '' ).trim() ) {
      return 'outbound';
    }
    if ( String( thread.replyDraftSubject || '' ).trim() || String( thread.replyDraftBody || '' ).trim() ) {
      return 'reply';
    }
    return 'none';
  }

  getDraftSubject ( thread: MomentumThread ): string {
    return this.getDraftKind( thread ) === 'reply'
      ? String( thread.replyDraftSubject || '' )
      : String( thread.draftSubject || '' );
  }

  getDraftBody ( thread: MomentumThread ): string {
    return this.getDraftKind( thread ) === 'reply'
      ? String( thread.replyDraftBody || '' )
      : String( thread.draftBody || '' );
  }

  getDraftRationale ( thread: MomentumThread ): string {
    return this.getDraftKind( thread ) === 'reply'
      ? String( thread.replyDraftRationale || thread.strategySummary || '' )
      : String( thread.strategySummary || '' );
  }

  setLane ( lane: string ): void {
    if ( lane !== 'drafts' && lane !== 'outbox' && lane !== 'sent' && lane !== 'plan' ) return;
    this.activeLane = lane;
    this.publishPageContext();
  }

  showNeedsYou (): void {
    this.activeLane = 'plan';
    this.planNeedsYouOnly = true;
    this.recomputeSignalTabs();
    this.publishPageContext();
  }

  setPlanNeedsYouOnly ( value: boolean ): void {
    this.planNeedsYouOnly = value;
    this.recomputeSignalTabs();
  }

  private recomputeSignalTabs (): void {
    this.recomputeThreadLanes();
    this.signalTabs = [
      { id: 'drafts', label: 'Drafts', icon: 'pen-to-square', count: this.draftThreads.length, dataCy: 'signal-engine-tab-drafts' },
      { id: 'outbox', label: 'Outbox', icon: 'layer-group', count: this.outboxThreads.length, dataCy: 'signal-engine-tab-outbox', tooltip: 'Approved drafts waiting to send. Sending runs weekdays only, 7am–11pm Pacific — items sit here over the weekend.' },
      { id: 'sent', label: 'Sent', icon: 'paper-plane', count: this.sentCount, dataCy: 'signal-engine-tab-sent' },
      { id: 'plan', label: 'Plan', icon: 'clipboard-list', count: this.planThreads.length, dataCy: 'signal-engine-tab-plan' }
    ];
  }

  isRestoredThread ( thread: MomentumThread ): boolean {
    return !!this.pendingRestoreThreadId && thread.contactId === this.pendingRestoreThreadId;
  }

  onSentContextChange ( context: EmailSentAssistantContext ): void {
    this.sentCount = context.totalEmails;
    this.emailSentContext = context;
    this.recomputeSignalTabs();
    this.publishPageContext();
  }

  onSentLoadingChange ( isLoading: boolean ): void {
    this.sentLoading = isLoading;
  }

  isPending ( thread: MomentumThread ): boolean {
    return this.pendingContactIds.has( thread.contactId );
  }

  isSelected ( thread: MomentumThread ): boolean {
    return this.selectedDraftContactIds.has( thread.contactId );
  }

  toggleDraftSelection ( thread: MomentumThread ): void {
    if ( this.isPending( thread ) ) return;
    if ( this.selectedDraftContactIds.has( thread.contactId ) ) {
      this.selectedDraftContactIds.delete( thread.contactId );
    } else {
      this.selectedDraftContactIds.add( thread.contactId );
    }
  }

  get hasSelectedDrafts (): boolean {
    return this.selectedDraftContactIds.size > 0;
  }

  get hasSelectedReplyDrafts (): boolean {
    return this.draftThreads.some(
      ( thread ) => this.selectedDraftContactIds.has( thread.contactId ) && this.getDraftKind( thread ) === 'reply'
    );
  }

  getActionError ( thread: MomentumThread ): string {
    return this.actionErrorByContactId.get( thread.contactId ) || '';
  }

  getOutboxStatusLabel ( thread: MomentumThread ): string {
    return thread.queueState === 'queued' ? 'Scheduled' : ( thread.queueState || '' );
  }

  isSendingTest ( thread: MomentumThread ): boolean {
    return this.testSendingContactIds.has( thread.contactId );
  }

  getTestSendStatus ( thread: MomentumThread ): string {
    return this.testSendStatusByContactId.get( thread.contactId ) || '';
  }

  async sendDraftTest ( thread: MomentumThread ): Promise<void> {
    if ( !this.tenantId || this.isSendingTest( thread ) ) return;
    this.testSendingContactIds.add( thread.contactId );
    this.testSendStatusByContactId.delete( thread.contactId );

    try {
      const response = await firstValueFrom(
        this.outreachApi.sendMomentumDraftTest( thread.contactId, {}, { tenantId: this.tenantId } )
      );
      const recipient = response?.data?.recipientEmail || 'your inbox';
      this.testSendStatusByContactId.set( thread.contactId, `Test sent to ${recipient}.` );
    } catch ( error: any ) {
      this.testSendStatusByContactId.set(
        thread.contactId,
        String( error?.error?.message || error?.message || 'Unable to send that test.' )
      );
    } finally {
      this.testSendingContactIds.delete( thread.contactId );
    }
  }

  async refresh (): Promise<void> {
    await this.loadBootstrap();
  }

  async loadBootstrap (): Promise<void> {
    if ( !this.tenantId ) return;
    this.loading = true;
    this.loadError = '';

    try {
      const response = await firstValueFrom(
        this.outreachApi.getSignalEngineBootstrap( { tenantId: this.tenantId } )
      );
      this.threads = Array.isArray( response?.data?.threads ) ? response.data.threads : [];
      this.summary = response?.data?.summary || null;
      this.recomputeSignalTabs();
      const stillDraftIds = new Set( this.draftThreads.map( ( thread ) => thread.contactId ) );
      for ( const contactId of this.selectedDraftContactIds ) {
        if ( !stillDraftIds.has( contactId ) ) this.selectedDraftContactIds.delete( contactId );
      }
      this.publishPageContext();
    } catch ( error: any ) {
      this.loadError = String( error?.error?.message || error?.message || 'Unable to load Signal Engine data.' );
    } finally {
      this.loading = false;
    }
  }

  async approveDraft ( thread: MomentumThread ): Promise<void> {
    if ( !this.tenantId || this.isPending( thread ) ) return;
    this.pendingContactIds.add( thread.contactId );
    this.actionErrorByContactId.delete( thread.contactId );

    try {
      if ( this.getDraftKind( thread ) === 'reply' ) {
        await firstValueFrom(
          this.outreachApi.sendManualMomentumReplyDraft( { contactId: thread.contactId }, { tenantId: this.tenantId } )
        );
      } else {
        await firstValueFrom(
          this.outreachApi.approveMomentumDraft( thread.contactId, { tenantId: this.tenantId } )
        );
      }
      await this.loadBootstrap();
      window.scrollTo( 0, 0 );
    } catch ( error: any ) {
      await this.handleStaleDraftAction( thread, error, 'Unable to approve this draft.' );
    } finally {
      this.pendingContactIds.delete( thread.contactId );
    }
  }

  async approveSelectedDrafts (): Promise<void> {
    if ( !this.tenantId || !this.hasSelectedDrafts || this.batchApproving ) return;
    const contactIds = Array.from( this.selectedDraftContactIds );
    this.batchApproving = true;
    for ( const contactId of contactIds ) this.actionErrorByContactId.delete( contactId );

    try {
      for ( const chunk of this.chunkContactIds( contactIds ) ) {
        try {
          const response = await firstValueFrom(
            this.outreachApi.approveMomentumDraftsBatch( chunk, { tenantId: this.tenantId } )
          );
          for ( const result of response?.data?.results || [] ) {
            if ( !result.success ) {
              this.actionErrorByContactId.set( result.contactId, result.message || 'Unable to approve this draft.' );
            } else {
              this.selectedDraftContactIds.delete( result.contactId );
            }
          }
        } catch ( chunkError: any ) {
          const message = String( chunkError?.error?.message || chunkError?.message || 'Unable to approve the selected drafts.' );
          for ( const contactId of chunk ) this.actionErrorByContactId.set( contactId, message );
        }
      }
      await this.loadBootstrap();
      window.scrollTo( 0, 0 );
    } catch ( error: any ) {
      const message = String( error?.error?.message || error?.message || 'Unable to approve the selected drafts.' );
      for ( const contactId of contactIds ) this.actionErrorByContactId.set( contactId, message );
    } finally {
      this.batchApproving = false;
    }
  }

  async rejectRewriteSelectedDrafts (): Promise<void> {
    if ( !this.tenantId || !this.hasSelectedDrafts || this.batchRejecting || this.batchApproving ) return;
    const contactIds = Array.from( this.selectedDraftContactIds );
    this.batchRejecting = true;
    for ( const contactId of contactIds ) this.actionErrorByContactId.delete( contactId );

    try {
      for ( const chunk of this.chunkContactIds( contactIds ) ) {
        try {
          const response = await firstValueFrom(
            this.outreachApi.rejectRewriteMomentumDraftsBatch( chunk, { tenantId: this.tenantId } )
          );
          for ( const result of response?.data?.results || [] ) {
            if ( !result.success ) {
              this.actionErrorByContactId.set( result.contactId, result.message || 'Unable to queue this draft for rewrite.' );
            } else {
              this.selectedDraftContactIds.delete( result.contactId );
            }
          }
        } catch ( chunkError: any ) {
          const message = String( chunkError?.error?.message || chunkError?.message || 'Unable to queue the selected drafts for rewrite.' );
          for ( const contactId of chunk ) this.actionErrorByContactId.set( contactId, message );
        }
      }
      await this.loadBootstrap();
      window.scrollTo( 0, 0 );
    } catch ( error: any ) {
      const message = String( error?.error?.message || error?.message || 'Unable to queue the selected drafts for rewrite.' );
      for ( const contactId of contactIds ) this.actionErrorByContactId.set( contactId, message );
    } finally {
      this.batchRejecting = false;
    }
  }

  async discardSelectedDrafts (): Promise<void> {
    if ( !this.tenantId || !this.hasSelectedDrafts || this.batchDiscarding || this.batchApproving || this.batchRejecting ) return;
    const contactIds = Array.from( this.selectedDraftContactIds );
    this.batchDiscarding = true;
    for ( const contactId of contactIds ) this.actionErrorByContactId.delete( contactId );

    try {
      for ( const chunk of this.chunkContactIds( contactIds ) ) {
        await Promise.all( chunk.map( async ( contactId ) => {
          try {
            await firstValueFrom( this.outreachApi.discardMomentumDraft( contactId, { tenantId: this.tenantId! } ) );
            this.selectedDraftContactIds.delete( contactId );
          } catch ( error: any ) {
            this.actionErrorByContactId.set(
              contactId,
              String( error?.error?.message || error?.message || 'Unable to reject this draft.' )
            );
          }
        } ) );
      }
      await this.loadBootstrap();
      window.scrollTo( 0, 0 );
    } finally {
      this.batchDiscarding = false;
    }
  }

  private async handleStaleDraftAction ( thread: MomentumThread, error: any, fallbackMessage: string ): Promise<void> {
    if ( error?.error?.error === 'not_a_draft' ) {
      await this.loadBootstrap();
      window.scrollTo( 0, 0 );
      return;
    }
    this.actionErrorByContactId.set(
      thread.contactId,
      String( error?.error?.message || error?.message || fallbackMessage )
    );
  }

  async rejectDraft ( thread: MomentumThread ): Promise<void> {
    if ( !this.tenantId || this.isPending( thread ) ) return;
    this.pendingContactIds.add( thread.contactId );
    this.actionErrorByContactId.delete( thread.contactId );
    const isReply = this.getDraftKind( thread ) === 'reply';

    try {
      await firstValueFrom(
        this.outreachApi.rejectMomentumDraft(
          thread.contactId,
          isReply
            ? { draftKind: 'reply' }
            : {
              draftKind: 'outbound',
              rejectedDraftSubject: thread.draftSubject,
              rejectedDraftBody: thread.draftBody,
              rejectionReason: 'Rejected in Signal Engine - please try a different angle.',
            },
          { tenantId: this.tenantId }
        )
      );
      await this.loadBootstrap();
      window.scrollTo( 0, 0 );
    } catch ( error: any ) {
      await this.handleStaleDraftAction( thread, error, 'Unable to reject this draft.' );
    } finally {
      this.pendingContactIds.delete( thread.contactId );
    }
  }

  async discardDraft ( thread: MomentumThread ): Promise<void> {
    if ( !this.tenantId || this.isPending( thread ) ) return;
    this.pendingContactIds.add( thread.contactId );
    this.actionErrorByContactId.delete( thread.contactId );

    try {
      await firstValueFrom(
        this.outreachApi.discardMomentumDraft( thread.contactId, { tenantId: this.tenantId } )
      );
      await this.loadBootstrap();
      window.scrollTo( 0, 0 );
    } catch ( error: any ) {
      await this.handleStaleDraftAction( thread, error, 'Unable to discard this draft.' );
    } finally {
      this.pendingContactIds.delete( thread.contactId );
    }
  }

  async editInComposer ( thread: MomentumThread ): Promise<void> {
    if ( !this.tenantId || this.isPending( thread ) ) return;
    this.pendingContactIds.add( thread.contactId );
    this.actionErrorByContactId.delete( thread.contactId );

    try {
      const returnTab = this.activeLane;
      const returnRoute = this.router.createUrlTree( ['/signal-engine'], {
        queryParams: { tab: returnTab, threadId: thread.contactId }
      } ).toString();
      const draftKind = this.getDraftKind( thread ) === 'reply' ? 'reply' : 'outbound';
      const hasLiveDraft = this.getDraftKind( thread ) !== 'none';

      const response = await firstValueFrom(
        this.outreachApi.createMomentumComposerHandoff( thread.contactId, {
          draftSubject: hasLiveDraft ? this.getDraftSubject( thread ) : ( thread.rejectedDraftSubject || '' ),
          draftBody: hasLiveDraft ? this.getDraftBody( thread ) : ( thread.rejectedDraftBody || '' ),
          companyName: thread.companyName,
          returnRoute,
          returnTab,
          returnThreadId: thread.contactId,
          draftKind
        }, { tenantId: this.tenantId } )
      );
      const reviewRoute = ( response as any )?.data?.reviewRoute;
      if ( reviewRoute ) {
        await this.router.navigateByUrl( reviewRoute );
      }
    } catch ( error: any ) {
      this.actionErrorByContactId.set(
        thread.contactId,
        String( error?.error?.message || error?.message || 'Unable to open this draft in the composer.' )
      );
    } finally {
      this.pendingContactIds.delete( thread.contactId );
    }
  }

  async deleteFromPlan ( thread: MomentumThread ): Promise<void> {
    if ( !this.tenantId || this.isPending( thread ) ) return;
    this.pendingContactIds.add( thread.contactId );
    this.actionErrorByContactId.delete( thread.contactId );

    try {
      await firstValueFrom(
        this.outreachApi.dismissMomentumThreadFromPlan( thread.contactId, { tenantId: this.tenantId } )
      );
      this.threads = this.threads.filter( ( t ) => t.contactId !== thread.contactId );
      this.recomputeSignalTabs();
    } catch ( error: any ) {
      this.actionErrorByContactId.set(
        thread.contactId,
        String( error?.error?.message || error?.message || 'Unable to remove this from Plan.' )
      );
    } finally {
      this.pendingContactIds.delete( thread.contactId );
    }
  }
}
