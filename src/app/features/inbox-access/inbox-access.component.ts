import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

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
  imports: [WriteActionDirective, BrowseNoticeComponent,
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

    this.logger.info( 'Inbox access context ready', {
      tenantId: this.tenantId,
      userId: this.userId,
      hasConnectedMailbox: this.mailboxAccess.hasMailboxConnection,
    } );
  }
}
