import {
  Component,
  ViewChild,
  ElementRef,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage';
import { firstValueFrom, Subscription } from 'rxjs';

import { LoggerService } from '../../../services/logger.service';
import { Contact } from '../../../models/contact.model';
import { SoundService } from '../../../services/sound.service';
import { EmailService } from '../../../services/email.service';
import { CapitalizeFirstPipe } from '../../../pipes/capitalize-first.pipe';
import { OutreachAuthService } from '../../../services/outreach-auth.service';
import { OutreachNotificationService } from '../../../services/outreach-notification.service';

/**
 * Ported near-verbatim from shared/page/email-editor/email-editor.component.ts
 * (1,553 lines) - this component isn't in the task's explicit shared/page
 * list, but is a live dependency of both InboxAccessComponent (mode
 * 'document', reply box) and EmailCreateComponent (default mode 'email',
 * full template/tone/campaign-draft flow - confirmed by checking both
 * components' actual template bindings before trimming, since
 * InboxAccessComponent's usage alone would have let most of this be cut).
 *
 * Dropped: `mode === 'signature'` branches and loadSignatureFromSelectedContact
 * (no ported route uses signature mode), the unused `ads` property (assigned
 * from a marketing landing-page export but never read anywhere in the
 * original file), and generateCampaignUnifiedPrompt/its only caller path
 * (dead code in the original - never invoked from the template or any
 * other method). Everything else - formatting toolbar, image upload,
 * grammar check, Maya rewrite, template picker + EMAIL_TEMPLATES, campaign
 * draft dropdown, tone-triggered generation - is kept because
 * EmailCreateComponent's default 'email' mode exercises all of it.
 */
export const EMAIL_TEMPLATES = {
  yourSuccess: `
    <!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
  <title>{{subject}}</title>
  <style>
    /* Some clients strip <style>. Kept minimal; most styling is inline. */
    @media (max-width: 620px) {
      .container {
        width: 100% !important;
      }

      .px {
        padding-left: 18px !important;
        padding-right: 18px !important;
      }

      .h1 {
        font-size: 26px !important;
        line-height: 32px !important;
      }

      .h2 {
        font-size: 18px !important;
        line-height: 24px !important;
      }
    }

    /* Dark mode (supported in Apple Mail, some others) */
    @media (prefers-color-scheme: dark) {
      .bg {
        background-color: #0b0f19 !important;
      }

      .card {
        background-color: #111827 !important;
      }

      .text {
        color: #e5e7eb !important;
      }

      .muted {
        color: #cbd5e1 !important;
      }

      .rule {
        border-color: rgba(255, 255, 255, 0.12) !important;
      }

      .chip {
        background-color: rgba(255, 255, 255, 0.06) !important;
        border-color: rgba(255, 255, 255, 0.12) !important;
      }

      .footer {
        color: rgba(229, 231, 235, 0.75) !important;
      }
    }
  </style>
</head>

<body class="bg" style="margin:0; padding:0; background:#f3f4f6;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;"> {{subject}} </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6; margin:0; padding:0;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <!-- Container -->
        <table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px; max-width:600px;">
          <!-- Header -->
          <tr>
            <td class="px" style="padding:0 28px 14px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="left" style="padding:0;">
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:14px; color:#111827; letter-spacing:0.2px;">
                      <span style="display:inline-block; padding:6px 10px; border:1px solid rgba(17,24,39,0.12); border-radius:999px; background:#ffffff;">  </span>
                    </div>
                  </td>
                  <td align="right" style="padding:0;">
                    <!-- Optional: logo text -->
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:14px; color:#111827; font-weight:700;"> Taliferro Tech </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td class="card" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(17,24,39,0.08);">
              <!-- Top accent -->
              <div style="height:6px; background:linear-gradient(90deg, #0ea5e9, #6366f1);"></div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td class="px" style="padding:26px 28px 8px 28px;">
                    <div class="text h1" style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:30px; line-height:36px; color:#111827; font-weight:800; margin:0;"> {{subject}} </div>
                    <div class="muted" style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:16px; line-height:24px; color:#374151; margin-top:10px;"> Building for the Remarkable </div>
                  </td>
                </tr>
                <tr>
                  <td class="px" style="padding:8px 28px 0 28px;">
                    <hr class="rule" style="border:none; border-top:1px solid rgba(17,24,39,0.10); margin:14px 0;" />
                  </td>
                </tr>
                <!-- Body copy (paste your text here) -->
                <tr>
                  <td class="px" style="padding:4px 28px 0 28px;">
                    <div class="text" style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:16px; line-height:26px; color:#111827;"> Hi {{firstName}}, <br /><br /> {{content}}</div>
                  </td>
                </tr>
                <!-- Key rule chips -->
                <tr>
                  <td class="px" style="padding:18px 28px 0 28px;">
                    <div class="h2 text" style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:20px; line-height:26px; color:#111827; font-weight:800; margin:0;"> Key Points: </div>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:12px;">
                      <tr>
                        <td class="chip" style="padding:12px 14px; border:1px solid rgba(17,24,39,0.10); border-radius:14px; background:#f9fafb;">
                          <div class="text" style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:15px; line-height:22px; color:#111827;">
                            <strong>Point 1</strong>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="height:10px; font-size:1px; line-height:1px;">&nbsp;</td>
                      </tr>
                      <tr>
                        <td class="chip" style="padding:12px 14px; border:1px solid rgba(17,24,39,0.10); border-radius:14px; background:#f9fafb;">
                          <div class="text" style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:15px; line-height:22px; color:#111827;">
                            <strong>Point 2</strong>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="height:10px; font-size:1px; line-height:1px;">&nbsp;</td>
                      </tr>
                      <tr>
                        <td class="chip" style="padding:12px 14px; border:1px solid rgba(17,24,39,0.10); border-radius:14px; background:#f9fafb;">
                          <div class="text" style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:15px; line-height:22px; color:#111827;"> Point 3 </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Launch + selection -->
                <tr>
                  <td class="px" style="padding:18px 28px 0 28px;">
                    <div class="text" style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:16px; line-height:26px; color:#111827;">Additional Content <br /><br />
                    </div>
                  </td>
                </tr>
                <!-- CTA -->
                <tr>
                  <td class="px" style="padding:22px 28px 8px 28px;">
                    <!--[if mso]>
                      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                        href="{{ctaLink}}" style="height:46px;v-text-anchor:middle;width:260px;" arcsize="14%" strokecolor="#0ea5e9" fillcolor="#0ea5e9">
                        <w:anchorlock/>
                        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">
                          CTA
                        </center>
                      </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <a href="{{imageURL}}" target="_blank" style="display:inline-block; background:#0ea5e9; color:#ffffff; text-decoration:none; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; font-size:16px; font-weight:800; padding:12px 18px; border-radius:12px;"> Image Title </a>
                    <!--<![endif]-->
                  </td>
                </tr>
                <!-- Closing -->
                <tr>
                  <td class="px" style="padding:8px 28px 22px 28px;">
                    <div class="text" style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size:16px; line-height:26px; color:#111827;"> Closing <br /><br /> <br />
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="height:16px; font-size:1px; line-height:1px;">&nbsp;</td>
          </tr>
        </table>
        <!-- /Container -->
      </td>
    </tr>
  </table>
</body>

</html>
  `,
  minimal: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="text-align:center;">
        <h1 style="font-size:24px;margin:0 0 10px;">{{subject}}</h1>
        <p style="margin:0 0 24px;"><font size="3">{{content}}</font></p>
              <img src="assets/placeholder-image.svg" alt="{{subject}}" style="width:100%;border-radius:8px;margin-bottom:20px;">

        <a class="button" href="{{ctaLink}}" style="display:inline-block;padding:12px 24px;background:#f4c542;color:#000;text-decoration:none;font-weight:bold;border-radius:4px;">
          Take a Look
        </a>
        <p><br></p><p>{{signature}}</p>
      </div>
    </div>
  `,
  hero: `
    <div style="text-align: center; padding: 40px;">
  <img src="assets/placeholder-image.svg" alt="Hero Image" style="width: 100%; max-width: 600px; border-radius: 8px;">
  <h1 style="font-size: 24px; font-weight: bold; margin-top: 30px;">{{subject}}</h1>
  <p style="color: #333;"><font size="3">{{content}}</font></p>
  <a href="{{ctaLink}}" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #000; color: #fff; text-decoration: none; border-radius: 4px;">See it in action</a>
  <p><br></p><p>{{signature}}</p>
</div>
  `,
  textOnly: `
    <div style="margin:0 auto;padding:20px;font-family:'Segoe UI',sans-serif;line-height:1.5;border-radius:12px;">

      <p><font size="3">{{content}}</font></p>

      <p>
        <a href="{{ctaLink}}" style="display:inline-block;
                             background:#f4c542;
                             color:#000;
                             padding:12px 24px;
                             text-decoration:none;
                             border-radius:6px;
                             font-weight:bold;">
          Take a Peek
        </a>
      </p>
      <p><br></p>
      <p>{{signature}}</p>

    </div>
  `,
};

@Component( {
  selector: 'app-email-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CapitalizeFirstPipe,
  ],
  templateUrl: './email-editor.component.html',
  styleUrl: './email-editor.component.css',
} )
export class EmailEditorComponent
  implements OnInit, OnDestroy, OnChanges, AfterViewInit {
  @Output() loader = new EventEmitter<boolean>();

  @Input() mode: 'email' | 'proposal' | 'document' = 'email';

  @Input() selectedContact: Contact | null = null;

  @Input() subject: string = '';

  @Input() userId!: string;

  @Input() sender!: Contact;

  @Input() body: string = '';

  @Input() reason!: string | null;

  @Input() campaignName!: string | null;

  @Input() campaignText!: string | null;

  @Output() htmlContentChange = new EventEmitter<string>();

  @Output() textContentChange = new EventEmitter<string>();

  @Output() subjectChange = new EventEmitter<string>();

  @Output() useTemplateChange = new EventEmitter<boolean>();

  selectedTemplate: '' | keyof typeof EMAIL_TEMPLATES = '';

  tenantSubscription!: Subscription;

  userSubscription!: Subscription;

  tenantId!: any;

  hookLoading = false;

  templates: Record<'minimal' | 'hero' | 'textOnly' | 'yourSuccess', string> = EMAIL_TEMPLATES;

  campaignDraftKeys: string[] = [];

  selectedDraftKey: string = '';

  isChecking: boolean = false;

  campaignDrafts: {
    [stage: string]: { subject: string; body: string; };
  } | null = null;

  @ViewChild( 'editorRef', { static: false } )
  editorRef!: ElementRef<HTMLDivElement>;

  private _htmlContent: string = '';

  @Input()
  set htmlContent ( value: string ) {
    if ( value !== this._htmlContent ) {
      this._htmlContent = value;
      this.updateEditorContent();
    }
  }

  get htmlContent (): string {
    return this._htmlContent;
  }

  storage = getStorage();

  fonts = ['Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana'];

  selectedFont = this.fonts[0];

  uploadProgress: number = 0;

  isLoading: boolean = false;

  isMayaDrafting: boolean = false;

  readonly mayaAvatarSrc = 'assets/marketing/marketing-director-avatar.png';

  isCodeView: boolean = false;

  isUsingTemplate: boolean = false;

  constructor (
    private logger: LoggerService,
    private authService: OutreachAuthService,
    private soundService: SoundService,
    private emailService: EmailService,
    private notificationService: OutreachNotificationService
  ) { }

  ngOnInit () {
    this.setSystemUser();
    this.updateEditorContent();
    this.checkForCampaign();
  }

  ngOnDestroy (): void {
    if ( this.userSubscription ) this.userSubscription.unsubscribe();
    if ( this.tenantSubscription ) this.tenantSubscription.unsubscribe();
  }

  ngOnChanges ( changes: SimpleChanges ) {
    if ( changes['campaignText'] ) {
      const incoming = changes['campaignText'].currentValue as string | null;
      if ( typeof incoming === 'string' && incoming !== this._htmlContent ) {
        this._htmlContent = incoming;
        this.updateEditorContent();
      }
    }
    if ( changes['htmlContent'] ) {
      this.updateEditorContent();
    }

    if (
      ( changes['selectedContact'] || changes['sender'] ) &&
      this.selectedContact &&
      this.sender
    ) {
      this.logger.info( 'SELECTED CONTACT CHANGED (no auto-generate)', this.selectedContact );
    }

    if (
      changes['subject'] &&
      !changes['subject'].firstChange &&
      this.selectedDraftKey
    ) {
      this.emailService.updateDraftStage(
        this.selectedDraftKey,
        changes['subject'].currentValue,
        this._htmlContent
      );
    }
  }

  ngAfterViewInit (): void {
    if ( this.campaignName?.includes( 'Follow Up/' ) && this.campaignText ) {
      this.logger.info( 'Follow-up campaign detected (no auto-generate). User may choose tone to generate.', {
        campaignName: this.campaignName,
      } );
    }
  }

  /**
   * Checks for campaign draft details retrieved from the email service.
   * Updates the campaign drafts state, emits subject and content updates, and plays a sound when a draft is found.
   */
  checkForCampaign () {
    const campaign = this.emailService.getCampaignDrafts();
    if ( campaign?.drafts?.parsedQuery ) {
      this.campaignDrafts = campaign.drafts.parsedQuery;
      this.selectedDraftKey = Object.keys( this.campaignDrafts ?? {} )[0];

      const draft = this.campaignDrafts?.[this.selectedDraftKey];
      if ( draft ) {
        setTimeout( () => {
          this.subjectChange.emit( draft.subject );
          this._htmlContent = draft.body;
          this.updateEditorContent();

          this.htmlContentChange.emit( this._htmlContent );
          this.textContentChange.emit(
            this.convertHtmlToText( this._htmlContent )
          );
          this.soundService.playSound( 'finished' );
        } );
      }
    }
  }

  setSystemUser () {
    if ( !this.userId ) {
      this.userSubscription = this.authService
        .getUserId()
        .subscribe( ( userId ) => {
          this.userId = userId;
        } );
    }

    if ( !this.tenantId ) {
      this.tenantSubscription = this.authService
        .getTenantId()
        .subscribe( ( tenantId ) => {
          this.tenantId = tenantId;
        } );
    }
  }

  onDraftChange ( event: Event ): void {
    const target = event.target as HTMLSelectElement;
    this.selectDraft( target.value );
  }

  onSubjectChange ( newSubject: string ): void {
    this.subjectChange.emit( newSubject );
    if ( this.selectedDraftKey ) {
      this.emailService.updateDraftStage(
        this.selectedDraftKey,
        newSubject,
        this._htmlContent
      );
    }
  }

  toggleView () {
    if ( !this.isCodeView ) {
      this._htmlContent = this.editorRef.nativeElement.innerHTML;
    }

    this.isCodeView = !this.isCodeView;

    if ( !this.isCodeView ) {
      setTimeout( () => {
        this.updateEditorContent();
      }, 0 );
    }
  }

  updateEditorContent ( force = false ) {
    if ( this.isCodeView || !this.editorRef ) {
      return;
    }

    if ( !force && this.editorRef.nativeElement === document.activeElement ) {
      return;
    }

    let html = this._htmlContent || '';

    // If a full HTML document was passed in, extract the body content
    if ( html.includes( '<body' ) ) {
      const parser = new DOMParser();
      const doc = parser.parseFromString( html, 'text/html' );
      html = doc.body.innerHTML;
    }

    this.editorRef.nativeElement.innerHTML = html;
    this.fitImages();
  }

  format ( command: string ) {
    document.execCommand( command, false, undefined );
  }

  formatBlock ( tag: string ) {
    const selection = window.getSelection();
    if ( selection && selection.rangeCount > 0 ) {
      const container = selection.getRangeAt( 0 ).commonAncestorContainer;
      const parentElement =
        container.nodeType === Node.ELEMENT_NODE
          ? ( container as HTMLElement )
          : container.parentElement;
      if ( parentElement && parentElement.tagName.toLowerCase() === tag ) {
        document.execCommand( 'formatBlock', false, 'p' );
      } else {
        document.execCommand( 'formatBlock', false, tag );
      }
    }
  }

  changeFont ( event: Event ) {
    const target = event.target as HTMLSelectElement;
    const font = target.value;
    document.execCommand( 'fontName', false, font );
    this.selectedFont = font;
  }

  insertImage ( event: Event ) {
    const input = event.target as HTMLInputElement;
    if ( input.files && input.files[0] && this.editorRef ) {
      this.uploadFile( input.files[0] );
    }
  }

  createList ( type: 'insertOrderedList' | 'insertUnorderedList' ) {
    document.execCommand( type, false, undefined );
  }

  alignText ( align: 'left' | 'center' | 'right' | 'justify' ) {
    document.execCommand(
      'justify' + align.charAt( 0 ).toUpperCase() + align.slice( 1 ),
      false,
      undefined
    );
  }

  fitImages () {
    const images = this.editorRef.nativeElement.querySelectorAll( 'img' );
    images.forEach( ( img: HTMLImageElement ) => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.cursor = 'pointer';
      img.setAttribute( 'width', '100%' );
      img.setAttribute( 'max-width', '100%' );
      img.onclick = () => this.selectImage( img );
    } );
  }

  insertTwoColumnLayout () {
    const html = `
      <table role="presentation" cellspacing="5" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="width: 50%; padding: 10px; border: 1px solid #ddd;">
            <!-- Column 1 -->
          </td>
          <td style="width: 50%; padding: 10px; border: 1px solid #ddd;">
            <!-- Column 2 -->
          </td>
        </tr>
      </table>
      <br />
    `;
    document.execCommand( 'insertHTML', false, html );
  }

  selectImage ( img: HTMLImageElement ) {
    const newSize = prompt(
      'Enter new width in pixels (e.g., 300):',
      img.width.toString()
    );
    if ( newSize ) {
      img.width = parseInt( newSize, 10 );
      this.onInput();
    }
  }

  changeFontSize ( event: Event ) {
    const target = event.target as HTMLSelectElement;
    const fontSize = target.value;
    document.execCommand( 'fontSize', false, fontSize );
  }

  changeFontColor ( event: Event ) {
    const target = event.target as HTMLInputElement;
    const color = target.value;
    document.execCommand( 'foreColor', false, color );
  }

  changeBackgroundColor ( event: Event ) {
    const target = event.target as HTMLInputElement;
    const color = target.value;
    document.execCommand( 'hiliteColor', false, color );
  }

  createLink () {
    const url = prompt( 'Enter the URL' );
    if ( url ) {
      document.execCommand( 'createLink', false, url );
    }
  }

  onInput () {
    if ( this.isCodeView ) {
      this.htmlContentChange.emit( this._htmlContent );
    } else {
      this._htmlContent = this.editorRef.nativeElement.innerHTML;
      this.htmlContentChange.emit( this._htmlContent );

      if ( this.selectedDraftKey ) {
        this.emailService.updateDraftStage(
          this.selectedDraftKey,
          this.subject,
          this._htmlContent
        );
      }
    }
  }

  uploadFile ( file: File ) {
    const folder = this.userId ? `uploads/${this.userId}` : `uploads`;
    const storageRef = ref( this.storage, `${folder}/${file.name}` );
    const uploadTask = uploadBytesResumable( storageRef, file );

    uploadTask.on(
      'state_changed',
      ( snapshot ) => {
        const progress =
          ( snapshot.bytesTransferred / snapshot.totalBytes ) * 100;
        this.uploadProgress = progress;
      },
      ( error ) => {
        this.logger.error( 'Upload error:', error );
      },
      () => {
        getDownloadURL( uploadTask.snapshot.ref ).then( ( downloadURL ) => {
          document.execCommand( 'insertImage', false, downloadURL );
          this.fitImages();
          this.onInput();
        } );
      }
    );
  }

  convertHtmlToText ( html: string ): string {
    const div = document.createElement( 'div' );
    div.innerHTML = html;

    const brs = div.getElementsByTagName( 'br' );
    for ( let i = 0; i < brs.length; i++ ) {
      brs[i].outerHTML = '\n';
    }

    const paragraphs = div.getElementsByTagName( 'p' );
    for ( let i = 0; i < paragraphs.length; i++ ) {
      paragraphs[i].outerHTML = '\n' + paragraphs[i].innerHTML + '\n';
    }

    const lists = div.getElementsByTagName( 'ul' );
    for ( let i = 0; i < lists.length; i++ ) {
      const listItems = lists[i].getElementsByTagName( 'li' );
      for ( let j = 0; j < listItems.length; j++ ) {
        listItems[j].outerHTML = '- ' + listItems[j].innerHTML + '\n';
      }
      lists[i].outerHTML = '\n' + lists[i].innerHTML + '\n';
    }

    const ols = div.getElementsByTagName( 'ol' );
    for ( let i = 0; i < ols.length; i++ ) {
      const listItems = ols[i].getElementsByTagName( 'li' );
      for ( let j = 0; j < listItems.length; j++ ) {
        listItems[j].outerHTML = j + 1 + '. ' + listItems[j].innerHTML + '\n';
      }
      ols[i].outerHTML = '\n' + ols[i].innerHTML + '\n';
    }

    return div.textContent || div.innerText || '';
  }

  clearEditor () {
    this.editorRef.nativeElement.innerHTML = '';
    this.onInput();
  }

  showToneSelection () {
    if ( this.mode !== 'email' ) return;
    this.generateEmailContent();
  }

  onUseTemplate () {
    setTimeout( () => {
      this.useTemplateChange.emit( this.isUsingTemplate );
    }, 500 );
  }

  private coerceFirstName ( c: Contact | null | undefined ): string {
    const raw = ( c as any )?.firstName || ( c as any )?.name || '';
    const name = String( raw || '' ).trim();
    if ( !name ) return '';
    return name.split( /\s+/ )[0];
  }

  private buildEmailSignature (): string {
    const s: any = this.sender as any;
    const sig = String( s?.signature || '' ).trim();
    if ( sig ) return sig;

    const name = String( s?.name || '' ).trim();
    const title = String( s?.title || '' ).trim();
    const company = String( s?.company || '' ).trim();

    const parts: string[] = [];
    if ( name ) parts.push( name );
    const line2 = [title, company].filter( Boolean ).join( ' | ' );
    if ( line2 ) parts.push( line2 );

    return parts.join( '<br />' );
  }

  private renderTemplate ( templateHtml: string, tokens: Record<string, string> ): string {
    let out = String( templateHtml || '' );
    Object.entries( tokens ).forEach( ( [k, v] ) => {
      const safe = v ?? '';
      out = out.replace( new RegExp( `\\{\\{\\s*${k}\\s*\\}\\}`, 'g' ), safe );
    } );
    return out;
  }

  private applySelectedTemplate ( subject: string, contentHtml: string ): string {
    const key = this.selectedTemplate as keyof typeof EMAIL_TEMPLATES;
    const template = key ? this.templates?.[key] : '';
    if ( !template ) {
      return contentHtml;
    }

    const firstName = this.coerceFirstName( this.selectedContact );
    const signature = this.buildEmailSignature();

    const tokens: Record<string, string> = {
      subject: String( subject || '' ),
      content: String( contentHtml || '' ),
      firstName: String( firstName || '' ),
      signature: String( signature || '' ),
      ctaLink: '',
      imageURL: '',
      imageTitle: ''
    };

    return this.renderTemplate( template, tokens );
  }

  async generateEmailContent () {
    const subject = String( this.subject || '' ).trim();

    this.isLoading = true;
    this.triggerLoading( true );

    try {
      const htmlContext = this.isCodeView
        ? ( this._htmlContent || '' )
        : ( this.editorRef?.nativeElement?.innerHTML || this._htmlContent || '' );

      const parsed = await firstValueFrom(
        this.emailService.generateEmailDraftFromEditor(
          {
            userId: this.userId,
            subject: subject || '',
            htmlContext,
            selectedContact: this.selectedContact,
            sender: this.sender,
            reason: this.reason || null,
            campaignName: this.campaignName || null,
          },
          null
        )
      );

      if ( !subject && parsed?.subject ) {
        this.subject = String( parsed.subject ).trim();
        this.subjectChange.emit( this.subject );
      }

      if ( parsed?.body ) {
        const bodyText = String( parsed.body ).trim();

        const contentHtml = bodyText.includes( '<' )
          ? bodyText
          : `<p>${bodyText
            .replace( /\n\n+/g, '</p><p>' )
            .replace( /\n/g, '<br>' )}</p>`;

        const shouldApplyTemplate = !!this.isUsingTemplate && !!this.selectedTemplate;
        this._htmlContent = shouldApplyTemplate
          ? this.applySelectedTemplate( this.subject || ( parsed?.subject || '' ), contentHtml )
          : contentHtml;

        this.updateEditorContent();
        this.htmlContentChange.emit( this._htmlContent );
        this.textContentChange.emit( this.convertHtmlToText( this._htmlContent ) );
      }

    } catch ( err: any ) {
      this.logger.error( 'generateEmailContent failed:', err );
      this.notificationService.show(
        'Email Generation Failure',
        err?.message || 'Unable to generate email right now.',
        'error'
      );
    } finally {
      this.isLoading = false;
      this.triggerLoading( false );
    }
  }

  async generateMayaEmailContent (): Promise<void> {
    const currentSubject = String( this.subject || '' ).trim();
    const htmlContext = this.isCodeView
      ? ( this._htmlContent || '' )
      : ( this.editorRef?.nativeElement?.innerHTML || this._htmlContent || '' );
    const normalizedDraftText = String( htmlContext || '' ).replace( /<[^>]+>/g, ' ' ).trim();
    const hasExistingDraft = !!currentSubject || !!normalizedDraftText;

    this.isMayaDrafting = true;
    this.isLoading = true;
    this.triggerLoading( true );

    try {
      const parsed = await firstValueFrom(
        this.emailService.generateEmailDraftFromEditor(
          {
            userId: this.userId,
            subject: currentSubject,
            htmlContext,
            selectedContact: this.selectedContact,
            sender: this.sender,
            reason: this.reason || null,
            campaignName: this.campaignName || null,
            senderPersona: 'maya',
            rewriteMode: hasExistingDraft,
            rejectedDraftSubject: hasExistingDraft ? currentSubject : null,
            rejectedDraftBody: hasExistingDraft ? htmlContext : null,
          },
          null
        )
      );

      const nextSubject = String( parsed?.subject || '' ).trim();
      const nextBody = String( parsed?.body || '' ).trim();

      if ( nextSubject ) {
        this.subject = nextSubject;
        this.subjectChange.emit( this.subject );
      }

      if ( nextBody ) {
        this._htmlContent = nextBody.includes( '<' )
          ? nextBody
          : `<p>${nextBody
            .replace( /\n\n+/g, '</p><p>' )
            .replace( /\n/g, '<br>' )}</p>`;

        this.updateEditorContent( true );
        this.htmlContentChange.emit( this._htmlContent );
        this.textContentChange.emit( this.convertHtmlToText( this._htmlContent ) );
      } else {
        this.notificationService.show(
          'Maya Draft Not Ready',
          'Maya could not produce a specific enough draft from the current contact and offer context.',
          'warning'
        );
      }
    } catch ( err: any ) {
      this.logger.error( 'generateMayaEmailContent failed:', err );
      this.notificationService.show(
        'Maya Draft Failure',
        err?.message || 'Unable to generate a Maya draft right now.',
        'error'
      );
    } finally {
      this.isMayaDrafting = false;
      this.isLoading = false;
      this.triggerLoading( false );
    }
  }

  formatAIResponse ( value: string ) {
    if ( !value ) {
      return value;
    }

    value = value.replace( /(\d+\.\s\*\*.*?\*\*)/g, '<br>$1<br>' );
    value = value.replace( /\n+/g, '<br><br>' );
    value = value.replace( /\*\*(.*?)\*\*/g, '<b>$1</b>' );

    return value;
  }

  onCheckGrammar (): void {
    this.isChecking = true;
    this.triggerLoading( true );

    const plainText = this.editorRef.nativeElement.innerText;

    this.emailService.onCheckGrammar( this.userId, plainText ).subscribe( {
      next: ( response: any ) => {
        this.handleResponse( response );
      },
      error: ( err: any ) => {
        this.logger.error( 'Grammar check failed:', err );
        this.notificationService.show( 'Grammar Check Failed', 'Unable to check grammar right now.', 'error' );
      },
      complete: () => {
        this.isChecking = false;
        this.triggerLoading( false );
      }
    } );
  };

  handleResponse ( rawResponse: any ) {
    const responseText = rawResponse?.response;
    if ( !responseText || typeof responseText !== 'string' ) return;

    const jsonMatch = responseText.match( /```json\s*([\s\S]*?)\s*```/ );

    let jsonString: string;
    if ( jsonMatch ) {
      jsonString = jsonMatch[1];
    } else if ( responseText.trim().startsWith( '```json' ) ) {
      jsonString = responseText.replace( /^```json/, '' ).trim();
    } else {
      this.logger.error( 'Grammar JSON block not found' );
      return;
    }

    let issues: any[] = [];

    try {
      issues = JSON.parse( jsonString );
    } catch ( e ) {
      const partials = jsonString.split( /\n(?=\s*{)/ );

      for ( let part of partials ) {
        try {
          if ( !part.trim().endsWith( '}' ) ) part += '}';
          const fixedPart = part.replace( /,$/, '' );
          const parsed = JSON.parse( fixedPart );
          issues.push( parsed );
        } catch {
          // Skip unparseable fragments - a partial JSON recovery is best-effort.
        }
      }
    }

    let html = this.editorRef.nativeElement.innerHTML;

    issues.forEach( ( issue ) => {
      if ( !issue.original || !issue.suggestion ) return;

      const tooltip = `
      <span class="grammar-tooltip">
        <strong>Suggestion:</strong> ${issue.suggestion}<br/>
        <em>${issue.explanation}</em>
      </span>
    `;
      const safeOriginal = issue.original.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );
      const regex = new RegExp( safeOriginal, 'i' );

      if ( regex.test( html ) ) {
        html = html.replace(
          regex,
          `<span class="grammar-highlight">${issue.original}${tooltip}</span>`
        );
      }
    } );

    this.editorRef.nativeElement.innerHTML = html;
  }

  draftKeys (): string[] {
    return this.campaignDrafts ? Object.keys( this.campaignDrafts ) : [];
  }

  selectDraft ( key: string ): void {
    this.selectedDraftKey = key;
    const draft = this.campaignDrafts?.[key];
    if ( draft ) {
      this.subjectChange.emit( draft.subject );
      this._htmlContent = this.formatAIResponse( draft.body );
      this.updateEditorContent();

      this.htmlContentChange.emit( this._htmlContent );
      this.textContentChange.emit( this.convertHtmlToText( this._htmlContent ) );
      this.soundService.playSound( 'finished' );
      this.isLoading = false;
      this.triggerLoading( false );
    }
  };

  onTemplateChange () {
    const templateChosen =
      this.selectedTemplate && this.templates[this.selectedTemplate];

    this.isUsingTemplate = !!templateChosen;
    this.updatePreview();
  }

  updatePreview () {
    if ( !this.selectedTemplate ) return;
    const template = this.templates[this.selectedTemplate];
    this._htmlContent = template;
    this.updateEditorContent();
    this.htmlContentChange.emit( this._htmlContent );
  }

  triggerLoading ( loading: boolean ): void {
    this.loader.emit( loading );
  };

  onPaste ( event: ClipboardEvent ): void {
    event.preventDefault();

    const clipboard = event.clipboardData;
    if ( !clipboard ) return;

    const html = clipboard.getData( 'text/html' );
    const text = clipboard.getData( 'text/plain' );

    if ( html ) {
      const cleaned = this.sanitizePastedHtml( html );
      document.execCommand( 'insertHTML', false, cleaned );
    } else if ( text ) {
      const escaped = text
        .replace( /&/g, '&amp;' )
        .replace( /</g, '&lt;' )
        .replace( />/g, '&gt;' )
        .replace( /\n/g, '<br>' );
      document.execCommand( 'insertHTML', false, escaped );
    }

    this.onInput();
    this.fitImages();
  }

  sanitizePastedHtml ( html: string ): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString( html, 'text/html' );

    const allowedStyleProps = new Set( [
      'font-weight',
      'font-style',
      'text-decoration',
      'text-align',
      'list-style-type',
      'margin-left'
    ] );

    const elements = Array.from( doc.body.querySelectorAll( '*' ) ) as HTMLElement[];

    elements.forEach( ( el ) => {
      const styleAttr = el.getAttribute( 'style' );
      if ( styleAttr ) {
        const kept: string[] = [];

        styleAttr
          .split( ';' )
          .map( part => part.trim() )
          .filter( Boolean )
          .forEach( part => {
            const idx = part.indexOf( ':' );
            if ( idx === -1 ) return;
            const prop = part.slice( 0, idx ).trim().toLowerCase();
            const value = part.slice( idx + 1 ).trim();

            if ( allowedStyleProps.has( prop ) && value ) {
              kept.push( `${prop}: ${value}` );
            }
          } );

        if ( kept.length ) {
          el.setAttribute( 'style', kept.join( '; ' ) );
        } else {
          el.removeAttribute( 'style' );
        }
      }

      el.removeAttribute( 'color' );
      el.removeAttribute( 'bgcolor' );
      el.removeAttribute( 'class' );
      el.removeAttribute( 'id' );
    } );

    return doc.body.innerHTML;
  }
}
