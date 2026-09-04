import { Component, Input, OnInit, OnDestroy, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoggerService } from '../../../services/logger.service';
import { OutreachInsightService } from '../../../services/outreach-insight.service';
import { Email } from '../../../models/email.model';
import { firstValueFrom, Subscription } from 'rxjs';
import { EmailService, EmailDraftingStageOption, EmailDraftingToneOption } from '../../../services/email.service';
import { OutreachAuthService } from '../../../services/outreach-auth.service';
import { OutreachDataService } from '../../../services/outreach-data.service';
import { OutreachNotificationService } from '../../../services/outreach-notification.service';
import { Address, Contact } from '../../../models/contact.model';
import { FormsModule } from '@angular/forms';
import { OutreachAssistantSignalService } from '../../../services/outreach-assistant-signal.service';
import { OutreachApiService } from '../../../services/outreach-api.service';
import { createThreadFromSentEmail } from '../../../shared/utils/momentum-thread-builder.util';

export type EmailerContactLite = Contact;

export interface AssistantDraftPayload {
  subject?: string;
  html?: string;
  body?: string;
}

export interface CatalystAssistantContext {
  page: 'catalyst';
  hasPreview: boolean;
  isRunning: boolean;
  queueComplete: boolean;
  remainingCount: number;
  skippedCount: number;
  removedCount: number;
  useTemplate: boolean;
  templateHtml: string;
  templateSubject: string;
  hasCustomTemplateSubject: boolean;
  previewSubject: string;
  previewHtml: string;
  testEmailAddress: string;
  currentContactId: string;
  currentContactName: string;
  currentCompanyName: string;
  currentContactEmail: string;
}

export interface CatalystAssistantDraftPayload extends AssistantDraftPayload { }
export interface CatalystRunContext {
  name?: string;
  source?: 'stale_queue' | 'blocked_handoff' | 'manual' | string;
  includeLeadVaultContacts?: boolean;
}

/**
 * Ported from features/email/components/emailer/ (1,969 lines - the
 * second-largest component in this extraction after EmailCreateComponent).
 * Real substitutions:
 *  - UserService.getLoggedInContactInfo() -> OutreachDataService.getContact
 *    (tenantId, userId), the "read my own contact doc" pattern used
 *    elsewhere in this app.
 *  - DataService.updateContact(contact, userId) -> OutreachDataService
 *    .updateContact(tenantId, contact.id, contact).
 *  - OpenAIService.contactInsight/getTemplateTokenAssistance ->
 *    OutreachInsightService (two-method trimmed copy).
 *  - MomentumThreadService.createThreadFromSentEmail (a stateful service
 *    method that read/wrote a localStorage thread cache this app doesn't
 *    carry) -> a pure createThreadFromSentEmail() utility function that
 *    builds the same MomentumThread object assuming no prior local
 *    thread exists (which was always true here anyway, since nothing in
 *    this extraction populates that cache). The real, load-bearing part -
 *    POSTing the built thread to the backend via
 *    OutreachApiService.upsertMomentumThread - is unchanged.
 */
@Component( {
  selector: 'app-emailer',
  standalone: true,
  imports: [CommonModule, FormsModule,],
  templateUrl: './emailer.component.html',
  styleUrl: './emailer.component.css'
} )
export class EmailerComponent implements OnInit, OnDestroy, AfterViewInit {
  private static readonly MAX_EMAIL_HTML_BYTES = 256 * 1024;


  @Input() contacts: EmailerContactLite[] = [];
  @Input() blockedDraftReason = '';
  @Input() beforeQueueStart: (() => Promise<EmailerContactLite[] | null>) | null = null;
  @Input() runContext: CatalystRunContext | null = null;
  @Output() emailSent = new EventEmitter<string>();
  @Output() assistantContextChange = new EventEmitter<CatalystAssistantContext>();

  userId!: any;
  tenantId!: any;
  showPreview = false;
  stopSending = false;
  isloading = false;
  contactInsight: string = '';

  autoRun = false;
  autoRunPauseRequested = false;

  emailBody = '';
  emailTones: EmailDraftingToneOption[] = [];
  emailCampaignStages: EmailDraftingStageOption[] = [];
  subject = '';
  selectedTone!: string;
  @Input() sender!: Contact;
  sendSubscription!: Subscription;
  getUserSubscription!: Subscription;
  loggedInSubscription!: Subscription;
  tenantSubscription!: Subscription;
  openAISubscription!: Subscription;
  metadataSubscription!: Subscription;

  private sendTimeoutHandles: any[] = [];

  showInsight = false;
  useTemplate = false;
  templateHtml = '';
  templateSubject = '';
  originalTemplateHtml = '';

  templateTokensDetected: string[] = [];
  templateTokenDebug: any = null;
  templateError = '';

  private rawHtmlTokens = new Set<string>( ['signature', 'content'] );

  private bulkQueue: EmailerContactLite[] = [];
  private bulkIsRunning = false;
  private bulkCurrentContact: EmailerContactLite | null = null;
  private initialQueueSnapshot: EmailerContactLite[] = [];
  private currentCatalystRunId = '';
  private currentCatalystRunName = '';
  private currentCatalystRunFinalized = false;
  skippedContacts: EmailerContactLite[] = [];
  removedContacts: EmailerContactLite[] = [];
  queueComplete = false;

  get currentContact (): EmailerContactLite | null {
    return this.bulkCurrentContact;
  }

  private getSenderDisplayName (): string {
    const fullName = `${this.sender?.firstName || ''} ${this.sender?.lastName || ''}`.replace( /\s+/g, ' ' ).trim();
    if ( fullName && fullName.toLowerCase() !== 'todd' ) {
      return fullName;
    }

    const displayName = String( ( this.sender as any )?.displayName || '' ).replace( /\s+/g, ' ' ).trim();
    if ( displayName && displayName.toLowerCase() !== 'todd' ) {
      return displayName;
    }

    const senderEmail =
      ( this.sender?.emailAddresses &&
        this.sender.emailAddresses.length > 0 &&
        this.sender.emailAddresses[0]?.emailAddress ) ||
      ( this.sender as any )?.email ||
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

  pendingEmail!: Email;
  pendingContact!: EmailerContactLite;
  previewTo!: string;
  previewSubject!: string;
  previewHtml!: string;

  testEmailAddress = '';
  isSendingTest = false;
  public currentAssistantContext: CatalystAssistantContext | null = null;
  lastSignalEngineMessage = '';

  @ViewChild( 'previewFrame', { static: false } )
  previewFrame?: ElementRef<HTMLIFrameElement>;

  debugRawPreview = false;


  constructor (
    private logger: LoggerService,
    private assistantBus: OutreachAssistantSignalService,
    private notificationService: OutreachNotificationService,
    private insightService: OutreachInsightService,
    private emailService: EmailService,
    private authService: OutreachAuthService,
    private dataService: OutreachDataService,
    private outreachApiService: OutreachApiService
  ) {
  }


  ngOnInit (): void {
    this.checkTenant();
    this.loadDraftingMetadata();
    this.emitAssistantContext();

    this.assistantBus.setAssistantPageContext( this.buildAssistantContext() );
  }

  ngOnDestroy (): void {
    if ( this.sendSubscription )
      this.sendSubscription.unsubscribe();
    if ( this.getUserSubscription )
      this.getUserSubscription.unsubscribe();
    if ( this.loggedInSubscription )
      this.loggedInSubscription.unsubscribe();
    if ( this.tenantSubscription )
      this.tenantSubscription.unsubscribe();
    if ( this.openAISubscription )
      this.openAISubscription.unsubscribe();
    if ( this.metadataSubscription )
      this.metadataSubscription.unsubscribe();
  }

  private loadDraftingMetadata (): void {
    this.metadataSubscription = this.emailService.getEmailDraftingMetadata().subscribe( metadata => {
      this.emailTones = Array.isArray( metadata?.tones ) ? metadata.tones : [];
      this.emailCampaignStages = Array.isArray( metadata?.stages ) ? metadata.stages : [];
      if ( !this.selectedTone ) {
        this.selectedTone = this.emailTones[0]?.key || 'direct';
      }
    } );
  }

  ngAfterViewInit (): void {
    setTimeout( () => this.emitAssistantContext(), 0 );
  }

  get isRunning (): boolean {
    return this.bulkIsRunning && !this.stopSending;
  }

  get remainingCount (): number {
    return this.bulkQueue?.length || 0;
  }

  get skippedCount (): number {
    return this.skippedContacts?.length || 0;
  }

  get removedCount (): number {
    return this.removedContacts?.length || 0;
  }

  get canLoadSkippedQueue (): boolean {
    return !this.bulkIsRunning && !this.showPreview && this.skippedCount > 0;
  }

  get canReloadQueue (): boolean {
    return !this.bulkIsRunning && !this.showPreview && !this.isloading;
  }

  get signalEnginePreviewNote (): string {
    if ( !this.pendingContact ) {
      return 'Catalyst sends one tailored email at a time, then Signal Engine takes over the thread after send.';
    }

    const name = `${this.pendingContact.firstName || ''} ${this.pendingContact.lastName || ''}`.trim() || 'this contact';
    return `Once you send to ${name}, Signal Engine will own the follow-up and adapt from opens, clicks, and silence.`;
  }

  get displayInsight (): string {
    const blockedDraftReason = this.getBlockedDraftReason();
    const contactInsight = String( this.contactInsight || '' ).trim();
    const sections: string[] = [];

    if ( blockedDraftReason ) {
      sections.push( `Blocked / Needs Human Reason: ${blockedDraftReason}` );
    }

    if ( contactInsight ) {
      sections.push( contactInsight );
    }

    return sections.join( '\n\n' ).trim();
  }

  private renderPreviewFrame (): void {
    if ( !this.previewFrame?.nativeElement ) return;

    const html = String( this.previewHtml || '' );
    this.previewFrame.nativeElement.srcdoc = html;
  }

  toggleRawPreview (): void {
    this.debugRawPreview = !this.debugRawPreview;
  }

  checkTenant () {
    this.tenantSubscription = this.authService.getTenantId().subscribe( tenantId => {
      this.tenantId = tenantId;
      this.senderInfo();
    } );
  }

  toggleInsight (): void {
    this.showInsight = !this.showInsight;
  }

  senderInfo (): void {
    this.getUserSubscription = this.authService.getUser().subscribe( user => {
      if ( user ) {
        this.userId = user.uid;

        this.dataService.getContact( this.tenantId, this.userId ).then( contact => {
          if ( contact ) {
            this.sender = contact;
          } else {
            this.logger.error( "No Contact Returned" );
          }
        } );
      }
    } );
  }

  async onStart (): Promise<void> {
    this.isloading = true;

    this.stopSending = false;
    this.bulkIsRunning = true;
    this.autoRunPauseRequested = false;
    this.queueComplete = false;
    this.skippedContacts = [];
    this.removedContacts = [];

    let allContacts = Array.isArray( this.contacts ) ? [...this.contacts] : [];

    if ( this.beforeQueueStart ) {
      try {
        const preparedContacts = await this.beforeQueueStart();
        if ( Array.isArray( preparedContacts ) ) {
          allContacts = [...preparedContacts];
        }
      } catch ( error ) {
        this.logger.error( 'beforeQueueStart failed', error );
        this.isloading = false;
        this.bulkIsRunning = false;
        this.stopSending = true;
        this.emitAssistantContext();
        return;
      }
    }

    const eligibleContacts: EmailerContactLite[] = [];
    const invalidContacts: EmailerContactLite[] = [];

    allContacts.forEach( contact => {
      if ( this.isQueueEligibleContact( contact ) ) {
        eligibleContacts.push( contact );
      } else {
        invalidContacts.push( contact );
      }
    } );

    this.removedContacts = invalidContacts;
    this.initialQueueSnapshot = [...eligibleContacts];
    this.bulkQueue = [...eligibleContacts];
    this.currentCatalystRunId = '';
    this.currentCatalystRunName = '';
    this.currentCatalystRunFinalized = false;

    this.bulkCurrentContact = null;

    this.sendTimeoutHandles.forEach( h => clearTimeout( h ) );
    this.sendTimeoutHandles = [];

    await this.createCurrentCatalystRun( eligibleContacts, invalidContacts );
    this.processNextInQueue();
  }

  private processNextInQueue (): void {
    if ( !this.bulkIsRunning || this.stopSending ) {
      this.isloading = false;
      return;
    }

    if ( this.showPreview ) {
      if ( this.autoRun && !this.autoRunPauseRequested && this.pendingEmail ) {
        this.confirmSend();
        return;
      }

      this.isloading = false;
      return;
    }

    const next = this.bulkQueue.shift();
    if ( !next ) {
      this.markQueueComplete();
      return;
    }

    this.bulkCurrentContact = next;
    this.isloading = true;
    this.emitAssistantContext();

    if ( this.useTemplate ) {
      ( next as any )._insight = '';
      this.contactInsight = '';
      this.generateEmailContent( next );
      return;
    }

    if ( this.shouldUseContactInsight() ) {
      this.getContactInsight( next );
    } else {
      ( next as any )._insight = '';
      this.contactInsight = '';
      this.generateEmailContent( next );
    }
  }

  private shouldUseContactInsight (): boolean {
    return Array.isArray( this.contacts ) && this.contacts.length <= 25;
  }

  private getCompanyNameForQueue ( contact: EmailerContactLite | Contact | null | undefined ): string {
    return String(
      ( contact as any )?.company?.name ||
      ( contact as any )?.companyName ||
      ''
    ).trim();
  }

  private isQueueEligibleContact ( contact: EmailerContactLite | Contact | null | undefined ): boolean {
    const firstName = String( ( contact as any )?.firstName || '' ).trim();
    const companyName = this.getCompanyNameForQueue( contact );
    return !!firstName && !!companyName;
  }

  private clearPreviewState (): void {
    this.pendingEmail = null!;
    this.pendingContact = null!;
    this.previewTo = '';
    this.previewSubject = '';
    this.previewHtml = '';
    this.isSendingTest = false;
    this.debugRawPreview = false;
    this.lastSignalEngineMessage = '';
    this.emitAssistantContext();
  }

  private getPrimaryEmailAddress ( contact: EmailerContactLite | Contact | null | undefined ): string {
    return String(
      ( contact as any )?.emailAddresses?.[0]?.emailAddress ||
      ( contact as any )?.email ||
      ''
    ).trim();
  }

  private getSenderMailingAddress (): string {
    const address =
      this.getMeaningfulAddress( this.sender?.company?.addresses ) ||
      this.getMeaningfulAddress( this.sender?.addresses );

    if ( !address ) {
      return '';
    }

    const cityStateZip = [
      String( address.city || '' ).trim(),
      [String( address.state || '' ).trim(), String( address.zip || '' ).trim()].filter( Boolean ).join( ' ' ).trim()
    ].filter( Boolean ).join( ', ' );

    return [
      String( address.streetAddress || '' ).trim(),
      cityStateZip,
      String( address.country || '' ).trim()
    ].filter( Boolean ).join( ', ' ).trim();
  }

  private getMeaningfulAddress ( addresses: Address[] | null | undefined ): Address | null {
    if ( !Array.isArray( addresses ) ) {
      return null;
    }

    return addresses.find( address => {
      if ( !address ) {
        return false;
      }

      return [
        address.streetAddress,
        address.city,
        address.state,
        address.zip,
        address.country
      ].some( value => String( value || '' ).trim().length > 0 );
    } ) || null;
  }

  private getUtf8ByteLength ( value: string ): number {
    return new TextEncoder().encode( String( value || '' ) ).length;
  }

  private formatHtmlSizeKib ( bytes: number ): string {
    return `${( bytes / 1024 ).toFixed( 1 )} KiB`;
  }

  private getErrorMessage ( error: unknown ): string {
    if ( error instanceof Error && error.message ) {
      return error.message;
    }

    if ( typeof error === 'string' && error.trim().length > 0 ) {
      return error;
    }

    try {
      return JSON.stringify( error );
    } catch {
      return 'Unknown error';
    }
  }

  private validateEmailHtmlSize ( html: string ): boolean {
    const htmlBytes = this.getUtf8ByteLength( html );
    if ( htmlBytes <= EmailerComponent.MAX_EMAIL_HTML_BYTES ) {
      return true;
    }

    this.notificationService.show(
      'Template too large',
      `This email HTML is ${this.formatHtmlSizeKib( htmlBytes )}. Keep it under ${this.formatHtmlSizeKib( EmailerComponent.MAX_EMAIL_HTML_BYTES )} before sending.`,
      'warning'
    );
    return false;
  }

  private buildAssistantContext (): CatalystAssistantContext {
    const activeContact = this.pendingContact || this.bulkCurrentContact || null;
    const currentContactName = `${String( ( activeContact as any )?.firstName || '' ).trim()} ${String( ( activeContact as any )?.lastName || '' ).trim()}`.trim();

    return {
      page: 'catalyst',
      hasPreview: !!this.showPreview,
      isRunning: this.isRunning,
      queueComplete: !!this.queueComplete,
      remainingCount: this.remainingCount,
      skippedCount: this.skippedCount,
      removedCount: this.removedCount,
      useTemplate: !!this.useTemplate,
      templateHtml: String( this.templateHtml || '' ),
      templateSubject: String( this.templateSubject || '' ),
      hasCustomTemplateSubject: !!String( this.templateSubject || '' ).trim(),
      previewSubject: String( this.previewSubject || this.subject || '' ),
      previewHtml: String( this.previewHtml || this.emailBody || '' ),
      testEmailAddress: String( this.testEmailAddress || '' ),
      currentContactId: String( ( activeContact as any )?.id || '' ),
      currentContactName,
      currentCompanyName: this.getCompanyNameForQueue( activeContact ),
      currentContactEmail: this.getPrimaryEmailAddress( activeContact )
    };
  }

  public emitAssistantContext (): void {
    const nextContext = this.buildAssistantContext();
    this.currentAssistantContext = nextContext;
    this.assistantContextChange.emit( nextContext );
    this.assistantBus.setAssistantPageContext( nextContext );
  }

  getAssistantContextSnapshot (): CatalystAssistantContext {
    return this.buildAssistantContext();
  }

  applyAssistantDraftToPreview ( payload: CatalystAssistantDraftPayload | null | undefined ): boolean {
    if ( !payload || !this.showPreview || !this.pendingEmail ) {
      return false;
    }

    const nextSubject = String( payload.subject || '' ).trim();
    const nextHtml = String( payload.html || payload.body || '' ).trim();

    if ( !nextSubject && !nextHtml ) {
      return false;
    }

    if ( nextSubject ) {
      this.subject = nextSubject;
      this.previewSubject = nextSubject;
      this.pendingEmail.subject = nextSubject;
    }

    if ( nextHtml ) {
      this.emailBody = nextHtml;
      this.previewHtml = nextHtml;
      this.pendingEmail.html = nextHtml;
      this.pendingEmail.textAsHtml = nextHtml;
      this.pendingEmail.text = this.stripHtmlTags( nextHtml );
    }

    this.emitAssistantContext();
    setTimeout( () => this.renderPreviewFrame(), 0 );
    return true;
  }

  private markQueueComplete (): void {
    this.isloading = false;
    this.bulkIsRunning = false;
    this.bulkCurrentContact = null;
    this.queueComplete = true;
    void this.finalizeCurrentCatalystRun( 'completed' );
    this.emitAssistantContext();
  }

  private async createCurrentCatalystRun ( eligibleContacts: EmailerContactLite[], invalidContacts: EmailerContactLite[] ): Promise<void> {
    if ( !this.tenantId || !this.userId || eligibleContacts.length <= 0 ) {
      return;
    }

    try {
      const response = await firstValueFrom( this.outreachApiService.createCatalystRun( {
        name: this.buildCatalystRunName(),
        source: this.runContext?.source || 'stale_queue',
        includeLeadVaultContacts: this.runContext?.includeLeadVaultContacts === true,
        plannedCount: this.contacts.length,
        eligibleCount: eligibleContacts.length,
        invalidCount: invalidContacts.length,
        queuedCount: eligibleContacts.length,
        skippedCount: 0,
        removedCount: invalidContacts.length,
        contactIds: eligibleContacts.map( contact => String( contact?.id || '' ).trim() ).filter( Boolean ),
        createdByUserId: this.userId,
        createdByUserEmail: this.sender?.emailAddresses?.[0]?.emailAddress || ( this.sender as any )?.email || ''
      }, {
        tenantId: this.tenantId,
        userId: this.userId,
        userEmail: this.sender?.emailAddresses?.[0]?.emailAddress || ( this.sender as any )?.email || ''
      } ) );

      this.currentCatalystRunId = String( response?.data?.id || '' ).trim();
      this.currentCatalystRunName = String( response?.data?.name || this.buildCatalystRunName() ).trim();
      this.currentCatalystRunFinalized = false;
    } catch ( error ) {
      this.logger.error( 'Failed to create Catalyst run history record', error );
    }
  }

  private async finalizeCurrentCatalystRun ( status: 'completed' | 'stopped' ): Promise<void> {
    if ( !this.currentCatalystRunId || this.currentCatalystRunFinalized || !this.tenantId || !this.userId ) {
      return;
    }

    this.currentCatalystRunFinalized = true;

    try {
      await firstValueFrom( this.outreachApiService.finalizeCatalystRun( this.currentCatalystRunId, {
        status,
        queuedCount: this.initialQueueSnapshot.length,
        skippedCount: this.skippedCount,
        removedCount: this.removedCount
      }, {
        tenantId: this.tenantId,
        userId: this.userId,
        userEmail: this.sender?.emailAddresses?.[0]?.emailAddress || ( this.sender as any )?.email || ''
      } ) );
    } catch ( error ) {
      this.currentCatalystRunFinalized = false;
      this.logger.error( 'Failed to finalize Catalyst run history record', error );
    }
  }

  private buildCatalystRunName (): string {
    const explicitName = String( this.runContext?.name || '' ).trim();
    if ( explicitName ) {
      return explicitName;
    }

    const source = String( this.runContext?.source || 'stale_queue' ).trim().toLowerCase();
    const sourceLabel = source === 'blocked_handoff' ? 'Blocked Handoff' : 'Stale Contacts';
    return `${sourceLabel} ${new Date().toISOString().slice( 0, 10 )}`;
  }

  loadSkippedQueue (): void {
    if ( !this.canLoadSkippedQueue ) {
      return;
    }

    const contactsToRetry = [...this.skippedContacts];
    this.skippedContacts = [];
    this.bulkQueue = contactsToRetry;
    this.bulkCurrentContact = null;
    this.queueComplete = false;
    this.stopSending = false;
    this.bulkIsRunning = true;
    this.isloading = true;
    this.autoRunPauseRequested = false;

    this.emitAssistantContext();
    this.processNextInQueue();
  }

  reloadQueue (): void {
    if ( !this.canReloadQueue ) {
      return;
    }

    this.stopSending = false;
    this.bulkIsRunning = true;
    this.bulkCurrentContact = null;
    this.bulkQueue = [...this.initialQueueSnapshot];
    this.skippedContacts = [];
    this.queueComplete = false;
    this.isloading = true;
    this.autoRunPauseRequested = false;
    this.emitAssistantContext();
    this.processNextInQueue();
  }

  async generateEmailContent ( contact: Contact ) {
    if ( this.stopSending ) {
      return;
    }

    if ( this.bulkIsRunning && this.bulkCurrentContact && contact?.id && this.bulkCurrentContact.id !== contact.id ) {
      return;
    }

    if ( this.useTemplate ) {
      await this.generateTemplateEmailForContact( contact );

      if ( this.templateError ) {
        this.logger.warn( `⚠️ Template mode error for ${contact?.firstName}: ${this.templateError}` );
      } else {
        this.sendEmail( contact as any );
        return;
      }
    }

    const blockedDraftReason = this.getBlockedDraftReason();
    const aiResponse = await firstValueFrom( this.emailService.generateEmailDraftFromEditor(
      {
        userId: this.userId,
        tenantId: this.tenantId,
        subject: this.subject || '',
        htmlContext: String( ( contact as any )?._insight || '' ).trim(),
        selectedContact: contact,
        sender: this.sender,
        reason: blockedDraftReason || this.contactInsight || null,
        toneCode: String( this.selectedTone || 'direct' ).trim(),
        handoffSource: blockedDraftReason ? 'blocked_handoff' : 'catalyst',
        draftIntent: 'fresh_outbound',
        senderPersona: 'maya'
      } as any,
      null
    ) ).catch( ( error ) => {
      this.logger.error( error );
      return null;
    } );

    if ( this.stopSending ) {
      return;
    }

    if ( !aiResponse ) {
      this.handleDraftFailure( contact, 'Drafting request failed - no response from AI service.' );
      return;
    }

    let parsed: any = aiResponse;
    let responseText = '';

    if ( typeof parsed === 'string' ) {
      try {
        let cleaned = parsed.trim();

        cleaned = cleaned
          .replace( /^```\s*json\s*/i, '' )
          .replace( /^```\s*/i, '' )
          .replace( /```\s*$/i, '' )
          .trim();

        cleaned = cleaned.replace( /^json\s*/i, '' ).trim();

        parsed = JSON.parse( cleaned );
      } catch ( err ) {
        this.logger.error( "❌ Failed to parse OpenAI JSON string:", parsed );
        this.subject = '';
        return;
      }
    }

    let rawSubject = '';

    if ( parsed && typeof parsed === 'object' ) {
      if ( parsed.subject ) {
        rawSubject = String( parsed.subject ).trim();
      }

      if ( parsed.body ) {
        responseText = String( parsed.body ).trim();
      }
    }

    if ( !rawSubject && !responseText ) {
      this.handleDraftFailure( contact, 'Drafting returned an empty subject and body.' );
      return;
    }

    this.emailBody = responseText;
    this.subject = this.sanitizeGeneratedSubject( rawSubject, responseText, contact );

    if ( !this.subject ) {
      this.subject = this.sanitizeGeneratedSubject( '', this.stripHtmlTags( this.emailBody ), contact );
    }

    if ( this.stopSending ) {
      return;
    }

    this.sendEmail( contact );
  }

  private handleDraftFailure ( contact: EmailerContactLite | Contact, reason: string ): void {
    const name = `${( contact as any )?.firstName || ''} ${( contact as any )?.lastName || ''}`.trim() || 'this contact';
    this.logger.error( `⛔️ Draft failed for ${name}: ${reason}` );
    this.notificationService.show(
      'Draft failed',
      `Skipped ${name}: ${reason}`,
      'warning'
    );

    if ( this.bulkIsRunning && !this.stopSending ) {
      this.skippedContacts.push( contact as EmailerContactLite );
      this.isloading = true;
      this.emitAssistantContext();
      this.processNextInQueue();
    } else {
      this.isloading = false;
    }
  }

  private traceTag ( contact: { id?: string, firstName?: string, lastName?: string; } | null ) {
    const name = `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim();
    return `[email-run contactId=${contact?.id || 'na'} name="${name}"]`;
  }

  private buildSubjectFromBody ( existingSubject: string, bodyText: string ): string {
    const cleanedExisting = String( existingSubject || '' ).replace( /\s+/g, ' ' ).trim();
    const normalizedBody = this.normalizeBodyTextForSubject( bodyText );

    if ( !normalizedBody ) {
      return cleanedExisting;
    }

    const firstSentence = this.extractFirstSentenceForSubject( normalizedBody );
    const subjectSeed = firstSentence || normalizedBody;
    const derived = this.toSubjectLine( subjectSeed );

    if ( !cleanedExisting ) {
      return derived;
    }

    const normalizedExisting = cleanedExisting.toLowerCase();
    const normalizedDerived = derived.toLowerCase();

    if ( !normalizedDerived ) {
      return cleanedExisting;
    }

    if ( normalizedExisting === normalizedDerived ) {
      return cleanedExisting;
    }

    const genericSubjects = new Set<string>( [
      'hello',
      'hi',
      'checking in',
      'following up',
      'quick question',
      'quick note',
      'touching base',
      'reaching out',
      'introduction'
    ] );

    if ( genericSubjects.has( normalizedExisting ) ) {
      return derived;
    }

    if ( cleanedExisting.length < 4 ) {
      return derived;
    }

    return cleanedExisting;
  }

  private normalizeBodyTextForSubject ( bodyText: string ): string {
    let value = String( bodyText || '' )
      .replace( /<br\s*\/?>(\s*)/gi, '\n' )
      .replace( /<\/p>/gi, '\n' )
      .replace( /<[^>]*>/g, ' ' )
      .replace( /&nbsp;/gi, ' ' )
      .replace( /&amp;/gi, '&' )
      .replace( /&lt;/gi, '<' )
      .replace( /&gt;/gi, '>' )
      .replace( /\s+/g, ' ' )
      .trim();

    value = value
      .replace( /^(hi|hello|dear)\s+[^,]+,\s*/i, '' )
      .replace( /^(best|thanks|thank you|sincerely|regards)[\s\S]*$/i, '' )
      .trim();

    return value;
  }

  private extractFirstSentenceForSubject ( text: string ): string {
    const value = String( text || '' ).trim();
    if ( !value ) return '';

    const match = value.match( /^(.{1,140}?[.!?])(?=\s|$)/ );
    if ( match && match[1] ) {
      return match[1].trim();
    }

    return value.split( /\s+/ ).slice( 0, 12 ).join( ' ' ).trim();
  }

  private toSubjectLine ( text: string ): string {
    let value = String( text || '' )
      .replace( /^["'“”‘’]+|["'“”‘’]+$/g, '' )
      .replace( /^[\-–—:;,.!?\s]+/, '' )
      .replace( /[\-–—:;,.!?\s]+$/, '' )
      .replace( /\s+/g, ' ' )
      .trim();

    if ( !value ) return '';

    const words = value.split( /\s+/ ).slice( 0, 7 );
    value = words.join( ' ' ).trim();

    return value;
  }

  private sendEmail ( contact: EmailerContactLite ) {
    try {
      if ( !contact )
        return;

      if ( this.emailBody ) {
        this.emailBody = this.emailBody.replace( /\\n/g, '' ).replace( /\\r/g, '' );
      }

      if ( !this.validateEmailHtmlSize( this.emailBody ) ) {
        this.isloading = false;
        this.isSendingTest = false;
        return;
      }

      const fromEmail =
        ( this.sender.emailAddresses &&
          this.sender.emailAddresses.length > 0 &&
          this.sender.emailAddresses[0].emailAddress ) ||
        ( this.sender as any )?.email ||
        '';

      const toEmail =
        ( contact.emailAddresses &&
          contact.emailAddresses.length > 0 &&
          contact.emailAddresses[0].emailAddress ) ||
        ( contact as any )?.email ||
        '';
      const mailingAddress = this.getSenderMailingAddress();

      let email: Email = {
        to: toEmail,
        cc: '',
        subject: this.subject,
        text: this.stripHtmlTags( this.emailBody ),
        html: this.emailBody,
        textAsHtml: this.emailBody,
        contactName: contact.firstName,
        contactId: contact.id,
        catalystRunId: this.currentCatalystRunId || undefined,
        catalystRunName: this.currentCatalystRunName || undefined,
        signalOrigin: 'catalyst',
        signalEngineEnabled: true,
        from: {
          email: fromEmail,
          name: this.getSenderDisplayName()
        },
      };
      ( email as any ).mailingAddress = mailingAddress;

      this.pendingEmail = email;
      this.pendingContact = contact;
      this.previewTo = toEmail;
      this.previewSubject = this.subject;
      this.previewHtml = this.emailBody;
      this.showPreview = true;
      this.isloading = false;
      this.isSendingTest = false;
      this.emitAssistantContext();

      if ( !this.testEmailAddress ) {
        const senderEmail =
          ( this.sender?.emailAddresses &&
            this.sender.emailAddresses.length > 0 &&
            this.sender.emailAddresses[0]?.emailAddress ) ||
          ( this.sender as any )?.email ||
          '';
        this.testEmailAddress = senderEmail;
      }

      setTimeout( () => this.renderPreviewFrame(), 0 );

      if ( this.bulkIsRunning && this.autoRun && !this.autoRunPauseRequested ) {
        setTimeout( () => {
          if ( this.showPreview && this.pendingEmail && this.autoRun && !this.autoRunPauseRequested ) {
            this.confirmSend();
          }
        }, 0 );
      }

    } catch ( error ) {
      this.notificationService.show( "Email Send Failure", JSON.stringify( error ), "error" );
    }
  }

  sendTestEmail (): void {
    if ( !this.pendingEmail ) {
      this.notificationService.show( 'No test email available', 'Prepare an email preview first.', 'warning' );
      return;
    }

    const testTo = String( this.testEmailAddress || '' ).trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if ( !testTo || !emailPattern.test( testTo ) ) {
      this.notificationService.show( 'Invalid test email', 'Enter a valid email address for test delivery.', 'warning' );
      return;
    }

    const testEmail: Email = {
      ...this.pendingEmail,
      to: testTo,
      subject: this.pendingEmail.subject?.startsWith( '[TEST] ' )
        ? this.pendingEmail.subject
        : `[TEST] ${this.pendingEmail.subject}`,
      isTestSend: true
    };
    delete ( testEmail as any ).catalystRunId;
    delete ( testEmail as any ).catalystRunName;

    this.isSendingTest = true;

    this.sendSubscription = this.emailService.sendEmail(
      testEmail,
      this.tenantId,
      this.userId
    ).subscribe( {
      next: ( response ) => {
        this.isSendingTest = false;
        this.notificationService.show(
          'Test email sent',
          `${testTo} - ${JSON.stringify( response )}`,
          'success'
        );
      },
      error: ( error ) => {
        this.isSendingTest = false;
        this.logger.error( 'Test email send failure', error );
        this.notificationService.show( 'Test email failed', this.getErrorMessage( error ), 'error' );
      }
    } );
  }

  cancelPreview () {
    this.showPreview = false;
    this.clearPreviewState();

    if ( this.autoRunPauseRequested ) {
      this.autoRunPauseRequested = false;
    }

    if ( this.bulkIsRunning && !this.stopSending ) {
      this.isloading = true;
      this.processNextInQueue();
    }
  }

  skipPreview () {
    const skipped = this.pendingContact;

    this.showPreview = false;
    this.clearPreviewState();

    if ( this.autoRunPauseRequested ) {
      this.autoRunPauseRequested = false;
    }

    if ( this.bulkIsRunning && !this.stopSending && skipped ) {
      this.skippedContacts.push( skipped );
      this.isloading = true;
      this.processNextInQueue();
    }
  }

  confirmSend () {
    this.showPreview = false;
    this.emitAssistantContext();
    this.debugRawPreview = false;
    this.isSendingTest = false;

    const pauseAfterThisSend = this.autoRunPauseRequested;
    const sentEmail = this.pendingEmail;
    const sentContact = this.pendingContact;

    if ( !this.validateEmailHtmlSize( String( sentEmail?.html || '' ) ) ) {
      this.showPreview = true;
      this.emitAssistantContext();
      this.isloading = false;
      return;
    }

    this.sendSubscription = this.emailService.sendEmail(
      sentEmail,
      this.tenantId,
      this.userId
    ).subscribe( {
      next: ( response ) => {
        this.notificationService.show(
          `Email sent to ${sentContact.firstName} ${sentContact.lastName}`,
          sentEmail.to + " - " + JSON.stringify( response ),
          "success"
        );
        this.emailSent.emit( sentContact.id );
        this.updateContact( sentContact );
        void this.seedSignalEngineThread( sentContact, sentEmail );

        this.clearPreviewState();

        if ( pauseAfterThisSend ) {
          this.autoRun = false;
          this.autoRunPauseRequested = false;
          this.isloading = false;
          return;
        }

        if ( this.bulkIsRunning && !this.stopSending ) {
          this.processNextInQueue();
        }
      },
      error: ( error ) => {
        this.logger.error( 'Email send failure', error );
        this.notificationService.show( 'Email send failed', this.getErrorMessage( error ), 'error' );
        this.showPreview = true;
        this.emitAssistantContext();
        this.isloading = false;
      }
    } );
  }

  private async seedSignalEngineThread ( contact: EmailerContactLite, email: Email ): Promise<void> {
    try {
      const contactId = String( contact?.id || '' ).trim();
      if ( !contactId ) return;

      const thread = createThreadFromSentEmail( {
        contactId,
        emailAddress: email.to,
        contactName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || email.to,
        companyName: this.getCompanyNameForQueue( contact ),
        senderEmail: String( typeof email.from === 'string' ? email.from : email.from?.email || '' ).trim(),
        senderName: this.getSenderDisplayName(),
        subject: email.subject,
        owner: 'todd',
        mode: 'draft_only',
        origin: 'catalyst',
        signalEngineEnabled: true
      } );

      await firstValueFrom( this.outreachApiService.upsertMomentumThread( thread, {
        tenantId: this.tenantId,
        userId: this.userId,
        userEmail: this.sender?.emailAddresses?.[0]?.emailAddress || ( this.sender as any )?.email || ''
      } ) );

      this.lastSignalEngineMessage = `Signal Engine now owns ${contact.firstName || 'this'} ${contact.lastName || ''}`.trim() + '.';
      this.notificationService.show(
        'Signal Engine Active',
        this.lastSignalEngineMessage,
        'info'
      );
    } catch ( error ) {
      this.logger.error( 'Failed to seed Signal Engine thread from Catalyst send', error );
    }
  }

  private updateContact ( contact: Contact ) {
    ( contact as any ).lastContacted = new Date().toISOString();
    this.dataService.updateContact( this.tenantId, contact.id, contact ).then( () => {
      this.logger.info( "Contact Updated" );
    } ).catch( () => {
      this.logger.error( "Error Updating Contact" );
    } );
  }

  private getContactInsight ( contact: Contact ): void {
    this.openAISubscription = this.insightService.contactInsight( contact ).subscribe( {
      next: ( result ) => {
        if ( this.stopSending ) {
          return;
        }
        if ( this.bulkIsRunning && this.bulkCurrentContact && contact?.id && this.bulkCurrentContact.id !== contact.id ) {
          return;
        }

        const insight = result?.response;

        if ( insight?.relationshipBuilder && insight.relationshipBuilder !== "No insight available" ) {
          const rawInsightText = `
          Relationship Tip: ${insight.relationshipBuilder}
          Recommended Action: ${insight.recommendedAction}
          Suggested Task: ${insight.suggestedTask}
                  `.trim();

          ( contact as any )._insight = rawInsightText;
        } else {
          ( contact as any )._insight = '';
        }
        this.contactInsight = ( contact as any )._insight;

        this.generateEmailContent( contact );
      },
      error: ( err ) => {
        this.logger.error( 'Error fetching contact insight:', err );
      }
    } );
  }

  private getBlockedDraftReason (): string {
    return String( this.blockedDraftReason || '' ).trim();
  }

  formatPhoneNumber ( phoneNumber: string ): string {
    const cleaned = phoneNumber.replace( /\D+/g, '' );
    if ( cleaned.length === 10 ) {
      return `${cleaned.slice( 0, 3 )}.${cleaned.slice( 3, 6 )}.${cleaned.slice( 6 )}`;
    } else {
      return phoneNumber;
    }
  }

  stripHtmlTags ( html: string ): string {
    const div = document.createElement( 'div' );
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  stopSendingEmails (): void {
    this.isloading = false;
    this.stopSending = true;
    this.autoRunPauseRequested = false;
    this.bulkIsRunning = false;
    this.bulkQueue = [];
    this.bulkCurrentContact = null;
    this.queueComplete = false;

    this.sendTimeoutHandles.forEach( h => clearTimeout( h ) );
    this.sendTimeoutHandles = [];

    if ( this.openAISubscription ) {
      this.openAISubscription.unsubscribe();
    }

    if ( this.showPreview ) {
      this.cancelPreview();
    }

    void this.finalizeCurrentCatalystRun( 'stopped' );
    this.emitAssistantContext();

    this.templateError = '';
    this.templateTokenDebug = null;
    this.originalTemplateHtml = '';
    this.templateSubject = '';
    this.clearPreviewState();
  }

  private escapeHtml ( text: string ): string {
    return ( text ?? '' )
      .toString()
      .replaceAll( '&', '&amp;' )
      .replaceAll( '<', '&lt;' )
      .replaceAll( '>', '&gt;' )
      .replaceAll( '"', '&quot;' )
      .replaceAll( "'", '&#39;' );
  }

  extractTemplateTokens ( html: string ): string[] {
    const found = new Set<string>();
    ( html || '' ).replace( /{{\s*([a-zA-Z0-9_-]+)\s*}}/g, ( _m, k ) => {
      found.add( String( k || '' ).trim() );
      return '';
    } );
    return Array.from( found ).sort();
  }

  onTemplateSubjectChanged (): void {
    this.emitAssistantContext();
  }

  private renderTemplateHtml ( templateHtml: string, tokens: Record<string, string> ): string {
    const safeTokens: Record<string, string> = {};
    Object.keys( tokens || {} ).forEach( k => {
      const key = String( k || '' ).trim();
      safeTokens[key] = ( tokens as any )[key] == null ? '' : String( ( tokens as any )[key] );
    } );

    let normalizedTemplateHtml = String( templateHtml || '' );
    const firstNameTokenValue = String( safeTokens['firstName'] || '' ).trim();
    if ( !firstNameTokenValue ) {
      normalizedTemplateHtml = normalizedTemplateHtml
        .replace( /Hi\s+{{\s*firstName\s*}}\s*,/g, 'Hi,' )
        .replace( /Hello\s+{{\s*firstName\s*}}\s*,/g, 'Hello,' )
        .replace( /Dear\s+{{\s*firstName\s*}}\s*,/g, 'Dear,' );
    }

    return normalizedTemplateHtml.replace( /{{\s*([a-zA-Z0-9_-]+)\s*}}/g, ( _m, keyRaw ) => {
      const key = String( keyRaw || '' ).trim();
      const val = safeTokens[key] ?? '';
      if ( this.rawHtmlTokens.has( key ) ) return val;
      return this.escapeHtml( val );
    } );
  }

  private buildContactTokenMap ( contact: Contact ): Record<string, string> {
    const companyName = ( contact as any )?.company?.name || ( contact as any )?.companyName || '';
    const title = ( contact as any )?.title || ( contact as any )?.jobTitle || '';

    const toEmail =
      ( ( contact as any )?.emailAddresses && ( contact as any )?.emailAddresses.length > 0 && ( contact as any )?.emailAddresses[0]?.emailAddress ) ||
      ( contact as any )?.email ||
      '';

    return {
      firstName: String( ( contact as any )?.firstName || '' ).trim(),
      lastName: String( ( contact as any )?.lastName || '' ).trim(),
      fullName: `${String( ( contact as any )?.firstName || '' )} ${String( ( contact as any )?.lastName || '' )}`.trim(),
      company: String( companyName || '' ),
      companyName: String( companyName || '' ),
      title: String( title || '' ),
      email: String( toEmail || '' ),
      signature: String(
        ( this.sender as any )?.signature ||
        `${this.sender?.firstName || ''} ${this.sender?.lastName || ''}`.trim()
      )
    };
  }

  private getReservedTemplateTokens (): Set<string> {
    return new Set<string>( [
      'firstName', 'lastName', 'fullName', 'company', 'companyName', 'title', 'email', 'signature'
    ] );
  }

  private getTemplateTokensNeedingModel ( htmlTokens: string[], subjectTokens: string[] = [] ): string[] {
    const reserved = this.getReservedTemplateTokens();
    const combined = Array.from( new Set<string>( [...( htmlTokens || [] ), ...( subjectTokens || [] )] ) );
    return combined.filter( token => !!token && !reserved.has( token ) );
  }

  private escapeRegex ( value: string ): string {
    return String( value || '' ).replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
  }

  private normalizeTemplateModelTokens ( contact: Contact, tokens: Record<string, string> ): Record<string, string> {
    const normalized: Record<string, string> = { ...( tokens || {} ) };

    const firstName = String( ( contact as any )?.firstName || '' ).trim();
    let content = String( normalized['content'] || '' ).trim();

    if ( content ) {
      content = content.replace( /^(hi|hello|dear)\s+[^,]+,\s*/i, '' ).trim();

      if ( firstName ) {
        const firstNamePattern = new RegExp( `^${this.escapeRegex( firstName )}\\s*,?\\s*`, 'i' );
        content = content.replace( firstNamePattern, '' ).trim();
      }

      const abbreviationMap: Array<[RegExp, string]> = [
        [/\bInc\./g, 'Inc§'],
        [/\bLLC\./g, 'LLC§'],
        [/\bCo\./g, 'Co§'],
        [/\bCorp\./g, 'Corp§'],
        [/\bLtd\./g, 'Ltd§'],
        [/\bSr\./g, 'Sr§'],
        [/\bJr\./g, 'Jr§'],
        [/\bMr\./g, 'Mr§'],
        [/\bMrs\./g, 'Mrs§'],
        [/\bMs\./g, 'Ms§'],
        [/\bDr\./g, 'Dr§']
      ];

      let protectedContent = content;
      abbreviationMap.forEach( ( [pattern, replacement] ) => {
        protectedContent = protectedContent.replace( pattern, replacement );
      } );

      const sentenceParts = protectedContent
        .split( /(?<=[.!?])\s+(?=[A-Z“"'])/ )
        .map( s => s.trim() )
        .filter( Boolean )
        .map( s => {
          let restored = s;
          abbreviationMap.forEach( ( [_pattern, replacement] ) => {
            restored = restored.replaceAll( replacement, replacement.replace( '§', '.' ) );
          } );
          return restored;
        } );

      if ( sentenceParts.length > 0 ) {
        const stemSentence = sentenceParts.find( s => /there.?s no real secret to better/i.test( s ) );

        if ( stemSentence ) {
          const openingSentence = sentenceParts.find( s => s !== stemSentence );
          content = openingSentence ? `${openingSentence} ${stemSentence}`.trim() : stemSentence;
        } else if ( sentenceParts[0] ) {
          content = sentenceParts[0];
        }
      }

      content = content
        .replace( /([.!?])\s+(?=[A-Z])/g, '$1<br><br>' )
        .replace( /\s+/g, ' ' )
        .trim();
      normalized['content'] = content;
    }

    if ( normalized['subject'] ) {
      normalized['subject'] = String( normalized['subject'] ).replace( /\s+/g, ' ' ).trim();
    }

    if ( normalized['subheading'] ) {
      normalized['subheading'] = String( normalized['subheading'] ).replace( /\s+/g, ' ' ).trim();
    }

    return normalized;
  }

  private buildTemplateTokenPrompt ( contact: Contact, detectedTokens: string[] ): string {
    const editorContext = String( ( contact as any )?._insight || '' ).trim();

    const reserved = this.getReservedTemplateTokens();

    const wanted = Array.isArray( detectedTokens )
      ? detectedTokens.filter( t => !!t && !reserved.has( t ) )
      : [];

    if ( !wanted.includes( 'subject' ) ) wanted.unshift( 'subject' );

    return [
      'You are filling placeholders for an HTML email template.',
      'Return ONLY valid JSON.',
      'Do not return markdown.',
      'Do not return explanatory text.',
      'Do not return any keys other than the exact keys requested.',
      '',
      'Contact context:',
      `Name: ${String( ( contact as any )?.firstName || '' )} ${String( ( contact as any )?.lastName || '' )}`.trim(),
      `Company: ${String( ( contact as any )?.company?.name || ( contact as any )?.companyName || '' )}`.trim(),
      `Profession: ${String( ( contact as any )?.profession || '' )}`.trim(),
      `Sector: ${String( ( contact as any )?.type || ( contact as any )?.sector || '' )}`.trim(),
      editorContext ? `Relationship insight:\n${editorContext}` : 'Relationship insight: (none)',
      '',
      'Instructions:',
      '- Write a concise subject if subject is requested related to the sector.',
      '- Subject lines must sound human, plain, and specific.',
      '- Do not write marketing-style subject lines.',
      '- Do not use phrases like seamless solutions, innovative solutions, transform, unlock, optimize your business, accelerate growth, or drive growth.',
      '- Do not make the subject sound like a brochure, campaign slogan, or website headline.',
      '- Keep the subject under 7 words when possible.',
      '- Good subject examples: Quick question, AI question, About Midland Tech, Data issue, Operational drag.',
      '- If subheading is requested, keep it short and specific to the sector.',
      '- If content is requested, write ONLY one killer opening line that complements the template.',
      '- The opening line must read naturally immediately after "Hi {{firstName}},"',
      '- The opening line must be a complete sentence, not a fragment, label, or headline.',
      '- The opening line must contain a subject and a verb.',
      '- Keep the opening line under 12 words when possible.',
      '- The opening line must be about the contact\'s reality, pressure, company, role, or sector.',
      '- The opening line must NOT talk about the sender, the sender\'s product, demos, meetings, or outreach.',
      '- The opening line should make the reader pause.',
      '- When useful, anchor the line in a concrete industry truth, operational tension, or credible outside signal that a research firm, analyst, regulator, or trade source might plausibly surface.',
      '- Do not fabricate quotes, study names, percentages, or named sources unless they are explicitly provided in the relationship insight.',
      '- Do not write in third person such as "James is..." or "Ellen could benefit..."',
      '- Do not start with the contact first name or last name.',
      '- Do not start with gerunds like "Navigating," "Managing," "Improving," or "Reducing" unless used in a full natural sentence.',
      '- Bad example: Navigating the challenges of AI adoption at Janus Associates, Inc.',
      '- Good example: Most firms testing AI discover the process breaks before the model does.',
      '- Good example: Supplier teams usually feel the friction before leadership sees it.',
      '- Good example: AI pilots often expose workflow gaps, not model gaps.',
      '- Do not include a greeting, CTA, sign-off, summary, or second sentence in content.',
      '- Content must directly reflect the relationship insight when one is provided.',
      '- When natural, mention the company or sector so the line feels personalized.',
      '- Avoid generic marketing language, vague productivity claims, and empty hype.',
      '- If point-title, point1, point2, or point3 are requested, you must generate them.',
      '- If point-title, point1, point2, or point3 are requested, make them concrete esoteric pain points that fit the contact, company, and sector - no more than 7 words.',
      '- Do not include greeting or signature unless explicitly requested as a key.',
      '- They should reflect esoteric friction common to the contact\'s profession, company type, or sector.',
      '- Do not return empty values for these fields.',
      '',
      `Return JSON with EXACT keys only:\n${JSON.stringify( wanted )}`
    ].join( '\n' );
  }

  private async generateTemplateEmailForContact ( contact: Contact ): Promise<void> {
    this.templateError = '';
    this.templateTokenDebug = null;

    const tpl = String( this.templateHtml || '' );
    this.originalTemplateHtml = tpl;
    if ( !tpl.trim() ) {
      this.templateError = 'Template HTML is empty.';
      return;
    }

    const detected = this.extractTemplateTokens( tpl );
    const detectedSubjectTokens = this.extractTemplateTokens( String( this.templateSubject || '' ) );
    const modelNeededTokens = this.getTemplateTokensNeedingModel( detected, detectedSubjectTokens );
    this.templateTokensDetected = Array.from( new Set<string>( [...detected, ...detectedSubjectTokens] ) ).sort();

    const contactTokens = this.buildContactTokenMap( contact );

    if ( !modelNeededTokens.length ) {
      const mergedLocal: Record<string, string> = { ...contactTokens };
      const customTemplateSubject = String( this.templateSubject || '' ).trim();

      if ( customTemplateSubject ) {
        const renderedCustomSubject = this.renderTemplateHtml( customTemplateSubject, mergedLocal )
          .replace( /<[^>]*>/g, ' ' )
          .replace( /\s+/g, ' ' )
          .trim();

        this.subject = renderedCustomSubject || this.subject || 'Hello';
      } else {
        this.subject = this.subject || 'Hello';
      }

      const renderedLocal = this.renderTemplateHtml( tpl, mergedLocal );
      this.emailBody = renderedLocal;
      this.templateTokenDebug = {
        detected,
        detectedSubjectTokens,
        modelNeededTokens,
        skippedOpenAI: true,
        merged: mergedLocal
      };
      this.emitAssistantContext();
      return;
    }

    const aiQuestion = this.buildTemplateTokenPrompt( contact, modelNeededTokens );

    const aiResponse = await firstValueFrom( this.insightService.getTemplateTokenAssistance( aiQuestion, this.userId, contact || undefined ) )
      .catch( ( error ) => {
        this.logger.error( error );
        return null;
      } );

    let parsed: any = aiResponse;

    if ( parsed && typeof parsed === 'object' && typeof parsed.response === 'string' ) {
      parsed = parsed.response;
    }

    if ( parsed && typeof parsed === 'object' ) {
      if ( parsed.body && !parsed.content ) parsed.content = parsed.body;
      if ( parsed.title && !parsed.subject ) parsed.subject = parsed.title;
    }

    if ( typeof parsed === 'string' ) {
      try {
        let cleaned = parsed.trim();
        cleaned = cleaned
          .replace( /^```\s*json\s*/i, '' )
          .replace( /^```\s*/i, '' )
          .replace( /```\s*$/i, '' )
          .trim();
        cleaned = cleaned.replace( /^json\s*/i, '' ).trim();
        parsed = JSON.parse( cleaned );
      } catch ( err ) {
        this.logger.error( '❌ Failed to parse template token JSON:', parsed );
        this.templateError = 'OpenAI returned invalid JSON for template tokens.';
        this.templateTokenDebug = { detected, raw: aiResponse, parsedAttempt: parsed, prompt: aiQuestion };
        return;
      }
    }

    if ( !parsed || typeof parsed !== 'object' ) {
      this.templateError = 'OpenAI did not return a token object.';
      return;
    }

    const normalizedParsed: Record<string, string> = this.normalizeTemplateModelTokens( contact, { ...( parsed || {} ) } );
    if ( normalizedParsed['title'] && !normalizedParsed['subject'] ) {
      normalizedParsed['subject'] = normalizedParsed['title'];
    }
    if ( normalizedParsed['subject'] && !normalizedParsed['title'] ) {
      normalizedParsed['title'] = normalizedParsed['subject'];
    }

    if ( normalizedParsed['pointTitle'] && !normalizedParsed['point-title'] ) {
      normalizedParsed['point-title'] = normalizedParsed['pointTitle'];
    }

    const merged: Record<string, string> = { ...normalizedParsed, ...contactTokens };

    const modelSubject = String( merged['subject'] || '' ).trim();
    const customTemplateSubject = String( this.templateSubject || '' ).trim();

    if ( customTemplateSubject ) {
      const renderedCustomSubject = this.renderTemplateHtml( customTemplateSubject, merged )
        .replace( /<[^>]*>/g, ' ' )
        .replace( /\s+/g, ' ' )
        .trim();

      this.subject = renderedCustomSubject || modelSubject || this.subject || 'Hello';
    } else {
      this.subject = modelSubject || this.subject || 'Hello';
    }

    const rendered = this.renderTemplateHtml( tpl, merged );
    this.emailBody = rendered;
    this.emitAssistantContext();

    this.templateTokenDebug = {
      detected,
      detectedSubjectTokens,
      modelNeededTokens,
      prompt: aiQuestion,
      modelTokens: parsed,
      merged,
      skippedOpenAI: false
    };
  }

  onAutoRunToggle (): void {
    if ( !this.autoRun ) {
      this.autoRunPauseRequested = true;
      return;
    }

    this.autoRunPauseRequested = false;

    if ( this.bulkIsRunning && this.showPreview && this.pendingEmail ) {
      this.confirmSend();
    }
  }

  private sanitizeGeneratedSubject ( existingSubject: string, bodyText: string, contact?: Contact ): string {
    const cleanedExisting = String( existingSubject || '' ).replace( /\s+/g, ' ' ).trim();
    const derived = this.buildSubjectFromBody( '', bodyText );

    if ( !cleanedExisting ) {
      return derived;
    }

    if ( this.isMarketingSubjectLine( cleanedExisting ) ) {
      this.logger.warn( 'Rejecting marketing-style subject line; falling back to body-derived subject.', {
        rejectedSubject: cleanedExisting,
        contactId: contact?.id,
        derivedSubject: derived
      } );
      return derived;
    }

    return this.normalizeSubjectLine( cleanedExisting );
  }

  private isMarketingSubjectLine ( subject: string ): boolean {
    const normalized = this.normalizeSubjectLine( subject ).toLowerCase();
    if ( !normalized ) return true;

    const hardBlockedPhrases = [
      'integrating seamless',
      'seamless tech solutions',
      'unlock',
      'revolutionize',
      'supercharge',
      'boost your',
      'maximize your',
      'transform your',
      'next-level',
      'game-changing',
      'cutting-edge',
      'innovative solution',
      'drive growth',
      'accelerate growth',
      'synergy',
      'streamline your business',
      'optimize your business'
    ];

    if ( hardBlockedPhrases.some( phrase => normalized.includes( phrase ) ) ) {
      return true;
    }

    if ( /\b(learn more|schedule a demo|book a demo|quick call|free consultation)\b/i.test( normalized ) ) {
      return true;
    }

    if ( /\b(for|with)\s+[a-z0-9][a-z0-9&.,\-\s]{0,50}$/i.test( normalized ) && normalized.length > 28 ) {
      return true;
    }

    if ( normalized.split( /\s+/ ).length > 8 ) {
      return true;
    }

    return false;
  }

  private normalizeSubjectLine ( subject: string ): string {
    return String( subject || '' )
      .replace( /^subject\s*:\s*/i, '' )
      .replace( /\s+/g, ' ' )
      .trim();
  }

}
