import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';

import { Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { OutreachAuthService } from '../../../services/outreach-auth.service';
import { LoggerService } from '../../../services/logger.service';
import { SoundService } from '../../../services/sound.service';
import { Email } from '../../../models/email.model';
import { FirestoreTimestampPipe } from '../../../pipes/firestore-timestamp.pipe';
import { EmailOptionButtonComponent } from '../../../shared/email-option-button/email-option-button.component';
import { OutreachDataService } from '../../../services/outreach-data.service';
import { EmailApiService } from '../../../services/email-api.service';
import { Contact } from '../../../models/contact.model';
import { OutreachApiService } from '../../../services/outreach-api.service';
import { ClickSoundDirective } from '../../../shared/directives/click-sound.directive';
import { PreloaderComponent } from '../../../shared/preloader/preloader.component';

export interface EmailSentFollowUpCandidate {
  to: string;
  subject: string;
  reason: string;
  clickCount: number;
  openCount: number;
  sentDate: string;
}

export interface EmailSentAssistantContext {
  page: 'email-sent';
  rangeDays: number;
  totalEmails: number;
  openedEmails: number;
  unopenedEmails: number;
  clickedEmails: number;
  totalClicks: number;
  clickThroughRate: number;
  openRate: number;
  followUpNow: EmailSentFollowUpCandidate[];
  warmRecipients: EmailSentFollowUpCandidate[];
  coldRecipients: EmailSentFollowUpCandidate[];
  openedNoClickRecipients: EmailSentFollowUpCandidate[];
  topSubjects: { subject: string; count: number; }[];
  worstSubjects: { subject: string; count: number; }[];
}

type EmailSentCard = Email & {
  previewHtml: string;
  previewPlainText: string;
  hasBodyPreview: boolean;
  fromDisplayName: string;
  sendSourceKey: string;
  sendSourceLabel: string;
  sendSourceTone: 'neutral' | 'campaign' | 'auto' | 'warning' | 'manual';
  sendReasonSummary: string;
};

type EmailSendSourceSummary = {
  key: string;
  label: string;
  count: number;
};

/**
 * Ported from features/email/components/email-sent/. Swapped
 * environment.multiTenant branching for always resolving tenantId (this
 * standalone app is inherently multi-tenant, unlike the monorepo which
 * also serves SayIt's single-tenant mode), and
 * UserService.getLoggedInContactInfo() for
 * OutreachDataService.getContact(tenantId, userId) once both ids resolve.
 */
@Component( {
  selector: 'app-email-sent',
  standalone: true,
  imports: [CommonModule, RouterModule, FirestoreTimestampPipe, EmailOptionButtonComponent, ClickSoundDirective, PreloaderComponent],
  templateUrl: './email-sent.component.html',
  styleUrl: './email-sent.component.css'
} )
export class EmailSentComponent implements OnInit, OnDestroy {
  emails: EmailSentCard[] = [];
  @Output() itemSelected = new EventEmitter<EmailSentCard>();
  @Output() assistantContextChange = new EventEmitter<EmailSentAssistantContext>();
  readonly COMPANY_NAME = environment.COMPANY_NAME;
  loading: boolean = false;
  shoPreview: boolean = false;
  tenantId!: any;
  userSubscription!: Subscription;
  @Input() userId!: string;
  message: string | undefined;
  loggedInUser!: Contact;
  data: EmailSentCard[] = [];
  pageSize = 10;
  pageSizeOptions: number[] = [10, 25, 50, 100];
  hasMoreEmails: boolean = false;
  nextCursor: string | null = null;
  filteredEmails: EmailSentCard[] = [];
  emailSentAssistantContext: EmailSentAssistantContext | null = null;
  sendSourceSummary: EmailSendSourceSummary[] = [];
  mayaOnlyFilter = false;
  private getUserIdSubscription!: Subscription;
  private getTenantIdSubscription!: Subscription;
  private emailsSubscription!: Subscription;

  @Output() loader = new EventEmitter<boolean>();

  constructor ( private authService: OutreachAuthService,
    private soundService: SoundService,
    private dataService: OutreachDataService,
    private emailApiService: EmailApiService,
    private outreachApi: OutreachApiService,
    private router: Router,
    private logger: LoggerService ) { }

  ngOnInit (): void {
    this.message = "Retrieving Emails";

    this.getTenantIdSubscription = this.authService.getTenantId().subscribe( tenantId => {
      this.tenantId = tenantId;
      this.setUp();
    } );
  }

  ngOnDestroy (): void {
    if ( this.userSubscription )
      this.userSubscription.unsubscribe();
    if ( this.getTenantIdSubscription )
      this.getTenantIdSubscription.unsubscribe();
    if ( this.getUserIdSubscription )
      this.getUserIdSubscription.unsubscribe();
    if ( this.emailsSubscription )
      this.emailsSubscription.unsubscribe();
  }

  setUp (): void {
    this.getUserIdSubscription = this.authService.getUserId().subscribe( userId => {
      this.userId = userId;
      if ( this.tenantId && this.userId ) {
        this.dataService.getContact( this.tenantId, this.userId ).then( ( contact ) => {
          if ( contact ) this.loggedInUser = contact;
        } ).catch( () => { } );
      }
      this.fetchEmails();
    } );
  }

  private triggerLoading ( loading: boolean ) {
    this.loader.emit( loading );
  }

  onEmail ( emailAddress: string | undefined ) {
    if ( !emailAddress ) {
      return;
    }

    this.outreachApi.getOutreachContactByEmail( emailAddress, {
      tenantId: this.tenantId,
      userId: this.userId,
      userEmail: this.loggedInUser?.emailAddresses?.[0]?.emailAddress || undefined
    } ).subscribe( ( response ) => {
      const contact = response?.data;
      if ( contact && contact.id ) {
        const url = this.router.serializeUrl(
          this.router.createUrlTree( ['/compose-email'], {
            queryParams: { id: contact.id },
          } )
        );
        window.open( url, 'compose-email-tab' );
      }
    } );
  }

  togglePreview () {
    this.shoPreview = !this.shoPreview;
    this.logger.info( "Toogle Preview", this.shoPreview );
  }

  private getEmailSubject ( email: Email | any ): string {
    return String( email?.subject || '' ).trim();
  }

  private getEmailSentDateIso ( email: Email | any ): string {
    const rawDate = email && email.date;

    if ( rawDate instanceof Date ) {
      return rawDate.toISOString();
    }

    if ( rawDate && typeof rawDate.toDate === 'function' ) {
      try {
        return rawDate.toDate().toISOString();
      } catch {
        return '';
      }
    }

    if ( rawDate && rawDate.seconds ) {
      try {
        return new Date( rawDate.seconds * 1000 + ( rawDate.nanoseconds || 0 ) / 1000000 ).toISOString();
      } catch {
        return '';
      }
    }

    try {
      return rawDate ? new Date( rawDate ).toISOString() : '';
    } catch {
      return '';
    }
  }

  private getClickCount ( email: Email | any ): number {
    if ( Array.isArray( email?.clicks ) ) {
      return email.clicks.length;
    }

    return Number( email?.clickCount || 0 ) || 0;
  }

  private getOpenCount ( email: Email | any ): number {
    if ( Array.isArray( email?.opens ) ) {
      return email.opens.length;
    }

    if ( Array.isArray( email?.openEvents ) ) {
      return email.openEvents.length;
    }

    if ( typeof email?.openCount === 'number' ) {
      return email.openCount;
    }

    if ( email?.opened === true ) {
      return 1;
    }

    return 0;
  }

  private escapeHtml ( value: string ): string {
    return String( value || '' )
      .replace( /&/g, '&amp;' )
      .replace( /</g, '&lt;' )
      .replace( />/g, '&gt;' )
      .replace( /"/g, '&quot;' )
      .replace( /'/g, '&#39;' );
  }

  private normalizeBodyHtml ( email: Email ): { previewHtml: string; previewPlainText: string; hasBodyPreview: boolean; } {
    const htmlBody = String( email?.html || '' ).trim();
    const textBody = String( email?.text || '' ).trim();

    if ( htmlBody ) {
      const plainText = htmlBody
        .replace( /<style[\s\S]*?<\/style>/gi, ' ' )
        .replace( /<script[\s\S]*?<\/script>/gi, ' ' )
        .replace( /<br\s*\/?>/gi, '\n' )
        .replace( /<\/p>/gi, '\n\n' )
        .replace( /<[^>]+>/g, ' ' )
        .replace( /&nbsp;/gi, ' ' )
        .replace( /\s+\n/g, '\n' )
        .replace( /\n{3,}/g, '\n\n' )
        .replace( /[ \t]{2,}/g, ' ' )
        .trim();

      return {
        previewHtml: htmlBody,
        previewPlainText: plainText,
        hasBodyPreview: true
      };
    }

    if ( textBody ) {
      return {
        previewHtml: this.escapeHtml( textBody ).replace( /\n/g, '<br />' ),
        previewPlainText: textBody,
        hasBodyPreview: true
      };
    }

    return {
      previewHtml: '',
      previewPlainText: '',
      hasBodyPreview: false
    };
  }

  private toEmailSentCard ( email: Email ): EmailSentCard {
    const preview = this.normalizeBodyHtml( email );
    const sendPresentation = this.resolveSendPresentation( email );
    const fromDisplayName = this.resolveFromDisplayName( email );
    return {
      ...email,
      previewHtml: preview.previewHtml,
      previewPlainText: preview.previewPlainText,
      hasBodyPreview: preview.hasBodyPreview,
      fromDisplayName,
      sendSourceKey: sendPresentation.key,
      sendSourceLabel: sendPresentation.label,
      sendSourceTone: sendPresentation.tone,
      sendReasonSummary: sendPresentation.reason
    };
  }

  private resolveFromDisplayName ( email: Email ): string {
    const explicit = String( email?.fromName || '' ).trim();
    if ( explicit && explicit.toLowerCase() !== 'todd' ) {
      return explicit;
    }

    const fromValue = email?.from;
    if ( fromValue && typeof fromValue === 'object' ) {
      const objectName = String( fromValue.name || '' ).trim();
      if ( objectName && objectName.toLowerCase() !== 'todd' ) {
        return objectName;
      }

      const objectEmail = String( fromValue.email || '' ).trim();
      return this.humanizeEmailLocalPart( objectEmail );
    }

    return this.humanizeEmailLocalPart( String( fromValue || '' ).trim() );
  }

  private humanizeEmailLocalPart ( email: string ): string {
    const localPart = String( email || '' ).trim().split( '@' )[0] || '';
    const humanized = localPart
      .split( /[._-]+/ )
      .filter( Boolean )
      .map( part => part.charAt( 0 ).toUpperCase() + part.slice( 1 ) )
      .join( ' ' )
      .trim();

    return humanized.toLowerCase() === 'todd' ? '' : humanized;
  }

  private resolveSendPresentation ( email: Email ): { key: string; label: string; tone: 'neutral' | 'campaign' | 'auto' | 'warning' | 'manual'; reason: string; } {
    const messageType = String( email?.messageType || '' ).trim().toLowerCase();
    const sendAuthority = String( email?.sendAuthority || '' ).trim().toLowerCase();
    const sendReasonLabel = String( email?.sendReasonLabel || '' ).trim();

    if ( messageType === 'hot_lead_seizure_auto_send' || sendAuthority === 'exception_hot_lead' ) {
      return {
        key: 'hot_lead',
        label: 'Hot Lead Seizure',
        tone: 'warning',
        reason: sendReasonLabel || 'Sent as a hot-lead exception.'
      };
    }

    if ( messageType === 'reply_review_send' || sendAuthority === 'manual_reviewed' ) {
      return {
        key: 'reviewed_reply',
        label: 'Reviewed Reply',
        tone: 'manual',
        reason: sendReasonLabel || 'Sent after human review.'
      };
    }

    if ( messageType === 'momentum_auto_send' || messageType === 'momentum_followup' || messageType === 'momentum_reply_draft' || sendAuthority === 'momentum_auto' ) {
      return {
        key: 'auto_outreach',
        label: 'Auto Outreach',
        tone: 'auto',
        reason: sendReasonLabel || 'Sent automatically by Signal Engine.'
      };
    }

    if ( messageType === 'campaign_sequence_send' ) {
      return {
        key: 'campaign_sequence',
        label: 'Sequence',
        tone: 'campaign',
        reason: sendReasonLabel || 'Sent by a launched campaign sequence.'
      };
    }

    if ( messageType === 'campaign_launch_send' || sendAuthority === 'campaign' || !!email?.campaignId ) {
      return {
        key: 'campaign',
        label: 'Campaign',
        tone: 'campaign',
        reason: sendReasonLabel || 'Sent by a launched campaign.'
      };
    }

    if ( messageType === 'maya_send' || sendAuthority === 'maya' || String( email?.signalOrigin || '' ).trim().toLowerCase() === 'maya' || String( ( email as any )?.sourceSystem || '' ).trim().toLowerCase() === 'maya' ) {
      return {
        key: 'maya',
        label: 'Maya',
        tone: 'neutral',
        reason: sendReasonLabel || 'Sent by Maya.'
      };
    }

    if ( messageType === 'catalyst_send' || sendAuthority === 'catalyst' || String( email?.signalOrigin || '' ).trim().toLowerCase() === 'catalyst' ) {
      return {
        key: 'catalyst',
        label: 'Catalyst',
        tone: 'neutral',
        reason: sendReasonLabel || 'Sent from Catalyst.'
      };
    }

    return {
      key: 'manual',
      label: 'Manual',
      tone: 'manual',
      reason: sendReasonLabel || 'Sent manually from Compose.'
    };
  }

  private buildSendSourceSummary ( emails: EmailSentCard[] ): EmailSendSourceSummary[] {
    const counts = new Map<string, EmailSendSourceSummary>();

    emails.forEach( email => {
      const key = String( email?.sendSourceKey || 'manual' ).trim();
      const label = String( email?.sendSourceLabel || 'Manual' ).trim() || 'Manual';
      const existing = counts.get( key );
      if ( existing ) {
        existing.count += 1;
        return;
      }
      counts.set( key, { key, label, count: 1 } );
    } );

    return Array.from( counts.values() )
      .sort( ( a, b ) => b.count - a.count || a.label.localeCompare( b.label ) );
  }

  private buildFollowUpCandidate ( email: Email | any, reason: string ): EmailSentFollowUpCandidate {
    return {
      to: String( email?.to || '' ).trim(),
      subject: this.getEmailSubject( email ),
      reason,
      clickCount: this.getClickCount( email ),
      openCount: this.getOpenCount( email ),
      sentDate: this.getEmailSentDateIso( email )
    };
  }

  private buildTopSubjects ( emails: Email[] ): { subject: string; count: number; }[] {
    const subjectMap = new Map<string, number>();

    emails.forEach( email => {
      const subject = this.getEmailSubject( email );
      if ( !subject ) return;
      subjectMap.set( subject, ( subjectMap.get( subject ) || 0 ) + 1 );
    } );

    return Array.from( subjectMap.entries() )
      .map( ( [subject, count] ) => ( { subject, count } ) )
      .sort( ( a, b ) => b.count - a.count )
      .slice( 0, 5 );
  }
  private buildWorstSubjects ( emails: Email[] ): { subject: string; count: number; }[] {
    const subjectMap = new Map<string, number>();

    emails.forEach( email => {
      const subject = this.getEmailSubject( email );
      if ( !subject ) return;
      subjectMap.set( subject, ( subjectMap.get( subject ) || 0 ) + 1 );
    } );

    return Array.from( subjectMap.entries() )
      .map( ( [subject, count] ) => ( { subject, count } ) )
      .sort( ( a, b ) => a.count - b.count )
      .slice( 0, 5 );
  }

  private buildAssistantContextFromEmails ( emails: Email[] ): EmailSentAssistantContext {
    const safeEmails = Array.isArray( emails ) ? emails : [];
    const totalEmails = safeEmails.length;
    const openedEmails = safeEmails.filter( email => this.getOpenCount( email ) > 0 ).length;
    const clickedEmails = safeEmails.filter( email => this.getClickCount( email ) > 0 ).length;
    const totalClicks = safeEmails.reduce( ( sum, email ) => sum + this.getClickCount( email ), 0 );
    const unopenedEmails = Math.max( totalEmails - openedEmails, 0 );

    const followUpNow = safeEmails
      .filter( email => this.getClickCount( email ) > 0 )
      .map( email => this.buildFollowUpCandidate( email, 'Clicked a link. Follow up now.' ) )
      .slice( 0, 10 );

    const warmRecipients = safeEmails
      .filter( email => this.getClickCount( email ) > 0 )
      .map( email => this.buildFollowUpCandidate( email, 'Clicked a link. High interest.' ) )
      .slice( 0, 10 );

    const openedNoClickRecipients = safeEmails
      .filter( email => this.getOpenCount( email ) > 0 && this.getClickCount( email ) === 0 )
      .map( email => this.buildFollowUpCandidate( email, 'Opened but did not click. Consider a tighter follow-up.' ) )
      .slice( 0, 10 );

    const coldRecipients = safeEmails
      .filter( email => this.getOpenCount( email ) === 0 && this.getClickCount( email ) === 0 )
      .map( email => this.buildFollowUpCandidate( email, 'No opens or clicks yet.' ) )
      .slice( 0, 10 );

    return {
      page: 'email-sent',
      rangeDays: 7,
      totalEmails,
      openedEmails,
      unopenedEmails,
      clickedEmails,
      totalClicks,
      clickThroughRate: totalEmails > 0 ? Number( ( clickedEmails / totalEmails ).toFixed( 4 ) ) : 0,
      openRate: totalEmails > 0 ? Number( ( openedEmails / totalEmails ).toFixed( 4 ) ) : 0,
      followUpNow,
      warmRecipients,
      coldRecipients,
      openedNoClickRecipients,
      topSubjects: this.buildTopSubjects( safeEmails ),
      worstSubjects: this.buildWorstSubjects( safeEmails )
    };
  }

  getAssistantContextSnapshot (): EmailSentAssistantContext {
    return this.buildAssistantContextFromEmails( this.filteredEmails );
  }

  toggleMayaOnlyFilter (): void {
    this.mayaOnlyFilter = !this.mayaOnlyFilter;
    this.applyEmailFilters();
  }

  fetchEmails (): void {
    if ( this.emailsSubscription ) {
      this.emailsSubscription.unsubscribe();
    }

    this.triggerLoading( true );
    this.nextCursor = null;
    this.hasMoreEmails = false;
    this.emails = [];
    this.data = [];
    this.filteredEmails = [];

    this.emailsSubscription = this.emailApiService.getEmails( {
      pageSize: this.pageSize
    } ).subscribe( {
      next: response => {
        const records = ( response?.data?.records || [] ).map( email => this.toEmailSentCard( email ) );

        this.emails = records;
        this.data = [...records];
        this.nextCursor = response?.data?.nextCursor || null;
        this.hasMoreEmails = Boolean( response?.data?.hasMore );
        this.applyEmailFilters();
        this.triggerLoading( false );
      },
      error: error => {
        this.logger.error( 'Error retrieving emails', error );
        this.emails = [];
        this.data = [];
        this.filteredEmails = [];
        this.nextCursor = null;
        this.hasMoreEmails = false;
        this.sendSourceSummary = [];
        this.emailSentAssistantContext = this.buildAssistantContextFromEmails( [] );
        this.assistantContextChange.emit( this.emailSentAssistantContext );
        this.triggerLoading( false );
      }
    } );
  }

  onPageSizeChange ( size: number ): void {
    const parsed = Number( size );
    if ( !parsed || parsed === this.pageSize ) return;

    this.pageSize = parsed;
    this.nextCursor = null;
    this.hasMoreEmails = false;
    this.emails = [];
    this.data = [];
    this.filteredEmails = [];

    this.fetchEmails();
  }

  loadMore (): void {
    if ( !this.hasMoreEmails || !this.nextCursor ) {
      return;
    }

    this.soundService.playSound( 'click' );
    this.triggerLoading( true );

    this.emailApiService.getEmails( {
      pageSize: this.pageSize,
      cursor: this.nextCursor
    } ).subscribe( {
      next: response => {
        const moreData = ( response?.data?.records || [] ).map( email => this.toEmailSentCard( email ) );

        this.data = this.data.concat( moreData );
        this.emails = [...this.data];
        this.nextCursor = response?.data?.nextCursor || null;
        this.hasMoreEmails = Boolean( response?.data?.hasMore );
        this.applyEmailFilters();
        this.triggerLoading( false );
      },
      error: error => {
        this.logger.error( 'Error loading more emails', error );
        this.triggerLoading( false );
      }
    } );
  }

  initializeFilteredEmails () {
    this.applyEmailFilters();
  }

  selectEmail ( email: EmailSentCard ): void {
    this.itemSelected.emit( email );
    window.scrollTo( 0, 0 );
  }

  getClickTooltip ( email: any ): string {
    if ( !email || !email.clicks || !email.clicks.length ) return '';
    return email.clicks
      .map( ( click: { url: any; timestamp: { toDate: () => { toLocaleString: () => any; }; }; } ) => `${click.url} - ${click.timestamp && click.timestamp.toDate ? click.timestamp.toDate().toLocaleString() : ''}` )
      .join( '\n' );
  }

  getRecipientInitial ( email: Email ): string {
    const to = ( email?.to || '' ).trim();
    if ( !to ) return '?';
    return to.charAt( 0 ).toUpperCase();
  }

  private applyEmailFilters (): void {
    const nextEmails = this.mayaOnlyFilter
      ? this.data.filter( email => String( email?.sendSourceKey || '' ).trim().toLowerCase() === 'maya' )
      : [...this.data];
    this.filteredEmails = nextEmails;
    this.sendSourceSummary = this.buildSendSourceSummary( nextEmails );
    this.emailSentAssistantContext = this.buildAssistantContextFromEmails( nextEmails );
    this.assistantContextChange.emit( this.emailSentAssistantContext );
  }
}
