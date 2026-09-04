import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { Contact } from '../../models/contact.model';
import { EmailService } from '../../services/email.service';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { LoggerService } from '../../services/logger.service';
import { firstValueFrom } from 'rxjs';
import { OutreachApiService } from '../../services/outreach-api.service';

@Component( {
  selector: 'app-email-option-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './email-option-button.component.html',
  styleUrl: './email-option-button.component.css',
} )
export class EmailOptionButtonComponent implements OnInit, OnDestroy {
  /**
   * Contact we are emailing (recipient).
   */
  @Input() contact: Contact | null = null;

  @Input() emailAddress: string | undefined = undefined;

  /**
   * Sender/contact representing the logged in user.
   * Used to build unified prompt context just like EmailEditor.
   */
  @Input() sender: Contact | null = null;

  /**
   * Optional reason or intent for this email
   * (e.g. "follow up", "proposal", etc.)
   */
  @Input() reason: string | null = null;

  /**
   * Optional hint for the subject line.
   */
  @Input() subjectHint: string = '';

  /**
   * If provided, we use this userId directly.
   * Otherwise, we fetch it from OutreachAuthService.
   */
  @Input() userId?: string;

  @Input() tenantId?: string;

  /**
   * Controls visual presentation in tight layouts.
   * 'button' = pill buttons with text labels
   * 'icon'   = compact icon-only buttons (better for lists)
   */
  @Input() displayMode: 'button' | 'icon' = 'button';

  /**
   * Emits when the user chooses to compose inside TODD.
   * Parent can open EmailEditor prefilled with AI subject/body.
   */
  @Output() composeInTodd = new EventEmitter<{
    contact: Contact | null;
    emailAddress: string | undefined;
    subject: string;
    body: string;
  }>();

  /**
   * Emits when an error occurs during AI drafting.
   */
  @Output() draftError = new EventEmitter<any>();

  @Output() emailAction = new EventEmitter<void>();

  isLoading = false;

  private userSub?: Subscription;

  constructor (
    private emailService: EmailService,
    private authService: OutreachAuthService,
    private logger: LoggerService,
    private outreachApi: OutreachApiService
  ) { }

  ngOnInit (): void {
    if ( !this.userId ) {
      this.userSub = this.authService.getUserId().subscribe( ( id ) => {
        this.userId = id;
      } );
    }
  }

  ngOnDestroy (): void {
    this.userSub?.unsubscribe();
  }

  /**
   * Entry point: user clicked "Use TODD" button.
   * We draft with AI and let the parent route into the full editor.
   */
  async onComposeInToddClick ( event?: MouseEvent ): Promise<void> {
    this.logger.info( "COMPOSE IN TODD" );

    event?.stopPropagation();

    if ( !this.contact && !this.emailAddress ) {
      this.logger.warn( 'EmailOptionButton: onComposeInToddClick called without contact' );
      return;
    }

    // Let the parent handle navigation to /compose-email (or any other route),
    // reusing the existing onEmail(contact) logic there.
    this.composeInTodd.emit( {
      contact: this.contact,
      emailAddress: this.emailAddress,
      subject: '',
      body: '',
    } );
  }

  /**
   * Entry point: user clicked "Email app" button.
   * We draft with AI, then open mailto: with subject/body filled.
   */
  async onComposeInNativeClick ( event?: MouseEvent ): Promise<void> {
    event?.stopPropagation();
    await this.composeWithAi( 'native' );
    this.emailAction.emit();
  }

  private async checkForContactOrEmailAddress (): Promise<void> {
    // If we already have a contact, nothing to do.
    if ( this.contact ) {
      return;
    }

    // If we don't even have an email address, we can't look anything up.
    if ( !this.emailAddress ) {
      return;
    }

    try {
      const response = await firstValueFrom( this.outreachApi.getOutreachContactByEmail(
        this.emailAddress,
        {
          tenantId: this.tenantId,
          userId: this.userId
        }
      ) );
      const contact = response?.data;
      if ( contact ) {
        this.contact = contact;
      }
    } catch ( err ) {
      this.logger.error(
        'EmailOptionButton: failed to fetch contact by email',
        err
      );
    }
  }

  /**
   * Shared logic to call OpenAI, parse the response,
   * then either emit for TODD or open the native client.
   */
  private async composeWithAi (
    mode: 'todd' | 'native'
  ): Promise<void> {

    // Try to resolve a Contact from the email address if needed
    await this.checkForContactOrEmailAddress();

    if ( !this.contact || !this.contact.emailAddresses?.[0]?.emailAddress ) {
      this.logger.warn( 'EmailOptionButton: missing contact or contact.email', this.emailAddress );
      return;
    }

    if ( !this.userId ) {
      this.logger.warn( 'EmailOptionButton: missing userId; cannot call OpenAI yet.' );
      return;
    }

    this.isLoading = true;

    try {
      const aiResponse = await this.emailService.generateEmailDraftFromEditor(
        {
          userId: this.userId,
          tenantId: this.tenantId,
          subject: this.subjectHint || '',
          htmlContext: '',
          selectedContact: this.contact || null,
          sender: this.sender || undefined,
          reason: this.reason || null,
          handoffSource: 'email_option_button',
          draftIntent: 'fresh_outbound',
          toneCode: 'direct'
        } as any,
        null
      )
        .toPromise();

      const subject = String( aiResponse?.subject || '' ).trim();
      const body = String( aiResponse?.body || '' ).trim();

      if ( !subject && !body ) {
        this.logger.warn( 'EmailOptionButton: AI response missing subject/body' );
        return;
      }

      if ( mode === 'todd' ) {
        this.composeInTodd.emit( {
          contact: this.contact,
          emailAddress: this.emailAddress,
          subject,
          body,
        } );
      } else {
        this.openInNativeClient( subject, body );
      }
    } catch ( err ) {
      this.logger.error( 'EmailOptionButton: composeWithAi failed', err );
      this.draftError.emit( err );
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Open the user's default mail client with subject/body prefilled.
   * Uses a simple mailto: URL; body is plain text.
   */
  private openInNativeClient ( subject: string, body: string ): void {
    const to = encodeURIComponent( this.contact?.emailAddresses?.[0]?.emailAddress || this.emailAddress || '' );
    const encodedSubject = encodeURIComponent( subject || '' );
    const encodedBody = encodeURIComponent(
      String( body || '' )
        .replace( /<br\s*\/?>/gi, '\n' )
        .replace( /<\/p>/gi, '\n\n' )
        .replace( /<[^>]*>/g, ' ' )
        .replace( /\s+\n/g, '\n' )
        .replace( /\n{3,}/g, '\n\n' )
        .trim()
    );

    const mailtoUrl = `mailto:${to}?subject=${encodedSubject}&body=${encodedBody}`;

    this.logger.info( 'EmailOptionButton: opening native client', mailtoUrl );
    window.location.href = mailtoUrl;
  }
}
