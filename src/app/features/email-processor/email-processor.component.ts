import { ChangeDetectorRef, Component, ViewChild, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LastContactChartComponent } from './last-contact-chart/last-contact-chart.component';
import { EmailerComponent, CatalystAssistantContext, CatalystAssistantDraftPayload } from './emailer/emailer.component';
import { TopDogComponent } from '../../shared/top-dog/top-dog.component';
import { Contact } from '../../models/contact.model';
import { CatalystRun, LeadVaultAudiencePreview } from '../../models/email.model';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { SoundService } from '../../services/sound.service';
import { LoggerService } from '../../services/logger.service';
import { ActivatedRoute, Router } from '@angular/router';
import { OutreachNomenclatureService } from '../../services/outreach-nomenclature.service';
import { OutreachDataService } from '../../services/outreach-data.service';
import { BackToTopComponent } from '../../shared/back-to-top/back-to-top.component';

import { EmailSendingStatusComponent } from '../../shared/email-sending-status/email-sending-status.component';
import { ToddTipComponent } from '../../shared/todd-tip/todd-tip.component';
import { TabBarComponent, TabBarItem } from '../../shared/tab-bar/tab-bar.component';
import { CommonModule } from '@angular/common';
import { OutreachTipService } from '../../services/outreach-tip.service';
import { FormsModule } from '@angular/forms';
import { PreloaderComponent } from '../../shared/preloader/preloader.component';
import { OutreachAssistantSignalService } from '../../services/outreach-assistant-signal.service';
import { OutreachPageActionsService } from '../../services/outreach-page-actions.service';
import { OutreachNotificationService } from '../../services/outreach-notification.service';
import { OutreachApiService } from '../../services/outreach-api.service';
import { buildOutreachPageActions } from '../../shared/utils/page-action-presets';
import {
  CATALYST_HANDOFF_QUERY_PARAM,
  CATALYST_HANDOFF_SOURCE,
  CATALYST_HANDOFF_SOURCE_PARAM,
  CatalystHandoffPayload,
  CatalystHandoffRouteState,
  getCatalystHandoffStorageKey
} from './catalyst-handoff';

export type EmailerContactLite = Contact;

/**
 * Ported from features/email/pages/email-processor/ (Catalyst). Swapped
 * DataService.getCollectionData('CONTACTS', userId) for
 * OutreachDataService.getAllContacts(tenantId) and
 * DataService.getContactFullByIdOnce for OutreachDataService.getContact
 * (tenantId, contactId). Dropped the settingsService.shouldShowMessage
 * delegation in shouldShowMessage() - SettingsService isn't part of this
 * app's trimmed TopDogComponent (it went unused in the original's own
 * class body too - see TopDogComponent's header comment), so this just
 * reads the local messageVisibility map directly, same fallback behavior
 * the original had when that delegation found nothing.
 */
@Component( {
  selector: 'app-email-processor',
  imports: [CommonModule, FormsModule, LastContactChartComponent, PreloaderComponent, EmailerComponent, BackToTopComponent, EmailSendingStatusComponent, ToddTipComponent, TabBarComponent],
  standalone: true,
  templateUrl: './email-processor.component.html',
  styleUrl: './email-processor.component.css'
} )
export class EmailProcessorComponent extends TopDogComponent {
  private readonly pageActionsService = inject( OutreachPageActionsService );

  liteContacts: Contact[] = [];
  contactsToPass: Contact[] = [];
  emailTipText: string = '';
  private hasLoadedContacts = false;
  catalystAssistantContext: CatalystAssistantContext | null = null;
  private _pageMode: 'stale_queue' | 'blocked_handoff' = 'stale_queue';
  catalystHandoff: CatalystHandoffPayload | null = null;
  catalystHandoffStatus = '';
  catalystHandoffLoadedCount = 0;
  catalystHandoffSkippedCount = 0;
  private catalystHandoffInitialized = false;
  includeLeadVaultContacts = false;
  leadVaultPreview: LeadVaultAudiencePreview | null = null;
  leadVaultPreviewLoading = false;
  catalystRuns: CatalystRun[] = [];
  catalystRunsLoading = false;
  catalystRunsError = '';

  @ViewChild( EmailerComponent ) emailerComponent?: EmailerComponent;

  processingCount: number = 25;
  activeTab: 'emailer' | 'graph' | 'history' = 'graph';
  catalystTabs: TabBarItem[] = [
    { id: 'graph', label: 'Stale Contacts', icon: 'user-clock', dataCy: 'catalyst-tab-graph' },
    { id: 'emailer', label: 'Emailer', icon: 'paper-plane', dataCy: 'catalyst-tab-emailer' },
    { id: 'history', label: 'History', icon: 'clock-rotate-left', dataCy: 'catalyst-tab-history' }
  ];

  get pageMode (): 'stale_queue' | 'blocked_handoff' {
    return this._pageMode;
  }

  set pageMode ( value: 'stale_queue' | 'blocked_handoff' ) {
    this._pageMode = value;
    this.recomputeCatalystTabs();
  }

  private recomputeCatalystTabs (): void {
    const handoff = this.isCatalystHandoffMode;
    const tabs: TabBarItem[] = [];
    if ( !handoff ) {
      tabs.push( { id: 'graph', label: 'Stale Contacts', icon: 'user-clock', dataCy: 'catalyst-tab-graph' } );
    }
    tabs.push( {
      id: 'emailer',
      label: handoff ? 'Blocked Queue' : 'Emailer',
      icon: handoff ? 'lock' : 'paper-plane',
      dataCy: 'catalyst-tab-emailer'
    } );
    tabs.push( { id: 'history', label: 'History', icon: 'clock-rotate-left', dataCy: 'catalyst-tab-history' } );
    this.catalystTabs = tabs;
  }

  messageVisibility: Record<string, boolean> = {
    registerEmailWarning: false
  };
  readonly signalEngineStates = [
    'No open: Catalyst should trigger a subject rewrite.',
    'Opened, no click: keep the subject logic and refactor the body.',
    'Clicked: follow the specific interest signal and push the next step.'
  ];

  constructor ( protected override authService: OutreachAuthService,
    protected override soundService: SoundService,
    protected override logger: LoggerService,
    protected override router: Router,
    private route: ActivatedRoute,
    protected override nomenclatureService: OutreachNomenclatureService,
    private tipService: OutreachTipService,
    private dataService: OutreachDataService,
    private outreachApi: OutreachApiService,
    private notificationService: OutreachNotificationService,
    private cdr: ChangeDetectorRef,
    private assistantBus: OutreachAssistantSignalService
  ) {
    super( authService, soundService, logger, router, nomenclatureService );
  }

  override ngOnInit (): void {
    super.ngOnInit();
    this.publishPageContext();

    this.readySubscription = this.ready$.subscribe( ( isReady ) => {
      if ( isReady ) {
        this.isLoading = true;
        this.emailTipText = this.tipService.getRandomTipText( 'email', 'compose-email' );
        this.loadData();
        this.assistantBus.emitAssistantActivity( {
          feature: 'outreach',
          page: 'email-processor',
          route: this.router.url,
          mode: 'dashboard',
          action: 'email_processor_opened',
          summary: {
            activeTab: this.activeTab,
            processingCount: this.processingCount
          }
        } );

      }

    } );

  }

  override ngOnDestroy (): void {
    super.ngOnDestroy();
    this.assistantBus.clearPageContext();
    this.assistantBus.setAssistantPageContext( null );
    this.pageActionsService.clearPageActions( 'email-processor' );
  }
  async loadData () {
    try {
      if ( !this.userId || !this.tenantId ) {
        this.logger.warn( '⚠️ EmailProcessor: tenant/user not ready yet; skipping contact load.' );
        return;
      }

      const raw = await this.dataService.getAllContacts( this.tenantId );
      this.liteContacts = ( raw || [] ) as Contact[];
      this.hasLoadedContacts = true;
      await this.maybeActivateCatalystHandoff();
      this.publishPageContext();

    } catch ( e ) {
      this.logger.error( '❌ EmailProcessor: failed loading contacts', e );
      this.liteContacts = [];
      this.hasLoadedContacts = true;
      await this.maybeActivateCatalystHandoff();

      setTimeout( () => {
        this.zone.run( () => {
          this.isLoading = false;
          this.contactsToPass = [];
          this.publishPageContext();
          try { this.cdr.detectChanges(); } catch { }
        } );
      }, 0 );
    }
  }

  shouldShowMessage ( key: string ): boolean {
    if ( !key ) return false;
    return !!this.messageVisibility?.[key];
  }

  onAssistantContextChange ( context: CatalystAssistantContext ): void {
    this.catalystAssistantContext = context;
    this.publishPageContext();
  }

  getCatalystAssistantContext (): CatalystAssistantContext | null {
    if ( this.emailerComponent ) {
      return this.emailerComponent.getAssistantContextSnapshot();
    }

    return this.catalystAssistantContext;
  }

  applyAssistantDraftToCurrentPreview ( payload: CatalystAssistantDraftPayload | null | undefined ): boolean {
    if ( !this.emailerComponent ) {
      this.logger.warn( 'Assistant draft apply requested, but EmailerComponent is not available yet.' );
      return false;
    }

    const applied = this.emailerComponent.applyAssistantDraftToPreview( payload );

    if ( applied ) {
      this.catalystAssistantContext = this.emailerComponent.getAssistantContextSnapshot();
      this.assistantBus.emitAssistantActivity( {
        feature: 'outreach',
        page: 'email-processor',
        route: this.router.url,
        mode: 'dashboard',
        action: 'catalyst_assistant_draft_applied',
        summary: {
          currentContactId: this.catalystAssistantContext?.currentContactId || '',
          hasPreview: !!this.catalystAssistantContext?.hasPreview
        }
      } );
      this.publishPageContext();
    } else {
      this.logger.warn( 'Assistant draft was not applied to current preview.' );
    }

    return applied;
  }

  setActiveTab ( tab: string ): void {
    if ( tab !== 'emailer' && tab !== 'graph' && tab !== 'history' ) return;
    this.activeTab = tab;
    if ( tab === 'history' ) {
      void this.loadCatalystRuns();
    }
    this.assistantBus.emitAssistantActivity( {
      feature: 'outreach',
      page: 'email-processor',
      route: this.router.url,
      mode: 'dashboard',
      action: 'catalyst_tab_changed',
      summary: {
        activeTab: this.activeTab
      }
    } );
    this.publishPageContext();
  }

  async loadCatalystRuns (): Promise<void> {
    if ( !this.tenantId || !this.userId ) {
      return;
    }

    this.catalystRunsLoading = true;
    this.catalystRunsError = '';

    try {
      const response = await firstValueFrom( this.outreachApi.listCatalystRuns( {
        limit: 12
      }, {
        tenantId: this.tenantId,
        userId: this.userId,
        userEmail: this.firebaseUser?.email || undefined
      } ) );
      this.catalystRuns = Array.isArray( response?.data ) ? response.data : [];
    } catch ( error ) {
      this.logger.error( 'Failed to load Catalyst runs', error );
      this.catalystRunsError = 'Catalyst history could not be loaded.';
      this.catalystRuns = [];
    } finally {
      this.catalystRunsLoading = false;
      this.publishPageContext();
    }
  }

  get catalystRunContext () {
    return {
      source: this.pageMode === 'blocked_handoff' ? 'blocked_handoff' : 'stale_queue',
      includeLeadVaultContacts: this.includeLeadVaultContacts
    };
  }

  formatCatalystRunRate ( value?: number ): string {
    const safeValue = Number( value || 0 );
    return `${Math.round( safeValue * 100 )}%`;
  }

  formatCatalystRunTimestamp ( value?: string ): string {
    const raw = String( value || '' ).trim();
    if ( !raw ) return 'Not available';
    const nextDate = new Date( raw );
    if ( Number.isNaN( nextDate.getTime() ) ) return 'Not available';
    return nextDate.toLocaleString();
  }

  onContactsReady ( contacts: Contact[] ) {
    if ( this.pageMode === 'blocked_handoff' ) {
      return;
    }

    const safeContacts = Array.isArray( contacts ) ? contacts : [];

    if ( safeContacts.length === 0 && !this.hasLoadedContacts ) {
      return;
    }

    setTimeout( () => {
      this.zone.run( () => {
        this.isLoading = false;
        this.contactsToPass = safeContacts;
        void this.refreshLeadVaultPreview();
        this.publishPageContext();
        try { this.cdr.detectChanges(); } catch { }
      } );
    }, 0 );
  }

  onProcessingCountChange ( count: number ): void {
    this.processingCount = Number( count ) || 25;
    this.assistantBus.emitAssistantActivity( {
      feature: 'outreach',
      page: 'email-processor',
      route: this.router.url,
      mode: 'dashboard',
      action: 'catalyst_batch_size_changed',
      summary: {
        processingCount: this.processingCount
      }
    } );
    this.publishPageContext();
  }

  get isCatalystHandoffMode (): boolean {
    return this.pageMode === 'blocked_handoff';
  }

  get catalystBlockedDraftReason (): string {
    return String( this.catalystHandoff?.reasonDetail || this.catalystHandoff?.reasonLabel || '' ).trim();
  }

  get leadVaultAdditionalCount (): number {
    return Number( this.leadVaultPreview?.additionalCount || 0 );
  }

  get catalystRemainingCount (): number {
    return Math.max( Number( this.catalystAssistantContext?.remainingCount || 0 ), 0 );
  }

  get catalystQueueCountForLeadVault (): number {
    const activeQueueCount = this.catalystRemainingCount;
    if ( activeQueueCount > 0 ) {
      return activeQueueCount;
    }

    return Math.max( Number( this.contactsToPass?.length || 0 ), 0 );
  }

  get leadVaultToggleDisabled (): boolean {
    if ( this.leadVaultPreviewLoading ) {
      return true;
    }

    if ( this.includeLeadVaultContacts ) {
      return false;
    }

    if ( this.catalystQueueCountForLeadVault <= 0 ) {
      return true;
    }

    const code = String( this.leadVaultPreview?.code || '' ).trim().toUpperCase();
    return ['NOT_ENTITLED', 'WEEKLY_LIMIT_ACTIVE', 'NO_ADDITIONAL_CONTACTS'].includes( code );
  }

  get leadVaultStatusMessage (): string {
    if ( this.catalystQueueCountForLeadVault <= 0 ) {
      return 'Load a Catalyst queue before adding Lead Vault contacts.';
    }

    if ( !this.leadVaultPreview ) {
      return 'Check Lead Vault availability for this Catalyst queue.';
    }

    if ( this.leadVaultPreview.code === 'ALLOWED' ) {
      return `${this.leadVaultAdditionalCount} additional unique Lead Vault contact${this.leadVaultAdditionalCount === 1 ? '' : 's'} can be added when Catalyst starts.`;
    }

    if ( this.leadVaultPreview.code === 'WEEKLY_LIMIT_ACTIVE' && this.leadVaultPreview.nextAvailableAt ) {
      return `Lead Vault inclusion is locked until ${this.formatLeadVaultTimestamp( this.leadVaultPreview.nextAvailableAt )}.`;
    }

    return this.leadVaultPreview.message || 'Lead Vault campaign inclusion is unavailable.';
  }

  private get leadVaultQueueLimit (): number {
    const baseCount = Math.max( Number( this.contactsToPass?.length || 0 ), 0 );
    const batchCount = Math.max( Number( this.processingCount || 0 ), 0 );
    const effectiveBase = Math.max( baseCount, batchCount, 1 );
    return effectiveBase + 200;
  }

  readonly prepareCatalystQueueForStart = async (): Promise<Contact[] | null> => {
    if ( !this.includeLeadVaultContacts ) {
      return Array.isArray( this.contactsToPass ) ? [...this.contactsToPass] : [];
    }

    if ( this.catalystQueueCountForLeadVault <= 0 ) {
      this.soundService.playSound( "error" );
      this.notificationService.show( 'Lead Vault unavailable', this.leadVaultStatusMessage, 'error' );
      throw new Error( this.leadVaultStatusMessage );
    }

    await this.refreshLeadVaultPreview();

    if ( !this.leadVaultPreview?.allowed ) {
      this.soundService.playSound( "error" );
      this.notificationService.show( 'Lead Vault unavailable', this.leadVaultStatusMessage, 'error' );
      throw new Error( this.leadVaultStatusMessage );
    }

    if ( !this.tenantId || !this.userId ) {
      throw new Error( 'Tenant context required for Lead Vault activation.' );
    }

    try {
      const response = await firstValueFrom( this.outreachApi.activateLeadVaultAudience( {
        queue: this.contactsToPass || [],
        limit: this.leadVaultQueueLimit
      }, {
        tenantId: this.tenantId,
        userId: this.userId,
        userEmail: this.firebaseUser?.email || undefined
      } ) );

      const nextQueue = Array.isArray( response?.data?.queue ) ? response.data.queue : [];
      this.contactsToPass = nextQueue;
      this.leadVaultPreview = response?.data?.leadVaultAudiencePreview || this.leadVaultPreview;
      this.publishPageContext();
      return [...nextQueue];
    } catch ( error: any ) {
      this.logger.error( 'Lead Vault activation failed', error );
      const message = String( error?.error?.message || error?.message || this.leadVaultStatusMessage || 'Lead Vault inclusion could not be activated.' ).trim();
      if ( error?.error?.data?.leadVaultAudiencePreview ) {
        this.leadVaultPreview = error.error.data.leadVaultAudiencePreview;
      }
      this.soundService.playSound( "error" );
      this.notificationService.show( 'Lead Vault activation blocked', message, 'error' );
      this.publishPageContext();
      throw error;
    }
  };

  toggleLeadVaultContacts (): void {
    const next = !this.includeLeadVaultContacts;
    if ( next && this.leadVaultToggleDisabled ) {
      return;
    }

    this.includeLeadVaultContacts = next;
    this.publishPageContext();
  }

  async clearCatalystHandoffMode (): Promise<void> {
    const handoffKey = String( this.catalystHandoff?.handoffKey || '' ).trim();
    this.pageMode = 'stale_queue';
    this.catalystHandoff = null;
    this.catalystHandoffStatus = '';
    this.catalystHandoffLoadedCount = 0;
    this.catalystHandoffSkippedCount = 0;
    this.contactsToPass = [];
    this.activeTab = 'graph';
    this.catalystAssistantContext = null;
    this.includeLeadVaultContacts = false;
    this.leadVaultPreview = null;
    this.publishPageContext();

    if ( handoffKey && typeof window !== 'undefined' ) {
      try {
        window.sessionStorage.removeItem( getCatalystHandoffStorageKey( handoffKey ) );
      } catch { }
    }

    await this.router.navigate( [], {
      relativeTo: this.route,
      queryParams: {
        [CATALYST_HANDOFF_SOURCE_PARAM]: null,
        [CATALYST_HANDOFF_QUERY_PARAM]: null
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    } );

    try { this.cdr.detectChanges(); } catch { }
  }

  private async maybeActivateCatalystHandoff (): Promise<void> {
    if ( this.catalystHandoffInitialized ) return;

    const payload = this.readCatalystHandoffPayload();
    if ( !payload ) return;

    this.catalystHandoffInitialized = true;
    this.pageMode = 'blocked_handoff';
    this.catalystHandoff = payload;
    this.activeTab = 'emailer';
    await this.loadCatalystHandoffContacts( payload );
  }

  private readCatalystHandoffPayload (): CatalystHandoffPayload | null {
    const querySource = String( this.route.snapshot.queryParamMap.get( CATALYST_HANDOFF_SOURCE_PARAM ) || '' ).trim();
    const queryHandoffKey = String( this.route.snapshot.queryParamMap.get( CATALYST_HANDOFF_QUERY_PARAM ) || '' ).trim();

    const navigationState = ( this.router.getCurrentNavigation()?.extras?.state || {} ) as CatalystHandoffRouteState;
    const historyState = ( typeof window !== 'undefined' ? ( window.history.state || {} ) : {} ) as CatalystHandoffRouteState;
    const statePayload = navigationState.catalystHandoff || historyState.catalystHandoff || null;
    if ( this.isValidCatalystHandoffPayload( statePayload ) ) {
      return statePayload;
    }

    if ( querySource !== CATALYST_HANDOFF_SOURCE || !queryHandoffKey || typeof window === 'undefined' ) {
      return null;
    }

    try {
      const raw = window.sessionStorage.getItem( getCatalystHandoffStorageKey( queryHandoffKey ) );
      if ( !raw ) return null;
      const parsed = JSON.parse( raw ) as CatalystHandoffPayload;
      return this.isValidCatalystHandoffPayload( parsed ) ? parsed : null;
    } catch ( error ) {
      this.logger.warn( 'Unable to restore Catalyst handoff payload from session storage.', error );
      return null;
    }
  }

  private isValidCatalystHandoffPayload ( payload: CatalystHandoffPayload | null | undefined ): payload is CatalystHandoffPayload {
    return !!payload
      && payload.source === CATALYST_HANDOFF_SOURCE
      && Array.isArray( payload.contactIds )
      && payload.contactIds.length > 0;
  }

  private async loadCatalystHandoffContacts ( payload: CatalystHandoffPayload ): Promise<void> {
    const uniqueContactIds = Array.from( new Set( ( payload.contactIds || [] ).map( id => String( id || '' ).trim() ).filter( Boolean ) ) );
    const localContacts = new Map(
      ( this.liteContacts || [] )
        .filter( ( contact ): contact is Contact => !!String( contact?.id || '' ).trim() )
        .map( contact => [String( contact.id ).trim(), contact] )
    );
    const resolvedContacts: Contact[] = [];

    for ( const contactId of uniqueContactIds ) {
      const cached = localContacts.get( contactId );
      if ( cached ) {
        resolvedContacts.push( cached );
        continue;
      }

      if ( !this.tenantId ) continue;
      const fetched = await this.dataService.getContact( this.tenantId, contactId );
      if ( fetched ) {
        resolvedContacts.push( fetched );
      }
    }

    const queueContacts = resolvedContacts.filter( contact => this.isCatalystQueueContact( contact ) );
    this.contactsToPass = queueContacts;
    this.catalystHandoffLoadedCount = queueContacts.length;
    this.catalystHandoffSkippedCount = Math.max( 0, uniqueContactIds.length - queueContacts.length );
    this.isLoading = false;
    await this.refreshLeadVaultPreview();

    if ( queueContacts.length === 0 ) {
      this.catalystHandoffStatus = 'None of these blocked contacts can be worked in Catalyst yet. Reset to return to the stale queue.';
    } else if ( this.catalystHandoffSkippedCount > 0 ) {
      this.catalystHandoffStatus = `${this.catalystHandoffLoadedCount} blocked contact${this.catalystHandoffLoadedCount === 1 ? '' : 's'} loaded into Catalyst. ${this.catalystHandoffSkippedCount} stayed in Outbox because they still require reply or human-review workflow.`;
    } else {
      this.catalystHandoffStatus = `${this.catalystHandoffLoadedCount} blocked contact${this.catalystHandoffLoadedCount === 1 ? '' : 's'} loaded into Catalyst.`;
    }

    this.publishPageContext();
  }

  private isCatalystQueueContact ( contact: Contact | null | undefined ): boolean {
    if ( !contact ) return false;
    const firstName = String( contact.firstName || '' ).trim();
    const companyName = String( contact.company?.name || ( contact as any )?.companyName || '' ).trim();
    const primaryEmail = String( contact.emailAddresses?.[0]?.emailAddress || ( contact as any )?.email || '' ).trim();
    const isBlocked = !!contact.emailAddresses?.[0]?.blocked;

    return !!firstName && !!companyName && !!primaryEmail && !isBlocked;
  }

  private formatLeadVaultTimestamp ( value?: string | null ): string {
    if ( !value ) return 'later';
    const timestamp = new Date( value );
    if ( Number.isNaN( timestamp.getTime() ) ) return 'later';
    return timestamp.toLocaleString();
  }

  private async refreshLeadVaultPreview (): Promise<void> {
    if ( !this.tenantId || !this.userId || !Array.isArray( this.contactsToPass ) ) {
      return;
    }

    this.leadVaultPreviewLoading = true;
    this.publishPageContext();

    try {
      const response = await firstValueFrom( this.outreachApi.previewLeadVaultAudience( {
        queue: this.contactsToPass || [],
        limit: this.leadVaultQueueLimit
      }, {
        tenantId: this.tenantId,
        userId: this.userId,
        userEmail: this.firebaseUser?.email || undefined
      } ) );

      this.leadVaultPreview = response?.data || null;
    } catch ( error ) {
      this.logger.error( 'Lead Vault preview failed for Catalyst', error );
    } finally {
      this.leadVaultPreviewLoading = false;
      this.publishPageContext();
    }
  }

  private publishPageContext (): void {
    this.pageActionsService.setPageActions( {
      pageId: 'email-processor',
      context: {
        pageId: 'email-processor',
        feature: 'outreach'
      },
      actions: buildOutreachPageActions()
    } );
    this.assistantBus.setPageContext( {
      feature: 'outreach',
      page: 'email-processor',
      route: this.router.url,
      mode: 'dashboard',
      title: 'Catalyst',
      description: 'Work the stale-contact queue, prepare tailored emails, and hand live threads over to Signal Engine after send.',
      allowedActions: [
        'review_stale_contacts',
        'switch_catalyst_tab',
        'change_batch_size',
        'open_email_preview',
        'apply_assistant_draft'
      ],
      selectedEntityType: this.catalystAssistantContext?.currentContactId ? 'contact' : 'contact_queue',
      selectedEntityId: this.catalystAssistantContext?.currentContactId || '',
      summary: {
        activeTab: this.activeTab,
        pageMode: this.pageMode,
        processingCount: this.processingCount,
        liteContactsCount: this.liteContacts.length,
        queuedContactsCount: this.contactsToPass.length,
        includeLeadVaultContacts: this.includeLeadVaultContacts,
        leadVaultAdditionalCount: this.leadVaultAdditionalCount,
        leadVaultAllowed: this.leadVaultPreview?.allowed === true,
        leadVaultPreviewLoading: this.leadVaultPreviewLoading,
        hasLoadedContacts: this.hasLoadedContacts,
        isLoading: this.isLoading,
        catalystHandoffLoadedCount: this.catalystHandoffLoadedCount,
        catalystHandoffSkippedCount: this.catalystHandoffSkippedCount,
        hasAssistantPreview: !!this.catalystAssistantContext?.hasPreview,
        assistantRunning: !!this.catalystAssistantContext?.isRunning,
        queueComplete: !!this.catalystAssistantContext?.queueComplete
      },
      dataPreview: {
        catalystHandoffLaunchLabel: this.catalystHandoff?.launchLabel || '',
        catalystBlockedDraftReason: this.catalystBlockedDraftReason,
        leadVaultStatusMessage: this.leadVaultStatusMessage,
        currentContactId: this.catalystAssistantContext?.currentContactId || '',
        currentContactName: this.catalystAssistantContext?.currentContactName || '',
        currentCompanyName: this.catalystAssistantContext?.currentCompanyName || '',
        previewSubject: this.catalystAssistantContext?.previewSubject || '',
        remainingCount: this.catalystAssistantContext?.remainingCount || 0
      }
    } );
  }

}
