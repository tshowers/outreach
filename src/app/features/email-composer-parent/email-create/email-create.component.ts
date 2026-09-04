import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { catchError, from, map, mergeMap, Observable, of, take, toArray, firstValueFrom } from 'rxjs';
import { TopDogComponent } from '../../../shared/top-dog/top-dog.component';
import { AlertService } from '../../../services/alert.service';
import { OutreachAuthService } from '../../../services/outreach-auth.service';
import { OutreachCampaignStateService } from '../../../services/outreach-campaign-state.service';
import { OutreachContactQueueService } from '../../../services/outreach-contact-queue.service';
import { EmailService } from '../../../services/email.service';
import { LoggerService } from '../../../services/logger.service';
import { OutreachNomenclatureService } from '../../../services/outreach-nomenclature.service';
import { SoundService } from '../../../services/sound.service';
import { OutreachDataService } from '../../../services/outreach-data.service';
import { Contact } from '../../../models/contact.model';
import { EmailEditorComponent } from '../../../shared/page/email-editor/email-editor.component';
import { EmailStageProgressComponent } from '../../../shared/email-stage-progress/email-stage-progress.component';

import { ContactPreviewCardComponent } from '../../../shared/contact-preview-card/contact-preview-card.component';

import { PreloaderComponent } from '../../../shared/preloader/preloader.component';
import { BackToTopComponent } from '../../../shared/back-to-top/back-to-top.component';
import { OutreachNotificationService } from '../../../services/outreach-notification.service';

import { OutreachMomentumThreadService } from '../../../services/outreach-momentum-thread.service';
import { ComposerHandoff, OutreachApiService } from '../../../services/outreach-api.service';
import { MomentumThread } from '../../../models/momentum-thread.model';
import { OutreachAssistantSignalService } from '../../../services/outreach-assistant-signal.service';

export interface AssistantDraftPayload {
  subject?: string;
  html?: string;
  body?: string;
}

export interface AssistantComposerContactPayload {
  contact: Contact;
  source?: string;
}

export const Footer: string = `<hr><div style="text-align: center; margin-top: 10px; font-size: 0.5em; color: #777777; padding: 10px 0;">
  <p>
    © 2026
    <a href="https://taliferro.com">Taliferro</a>.
    Email sent from
    <a href="https://taliferro.com/business-momentum-system">TODD</a>.
    taliferro-tech-unsubscribe.
  </p>
  <p style="margin-top: 4px;">
    Taliferro Tech, LLC &bull; 1424 11th Ave STE 400, Seattle, WA 98122 &bull; 401.646.2662 &bull; info@taliferro.com
  </p>
</div>
`;


/**
 * Ported from features/email/components/email-create/ (2,285 lines - the
 * single biggest component across every extraction so far). Real
 * substitutions:
 *  - ContactService's plain state slice (setQueue/currentQueue/
 *    changeContact/currentContact/resetContact/currentReason/
 *    changeReason/clearQueue - not its data-fetching or suggestion-engine
 *    surface) -> OutreachContactQueueService.
 *  - CampaignStateService -> OutreachCampaignStateService (same 3-method
 *    trim as CampaignStateService's own header comment explains).
 *  - MomentumThreadService -> OutreachMomentumThreadService (a real port,
 *    not a stub - see that service's header comment).
 *  - UserService.getLoggedInContactInfo() -> OutreachDataService.getContact
 *    (tenantId, userId).
 *  - <app-read> (ReadComponent, a full 1,727-line contact detail page)
 *    used here ONLY inside a `*ngIf="hoveredContact"` hover-preview box
 *    with showAdditionalInfo=false - the exact same hover-card use case
 *    SignalEngineComponent already solved with ContactPreviewCardComponent,
 *    reused here instead of porting the full page component for a
 *    hover tooltip.
 */
@Component( {
  selector: 'app-email-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ReactiveFormsModule, EmailEditorComponent, EmailStageProgressComponent, ContactPreviewCardComponent,
    BackToTopComponent,
    PreloaderComponent,
  ],
  templateUrl: './email-create.component.html',
  styleUrl: './email-create.component.css'
} )
export class EmailCreateComponent extends TopDogComponent implements OnInit, OnDestroy {
  private composerSubmitIntent: 'default' | 'save_outbox' | 'send_now' = 'default';

  @ViewChild( EmailEditorComponent ) emailEditor!: EmailEditorComponent;
  message: string | undefined;
  emailForm: FormGroup;
  queue: Contact[] = [];
  contacts: Contact[] = [];
  filteredContacts: string[] = [];
  allEmailAddresses: string[] = [];
  showSuggestions = false;
  userSubscription!: import( 'rxjs' ).Subscription;

  private _selectedContact: Contact | null = null;
  sender!: Contact;
  selectedTemplate = 'template';
  contact!: Contact;

  isSmallScreen: boolean = window.innerWidth < 992;
  isUltraWideScreen: boolean = window.innerWidth >= 2000;
  showLeftColumn: boolean = true;
  hoveredContact: Contact | null = null;
  hoverPosition = { x: 0, y: 0 };

  reason!: string | null;
  previousCampaignText!: string;
  campaignId: string | null = null;
  sequenceStepId: string | null = null;
  sequenceStepNumber: string | null = null;
  returnUrl: string | null = null;
  composerSignalOrigin: string | null = null;
  composerSourceSystem: string | null = null;
  composerActionId: string | null = null;
  composerPlanId: string | null = null;
  composerStrategyId: string | null = null;
  composerSegmentId: string | null = null;
  composerAngleId: string | null = null;
  preparedHandoff: ComposerHandoff | null = null;
  isSequenceEditMode = false;
  isSavingSequenceStep = false;
  isSavingMomentumDraft = false;
  isSendingComposerTest = false;
  composerTestStatus = '';
  private loggedInContactSubscription!: import( 'rxjs' ).Subscription;
  private currentQueueSubscription!: import( 'rxjs' ).Subscription;
  private currentContactSubscription!: import( 'rxjs' ).Subscription;
  private campaignSubscription!: import( 'rxjs' ).Subscription;
  private getUserSubscription!: import( 'rxjs' ).Subscription;
  private sendEmailSubscription!: import( 'rxjs' ).Subscription;
  private currentReasonSubscription!: import( 'rxjs' ).Subscription;
  private handoffSubscription!: import( 'rxjs' ).Subscription;
  private assistantDraftApplySubscription!: import( 'rxjs' ).Subscription;
  private assistantComposerContactApplySubscription!: import( 'rxjs' ).Subscription;
  showCCBCC = false;

  showMomentumInterrupt = false;
  pendingEmailData: any | null = null;
  signalEngineEnabled = true;
  isAdvertisement = false;
  useTemplateEnabled = false;

  emailContent: string = '';
  @Output() loader = new EventEmitter<boolean>();
  @Output() senderInformation = new EventEmitter<Contact>();
  @Output() toChange = new EventEmitter<string>();
  @Output() subjectChange = new EventEmitter<string>();
  @Output() psChange = new EventEmitter<string>();
  @Output() textChange = new EventEmitter<string>();
  @Output() textOnlyChange = new EventEmitter<string>();
  @Output() useTemplateChange = new EventEmitter<boolean>();
  @Output() momentumDraftAction = new EventEmitter<{ action: 'loaded' | 'saved' | 'dismissed' | 'sent'; contactId?: string; }>();

  footer = Footer;

  periodStartDate!: Date;

  private textOnly: string = '';
  private subscriptions: import( 'rxjs' ).Subscription[] = [];
  private validQueueSubscription!: import( 'rxjs' ).Subscription;

  private dataSubscription!: import( 'rxjs' ).Subscription;

  private initPending = 0;

  private beginInitStep (): void {
    this.initPending++;
    this.isLoading = true;
    this.triggerLoading( true );
  }

  private completeInitStep (): void {
    this.initPending = Math.max( 0, this.initPending - 1 );
    if ( this.initPending === 0 ) {
      this.isLoading = false;
      this.triggerLoading( false );
    }
  }

  private getSenderDisplayName (): string {
    const fullName = `${this.sender?.firstName || ''} ${this.sender?.lastName || ''}`.replace( /\s+/g, ' ' ).trim();
    if ( fullName && fullName.toLowerCase() !== 'todd' ) {
      return fullName;
    }

    const displayName = String( this.sender?.displayName || '' ).replace( /\s+/g, ' ' ).trim();
    if ( displayName && displayName.toLowerCase() !== 'todd' ) {
      return displayName;
    }

    const senderEmail =
      ( this.sender?.emailAddresses &&
        this.sender.emailAddresses.length > 0 &&
        this.sender.emailAddresses[0]?.emailAddress ) ||
      this.sender?.email ||
      '';

    const localPart = String( senderEmail || '' ).trim().split( '@' )[0] || '';
    const humanized = localPart
      .split( /[._-]+/ )
      .filter( Boolean )
      .map( part => part.charAt( 0 ).toUpperCase() + part.slice( 1 ) )
      .join( ' ' )
      .trim();

    return humanized.toLowerCase() === 'todd' ? '' : humanized;
  }


  constructor ( private dataService: OutreachDataService,
    private fb: FormBuilder,
    private alertService: AlertService,
    private emailService: EmailService,
    private route: ActivatedRoute,
    private campaignStateService: OutreachCampaignStateService,
    private contactService: OutreachContactQueueService,
    private notificationService: OutreachNotificationService,
    private momentumThreadService: OutreachMomentumThreadService,
    private outreachApi: OutreachApiService,
    private assistantBus: OutreachAssistantSignalService,
    protected override authService: OutreachAuthService,
    protected override soundService: SoundService,
    protected override logger: LoggerService,
    protected override router: Router,
    protected override nomenclatureService: OutreachNomenclatureService,

    private cdr: ChangeDetectorRef ) {
    super( authService, soundService, logger, router, nomenclatureService );

    this.triggerLoading( true );
    this.emailForm = this.fb.group( {
      to: ['', [Validators.required, Validators.email]],
      campaignName: ['', Validators.required],
      cc: ['', Validators.email],
      bcc: ['', Validators.email],
      subject: ['', Validators.required],
    } );
  }

  override  ngOnInit (): void {
    super.ngOnInit();
    this.publishPageContext();
    this.assistantDraftApplySubscription = this.assistantBus.assistantDraftApply$.subscribe( payload => {
      this.applyAssistantDraft( payload );
    } );
    this.assistantComposerContactApplySubscription = this.assistantBus.assistantComposerContactApply$.subscribe( payload => {
      this.applyAssistantResolvedContact( payload as AssistantComposerContactPayload | null );
    } );

    this.readySubscription = this.ready$.subscribe( ( isReady ) => {
      if ( isReady ) this.setupPage();

    } );

  }

  override ngOnDestroy (): void {
    super.ngOnDestroy();
    this.subscriptions.forEach( sub => sub.unsubscribe() );

    if ( this.currentQueueSubscription ) this.currentQueueSubscription.unsubscribe();

    if ( this.currentContactSubscription ) this.currentContactSubscription.unsubscribe();

    if ( this.campaignSubscription ) this.campaignSubscription.unsubscribe();

    if ( this.getUserSubscription ) this.getUserSubscription.unsubscribe();

    if ( this.sendEmailSubscription ) this.sendEmailSubscription.unsubscribe();

    if ( this.currentReasonSubscription ) this.currentReasonSubscription.unsubscribe();

    if ( this.validQueueSubscription ) this.validQueueSubscription.unsubscribe();

    if ( this.dataSubscription ) this.dataSubscription.unsubscribe();

    if ( this.handoffSubscription ) this.handoffSubscription.unsubscribe();

    if ( this.loggedInContactSubscription ) this.loggedInContactSubscription.unsubscribe();
    if ( this.assistantDraftApplySubscription ) this.assistantDraftApplySubscription.unsubscribe();
    if ( this.assistantComposerContactApplySubscription ) this.assistantComposerContactApplySubscription.unsubscribe();
    this.assistantBus.clearPageContext();

  }

  /**
   * Prefill subject/body when navigated from chat (inline Apply).
   * Prefers navigation state for large bodies; falls back to query params.
   */
  private prefillFromNavigation (): void {
    try {
      const nav = this.router.getCurrentNavigation();
      const state = ( nav?.extras?.state ?? {} ) as any;

      this.route.queryParamMap.pipe( take( 1 ) ).subscribe( qp => {
        const campaignId = ( state?.campaignId ?? qp.get( 'campaignId' ) ?? '' ).trim();
        const stepId = ( state?.stepId ?? qp.get( 'stepId' ) ?? '' ).trim();
        const stepNumber = ( state?.stepNumber ?? qp.get( 'stepNumber' ) ?? '' ).trim();
        const returnUrl = ( state?.returnUrl ?? qp.get( 'returnUrl' ) ?? '' ).trim();
        const signalOrigin = ( state?.signalOrigin ?? qp.get( 'signalOrigin' ) ?? '' ).trim();
        const sourceSystem = ( state?.sourceSystem ?? qp.get( 'sourceSystem' ) ?? '' ).trim();
        const actionId = ( state?.actionId ?? qp.get( 'actionId' ) ?? '' ).trim();
        const planId = ( state?.planId ?? qp.get( 'planId' ) ?? '' ).trim();
        const strategyId = ( state?.strategyId ?? qp.get( 'strategyId' ) ?? '' ).trim();
        const segmentId = ( state?.segmentId ?? qp.get( 'segmentId' ) ?? '' ).trim();
        const angleId = ( state?.angleId ?? qp.get( 'angleId' ) ?? '' ).trim();

        this.campaignId = campaignId || null;
        this.sequenceStepId = stepId || null;
        this.sequenceStepNumber = stepNumber || null;
        this.returnUrl = returnUrl || null;
        this.composerSignalOrigin = signalOrigin || null;
        this.composerSourceSystem = sourceSystem || null;
        this.composerActionId = actionId || null;
        this.composerPlanId = planId || null;
        this.composerStrategyId = strategyId || null;
        this.composerSegmentId = segmentId || null;
        this.composerAngleId = angleId || null;
        this.isSequenceEditMode = !!( this.campaignId && this.sequenceStepId );

        if ( this.isSequenceEditMode ) {
          this.emailForm.get( 'to' )?.clearValidators();
          this.emailForm.get( 'to' )?.setValue( '' );
          this.emailForm.get( 'to' )?.updateValueAndValidity( { emitEvent: false } );
          this.emailForm.get( 'cc' )?.setValue( '' );
          this.emailForm.get( 'bcc' )?.setValue( '' );
          this.emailForm.get( 'campaignName' )?.clearValidators();
          this.emailForm.get( 'campaignName' )?.updateValueAndValidity( { emitEvent: false } );
        }

        const subject = (
          state?.draftSubject ??
          state?.subject ??
          qp.get( 'draftSubject' ) ??
          qp.get( 'subject' )
        ) || '';
        const campaignName = (
          state?.campaignName ??
          qp.get( 'campaignName' )
        ) || '';

        const body = (
          state?.draftBody ??
          state?.body ??
          qp.get( 'draftBody' ) ??
          qp.get( 'body' )
        ) || '';

        if ( subject ) {
          this.emailForm.patchValue( { subject } );
        }

        if ( campaignName ) {
          this.emailForm.patchValue( { campaignName } );
        }

        if ( body ) {
          this.onTextOnlyContentChange( body );

          const looksHtml = /<\w+[^>]*>/i.test( body );
          const html = looksHtml
            ? body
            : `<p>${body
              .replace( /&/g, '&amp;' )
              .replace( /</g, '&lt;' )
              .replace( />/g, '&gt;' )
              .replace( /\n\n/g, '</p><p>' )
              .replace( /\n/g, '<br>' )
            }</p>`;

          this.emailContent = html;
          this.cdr.detectChanges();
        }

        if ( this.isSequenceEditMode ) {
          this.message = `Editing campaign step${this.sequenceStepNumber ? ' ' + this.sequenceStepNumber : ''}`;
        }

        this.publishPageContext();
      } );
    } catch ( e ) {
      this.logger.warn( 'prefillFromNavigation failed (non-fatal)', e );
    }
  }

  setupPage () {
    this.assistantBus.emitAssistantActivity( {
      feature: 'outreach',
      page: 'email-create',
      route: this.router.url,
      mode: 'create',
      action: 'email_create_opened',
      summary: {
        hasQueuedContacts: this.queue.length > 0
      }
    } );
    this.prefillFromNavigation();

    this.periodStartDate = new Date();
    this.periodStartDate.setDate( this.periodStartDate.getDate() - 2 );

    const toControl = this.emailForm.get( 'to' );
    if ( toControl ) {
      this.subscriptions.push(
        toControl.valueChanges.subscribe( value => this.toChange.emit( value ) )
      );
    }

    const subjectControl = this.emailForm.get( 'subject' );
    if ( subjectControl ) {
      this.subscriptions.push(
        subjectControl.valueChanges.subscribe( value => this.subjectChange.emit( value ) )
      );
    }

    const textControl = this.emailForm.get( 'text' );
    if ( textControl ) {
      this.subscriptions.push(
        textControl.valueChanges.subscribe( value => this.textChange.emit( value ) )
      );
    }

    this.alertService.closeAlertAfterTimeout( 'autoCloseAlert', 10000 );

    this.beginInitStep();
    this.checkQueue();

    this.beginInitStep();
    this.checkContact();

    this.beginInitStep();
    this.senderInfo();

    this.beginInitStep();
    this.loadPreparedHandoff();
    this.publishPageContext();

  }

  private loadPreparedHandoff (): void {
    this.handoffSubscription?.unsubscribe();

    this.route.queryParams.pipe( take( 1 ) ).subscribe( params => {
      const handoffId = String( params['handoffId'] || '' ).trim();
      if ( !handoffId ) {
        this.applyLegacyComposerQueryParams( params );
        this.completeInitStep();
        return;
      }

      this.handoffSubscription = this.outreachApi.getComposerHandoff( handoffId, {
        tenantId: this.tenantId,
        userId: this.userId,
        userEmail: this.firebaseUser?.email || undefined
      } ).subscribe( {
        next: ( response ) => {
          this.applyPreparedHandoff( response?.data || null );
          this.completeInitStep();
          this.publishPageContext();
        },
        error: error => {
          this.logger.error( 'Prepared outreach handoff load failed', error );
          this.completeInitStep();
        }
      } );
    } );
  }

  private applyPreparedHandoff ( handoff: ComposerHandoff | null ): void {
    if ( !handoff ) return;
    this.preparedHandoff = handoff;
    this.returnUrl = this.returnUrl || String( handoff.returnRoute || '' ).trim() || null;

    const selectedContacts = Array.isArray( handoff.selectedContacts ) ? handoff.selectedContacts : [];
    const emailData: any = handoff.emailData || {};
    const campaignDrafts = handoff.campaignDrafts;
    const handoffSource = String( handoff.source || '' ).trim();
    const handoffMode = String( handoff.handoffMode || '' ).trim();
    const isSignalEngineSingleContact =
      handoffSource === 'signal_engine_thread'
      || handoffMode === 'single_contact';
    const isCampaignReviewHandoff =
      handoffSource === 'daily_momentum_campaign'
      || handoffMode === 'campaign_review';
    const handoffFollowupContext = String(
      ( handoff as any )?.followupContext
      || ( handoff as any )?.contextHint
      || ( handoff as any )?.nextActionReason
      || ( handoff as any )?.reason
      || ( emailData as any )?.followupContext
      || ( emailData as any )?.contextHint
      || ( emailData as any )?.nextActionReason
      || ( emailData as any )?.reason
      || ''
    ).trim();

    if ( isSignalEngineSingleContact ) {

      const selectedContact = this.resolveHandoffSelectedContact( handoff );
      const selectedContactEmail = String(
        selectedContact?.email
        || selectedContact?.emailAddresses?.[0]?.emailAddress
        || handoff?.threadContext?.recipientEmail
        || ''
      ).trim();

      this.queue = [];
      this.contactService.clearQueue();
      this.selectedContact = selectedContact;
      if ( selectedContact ) {
        this.contactService.changeContact( selectedContact );
      } else {
        this.contactService.resetContact();
      }

      this.emailForm.patchValue( {
        to: selectedContactEmail
      } );
    } else if ( isCampaignReviewHandoff && selectedContacts.length > 0 ) {
      this.queue = selectedContacts;
      this.contactService.setQueue( selectedContacts );
      this.selectedContact = null;
      this.contactService.resetContact();
      this.extractQueueEmailAddresses();
      this.emailForm.get( 'campaignName' )?.setValidators( Validators.required );
      this.emailForm.get( 'to' )?.clearValidators();
      this.emailForm.get( 'to' )?.updateValueAndValidity();
      this.emailForm.get( 'campaignName' )?.updateValueAndValidity();
    } else if ( selectedContacts.length > 0 ) {
      this.queue = selectedContacts;
      this.contactService.setQueue( selectedContacts );
      this.selectedContact = null;
      this.contactService.resetContact();
    }

    this.emailForm.patchValue( {
      campaignName: isSignalEngineSingleContact ? '' : String( emailData.campaignName || '' ).trim(),
      cc: String( emailData.cc || '' ).trim(),
      bcc: String( emailData.bcc || '' ).trim(),
      subject: String( emailData.subject || '' ).trim()
    } );

    const sanitizedHandoffHtml = this.stripSignalEngineComposerSignoff( String( emailData.html || '' ).trim() );
    this.emailContent = sanitizedHandoffHtml;
    this.onTextOnlyContentChange( this.stripSignalEngineComposerSignoff( String( emailData.text || '' ).trim() ) );

    if ( isSignalEngineSingleContact && handoffFollowupContext ) {
      this.reason = handoffFollowupContext;
      this.contactService.changeReason( handoffFollowupContext );
    }

    if ( campaignDrafts ) {
      this.emailService.storeCampaignDrafts( campaignDrafts );
      setTimeout( () => {
        this.emailEditor?.checkForCampaign?.();
      } );
    }

    this.assistantBus.emitAssistantActivity( {
      feature: 'outreach',
      page: 'email-create',
      route: this.router.url,
      mode: 'create',
      action: 'daily_momentum_campaign_handoff_loaded',
      summary: {
        handoffId: String( handoff.id || handoff.handoffId || '' ).trim(),
        contactsCount: selectedContacts.length,
        subject: String( emailData.subject || '' ).trim(),
        handoffSource,
        handoffMode,
        isSignalEngineSingleContact,
        isCampaignReviewHandoff,
        hasFollowupContext: !!handoffFollowupContext
      }
    } );

    this.publishPageContext();
  }

  onHtmlContentChange ( content: string ) {
    this.emailContent = content;
    this.textChange.emit( content );
    this.publishPageContext();
  }

  onTextOnlyContentChange ( content: string ) {
    this.textOnly = content;
    this.textOnlyChange.emit( content );
    this.publishPageContext();
  }

  onSubjectChange ( content: string ) {
    this.emailForm.patchValue( { subject: content } );
    this.publishPageContext();
  }

  public hasUnsentDraftContent (): boolean {
    return !!String( this.emailForm.get( 'subject' )?.value || '' ).trim()
      || !!String( this.emailContent || '' ).trim()
      || !!String( this.textOnly || '' ).trim();
  }

  public applyAssistantResolvedContact ( payload: AssistantComposerContactPayload | null | undefined ): void {
    const contact = payload?.contact || null;
    const email = String(
      contact?.email
      || contact?.emailAddresses?.[0]?.emailAddress
      || ''
    ).trim();

    if ( !contact || !email ) return;

    this.queue = [];
    this.contactService.clearQueue();
    this.selectedContact = contact;
    this.contactService.changeContact( contact );
    this.emailForm.patchValue( { to: email } );
    this.showSuggestions = false;
    this.cdr.detectChanges();
    this.assistantBus.emitAssistantActivity( {
      feature: 'outreach',
      page: 'email-create',
      route: this.router.url,
      mode: 'create',
      action: 'assistant_contact_applied_to_composer',
      summary: {
        contactId: contact?.id || '',
        email,
        source: String( payload?.source || 'assistant_chat_composer' )
      }
    } );
    this.publishPageContext();
  }

  public applyComposerHandoff ( handoff: ComposerHandoff | null | undefined ): void {
    if ( !handoff ) return;

    this.showMomentumInterrupt = false;
    this.pendingEmailData = null;
    this.message = undefined;
    this.applyPreparedHandoff( handoff );
    this.cdr.detectChanges();
    this.emailEditor?.updateEditorContent( true );
    this.momentumDraftAction.emit( {
      action: 'loaded',
      contactId: String( handoff.threadContext?.contactId || '' ).trim() || undefined
    } );
    this.publishPageContext();
  }

  private applyAssistantDraft ( payload: AssistantDraftPayload | null | undefined ): void {
    if ( !payload ) return;

    const subject = String( payload.subject || '' ).trim();
    const html = String( payload.html || payload.body || '' ).trim();

    if ( subject ) {
      this.emailForm.patchValue( { subject } );
    }

    if ( html ) {
      this.emailContent = html;
      this.onTextOnlyContentChange( this.convertHtmlToText( html ) );
      this.cdr.detectChanges();
      this.emailEditor?.updateEditorContent( true );
    }

    this.publishPageContext();
  }

  private convertHtmlToText ( html: string ): string {
    if ( !html ) return '';

    try {
      const container = document.createElement( 'div' );
      container.innerHTML = html;
      return String( container.innerText || container.textContent || '' ).trim();
    } catch {
      return String( html || '' )
        .replace( /<br\s*\/?>/gi, '\n' )
        .replace( /<\/p>/gi, '\n\n' )
        .replace( /<[^>]+>/g, ' ' )
        .replace( /\n{3,}/g, '\n\n' )
        .replace( /[ \t]{2,}/g, ' ' )
        .trim();
    }
  }

  private stripSignalEngineComposerSignoff ( content: string ): string {
    return String( content || '' )
      .replace(
        /<p>\s*(best|best regards|thanks|thank you|sincerely|regards|kind regards),?\s*(<br\s*\/?>)?\s*(todd|{{\s*signature\s*}}|{\s*signature\s*}|[^<]+)\s*<\/p>\s*$/gi,
        ''
      )
      .replace(
        /<p>\s*(best|best regards|thanks|thank you|sincerely|regards|kind regards),?\s*<\/p>\s*<p>\s*(todd|{{\s*signature\s*}}|{\s*signature\s*}|[^<]+)\s*<\/p>\s*$/gi,
        ''
      )
      .replace(
        /\n*(best|best regards|thanks|thank you|sincerely|regards|kind regards),?\s*\n+(\{\{\s*signature\s*\}\}|\{\s*signature\s*\}|todd|[^\n]+)\s*$/i,
        ''
      )
      .trim();
  }

  private endsWithEquivalentSignature ( body: string, signature: string ): boolean {
    const normalizedBody = this.normalizeComparableSignature( body );
    const normalizedSignature = this.normalizeComparableSignature( signature );
    return !!normalizedBody && !!normalizedSignature && normalizedBody.endsWith( normalizedSignature );
  }

  private normalizeComparableSignature ( value: string ): string {
    return String( value || '' )
      .replace( /<br\s*\/?>/gi, '\n' )
      .replace( /<\/p>/gi, '\n\n' )
      .replace( /<[^>]+>/g, ' ' )
      .replace( /&nbsp;/gi, ' ' )
      .replace( /&amp;/gi, '&' )
      .replace( /\s+/g, ' ' )
      .trim()
      .toLowerCase();
  }


  triggerLoading ( loading: boolean ): void {
    this.loader.emit( loading );
  }

  onUseTemplate ( value: boolean ) {
    this.useTemplateEnabled = value;
    this.useTemplateChange.emit( value );
    this.assistantBus.emitAssistantActivity( {
      feature: 'outreach',
      page: 'email-create',
      route: this.router.url,
      mode: 'create',
      action: 'email_create_template_mode_changed',
      summary: {
        useTemplate: value
      }
    } );
    this.publishPageContext();
  }

  private checkQueue (): void {
    if ( this.currentQueueSubscription )
      this.currentQueueSubscription.unsubscribe();

    this.currentQueueSubscription = this.contactService.currentQueue.subscribe( queue => {
      if ( queue && queue.length > 0 ) {

        this.queue = queue;
        this.selectedContact = null;
        this.contactService.resetContact();
        this.validQueueSubscription = this.validateQueueEmails( this.queue ).subscribe( validatedEmails => {
          this.queue = validatedEmails;
          this.extractQueueEmailAddresses();

          this.emailForm.get( 'campaignName' )?.setValidators( Validators.required );
          this.emailForm.get( 'to' )?.clearValidators();
          this.emailForm.get( 'to' )?.updateValueAndValidity();
          this.emailForm.get( 'campaignName' )?.updateValueAndValidity();

          this.completeInitStep();
          this.publishPageContext();
        } );
      } else {
        this.emailForm.get( 'to' )?.setValidators( [Validators.required, Validators.email] );
        this.emailForm.get( 'campaignName' )?.clearValidators();
        this.emailForm.get( 'to' )?.updateValueAndValidity();
        this.emailForm.get( 'campaignName' )?.updateValueAndValidity();

        this.completeInitStep();
        this.publishPageContext();
      }
    } );
  }

  private applyLegacyComposerQueryParams ( params: Record<string, any> ): void {
    const subject = String( params['subject'] || '' ).trim();
    const contextHint = String( params['contextHint'] || '' ).trim();
    const currentSubject = String( this.emailForm.value.subject || '' ).trim();
    const currentText = String( this.textOnly || this.emailForm.value.text || '' ).trim();

    if ( subject && !currentSubject ) {
      this.emailForm.patchValue( { subject } );
    }

    if ( contextHint && !currentText ) {
      this.onTextOnlyContentChange( contextHint );
    }
  }

  private checkContact (): void {
    if ( this.currentContactSubscription )
      this.currentContactSubscription.unsubscribe();

    this.route.queryParams.pipe( take( 1 ) ).subscribe( params => {
      const id = params['id'] || params['contactId'];
      if ( id ) {
        this.dataSubscription = this.outreachApi.getOutreachContactById( id, {
          tenantId: this.tenantId,
          userId: this.userId,
          userEmail: this.firebaseUser?.email || undefined
        } ).subscribe( response => {
          const contact = response?.data as Contact;
          this.postProcessContact( contact );
          if ( !this.selectedContact ) this.setupContacts();
          this.completeInitStep();
          this.publishPageContext();
        } );
      } else {
        this.currentContactSubscription = this.contactService.currentContact.subscribe( contact => {
          if ( contact ) {
            this.postProcessContact( contact );
          } else this.setupContacts();
          this.completeInitStep();
          this.publishPageContext();
        } );
      }
    } );
  }

  postProcessContact ( contact: Contact ) {
    let emailAddress = contact.email;
    this.selectedContact = contact;
    if ( !emailAddress && contact.emailAddresses && contact.emailAddresses.length > 0 ) {
      emailAddress = contact.emailAddresses[0].emailAddress;
    }

    if ( emailAddress ) {
      this.emailForm.patchValue( {
        to: emailAddress,
        text: `Hi ${contact.firstName},`
      } );
    }

    this.currentReasonSubscription = this.contactService.currentReason.subscribe( reason => {
      this.reason = reason;
    } );


    if ( this.campaignSubscription )
      this.campaignSubscription.unsubscribe();


    this.campaignSubscription = this.campaignStateService.campaign$.subscribe( ( campaign ) => {
      if ( campaign && campaign.id ) {

        this.previousCampaignText = ( campaign.html ) ? campaign.html : '';
        this.emailForm.patchValue( {
          campaignName: "Follow Up/" + campaign.name,
          subject: ( campaign.subject || '' )
        } );
        setTimeout( () => {
          this.campaignStateService.clearCampaign();
        }, 2000 );
      }
    } );

    this.publishPageContext();
  }



  private validateQueueEmails ( queue: any[] ): Observable<any[]> {
    return from( queue ).pipe(
      mergeMap( contact => this.processContactEmail( contact ), 5 ),
      toArray(),
      map( results => results.filter( contact => contact !== null ) )
    );
  }

  private getPrimaryEmailInfo ( contact: any ): any | null {
    if ( contact?.emailAddresses && contact.emailAddresses.length > 0 && contact.emailAddresses[0]?.emailAddress ) {
      return contact.emailAddresses[0];
    }

    if ( contact?.email ) {
      return {
        emailAddress: String( contact.email ).trim(),
        checked: false,
        blocked: false
      };
    }

    return null;
  }

  private processContactEmail ( contact: any ): Observable<any> {
    const emailInfo = this.getPrimaryEmailInfo( contact );

    if ( !emailInfo || !emailInfo.emailAddress ) {
      this.logger.warn( 'Contact has no sendable email', { contact } );
      return of( null );
    }

    if ( emailInfo.checked ) {
      if ( emailInfo.blocked ) {
        this.logger.warn( `Blocked email: ${emailInfo.emailAddress}` );
        return of( null );
      }
      return of( contact );
    }

    return this.emailService.verifyEmailWithSendGrid( emailInfo.emailAddress ).pipe(
      mergeMap( response => {
        const isBlocked = String( response?.verdict || '' ).toLowerCase() === 'invalid';

        if ( contact?.emailAddresses && contact.emailAddresses.length > 0 && contact.emailAddresses[0] ) {
          emailInfo.checked = true;
          emailInfo.blocked = isBlocked;
          emailInfo.dateChecked = new Date().toISOString();

          return this.saveContact( contact ).pipe(
            map( () => ( isBlocked ? null : contact ) ),
            catchError( error => {
              this.logger.error( `Error saving contact after email verification: ${emailInfo.emailAddress}`, error );
              return of( null );
            } )
          );
        }

        return of( isBlocked ? null : contact );
      } ),
      catchError( error => {
        this.logger.error( `Error verifying email: ${emailInfo.emailAddress}`, error );
        return of( null );
      } )
    );
  }

  private saveContact ( contact: any ): Observable<void> {
    return this.outreachApi.updateOutreachContact( contact.id, contact, {
      tenantId: this.tenantId,
      userId: this.userId,
      userEmail: this.firebaseUser?.email || undefined
    } ).pipe(
      map( () => {
        this.logger.debug( "Contact Updated", contact );
      } ),
      catchError( error => {
        this.logger.error( "Contact Update failed", contact );
        throw error;
      } )
    );
  }


  /**
   * Queues a multi-contact campaign draft, then navigates to
   * '/email-queue-dashboard' - the monorepo's own pages/email-queue-dashboard/
   * is an empty stub folder (confirmed unreachable there too, per this
   * extraction's brief), so this path is a pre-existing dead end upstream,
   * not a regression introduced by the port. Left as-is rather than
   * building a queue dashboard that was never in scope.
   */
  queueEmail (): void {
    if ( this.isSequenceEditMode ) {
      this.saveSequenceStep();
      return;
    }

    if ( this.hasUnreplacedPlaceholders( this.emailContent ) ) {
      alert( "Please replace all placeholder content in the template before sending." );
      return;
    }

    if ( this.emailForm.valid && this.sender ) {
      if ( this.queueMomentumCount > 0 ) {
        const confirmed = confirm(
          `${this.queueMomentumCount} queued contact(s) are already being managed by the Signal Engine. Starting this campaign will restart their current sequence. Continue?`
        );

        if ( !confirmed ) {
          return;
        }
      }

      this.message = "Preparing email to send ...";

      let textContent = this.textOnly;
      textContent += '\n';
      textContent += this.sender.signature ? this.sender.signature : `\n${this.sender.firstName} ${this.sender.lastName}`;

      let htmlContent = this.emailContent;
      htmlContent += '<br>';

      if ( !this.sender.signature )
        htmlContent += `Best<br><br>${this.sender.firstName} ${this.sender.lastName}`;

      htmlContent += this.footer;

      htmlContent = this.getReplacements( htmlContent, this.sender.signature ? this.sender.signature : "" );

      const fromEmail =
        ( this.sender.emailAddresses &&
          this.sender.emailAddresses.length > 0 &&
          this.sender.emailAddresses[0].emailAddress ) ||
        this.sender.email ||
        '';

      const emailData = {
        campaignName: this.emailForm.value.campaignName,
        signalEngineEnabled: true,
        actionId: this.composerActionId,
        signalOrigin: this.resolveSendSignalOrigin( 'campaign' ),
        sourceSystem: this.resolveSendSourceSystem(),
        planId: this.composerPlanId,
        strategyId: this.composerStrategyId,
        segmentId: this.composerSegmentId,
        angleId: this.composerAngleId,
        cc: this.emailForm.value.cc,
        from: {
          email: fromEmail,
          name: this.getSenderDisplayName()
        },
        bcc: this.emailForm.value.bcc,
        subject: this.emailForm.value.subject,
        text: textContent,
        html: htmlContent,
        contactName: this.selectedContact ? `${this.selectedContact.firstName}` : 'No contact name'
      };

      this.contactService.setQueue( this.queue );
      this.campaignStateService.setEmailData( emailData );
      this.assistantBus.emitAssistantActivity( {
        feature: 'outreach',
        page: 'email-create',
        route: this.router.url,
        mode: 'create',
        action: 'campaign_queue_prepared',
        summary: {
          queueCount: this.queue.length,
          subject: this.emailForm.value.subject || '',
          signalEngineEnabled: true
        }
      } );
      this.publishPageContext();
      this.router.navigate( ['/email-queue-dashboard'] );
      this.emailEditor.clearEditor();
      this.selectedContact = null;
    }
  }


  senderInfo (): void {
    if ( this.firebaseUser && this.tenantId && this.userId ) {
      this.loggedInContactSubscription = from( this.dataService.getContact( this.tenantId, this.userId ) ).subscribe( contact => {
        if ( contact ) {
          this.sender = contact;
          this.senderInformation.emit( contact );
        }
        else {
          this.logger.error( "No Contact Returned" );
        }
        this.completeInitStep();
        this.publishPageContext();
      } );
    } else {
      this.completeInitStep();
      this.publishPageContext();
    }
  }


  setupContacts (): void {
    firstValueFrom( this.outreachApi.listOutreachContacts( {
      tenantId: this.tenantId,
      userId: this.userId,
      userEmail: this.firebaseUser?.email || undefined
    } ) ).then( response => {
      const data = ( response?.data || [] ) as Contact[];
      this.contacts = data.filter( contact => {
        const hasValidEmail = contact.emailAddresses?.some( email => !email.blocked ) ?? false;
        return contact.status !== 'deleted' && hasValidEmail;
      } );

      this.extractEmailAddresses();
      this.completeInitStep();
      this.publishPageContext();
    } ).catch( error => {
      this.logger.error( 'Error fetching contacts:', error );
      this.completeInitStep();
      this.publishPageContext();
    } );
  }

  private extractQueueEmailAddresses (): void {
    this.allEmailAddresses = this.queue.map( contact => {
      const email = contact.email || ( contact.emailAddresses && contact.emailAddresses[0].emailAddress );
      return `${contact.firstName} ${contact.lastName} <${email}>`;
    } );
  }

  extractEmailAddresses (): void {
    this.allEmailAddresses = [];
    this.contacts.forEach( contact => {
      if ( contact.emailAddresses ) {
        contact.emailAddresses.forEach( emailAddress => {
          if ( !emailAddress.blocked ) {
            this.allEmailAddresses.push( emailAddress.emailAddress );
          }
        } );
      }
    } );
    this.filteredContacts = this.allEmailAddresses;
  }


  removeContactFromQueue ( contact: Contact ): void {
    this.soundService.playSound( "click" );

    this.queue = this.queue.filter( c => c !== contact );
    this.extractQueueEmailAddresses();
    this.contactService.setQueue( this.queue );
    this.assistantBus.emitAssistantActivity( {
      feature: 'outreach',
      page: 'email-create',
      route: this.router.url,
      mode: 'create',
      action: 'campaign_queue_contact_removed',
      summary: {
        queueCount: this.queue.length,
        removedContactId: contact?.id || ''
      }
    } );
    this.publishPageContext();
  }

  onRecipientInput (): void {
    const inputValue = this.emailForm.get( 'to' )?.value.toLowerCase() || '';
    this.filteredContacts = this.allEmailAddresses.filter( contact =>
      contact.toLowerCase().includes( inputValue )
    );
    this.showSuggestions = this.filteredContacts.length > 0;
  }

  hideSuggestions (): void {
    setTimeout( () => this.showSuggestions = false, 200 );
  }

  selectContact ( contact: string ): void {
    this.emailForm.get( 'to' )?.setValue( contact );
    this.showSuggestions = false;
    this.selectContactByEmail( contact );
  }

  selectContactByEmail ( email: string ): void {
    const contact = this.contacts.find( c =>
      c.email === email || ( c.emailAddresses && c.emailAddresses.some( e => e.emailAddress === email ) )
    );
    if ( contact ) {
      this.selectedContact = contact;
      this.assistantBus.emitAssistantActivity( {
        feature: 'outreach',
        page: 'email-create',
        route: this.router.url,
        mode: 'create',
        action: 'email_recipient_selected',
        summary: {
          contactId: contact?.id || '',
          email
        }
      } );
      this.publishPageContext();
    }
  }

  hasUnreplacedPlaceholders ( html: string ): boolean {
    const placeholderPatterns = [
      /{{\s*ctaLink\s*}}/i,
      /See it in action/i,
      /Key benefit\s*\d?/i,
      /https:\/\/via\.placeholder\.com/i,
      /{{\s*subject\s*}}/i,
      /{{\s*content\s*}}/i
    ];

    return placeholderPatterns.some( pattern => pattern.test( html ) );
  }

  get activeMomentumThread (): MomentumThread | null {
    const contactId = this.selectedContact?.id ? String( this.selectedContact.id ) : '';
    if ( !contactId ) return null;
    return this.momentumThreadService.getThreadByContactId( contactId );
  }

  get activeMomentumLabel (): string {
    const contactId = this.selectedContact?.id ? String( this.selectedContact.id ) : '';
    if ( !contactId ) return 'Signal Idle';
    return this.momentumThreadService.getSignalEngineLabel( contactId );
  }

  get activeMomentumWarning (): string {
    const contactId = this.selectedContact?.id ? String( this.selectedContact.id ) : '';
    if ( !contactId ) return 'Signal Engine will stand by until the first email goes out.';
    return this.momentumThreadService.getSignalEngineWarning( contactId );
  }

  get queueMomentumCount (): number {
    return ( this.queue || [] ).filter( ( contact ) => {
      const contactId = contact?.id ? String( contact.id ) : '';
      return !!contactId && this.momentumThreadService.hasToddOwnedActiveThread( contactId );
    } ).length;
  }

  private shouldInterruptForMomentum (): boolean {
    const contactId = this.selectedContact?.id ? String( this.selectedContact.id ) : '';
    if ( !contactId ) return false;

    return this.momentumThreadService.hasToddOwnedActiveThread( contactId );
  }

  get composerTestRecipient (): string {
    return String(
      this.firebaseUser?.email
      || ( this.sender?.emailAddresses && this.sender.emailAddresses.length > 0 && this.sender.emailAddresses[0]?.emailAddress )
      || this.sender?.email
      || ''
    ).trim();
  }

  canSendComposerTest (): boolean {
    if ( this.isSequenceEditMode || this.queue.length > 0 || this.isSendingComposerTest ) {
      return false;
    }

    return !!this.resolveComposerSenderEmail()
      && !!String( this.emailForm.value.subject || '' ).trim()
      && !!this.composerTestRecipient;
  }

  pauseToddAndSend (): void {
    const pendingEmailData = this.pendingEmailData;
    this.pendingEmailData = null;
    this.showMomentumInterrupt = false;

    if ( pendingEmailData ) {
      this.sendItAlready( pendingEmailData );
      return;
    }

    this.triggerLoading( false );
    this.publishPageContext();
  }

  keepToddInControl (): void {
    this.pendingEmailData = null;
    this.showMomentumInterrupt = false;
    this.message = undefined;
    this.triggerLoading( false );
    this.notificationService.show( 'Momentum Active', 'TODD stayed in control of this conversation.', 'info' );
    this.publishPageContext();
  }

  reviewMomentumThread (): void {
    this.pendingEmailData = null;
    this.showMomentumInterrupt = false;
    this.triggerLoading( false );
    this.publishPageContext();
    this.router.navigate( ['/signal-engine'] );
  }

  sendEmail (): void {
    if ( this.isSequenceEditMode ) {
      this.saveSequenceStep();
      return;
    }

    if ( this.hasUnreplacedPlaceholders( this.emailContent ) ) {
      alert( "Please replace all placeholder content in the template before sending." );
      return;
    }

    this.triggerLoading( true );

    if ( this.emailForm.valid && this.sender ) {
      this.message = "Preparing email to send ...";

      const emailData = this.buildSingleEmailPayload( { useAdvertisementPrefix: true } );
      if ( !emailData ) {
        this.message = undefined;
        this.triggerLoading( false );
        return;
      }

      this.assistantBus.emitAssistantActivity( {
        feature: 'outreach',
        page: 'email-create',
        route: this.router.url,
        mode: 'create',
        action: 'single_email_send_requested',
        summary: {
          to: this.emailForm.value.to || '',
          hasSelectedContact: !!this.selectedContact,
          signalEngineEnabled: this.signalEngineEnabled
        }
      } );
      this.publishPageContext();

      if ( this.shouldInterruptForMomentum() ) {
        this.pendingEmailData = emailData;
        this.showMomentumInterrupt = true;
        this.message = undefined;
        this.triggerLoading( false );
        return;
      }

      this.sendItAlready( emailData );
    }
  }

  async sendComposerTestEmail (): Promise<void> {
    if ( this.hasUnreplacedPlaceholders( this.emailContent ) ) {
      alert( "Please replace all placeholder content in the template before sending." );
      return;
    }

    const draftPayload = this.buildSingleEmailPayload( { useAdvertisementPrefix: true } );
    const testRecipient = this.composerTestRecipient;

    if ( !draftPayload ) {
      return;
    }

    if ( !testRecipient ) {
      this.notificationService.show( 'No test recipient', 'TODD could not find the signed-in user email for test delivery.', 'warning' );
      return;
    }

    const testPayload = {
      ...draftPayload,
      to: testRecipient,
      cc: '',
      bcc: '',
      subject: String( draftPayload.subject || '' ).startsWith( '[TEST] ' )
        ? draftPayload.subject
        : `[TEST] ${draftPayload.subject}`,
      isTestSend: true
    };

    this.isSendingComposerTest = true;
    this.composerTestStatus = '';

    try {
      await firstValueFrom( this.emailService.sendEmail( testPayload, this.tenantId, this.userId ) );
      this.composerTestStatus = `Test sent to ${testRecipient}. The real recipient and queue were not changed.`;
      this.notificationService.show( 'Test Sent', this.composerTestStatus, 'success' );
    } catch ( error ) {
      this.logger.error( 'Composer test email failed', error );
      this.composerTestStatus = 'TODD could not send the test email right now.';
      this.notificationService.show( 'Test Send Failed', this.composerTestStatus, 'error' );
    } finally {
      this.isSendingComposerTest = false;
      this.publishPageContext();
    }
  }

  async handleComposerSubmit (): Promise<void> {
    const submitIntent = this.composerSubmitIntent;
    this.composerSubmitIntent = 'default';

    if ( this.isSequenceEditMode ) {
      await this.saveSequenceStep();
      return;
    }

    if ( this.canSaveMomentumDraftToOutbox() ) {
      if ( submitIntent === 'send_now' ) {
        this.sendEmail();
        return;
      }

      await this.saveMomentumDraftToOutbox();
      return;
    }

    if ( this.queue.length > 0 ) {
      this.queueEmail();
      return;
    }

    this.sendEmail();
  }

  handleSaveToOutboxClick (): void {
    this.composerSubmitIntent = 'save_outbox';
  }

  async handleSendNowClick (): Promise<void> {
    this.composerSubmitIntent = 'send_now';
    await this.handleComposerSubmit();
  }

  handleComposerBack (): void {
    if ( this.returnUrl ) {
      this.router.navigateByUrl( this.returnUrl );
      return;
    }

    window.history.back();
  }

  canSaveMomentumDraftToOutbox (): boolean {
    return !!String( this.preparedHandoff?.threadContext?.contactId || '' ).trim()
      && !!this.resolveComposerReturnUrl()
      && this.preparedHandoff?.source === 'signal_engine_thread';
  }

  private resolveComposerReturnUrl (): string {
    return String( this.returnUrl || this.preparedHandoff?.returnRoute || '' ).trim();
  }

  private async saveMomentumDraftToOutbox (): Promise<void> {
    const contactId = String( this.preparedHandoff?.threadContext?.contactId || '' ).trim();
    const draftKind = String( this.preparedHandoff?.threadContext?.draftKind || 'outbound' ).trim().toLowerCase();
    const subject = String( this.emailForm.get( 'subject' )?.value || '' ).trim();
    const draftBody = String( this.emailContent || '' ).trim();

    if ( !contactId ) return;
    if ( this.isSavingMomentumDraft ) return;

    if ( !subject ) {
      this.notificationService.show( 'Missing Subject', 'Enter a subject before saving this draft.', 'error' );
      return;
    }

    if ( !draftBody ) {
      this.notificationService.show( 'Missing Body', 'Enter email content before saving this draft.', 'error' );
      return;
    }

    this.isSavingMomentumDraft = true;
    this.triggerLoading( true );
    this.message = 'Saving draft back to Outbox ...';

    const currentThread = this.momentumThreadService.getThreadByContactId( contactId ) || {} as MomentumThread;
    const nextThread: MomentumThread = {
      ...currentThread,
      contactId,
      contactName: currentThread.contactName || this.preparedHandoff?.selectedContacts?.[0]?.firstName || '',
      companyName: currentThread.companyName || this.preparedHandoff?.threadContext?.companyName || '',
      lastAutomationNote: 'Draft updated in Compose Email and returned to Outbox.',
      ...( draftKind === 'reply'
        ? {
          replyDraftSubject: subject,
          replyDraftBody: draftBody,
          draftSubject: null as any,
          draftBody: null as any,
          replyDraftRationale: currentThread.replyDraftRationale || 'Draft updated in Compose Email for human review.',
          replyApprovalMode: currentThread.replyApprovalMode || 'review_before_send',
          replyApprovalReason: currentThread.replyApprovalReason || 'Draft updated in Compose Email and returned to Outbox for review.',
          queueState: currentThread.queueState || 'handoff',
          mode: currentThread.mode || 'handoff',
          owner: currentThread.owner || 'user'
        }
        : {
          draftSubject: subject,
          draftBody,
          replyDraftSubject: null as any,
          replyDraftBody: null as any,
          queueState: currentThread.queueState || 'handoff',
          mode: currentThread.mode || 'handoff',
          owner: currentThread.owner || 'user'
        } ),
    };

    try {
      this.momentumThreadService.upsertThread( nextThread );
      await firstValueFrom( this.outreachApi.upsertMomentumThread( nextThread, {
        tenantId: this.tenantId,
        userId: this.userId,
        userEmail: this.firebaseUser?.email || undefined
      } ) );

      this.notificationService.show( 'Draft Saved', 'Draft saved back to Outbox for review.', 'success' );
      this.momentumDraftAction.emit( { action: 'saved', contactId } );
      if ( this.returnUrl ) {
        await this.router.navigateByUrl( this.returnUrl );
      }
    } catch ( error ) {
      this.logger.error( 'Failed to save momentum draft back to Outbox', error );
      this.notificationService.show( 'Save Failed', 'Unable to save this draft back to Outbox.', 'error' );
    } finally {
      this.isSavingMomentumDraft = false;
      this.message = undefined;
      this.triggerLoading( false );
      this.publishPageContext();
    }
  }

  async dismissMomentumDraftFromCompose (): Promise<void> {
    const contactId = String( this.preparedHandoff?.threadContext?.contactId || '' ).trim();
    const draftKind = String( this.preparedHandoff?.threadContext?.draftKind || 'outbound' ).trim().toLowerCase();

    if ( !contactId || this.isSavingMomentumDraft ) return;

    this.isSavingMomentumDraft = true;
    this.triggerLoading( true );
    this.message = 'Removing draft from review ...';

    const currentThread = this.momentumThreadService.getThreadByContactId( contactId ) || {} as MomentumThread;
    const nextThread: MomentumThread = draftKind === 'reply'
      ? {
        ...currentThread,
        contactId,
        replyDraftSubject: null as any,
        replyDraftBody: null as any,
        replyDraftPlaybook: null as any,
        replyDraftRationale: null as any,
        replyApprovalReason: '',
        replyRecommendedAction: 'needs_human',
        replyReviewedByUser: false,
        replyReviewedAt: null,
        replyReviewedByUserId: null as any,
        draftSubject: null as any,
        draftBody: null as any,
        lastAutomationNote: 'Draft rejected in Compose Email.'
      }
      : {
        ...currentThread,
        contactId,
        draftSubject: null as any,
        draftBody: null as any,
        replyDraftSubject: null as any,
        replyDraftBody: null as any,
        lastAutomationNote: 'Draft rejected in Compose Email.'
      };

    try {
      this.momentumThreadService.upsertThread( nextThread );
      await firstValueFrom( this.outreachApi.upsertMomentumThread( nextThread, {
        tenantId: this.tenantId,
        userId: this.userId,
        userEmail: this.firebaseUser?.email || undefined
      } ) );

      this.clearMomentumDraftReviewState();
      this.notificationService.show( 'Draft Removed', 'TODD removed this draft from the review queue.', 'success' );
      this.momentumDraftAction.emit( { action: 'dismissed', contactId } );
    } catch ( error ) {
      this.logger.error( 'Failed to dismiss momentum draft from Compose Email', error );
      this.notificationService.show( 'Dismiss Failed', 'Unable to remove this draft from review right now.', 'error' );
    } finally {
      this.isSavingMomentumDraft = false;
      this.message = undefined;
      this.triggerLoading( false );
      this.publishPageContext();
    }
  }

  private async saveSequenceStep (): Promise<void> {
    if ( !this.isSequenceEditMode || !this.campaignId || !this.sequenceStepId ) {
      return;
    }

    if ( this.isSavingSequenceStep ) {
      return;
    }

    const subject = String( this.emailForm.get( 'subject' )?.value || '' ).trim();
    const draftBody = String( this.emailContent || '' ).trim();
    const textBody = String( this.textOnly || '' ).trim();

    if ( !subject ) {
      this.notificationService.show( 'Missing Subject', 'Enter a subject before saving this step.', 'error' );
      return;
    }

    if ( !draftBody ) {
      this.notificationService.show( 'Missing Body', 'Enter email content before saving this step.', 'error' );
      return;
    }

    this.isSavingSequenceStep = true;
    this.triggerLoading( true );
    this.message = 'Saving campaign step ...';

    try {
      await firstValueFrom( this.outreachApi.updateSequenceStep( this.campaignId, this.sequenceStepId, {
        draftSubject: subject,
        draftBody,
        draftText: textBody,
        stepNumber: this.sequenceStepNumber ? Number( this.sequenceStepNumber ) : null,
        editedByUser: true,
        approvalStatus: 'pending',
        lastEditedAt: new Date().toISOString()
      }, {
        tenantId: this.tenantId,
        userId: this.userId,
        userEmail: this.firebaseUser?.email || undefined
      } ) );

      this.assistantBus.emitAssistantActivity( {
        feature: 'outreach',
        page: 'email-create',
        route: this.router.url,
        mode: 'edit',
        action: 'campaign_sequence_step_saved',
        summary: {
          campaignId: this.campaignId,
          stepId: this.sequenceStepId,
          stepNumber: this.sequenceStepNumber || '',
          subject
        }
      } );

      this.publishPageContext();
      this.notificationService.show( 'Step Saved', 'Campaign step updated and sent back for approval.', 'success' );

      if ( this.returnUrl ) {
        this.router.navigateByUrl( this.returnUrl );
      }
    } catch ( error ) {
      this.logger.error( 'Failed to save campaign sequence step', error );
      this.notificationService.show( 'Save Failed', 'Unable to save this campaign step.', 'error' );
    } finally {
      this.isSavingSequenceStep = false;
      this.message = undefined;
      this.triggerLoading( false );
      this.publishPageContext();
    }
  }

  private sendItAlready ( emailData: any ): void {
    if ( this.sendEmailSubscription )
      this.sendEmailSubscription.unsubscribe();

    this.sendEmailSubscription = this.emailService.sendEmail( emailData, this.tenantId, this.userId ).subscribe( {
      next: response => {
        this.addEmailToContact( emailData.html, emailData.subject );
        const selectedContactId = this.selectedContact?.id ? String( this.selectedContact.id ) : '';

        if ( selectedContactId ) {
          if ( emailData.signalEngineEnabled ) {
            const thread = this.momentumThreadService.createThreadFromSentEmail( {
              contactId: selectedContactId,
              emailAddress: String( emailData.to || '' ).trim(),
              contactName: `${this.selectedContact?.firstName || ''} ${this.selectedContact?.lastName || ''}`.trim(),
              companyName: this.selectedContact?.company?.name || '',
              senderEmail: String( emailData?.from?.email || emailData?.from || '' ).trim(),
              senderName: String( emailData?.from?.name || this.getSenderDisplayName() || '' ).trim(),
              actionId: String( emailData?.actionId || '' ).trim() || null,
              planId: String( emailData?.planId || '' ).trim() || null,
              strategyId: String( emailData?.strategyId || '' ).trim() || null,
              segmentId: String( emailData?.segmentId || '' ).trim() || null,
              angleId: String( emailData?.angleId || '' ).trim() || null,
              subject: emailData.subject,
              origin: emailData.signalOrigin,
              signalEngineEnabled: true,
              owner: 'todd',
              mode: 'draft_only'
            } );
            const draftKind = String( this.preparedHandoff?.threadContext?.draftKind || 'outbound' ).trim().toLowerCase();
            const nowIso = new Date().toISOString();
            const resolvedThread: MomentumThread = draftKind === 'reply'
              ? {
                ...thread,
                owner: 'user',
                mode: 'handoff',
                isMomentumActive: false,
                queueState: 'handoff',
                nextActionType: 'handoff_to_user',
                nextActionAt: undefined,
                scheduledAt: undefined,
                lastSentAt: nowIso,
                lastSentReplyAt: nowIso,
                lastSentReplySubject: String( emailData.subject || '' ).trim(),
                lastSentReplyBody: String( emailData.html || '' ).trim(),
                replyDraftSubject: null as any,
                replyDraftBody: null as any,
                replyDraftPlaybook: null as any,
                replyDraftRationale: null as any,
                replyReviewedByUser: false,
                replyReviewedAt: null,
                replyReviewedByUserId: null as any,
                draftSubject: null as any,
                draftBody: null as any,
                needsHumanEdit: false,
                nextActionReason: 'Approved reply sent from Compose Email. TODD is waiting for the next real signal.',
                lastAutomationNote: 'Compose Email sent the reviewed reply and cleared the pending draft.'
              }
              : {
                ...thread,
                draftSubject: null as any,
                draftBody: null as any,
                replyDraftSubject: null as any,
                replyDraftBody: null as any,
                needsHumanEdit: false,
                lastAutomationNote: 'Compose Email sent the reviewed draft and restarted the thread cleanly.'
              };

            this.momentumThreadService.upsertThread( resolvedThread );
            firstValueFrom( this.outreachApi.upsertMomentumThread( resolvedThread, {
              tenantId: this.tenantId,
              userId: this.userId,
              userEmail: this.firebaseUser?.email || undefined
            } ) ).catch( error => {
              this.logger.warn( 'Momentum thread sync failed after send', error );
            } );
          } else {
            this.momentumThreadService.takeOverThread(
              selectedContactId,
              'A manual email was sent with Signal Engine turned off.'
            );

            const manualThread = this.momentumThreadService.getThreadByContactId( selectedContactId );
            if ( manualThread ) {
              firstValueFrom( this.outreachApi.upsertMomentumThread( manualThread, {
                tenantId: this.tenantId,
                userId: this.userId,
                userEmail: this.firebaseUser?.email || undefined
              } ) ).catch( error => {
                this.logger.warn( 'Momentum thread sync failed after manual takeover', error );
              } );
            }
          }
        } else {
          this.logger.warn( '[Signal Engine] Email sent but no selected contact id was available, so no thread was created.' );
        }
        this.message = undefined;
        this.emailForm.reset();
        this.emailEditor.clearEditor();
        const momentumContactId = String( this.preparedHandoff?.threadContext?.contactId || '' ).trim();
        if ( momentumContactId ) {
          this.momentumDraftAction.emit( { action: 'sent', contactId: momentumContactId } );
        }
        this.publishPageContext();
        this.soundService.playSound( "alert" );
        const sentToAddress = String( emailData.to || '' ).trim();
        this.notificationService.show(
          "Email Sent!",
          sentToAddress ? `Sent to ${sentToAddress}.` : 'Your email was sent.',
          'success'
        );
      },
      error: error => {
        this.logger.error( 'Error sending email:', error );
        this.message = undefined;
        this.publishPageContext();
        this.soundService.playSound( "error" );
        this.notificationService.show( "Email Send Failure", JSON.stringify( error ), 'error' );
      }
    } );

    if ( this.selectedContact && this.selectedContact.id ) {
      const lastContacted = new Date().toISOString();
      this.selectedContact.lastContacted = lastContacted;
      this.logSentEmailActivity( this.selectedContact.id, emailData.subject, emailData.html, lastContacted );
    }
    setTimeout( () => {
      this.selectedContact = null;
      this.contactService.resetContact();
      this.emailService.clearDrafts();
      this.useTemplateChange;
      this.triggerLoading( false );
      this.publishPageContext();
      this.router.navigate( ['/compose-email'] );

    }, 3000 );

  }

  private resolveSendSignalOrigin ( fallbackOrigin: 'campaign' | 'composer' ): string {
    const normalizedOverride = String( this.composerSignalOrigin || '' ).trim().toLowerCase();
    return normalizedOverride || fallbackOrigin;
  }

  private buildSingleEmailPayload ( options: { useAdvertisementPrefix?: boolean } = {} ): any | null {
    if ( !this.sender ) {
      this.notificationService.show( 'Missing sender', 'TODD needs a sender profile before it can build this email.', 'error' );
      return null;
    }

    const fromEmail = this.resolveComposerSenderEmail();

    if ( !fromEmail ) {
      this.notificationService.show( 'Missing sender email', 'Configure the sender email before sending or testing this draft.', 'error' );
      return null;
    }

    const subjectValue = String( this.emailForm.value.subject || '' ).trim();
    if ( !subjectValue ) {
      this.notificationService.show( 'Missing Subject', 'Enter a subject before sending this draft.', 'error' );
      return null;
    }

    const signature = this.sender.signature ? this.sender.signature : `${this.sender.firstName} ${this.sender.lastName}`;

    let textContent = this.textOnly || "";
    if ( textContent.includes( '{{signature}}' ) ) {
      textContent = textContent.replace( '{{signature}}', signature );
    } else if ( !this.endsWithEquivalentSignature( textContent, signature ) ) {
      textContent += `\n\n${signature}`;
    }

    let htmlContent = this.emailContent || "";
    if ( htmlContent.includes( '{{signature}}' ) ) {
      htmlContent = htmlContent.replace( '{{signature}}', signature );
    } else if ( !this.endsWithEquivalentSignature( htmlContent, signature ) ) {
      htmlContent += `<br><br>${signature}`;
    }

    htmlContent += this.footer;
    htmlContent = this.getReplacements( htmlContent, signature );

    return {
      to: this.emailForm.value.to,
      contactId: this.selectedContact?.id || '',
      contactName: this.selectedContact ? `${this.selectedContact.firstName}` : 'No contact name',
      signalEngineEnabled: this.signalEngineEnabled,
      actionId: this.composerActionId,
      signalOrigin: this.resolveSendSignalOrigin( 'composer' ),
      sourceSystem: this.resolveSendSourceSystem(),
      planId: this.composerPlanId,
      strategyId: this.composerStrategyId,
      segmentId: this.composerSegmentId,
      angleId: this.composerAngleId,
      cc: this.emailForm.value.cc,
      bcc: this.emailForm.value.bcc,
      subject: options.useAdvertisementPrefix && this.isAdvertisement && !subjectValue.startsWith( 'ADV:' )
        ? `ADV: ${subjectValue}`
        : subjectValue,
      text: textContent,
      html: htmlContent,
      from: {
        email: fromEmail,
        name: this.getSenderDisplayName()
      }
    };
  }

  private resolveComposerSenderEmail (): string {
    return String(
      ( this.sender?.emailAddresses &&
        this.sender.emailAddresses.length > 0 &&
        this.sender.emailAddresses[0]?.emailAddress ) ||
      this.sender?.email ||
      ''
    ).trim();
  }

  private resolveSendSourceSystem (): string | undefined {
    const normalized = String( this.composerSourceSystem || '' ).trim().toLowerCase();
    return normalized || undefined;
  }

  logSentEmailActivity ( contactId: string, subject: string, html: string, lastContacted: string ): void {
    firstValueFrom( this.outreachApi.logSentEmail( contactId, {
      subject,
      html,
      lastContacted,
      sentConfirmed: true
    }, {
      tenantId: this.tenantId,
      userId: this.userId,
      userEmail: this.firebaseUser?.email || undefined
    } ) )
      .then( response => {
        this.logger.info( 'Sent email activity logged successfully', response?.data );
      } )
      .catch( error => {
        this.logger.error( 'Failed to log sent email activity:', error );
      } );
  }

  addEmailToContact ( text: string, subject: string ): void {
    this.logger.info( "Email send handled by backend activity logger", { subject, contactId: this.selectedContact?.id, size: text?.length || 0 } );
  }

  private clearMomentumDraftReviewState (): void {
    this.preparedHandoff = null;
    this.queue = [];
    this.contactService.clearQueue();
    this.selectedContact = null;
    this.contactService.resetContact();
    this.showSuggestions = false;
    this.emailForm.patchValue( {
      to: '',
      cc: '',
      bcc: '',
      subject: '',
      campaignName: ''
    } );
    this.emailForm.get( 'to' )?.markAsUntouched();
    this.emailForm.get( 'subject' )?.markAsUntouched();
    this.emailContent = '';
    this.onTextOnlyContentChange( '' );
    this.cdr.detectChanges();
    this.emailEditor?.clearEditor();
  }


  getReplacements ( htmlContent: string, signature: string ): string {
    htmlContent = htmlContent.replaceAll( '{{email}}',
      ( this.sender && this.sender.email )
        ? this.sender.email
        : ( this.sender && this.sender.emailAddresses && this.sender.emailAddresses[0] && this.sender.emailAddresses[0].emailAddress )
          ? this.sender.emailAddresses[0].emailAddress
          : ''
    )
      .replaceAll( '{{email2}}',
        ( this.sender && this.sender.emailAddresses && this.sender.emailAddresses[1] && this.sender.emailAddresses[1].emailAddress )
          ? this.sender.emailAddresses[1].emailAddress
          : ''
      )
      .replaceAll( '{{senderFirstName}}', ( this.sender && this.sender.firstName ) ? this.sender.firstName : '' )
      .replaceAll( '{{senderLastName}}', ( this.sender && this.sender.lastName ) ? this.sender.lastName : '' )
      .replaceAll( '{{signature}}', ( signature ) ? signature : '' )
      .replaceAll( '{{senderCompanyName}}', ( this.sender && this.sender.company && this.sender.company.name ) ? this.sender.company.name : '' )
      .replaceAll( '{{ps}}', this.emailForm.get( 'ps' )?.value || '' )
      .replaceAll( '{{senderPhone}}', this.formatPhoneNumber( ( this.sender && this.sender.phoneNumbers && this.sender.phoneNumbers[0] && this.sender.phoneNumbers[0].phoneNumber ) ? this.formatPhoneNumber( this.sender.phoneNumbers[0].phoneNumber ) : '' ) );
    return htmlContent;
  }

  formatPhoneNumber ( phoneNumber: string ): string {
    const cleaned = phoneNumber.replace( /\D+/g, '' );
    if ( cleaned.length === 10 ) {
      return `${cleaned.slice( 0, 3 )}.${cleaned.slice( 3, 6 )}.${cleaned.slice( 6 )}`;
    } else {
      return phoneNumber;
    }
  }



  public get selectedContact (): Contact | null {
    return this._selectedContact;
  }
  public set selectedContact ( value: Contact | null ) {
    this._selectedContact = value;
    this.publishPageContext();
  }

  private publishPageContext (): void {
    const fallbackSelectedContact = this.resolveHandoffSelectedContact( this.preparedHandoff );
    const effectiveSelectedContact = this.selectedContact || fallbackSelectedContact;
    const effectiveSelectedContactName = effectiveSelectedContact
      ? `${effectiveSelectedContact.firstName || ''} ${effectiveSelectedContact.lastName || ''}`.trim()
      : '';
    const effectiveRecipientEmail = String(
      this.emailForm.get( 'to' )?.value
      || effectiveSelectedContact?.email
      || effectiveSelectedContact?.emailAddresses?.[0]?.emailAddress
      || this.preparedHandoff?.threadContext?.recipientEmail
      || ''
    ).trim();

    this.assistantBus.setPageContext( {
      feature: 'outreach',
      page: 'email-composer',
      route: this.router.url,
      mode: 'create',
      title: this.isSequenceEditMode ? 'Campaign Step Editor' : 'Email Composer',
      description: this.isSequenceEditMode
        ? 'Edit a campaign sequence step draft, save it back to the campaign, and return for approval.'
        : this.canSaveMomentumDraftToOutbox()
          ? 'Refine a Signal Engine draft in Compose Email. Four actions are available and they are NOT interchangeable: '
            + '"Send Test" delivers immediately to the user\'s own inbox as a preview only - it never touches the real '
            + 'recipient, the send queue, or the contact\'s momentum thread/history. '
            + '"Dismiss Draft" clears this draft from the underlying momentum thread (a real, persisted change) but is '
            + 'reversible - it does not stop or block the contact, so a new draft can be generated for them again later. '
            + '"Send" delivers directly to the real recipient with no further human approval step - it is scheduled via '
            + 'business-hours pacing (not always literally instant) but nothing else needs to happen for it to go out. '
            + '"Save" does NOT send anything - it only saves the edited draft back onto the momentum thread in its '
            + 'current state and returns to Signal Engine, where a human must still separately approve and send it.'
          : 'Prepare a direct email or queue-backed campaign draft with sender, recipient, and Signal Engine context.',
      allowedActions: this.isSequenceEditMode
        ? [
          'edit_subject',
          'edit_body',
          'save_sequence_step',
          'return_to_campaign'
        ]
        : this.canSaveMomentumDraftToOutbox()
          ? [
            'edit_subject',
            'edit_body',
            'send_test_email',
            'dismiss_draft',
            'send_now',
            'save_draft_to_outbox',
            'return_to_outbox'
          ]
          : [
            'select_recipient',
            'edit_subject',
            'edit_body',
            'queue_campaign',
            'send_email'
          ],
      selectedEntityType: this.isSequenceEditMode
        ? 'campaign_sequence_step'
        : ( effectiveSelectedContact ? 'contact' : ( this.queue.length > 0 ? 'campaign_queue' : 'email_draft' ) ),
      selectedEntityId: this.isSequenceEditMode
        ? ( this.sequenceStepId || '' )
        : ( effectiveSelectedContact?.id || '' ),
      summary: {
        queueCount: this.queue.length,
        contactsCount: this.contacts.length,
        hasSelectedContact: !!effectiveSelectedContact,
        hasSender: !!this.sender,
        hasRecipient: !!effectiveRecipientEmail,
        hasSubject: !!String( this.emailForm.get( 'subject' )?.value || '' ).trim(),
        hasHtmlBody: !!String( this.emailContent || '' ).trim(),
        hasTextBody: !!String( this.textOnly || '' ).trim(),
        signalEngineEnabled: this.signalEngineEnabled,
        queueMomentumCount: this.queueMomentumCount,
        showMomentumInterrupt: this.showMomentumInterrupt,
        hasFollowupReason: !!String( this.reason || '' ).trim(),
        isSequenceEditMode: this.isSequenceEditMode,
        campaignId: this.campaignId || '',
        stepId: this.sequenceStepId || '',
        stepNumber: this.sequenceStepNumber || ''
      },
      dataPreview: {
        to: effectiveRecipientEmail,
        subject: this.emailForm.get( 'subject' )?.value || '',
        campaignName: this.emailForm.get( 'campaignName' )?.value || '',
        selectedContactName: effectiveSelectedContactName,
        senderName: this.getSenderDisplayName(),
        followupReason: String( this.reason || '' ).trim(),
        returnUrl: this.returnUrl || '',
        threadCampaignId: String( this.preparedHandoff?.threadContext?.campaignId || '' ).trim(),
        threadCampaignName: String(
          this.preparedHandoff?.threadContext?.campaignName
          || this.preparedHandoff?.emailData?.campaignName
          || ''
        ).trim()
      },
      composerContext: {
        recipientEmail: effectiveRecipientEmail,
        selectedContactId: effectiveSelectedContact?.id || '',
        selectedContactName: effectiveSelectedContactName,
        selectedContactEmail: String(
          effectiveSelectedContact?.email
          || effectiveSelectedContact?.emailAddresses?.[0]?.emailAddress
          || ''
        ).trim(),
        selectedCompanyName: String( effectiveSelectedContact?.company?.name || '' ).trim(),
        senderName: this.getSenderDisplayName(),
        currentSubject: String( this.emailForm.get( 'subject' )?.value || '' ).trim(),
        currentHtml: String( this.emailContent || '' ).trim(),
        currentText: String( this.textOnly || '' ).trim(),
        campaignName: String( this.emailForm.get( 'campaignName' )?.value || '' ).trim(),
        threadContactId: String( this.preparedHandoff?.threadContext?.contactId || '' ).trim(),
        threadId: String( this.preparedHandoff?.threadContext?.threadId || '' ).trim(),
        threadCampaignId: String( this.preparedHandoff?.threadContext?.campaignId || '' ).trim(),
        threadCampaignName: String(
          this.preparedHandoff?.threadContext?.campaignName
          || this.preparedHandoff?.emailData?.campaignName
          || ''
        ).trim(),
        threadDraftKind: String( this.preparedHandoff?.threadContext?.draftKind || '' ).trim(),
        useTemplate: this.useTemplateEnabled,
        hasDraftContent: !!String( this.emailForm.get( 'subject' )?.value || '' ).trim()
          || !!String( this.emailContent || '' ).trim()
          || !!String( this.textOnly || '' ).trim()
      }
    } );
  }

  private resolveHandoffSelectedContact ( handoff: ComposerHandoff | null | undefined ): Contact | null {
    const handoffContact = Array.isArray( handoff?.selectedContacts ) ? handoff?.selectedContacts?.[0] : null;
    if ( handoffContact ) {
      return handoffContact;
    }

    const recipientEmail = String( handoff?.threadContext?.recipientEmail || '' ).trim();
    const contactId = String( handoff?.threadContext?.contactId || '' ).trim();
    const rawName = String( handoff?.emailData?.contactName || '' ).trim();
    const [firstName = '', ...restName] = rawName.split( /\s+/ ).filter( Boolean );
    const companyName = String( handoff?.threadContext?.companyName || '' ).trim();

    if ( !recipientEmail && !contactId && !rawName && !companyName ) {
      return null;
    }

    return {
      id: contactId || recipientEmail || rawName,
      firstName,
      lastName: restName.join( ' ' ),
      email: recipientEmail,
      emailAddresses: recipientEmail
        ? [{ emailAddress: recipientEmail, emailAddressType: 'primary', blocked: false }]
        : [],
      company: {
        name: companyName
      }
    } as Contact;
  }

  showContactInfo ( contact: Contact, event: MouseEvent ): void {
    this.hoveredContact = this.selectedContact;
    const offsetY = -120;
    const offsetX = 10;
    this.hoverPosition = {
      x: event.clientX + offsetX,
      y: event.clientY - offsetY
    };
  }

  hideContactInfo (): void {
    this.hoveredContact = null;
  }


}
