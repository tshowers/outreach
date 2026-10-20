import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MailboxMessageDetail } from '../../services/outreach-api.service';
import { cleanMessageText } from '../../shared/utils/message-kind.util';
import { WriteActionDirective } from '../../shared/write-access/write-action.directive';
import { InboxIconComponent } from './inbox-icon.component';
import { InboxLetter, NextAction, dayLong, dayKeyOf, firstName, htmlToText, initials, isWaiting, kindTint, shortDate, timeOfDay } from './inbox.model';

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
export class InboxLetterComponent {
  @ViewChild( 'replyBox' ) replyBox?: ElementRef<HTMLTextAreaElement>;

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
  @Input() deleting = false;

  @Output() back = new EventEmitter<void>();
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() send = new EventEmitter<string>();
  @Output() done = new EventEmitter<void>();
  @Output() rewrite = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();

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
      ? ( cleanMessageText( source.text ) || cleanMessageText( htmlToText( source.html || '' ) ) || String( source.text || '' ) )
      : cleanMessageText( this.letter.source.preview );
    return text.split( /\n\s*\n/ ).map( part => part.trim() ).filter( Boolean );
  }

  get loadingBody (): boolean {
    return this.detail?.id !== this.letter.id;
  }

  get files (): string[] {
    const source = this.detail?.id === this.letter.id ? this.detail : this.letter.source;
    return ( source.attachments || [] ).map( file => file.name ).filter( Boolean );
  }

  /** "Your message · Oct 14": the quoted thread, collapsed to one pill. */
  get quote (): string {
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
