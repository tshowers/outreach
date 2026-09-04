import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { TopDogComponent } from '../../shared/top-dog/top-dog.component';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { EmailService } from '../../services/email.service';
import { LoggerService } from '../../services/logger.service';
import { OutreachNomenclatureService } from '../../services/outreach-nomenclature.service';
import { OutreachApiService } from '../../services/outreach-api.service';
import { SoundService } from '../../services/sound.service';
import { Contact } from '../../models/contact.model';
import { EmailCreateComponent } from './email-create/email-create.component';

import { PreloaderComponent } from '../../shared/preloader/preloader.component';
import { ToddTipComponent } from '../../shared/todd-tip/todd-tip.component';
import { OutreachTipService } from '../../services/outreach-tip.service';
import { EmailSendingStatusComponent } from '../../shared/email-sending-status/email-sending-status.component';
import { OutreachAssistantSignalService } from '../../services/outreach-assistant-signal.service';
import { OutreachPageActionsService } from '../../services/outreach-page-actions.service';
import { buildOutreachPageActions } from '../../shared/utils/page-action-presets';

/** Ported near-verbatim from features/email/pages/email-composer-parent/. */
@Component( {
  selector: 'app-email-composer-parent',
  standalone: true,
  imports: [CommonModule, EmailCreateComponent,
    PreloaderComponent,
    ToddTipComponent,
    EmailSendingStatusComponent
  ],
  templateUrl: './email-composer-parent.component.html',
  styleUrl: './email-composer-parent.component.css'
} )
export class EmailComposerParentComponent extends TopDogComponent implements OnInit, OnDestroy {
  private readonly pageActionsService = inject( OutreachPageActionsService );
  @ViewChild( EmailCreateComponent ) emailCreateComponent?: EmailCreateComponent;

  contactDetails!: Contact;
  isSmallScreen: boolean = window.innerWidth < 992;
  itemListClass: string = 'col-12';
  itemDetailClass: string = 'col-12';
  isSplitView: boolean = false;
  sender!: Contact;
  selectedContact: Contact | null = null;
  to!: string;
  subject!: string;
  campaignName!: string;
  text!: string;
  textOnly: string = '';
  ps!: string;
  getEmailConfigSubscription!: Subscription;
  useTemplate!: boolean;

  drafts!: any;
  outreachAccess: any = null;
  showRegisterEmailWarning = false;
  private engagementActionSubscription?: Subscription;

  emailTipText: string = '';
  readonly signalEngineStates = [
    {
      label: 'Unopened',
      diagnosis: 'Subject likely missed',
      action: 'TODD rewrites the subject around the contact and company context.'
    },
    {
      label: 'Opened',
      diagnosis: 'Subject worked, body missed',
      action: 'TODD keeps the subject logic and refactors the body with a simpler ask.'
    },
    {
      label: 'Clicked',
      diagnosis: 'Interest is specific',
      action: 'TODD follows the clicked topic and makes the next step more direct.'
    }
  ];

  constructor (
    protected override authService: OutreachAuthService,
    protected override soundService: SoundService,
    protected override logger: LoggerService,
    protected override router: Router,
    protected override nomenclatureService: OutreachNomenclatureService,
    private emailService: EmailService,
    private outreachApi: OutreachApiService,
    private tipService: OutreachTipService,
    private assistantBus: OutreachAssistantSignalService
  ) {
    super( authService, soundService, logger, router, nomenclatureService );
    this.updateClasses();
  }

  override ngOnInit (): void {
    super.ngOnInit();
    this.publishPageContext();
    this.bindEngagementActions();

    this.readySubscription = this.ready$.subscribe( ( isReady ) => {
      if ( isReady ) this.setupPage();
      this.emailTipText = this.tipService.getRandomTipText( 'email', 'compose-email' );

    } );

  }

  override ngOnDestroy (): void {
    super.ngOnDestroy();
    this.engagementActionSubscription?.unsubscribe();
    this.assistantBus.clearPageContext();
    this.pageActionsService.clearPageActions( 'email-composer-parent' );
  }
  setupPage () {
    this.drafts = this.emailService.getCampaignDrafts();
    void this.loadOutreachAccess();
    this.assistantBus.emitAssistantActivity( {
      feature: 'outreach',
      page: 'email-composer',
      route: this.router.url,
      mode: 'create',
      action: 'email_composer_opened',
      summary: {
        draftCount: Object.keys( this.drafts?.drafts || {} ).length
      }
    } );
    this.publishPageContext();

  }

  setIsLoading ( loading: boolean ) {
    this.isLoading = loading;
    this.publishPageContext();
  }

  updateClasses () {
    if ( this.isSmallScreen ) {
      this.itemListClass = 'col-12';
      this.itemDetailClass = 'd-none';
    } else {
      this.itemListClass = 'col-lg-6';
      this.itemDetailClass = 'col-lg-6';
    }
  }

  shouldShowMessage ( key: string ): boolean {
    const count = Number( localStorage.getItem( key ) || '0' );
    return count < 5;
  }

  incrementMessageCount ( key: string ): void {
    const current = Number( localStorage.getItem( key ) || '0' );
    localStorage.setItem( key, String( current + 1 ) );
  }

  private async loadOutreachAccess (): Promise<void> {
    try {
      const response = await firstValueFrom( this.outreachApi.getOutreachAccess( {
        tenantId: this.tenantId || undefined,
        userId: this.userId || undefined,
        userEmail: this.firebaseUser?.email || undefined
      } ) );
      this.applyOutreachAccessState( response?.data || null );
    } catch ( error ) {
      this.logger.warn( '[Email Composer] Unable to load outreach access state.', error );
      this.applyOutreachAccessState( null );
    }
  }

  private applyOutreachAccessState ( access: any ): void {
    this.outreachAccess = access || null;

    const shouldWarn = !!access
      && access.internal !== true
      && access.internalTenantOverride !== true
      && access.approvedSender !== true
      && access.tenantProvisionedSenderMatch !== true;

    this.showRegisterEmailWarning = shouldWarn && this.shouldShowMessage( 'registerEmailWarning' );
    if ( this.showRegisterEmailWarning ) {
      this.incrementMessageCount( 'registerEmailWarning' );
    }
    this.publishPageContext();
  }

  onUseTemplate ( value: boolean ) {
    this.useTemplate = value;
    this.assistantBus.emitAssistantActivity( {
      feature: 'outreach',
      page: 'email-composer',
      route: this.router.url,
      mode: 'create',
      action: 'email_template_mode_changed',
      summary: {
        useTemplate: this.useTemplate
      }
    } );
    this.publishPageContext();
  }

  updateTo ( value: string ) {
    this.to = value;
    this.publishPageContext();
  }

  handleMomentumDraftAction ( event: { action: 'loaded' | 'saved' | 'dismissed' | 'sent'; contactId?: string; } ): void {
    if ( !event ) return;

    if ( event.action === 'dismissed' || event.action === 'sent' ) {
      this.subject = '';
      this.text = '';
      this.textOnly = '';
    }

    if ( event.action === 'saved' || event.action === 'dismissed' || event.action === 'sent' ) {
      this.publishPageContext();
    }
  }

  updateSubject ( value: string ) {
    this.subject = value;
    this.publishPageContext();
  }

  updatePS ( value: string ) {
    this.ps = value;
    this.publishPageContext();
  }

  updateText ( value: string ) {
    this.text = value;
    this.publishPageContext();
  }

  updateTextOnly ( value: string ) {
    this.textOnly = value;
    this.publishPageContext();
  }

  onSenderInfo ( sender: Contact ) {
    this.sender = sender;
    this.assistantBus.emitAssistantActivity( {
      feature: 'outreach',
      page: 'email-composer',
      route: this.router.url,
      mode: 'create',
      action: 'email_sender_loaded',
      summary: {
        senderId: this.sender?.id || '',
        senderName: `${this.sender?.firstName || ''} ${this.sender?.lastName || ''}`.trim()
      }
    } );
    this.publishPageContext();
  }

  get signalEngineSummary (): string {
    return 'If Signal Engine is on, TODD keeps working after the first email goes out.';
  }

  private publishPageContext (): void {
    const existingContext = this.assistantBus.getPageContextSnapshot();
    const existingComposerContext = existingContext?.page === 'email-composer'
      ? existingContext.composerContext || null
      : null;
    const mergedSummary = {
      ...( existingContext?.summary || {} ),
      isLoading: this.isLoading,
      hasRecipient: !!String( this.to || '' ).trim(),
      hasSubject: !!String( this.subject || '' ).trim(),
      hasBody: !!String( this.text || this.textOnly || '' ).trim(),
      hasPS: !!String( this.ps || '' ).trim(),
      useTemplate: !!this.useTemplate,
      hasSender: !!this.sender,
      senderApproved: this.outreachAccess?.approvedSender === true || this.outreachAccess?.tenantProvisionedSenderMatch === true,
      senderApprovalWarningVisible: this.showRegisterEmailWarning,
      draftCount: Object.keys( this.drafts?.drafts || {} ).length
    };
    const mergedPreview = {
      ...( existingContext?.dataPreview || {} ),
      to: this.to || existingContext?.dataPreview?.['to'] || '',
      subject: this.subject || existingContext?.dataPreview?.['subject'] || '',
      senderName: `${this.sender?.firstName || ''} ${this.sender?.lastName || ''}`.trim() || existingContext?.dataPreview?.['senderName'] || '',
      campaignName: this.campaignName || existingContext?.dataPreview?.['campaignName'] || ''
    };

    this.pageActionsService.setPageActions( {
      pageId: 'email-composer-parent',
      context: {
        pageId: 'email-composer-parent',
        feature: 'outreach'
      },
      actions: buildOutreachPageActions( {
        includeCatalyst: true
      } )
    } );
    this.assistantBus.setPageContext( {
      feature: 'outreach',
      page: 'email-composer',
      route: this.router.url,
      mode: 'create',
      title: 'Email Composer',
      description: existingContext?.description || 'Draft a message, set the sender, and prepare a first touch that Signal Engine can continue after send.',
      allowedActions: [
        'draft_email',
        'set_recipient',
        'set_subject',
        'toggle_template_mode',
        'send_email'
      ],
      selectedEntityType: existingComposerContext ? ( existingContext?.selectedEntityType || 'email_draft' ) : 'email_draft',
      selectedEntityId: existingComposerContext ? ( existingContext?.selectedEntityId || '' ) : '',
      summary: mergedSummary,
      dataPreview: mergedPreview,
      composerContext: existingComposerContext || undefined
    } );
  }

  private bindEngagementActions (): void {
    this.engagementActionSubscription = this.assistantBus.engagementActionRequest$.subscribe( request => {
      if ( !request || this.router.url.split( '?' )[0] !== '/compose-email' ) {
        return;
      }

      switch ( request.action ) {
        case 'send_email':
          void this.emailCreateComponent?.handleSendNowClick();
          break;
        case 'queue_campaign':
        case 'save_sequence_step':
        case 'save_draft_to_outbox':
          void this.emailCreateComponent?.handleComposerSubmit();
          break;
        case 'return_to_campaign':
        case 'return_to_outbox':
          this.emailCreateComponent?.handleComposerBack();
          break;
        case 'open_outbox':
          void this.router.navigate( ['/signal-engine'] );
          break;
        case 'open_outreach':
          void this.router.navigate( ['/app'] );
          break;
        default:
          break;
      }
    } );
  }

}
