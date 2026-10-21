import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { InboxCategory, MailboxAttachment, MailboxMessageDetail } from '../../services/outreach-api.service';
import { cleanMessageText } from '../../shared/utils/message-kind.util';
import { WriteActionDirective } from '../../shared/write-access/write-action.directive';
import { InboxIconComponent } from './inbox-icon.component';
import { InboxLetter, NextAction, dayLong, dayKeyOf, firstName, htmlToText, initials, isWaiting, kindTint, shortDate, timeOfDay } from './inbox.model';
import { LetterHtml, prepareLetterHtml } from './letter-html';

interface ToddAction {
  label: string;
  icon: string;
  href: string;
}

/**
 * The letter fills the screen (Outreach Inbox 2026, "Letter"): a top bar
 * with Back, the position and prev/next; the paper; "What TODD sees" beside
 * it on wide pages and above it on narrow ones; and, while the person is
 * waiting, Write back with TODD's draft in the box.
 */
@Component( {
  selector: 'app-inbox-letter',
  standalone: true,
  imports: [FormsModule, InboxIconComponent, WriteActionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inbox-letter.component.html',
  styleUrl: './inbox-letter.component.css',
} )
export class InboxLetterComponent implements OnChanges, OnDestroy {
  @ViewChild( 'replyBox' ) replyBox?: ElementRef<HTMLTextAreaElement>;
  @ViewChild( 'mailFrame' ) mailFrame?: ElementRef<HTMLIFrameElement>;

  private sanitizer = inject( DomSanitizer );
  private host = inject<ElementRef<HTMLElement>>( ElementRef );

  letter!: InboxLetter;
  reply = '';
  /** True once the person changes TODD's draft (or TODD rewrites it). */
  edited = false;

  @Input( { required: true, alias: 'letter' } ) set setLetter ( letter: InboxLetter ) {
    const changed = letter.id !== this.letter?.id;
    this.letter = letter;
    if ( changed ) {
      this.reply = letter.draft;
      this.edited = false;
    }
  }

  @Input() detail: MailboxMessageDetail | null = null;
  @Input() backLabel = '';
  @Input() position = '';
  @Input() sending = false;
  @Input() rewriting = false;
  @Input() category: InboxCategory | null = null;

  @Output() back = new EventEmitter<void>();
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() send = new EventEmitter<string>();
  @Output() done = new EventEmitter<void>();
  @Output() rewrite = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();
  /** The category button: the page opens the menu beside it. */
  @Output() openCategory = new EventEmitter<MouseEvent>();
  /** An attachment tile: the page fetches it and opens or saves it. */
  @Output() openFile = new EventEmitter<MailboxAttachment>();

  /** The letter's HTML, ready for the frame; null when there is none (text letters). */
  mail: LetterHtml | null = null;
  frameDoc: SafeHtml | null = null;
  /** "Show earlier messages": the frame shows the quoted thread too. */
  showThread = false;
  private preparedFor = '';
  private frameObserver?: ResizeObserver;

  ngOnChanges (): void {
    const source = this.detail?.id === this.letter.id ? this.detail : null;
    const html = source?.html || '';
    const key = `${ this.letter.id }:${ html.length }`;
    if ( key === this.preparedFor ) return;
    this.preparedFor = key;
    this.showThread = false;
    this.mail = html ? prepareLetterHtml( html, this.theme(), { forward: this.letter.kind === 'forward' } ) : null;
    this.renderFrame();
  }

  ngOnDestroy (): void {
    this.frameObserver?.disconnect();
  }

  toggleThread (): void {
    this.showThread = !this.showThread;
    this.renderFrame();
  }

  /** Sizes the frame to its letter, and keeps it sized as images load or the page narrows. */
  onFrameLoad (): void {
    const frame = this.mailFrame?.nativeElement;
    const doc = frame?.contentDocument;
    if ( !frame || !doc?.body ) return;
    // Next frame, so a resize never lands inside ResizeObserver's own callback.
    let pending = 0;
    const fit = () => {
      cancelAnimationFrame( pending );
      pending = requestAnimationFrame( () => {
        const height = `${ Math.ceil( doc.body.getBoundingClientRect().height ) }px`;
        if ( frame.style.height !== height ) frame.style.height = height;
      } );
    };
    fit();
    doc.querySelectorAll( 'img' ).forEach( img => img.addEventListener( 'load', fit ) );
    this.frameObserver?.disconnect();
    if ( typeof ResizeObserver !== 'undefined' ) {
      this.frameObserver = new ResizeObserver( fit );
      this.frameObserver.observe( frame );
    }
    // Esc and ←/→ still work while the letter has focus.
    doc.addEventListener( 'keydown', ( event: KeyboardEvent ) => {
      if ( ['Escape', 'ArrowLeft', 'ArrowRight'].includes( event.key ) && !event.metaKey && !event.ctrlKey && !event.altKey ) {
        document.dispatchEvent( new KeyboardEvent( 'keydown', { key: event.key, bubbles: true } ) );
      }
    } );
  }

  private renderFrame (): void {
    const page = this.mail ? ( this.showThread && this.mail.full ) || this.mail.own : '';
    // Built from the letter after prepareLetterHtml scrubbed it, and shown in a
    // frame sandboxed without scripts.
    this.frameDoc = page ? this.sanitizer.bypassSecurityTrustHtml( page ) : null;
  }

  /** The paper's own colors and type, for plain mail. */
  private theme () {
    const style = getComputedStyle( this.host.nativeElement );
    const value = ( name: string, fallback: string ) => style.getPropertyValue( name ).trim() || fallback;
    return {
      text: value( '--text', '#f2f2f2' ),
      muted: value( '--muted', '#9aa0a6' ),
      link: value( '--blue', '#6ea8ff' ),
      line: value( '--surface2', '#2a2d34' ),
      font: style.fontFamily || 'system-ui, sans-serif',
    };
  }

  get first (): string {
    return firstName( this.letter.name ) || this.letter.name;
  }

  get ini (): string {
    return initials( this.letter.name );
  }

  get tint (): string {
    return kindTint( this.letter.kind );
  }

  get whenDay (): string {
    return this.letter.time ? dayLong( dayKeyOf( new Date( this.letter.time ) ) ) : '';
  }

  get whenTime (): string {
    return timeOfDay( this.letter.receivedAt );
  }

  get canReply (): boolean {
    return isWaiting( this.letter );
  }

  get replyLabel (): string {
    return this.letter.draft && !this.edited ? 'Write back · TODD drafted this, edit freely' : 'Write back';
  }

  get helpLabel (): string {
    return this.letter.draft ? 'Rewrite with TODD' : 'Help me write it';
  }

  /** The person's own words, split into paragraphs; the quoted thread is left out. */
  get paragraphs (): string[] {
    const source = this.detail?.id === this.letter.id ? this.detail : null;
    const text = source
      ? ( cleanMessageText( source.text, { keepForwarded: true } ) || cleanMessageText( htmlToText( source.html || '' ), { keepForwarded: true } ) || String( source.text || '' ) )
      : cleanMessageText( this.letter.source.preview );
    return text.split( /\n\s*\n/ ).map( part => part.trim() ).filter( Boolean );
  }

  /** "To info@taliferro.com": the mailbox it came to, as Mail shows it. */
  get recipients (): string {
    const to = this.detail?.id === this.letter.id ? this.detail.to || [] : [];
    const emails = to.map( person => person.email ).filter( Boolean );
    if ( !emails.length ) return '';
    return emails.length > 2 ? `${ emails.slice( 0, 2 ).join( ', ' ) } +${ emails.length - 2 }` : emails.join( ', ' );
  }

  get loadingBody (): boolean {
    return this.detail?.id !== this.letter.id;
  }

  get files (): MailboxAttachment[] {
    const source = this.detail?.id === this.letter.id ? this.detail : this.letter.source;
    return ( source.attachments || [] ).filter( file => file?.name );
  }

  /** Photos show as pictures; everything else as a file card. */
  get photos (): MailboxAttachment[] {
    return this.files.filter( file => !!file.preview );
  }

  get documents (): MailboxAttachment[] {
    return this.files.filter( file => !file.preview );
  }

  /** "PDF", "DOCX", "EML": the card's badge. */
  fileBadge ( file: MailboxAttachment ): string {
    const extension = ( file.name.match( /\.([a-z0-9]{1,5})$/i ) || [] )[1];
    return ( extension || String( file.contentType || '' ).split( '/' )[1] || 'file' ).slice( 0, 4 ).toUpperCase();
  }

  /** "PDF document · 1.2 MB". */
  fileMeta ( file: MailboxAttachment ): string {
    const size = Number( file.size || 0 );
    const sized = !size ? '' : size < 1024 ? `${ size } bytes` : size < 1048576 ? `${ Math.round( size / 1024 ) } KB` : `${ ( size / 1048576 ).toFixed( 1 ) } MB`;
    const type = /rfc822/i.test( file.contentType || '' ) ? 'Email message' : /pdf/i.test( file.contentType || '' ) ? 'PDF document' : /^image\//i.test( file.contentType || '' ) ? 'Image' : '';
    return [type, sized].filter( Boolean ).join( ' · ' );
  }

  /** "Your message · Oct 14": the quoted thread, collapsed to one pill. */
  get quote (): string {
    if ( this.mail ) {
      if ( !this.mail.full ) return '';
      if ( this.showThread ) return 'Hide earlier messages';
    }
    return this.quoteLabel || ( this.mail ? 'Show earlier messages' : '' );
  }

  private get quoteLabel (): string {
    const source = this.detail?.id === this.letter.id ? this.detail : this.letter.source;
    if ( source.quotedFrom?.date ) return `Your message · ${ shortDate( source.quotedFrom.date ) }`;
    const marker = String( ( source as MailboxMessageDetail ).text || '' ).match( /^\s*On (.{6,80}?)(?: at [^,]+)?,? [^\n]{0,120}wrote:?\s*$/m );
    if ( !marker ) return '';
    const parsed = Date.parse( marker[1] );
    return Number.isFinite( parsed ) ? `Your message · ${ shortDate( new Date( parsed ).toISOString() ) }` : 'Your message';
  }

  get actions (): ToddAction[] {
    const action = this.letter.nextAction;
    if ( !action || ( action.type === 'call' && !this.canReply ) ) return [];
    return [{ label: action.label, icon: this.iconOf( action ), href: this.hrefOf( action ) }];
  }

  onReplyChange ( value: string ): void {
    this.reply = value;
    this.edited = value !== this.letter.draft;
  }

  /** TODD's new draft (Rewrite / Help me write it). */
  setDraft ( text: string ): void {
    this.reply = text;
    this.edited = true;
    this.replyBox?.nativeElement.focus();
  }

  private iconOf ( action: NextAction ): string {
    return ( { call: 'phone', text: 'msg', email: 'mail', calendar: 'cal', attach: 'file' } as Record<string, string> )[action.type] || 'spark';
  }

  private hrefOf ( action: NextAction ): string {
    const value = String( action.value || '' ).trim();
    if ( !value ) return '';
    if ( action.type === 'call' ) return `tel:${ value.replace( /[^\d+]/g, '' ) }`;
    if ( action.type === 'text' ) return `sms:${ value.replace( /[^\d+]/g, '' ) }`;
    if ( action.type === 'email' ) return `mailto:${ value }`;
    return '';
  }
}
