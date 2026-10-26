import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { getAuth } from 'firebase/auth';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';

import { OutreachAuthService } from '../../services/outreach-auth.service';
import { OutreachDataService } from '../../services/outreach-data.service';
import { LoggerService } from '../../services/logger.service';
import { BackToTopComponent } from '../../shared/back-to-top/back-to-top.component';
import { PreloaderComponent } from '../../shared/preloader/preloader.component';
import { MailboxAccessService } from '../../services/mailbox-access.service';
import { MailboxConfigSummary, MailboxProviderId } from '../../services/outreach-api.service';
import { DESIGN_PREVIEW_MAILBOX, isDesignPreview } from '../../shared/utils/design-preview';
import { mailboxConnectionLabel } from '../../shared/utils/mailbox-label';
import { WriteActionDirective } from '../../shared/write-access/write-action.directive';
import { BrowseNoticeComponent } from '../../shared/write-access/browse-notice.component';
import { SendingFromComponent } from './sending-from.component';
import { OutreachOnboardingService } from '../../services/outreach-onboarding.service';
import { environment } from '../../../environments/environment';

type ProviderChip = 'google' | 'microsoft' | 'icloud' | 'yahoo' | 'other';

/** Who hosts it (design_handoff_outreach_onboarding 2), and the form's provider for each. */
const PROVIDER_CHIPS: Array<{ id: ProviderChip; label: string; provider: MailboxProviderId; note: string }> = [
  { id: 'google', label: 'Google / Gmail', provider: 'gmail', note: 'Gmail and Google Workspace.' },
  { id: 'microsoft', label: 'Microsoft 365 / Outlook', provider: 'outlook',
    note: 'Microsoft sign-in is coming. For now, create an app password in your Microsoft account (Security → Advanced security options → App passwords) and paste it here.' },
  { id: 'icloud', label: 'iCloud', provider: 'icloud', note: 'Needs an app-specific password from appleid.apple.com.' },
  { id: 'yahoo', label: 'Yahoo', provider: 'yahoo', note: 'Needs an app password from your Yahoo account security page.' },
  { id: 'other', label: 'Something else', provider: 'other_imap', note: 'Any mailbox that supports IMAP and SMTP.' },
];

/**
 * Inbox settings: connect, test and choose mailboxes. The inbox itself is
 * /inbox (Outreach Inbox 2026), which replaced the three-pane inbox that
 * used to be this page's other tab.
 *
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
  imports: [WriteActionDirective, BrowseNoticeComponent, SendingFromComponent,
    CommonModule,
    FormsModule,
    RouterLink,
    PreloaderComponent,
    BackToTopComponent,
  ],
  providers: [MailboxAccessService],
  templateUrl: './inbox-access.component.html',
  styleUrl: './inbox-access.component.css'
} )
export class InboxAccessComponent implements OnInit, OnDestroy {
  /** Gmail: the password form stays tucked away unless asked for - Google
   * authorization is the way to connect. */
  showPasswordForm = false;
  isProcessing = false;

  private userId = '';
  private tenantId = '';
  private userEmail = '';

  // ── Guided first connect (design_handoff_outreach_onboarding 2) ────────
  readonly setup = inject( OutreachOnboardingService );
  private readonly http = inject( HttpClient );
  readonly providerChips = PROVIDER_CHIPS;
  chosen: ProviderChip = 'google';
  /** enter → connecting → connected, or failed (back to enter on retry). */
  phase: 'enter' | 'connecting' | 'connected' | 'failed' = 'enter';
  checks = { signedIn: false, send: false, read: false };
  failure = '';
  private guessedFor = '';
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
    // Settings only list mailboxes; the inbox page lists messages.
    this.mailboxAccess.messageLimit = 1;
    this.mailboxAccess.openFirstMessage = false;
    if ( isDesignPreview() ) {
      // Two connections to one address, as duplicates look in production.
      const tech = { ...DESIGN_PREVIEW_MAILBOX, provider: 'other_imap', providerLabel: 'Other IMAP', auth: { mode: 'app_password' } };
      this.mailboxAccess.mailboxConfigs = [
        { ...tech, id: 'primary', createdAt: '2026-06-02T15:00:00Z' },
        { ...tech, id: 'ty-showers-1a2b3c', isPrimary: false, createdAt: '2026-09-14T15:00:00Z' },
        { ...tech, id: 'ty-showers-com', emailAddress: 'ty.showers@taliferro.com', isPrimary: false, auth: { mode: 'oauth' }, provider: 'gmail', providerLabel: 'Gmail' },
      ] as any;
      this.mailboxAccess.selectMailbox( this.mailboxAccess.mailboxConfigs[0] );
    }
    this.readOAuthReturn();
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

  /** Adding a new inbox: nothing selected, the connect form open in the Add card. */
  get adding (): boolean {
    return !this.mailboxAccess.connectedMailbox;
  }

  isSelected ( mailbox: MailboxConfigSummary ): boolean {
    return this.mailboxAccess.connectedMailbox?.id === mailbox.id;
  }

  /** Connected with Google sign-in: there's no password form to show. */
  get selectedIsGoogle (): boolean {
    return this.mailboxAccess.connectedMailbox?.auth?.mode === 'oauth';
  }

  connectionLabel ( mailbox: MailboxConfigSummary ): string {
    return mailboxConnectionLabel( mailbox, this.mailboxAccess.mailboxConfigs );
  }

  selectMailbox ( mailbox: MailboxConfigSummary ): void {
    this.mailboxAccess.selectMailbox( mailbox );
  }

  /** Names the inbox and how it's connected, so the wrong one isn't removed. */
  disconnect ( mailbox: MailboxConfigSummary ): void {
    const others = this.mailboxAccess.mailboxConfigs.filter( item => item.id !== mailbox.id && item.emailAddress === mailbox.emailAddress ).length;
    const which = others ? ` (${ mailboxConnectionLabel( mailbox, this.mailboxAccess.mailboxConfigs ) })` : '';
    if ( !window.confirm( `Disconnect ${ mailbox.emailAddress }${ which }? Outreach will stop reading its replies.` ) ) return;
    this.mailboxAccess.disconnectMailboxConnection();
  }

  startAddingMailbox (): void {
    this.mailboxAccess.startAddingMailbox();
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

  /** No inbox yet, or in the middle of connecting one: the guided panel instead of settings. */
  get showGuided (): boolean {
    return this.phase !== 'enter' || ( !this.mailboxAccess.mailboxConfigs.length && !this.mailboxAccess.loadingMailboxes );
  }

  get chip () {
    return PROVIDER_CHIPS.find( ( chip ) => chip.id === this.chosen ) || PROVIDER_CHIPS[0];
  }

  get providerName (): string {
    return this.chip.label.split( ' /' )[0];
  }

  /** The address this page is connecting, or the one that just connected. */
  get connectingAddress (): string {
    return this.mailboxAccess.mailboxForm.emailAddress || this.mailboxAccess.connectedMailbox?.emailAddress || '';
  }

  get nextIsProfile (): boolean {
    return !this.setup.onboarding()?.steps.find( ( step ) => step.id === 'profile' )?.done;
  }

  choose ( id: ProviderChip ): void {
    this.chosen = id;
    this.mailboxAccess.mailboxForm.provider = this.chip.provider;
    this.mailboxAccess.onMailboxProviderChange();
  }

  /** Preselect who hosts the address (MX lookup), once per address. */
  async guessProvider (): Promise<void> {
    const email = String( this.mailboxAccess.mailboxForm.emailAddress || '' ).trim().toLowerCase();
    if ( !email.includes( '@' ) || email === this.guessedFor ) return;
    this.guessedFor = email;
    try {
      const user = getAuth().currentUser;
      if ( !user ) return;
      const response = await firstValueFrom( this.http.get<{ data: { provider: ProviderChip } }>(
        `${environment.backendURL}/outreach/provider-hint`,
        { params: { email }, headers: { Authorization: `Bearer ${await user.getIdToken()}` } } ) );
      if ( response?.data?.provider ) this.choose( response.data.provider );
    } catch {
      // Keep the current choice.
    }
  }

  connectGoogle (): void {
    this.mailboxAccess.connectGoogleMailbox();
  }

  async connectWithPassword (): Promise<void> {
    this.phase = 'connecting';
    this.failure = '';
    this.checks = { signedIn: false, send: false, read: false };
    // The form reloads its defaults when the mailbox list arrives; the chip the user picked wins.
    if ( this.mailboxAccess.mailboxForm.provider !== this.chip.provider ) this.choose( this.chosen );
    const result = await this.mailboxAccess.connectWithChecks();
    // Tick them off in order, the way the connection was checked.
    const pause = () => new Promise( ( resolve ) => setTimeout( resolve, 350 ) );
    this.checks.signedIn = result.smtpVerified || result.imapVerified || result.ok;
    await pause();
    this.checks.send = result.smtpVerified;
    await pause();
    this.checks.read = result.imapVerified;
    if ( result.ok ) {
      this.phase = 'connected';
      void this.setup.refresh();
      return;
    }
    this.phase = 'failed';
    this.failure = !this.checks.signedIn
      ? `${this.providerName} didn't accept that password. Check it's an app password, not your normal one.${result.message ? ` (${result.message})` : ''}`
      : !result.smtpVerified
        ? `Outreach couldn't send from ${this.connectingAddress}. Check the sending (SMTP) server under Advanced.`
        : `Outreach can send, but couldn't read replies. Check the receiving (IMAP) server under Advanced.`;
  }

  retry (): void {
    this.phase = 'enter';
    this.failure = '';
  }

  /** Back from Google's consent screen: ?mailboxConnect=1&mailboxConnectStatus=success|error. */
  private readOAuthReturn (): void {
    const params = this.route.snapshot.queryParamMap;
    if ( params.get( 'mailboxConnect' ) !== '1' ) return;
    this.chosen = 'google';
    if ( params.get( 'mailboxConnectStatus' ) === 'success' ) {
      this.checks = { signedIn: true, send: true, read: true };
      this.phase = 'connected';
      void this.setup.refresh();
    } else {
      this.phase = 'failed';
      const message = params.get( 'mailboxMessage' ) || '';
      this.failure = /not completed|denied|scope/i.test( message )
        ? "Google didn't allow sending. Try again and tick \"Send email on your behalf\"."
        : message || 'Google mailbox connection failed. Try again.';
    }
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
    // First connect: start from the TODD account's address and guess who hosts it.
    if ( !this.mailboxAccess.mailboxForm.emailAddress && this.userEmail ) this.mailboxAccess.mailboxForm.emailAddress = this.userEmail;
    void this.guessProvider();

    this.logger.info( 'Inbox access context ready', {
      tenantId: this.tenantId,
      userId: this.userId,
      hasConnectedMailbox: this.mailboxAccess.hasMailboxConnection,
    } );
  }
}
