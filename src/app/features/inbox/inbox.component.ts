import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { Subscription, filter } from 'rxjs';

import { LoggerService } from '../../services/logger.service';
import { MailboxAccessService } from '../../services/mailbox-access.service';
import { MailboxMessageDetail, MailboxMessageListItem } from '../../services/outreach-api.service';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { OutreachDataService } from '../../services/outreach-data.service';
import { isDesignPreview } from '../../shared/utils/design-preview';
import { BrowseNoticeComponent } from '../../shared/write-access/browse-notice.component';
import { WriteActionDirective } from '../../shared/write-access/write-action.directive';
import { InboxIconComponent } from './inbox-icon.component';
import { InboxLetterComponent } from './inbox-letter.component';
import { InboxRowComponent } from './inbox-row.component';
import { INBOX_PREVIEW_LETTERS } from './inbox.preview';
import {
  AskResult, InboxDay, InboxLetter, askTodd, buildDays, dayAge, dayKeyOf, dayLabel, dayLong, groupOf, isWaiting, monthName, timeOfDay, toLetter,
} from './inbox.model';

interface CalendarCell {
  day: number;
  key: string;
  hasMail: boolean;
  waiting: boolean;
  future: boolean;
}

interface Toast {
  text: string;
  undo?: () => void;
}

interface PendingSend {
  timer: ReturnType<typeof setTimeout>;
  subject: string;
  text: string;
  name: string;
}

/** How long Undo stays on screen; a send waits this long before it goes. */
const UNDO_MS = 5000;

/**
 * Outreach Inbox 2026 (design_handoff_outreach_inbox_2026): replaces the
 * three-pane inbox. One day at a time, grouped Waiting on you / TODD
 * handled / Answered; the letter fills the screen at /inbox/:id; Start
 * answering walks every waiting letter; Ask TODD searches every day.
 * Mailbox settings stay at /inbox-access.
 */
@Component( {
  selector: 'app-inbox',
  standalone: true,
  imports: [FormsModule, RouterLink, WriteActionDirective, BrowseNoticeComponent, InboxIconComponent, InboxRowComponent, InboxLetterComponent],
  providers: [MailboxAccessService],
  templateUrl: './inbox.component.html',
  styleUrl: './inbox.component.css',
} )
export class InboxComponent implements OnInit, OnDestroy {
  readonly mailbox = inject( MailboxAccessService );
  private readonly router = inject( Router );
  private readonly route = inject( ActivatedRoute );
  private readonly auth = inject( OutreachAuthService );
  private readonly data = inject( OutreachDataService );
  private readonly logger = inject( LoggerService );

  @ViewChild( 'askField' ) askField?: ElementRef<HTMLInputElement>;
  @ViewChild( InboxLetterComponent ) letterView?: InboxLetterComponent;

  readonly preview = isDesignPreview();
  readonly weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  /** The day picked; dayKey falls back to the newest day with mail. */
  private selectedDay = '';
  query = '';
  calendarOpen = false;
  calendarMonth = new Date( new Date().getFullYear(), new Date().getMonth(), 1 );
  openId: string | null = null;
  queue = false;
  detail: MailboxMessageDetail | null = null;
  rewriting = false;
  toast: Toast | null = null;
  narrow = typeof window !== 'undefined' && window.innerWidth < 820;
  /** Select mode (the Select button, or ⌘/Ctrl-click a row): ticked rows can be deleted together. */
  selectMode = false;
  selectedIds = new Set<string>();
  private lastTicked: string | null = null;

  /** Marked done here; kept per mailbox until the server has POST /inbox/{id}/done. */
  private done = new Set<string>();
  /** Sent (or waiting out Undo) this session, so they read Answered at once. */
  private answeredNow = new Set<string>();
  private pending = new Map<string, PendingSend>();
  private toastTimer?: ReturnType<typeof setTimeout>;
  private subscriptions: Subscription[] = [];
  private userId = '';
  private userEmail = '';
  private tenantId = '';
  private companyName = '';
  private cache: { messages: MailboxMessageListItem[] | null; version: number; letters: InboxLetter[]; days: InboxDay[]; } =
    { messages: null, version: -1, letters: [], days: [] };
  private version = 0;
  private doneLoadedFor = '';

  ngOnInit (): void {
    this.mailbox.messageLimit = 50;
    this.mailbox.openFirstMessage = false;

    this.subscriptions.push( this.router.events.pipe( filter( event => event instanceof NavigationEnd ) ).subscribe( () => this.readRoute() ) );
    this.readRoute();

    if ( this.preview ) {
      const previewMailbox = { id: 'preview', emailAddress: 'ty.showers@taliferro.tech', providerLabel: 'Other IMAP', isPrimary: true, lastSyncAt: new Date( Date.now() - 8 * 60000 ).toISOString() };
      this.mailbox.mailboxConfigs = [previewMailbox] as any;
      this.mailbox.connectedMailbox = previewMailbox as any;
      this.mailbox.mailboxMessages = INBOX_PREVIEW_LETTERS.map( letter => ( { ...letter } ) );
      return;
    }

    this.subscriptions.push( this.auth.getUser().subscribe( ( user ) => {
      if ( !user ) return;
      this.userId = user.uid;
      this.userEmail = user.email || '';
      this.syncContext();
    } ) );
    this.subscriptions.push( this.auth.getTenantId().subscribe( ( tenantId ) => {
      this.tenantId = tenantId || '';
      if ( !this.tenantId || !this.userId ) return this.syncContext();
      this.data.getContact( this.tenantId, this.userId )
        .then( ( contact ) => this.companyName = contact?.company?.name || '' )
        .catch( () => undefined )
        .finally( () => this.syncContext() );
    } ) );
  }

  ngOnDestroy (): void {
    this.subscriptions.forEach( subscription => subscription.unsubscribe() );
    clearTimeout( this.toastTimer );
    // Leaving the page ends the Undo window: anything still waiting goes now.
    for ( const id of [...this.pending.keys()] ) this.flushSend( id );
  }

  // ---------------------------------------------------------------- data

  get letters (): InboxLetter[] {
    return this.model().letters;
  }

  get days (): InboxDay[] {
    return this.model().days;
  }

  get loading (): boolean {
    return this.mailbox.loadingMailboxes || ( this.mailbox.loadingMailboxMessages && !this.mailbox.mailboxMessages.length );
  }

  get dayKey (): string {
    const days = this.days;
    return days.some( day => day.key === this.selectedDay ) ? this.selectedDay : days[0]?.key || '';
  }

  get day (): InboxDay | null {
    return this.days.find( day => day.key === this.dayKey ) || null;
  }

  get pillDays (): InboxDay[] {
    return this.days.filter( day => day.age >= 0 && day.age < 7 );
  }

  get inPills (): boolean {
    return this.pillDays.some( day => day.key === this.dayKey );
  }

  get earlierLabel (): string {
    return this.inPills || !this.day ? 'Earlier' : this.day.label;
  }

  get waitingAll (): InboxLetter[] {
    return this.days.flatMap( day => day.letters.filter( isWaiting ) );
  }

  get handledLine (): string {
    const count = this.letters.filter( letter => !letter.needsAnswer && dayAge( letter.dayKey ) < 7 ).length;
    return `TODD handled ${ count } this week`;
  }

  get daySub (): string {
    const day = this.day;
    if ( !day ) return '';
    const total = day.letters.length;
    const need = day.waiting;
    return `${ day.long } · ${ total } ${ total === 1 ? 'letter' : 'letters' } · ${ need ? `${ need } ${ need === 1 ? 'needs' : 'need' } an answer` : 'all answered' }`;
  }

  groupRows ( group: 'waiting' | 'handled' | 'answered' ): InboxLetter[] {
    return ( this.day?.letters || [] ).filter( letter => groupOf( letter ) === group );
  }

  get olderDay (): InboxDay | null {
    const index = this.days.findIndex( day => day.key === this.dayKey );
    return index >= 0 ? this.days[index + 1] || null : null;
  }

  get newerDay (): InboxDay | null {
    const index = this.days.findIndex( day => day.key === this.dayKey );
    return index > 0 ? this.days[index - 1] : null;
  }

  get olderLine (): string {
    const older = this.olderDay;
    return older ? `${ older.long } · ${ older.letters.length } ${ older.letters.length === 1 ? 'letter' : 'letters' }` : '';
  }

  time ( letter: InboxLetter ): string {
    return timeOfDay( letter.receivedAt );
  }

  sourceLine ( letter: InboxLetter ): string {
    return `From ${ letter.name } · ${ dayLong( letter.dayKey ) }`;
  }

  selectMailboxById ( id: string ): void {
    const box = this.mailbox.mailboxConfigs.find( item => item.id === id );
    if ( box ) this.mailbox.selectMailbox( box );
  }

  hitWhen ( letter: InboxLetter ): string {
    return `${ dayLabel( letter.dayKey ) } · ${ timeOfDay( letter.receivedAt ) }`;
  }

  syncedAgo (): string {
    const iso = this.mailbox.connectedMailbox?.lastSyncAt;
    const time = iso ? Date.parse( iso ) : NaN;
    if ( !Number.isFinite( time ) ) return '';
    const minutes = Math.round( ( Date.now() - time ) / 60000 );
    if ( minutes < 1 ) return 'Synced just now';
    if ( minutes < 60 ) return `Synced ${ minutes } min ago`;
    if ( minutes < 1440 ) return `Synced ${ Math.round( minutes / 60 ) } h ago`;
    return `Synced ${ Math.round( minutes / 1440 ) } d ago`;
  }

  // ---------------------------------------------------------------- search

  get searching (): boolean {
    return !!this.query.trim();
  }

  get ask (): AskResult {
    return askTodd( this.query, this.letters );
  }

  clearQuery (): void {
    this.query = '';
    this.clearSelection();
  }

  // ---------------------------------------------------------------- days

  pickDay ( key: string ): void {
    this.clearSelection();
    this.selectedDay = key;
    this.calendarOpen = false;
    this.query = '';
    if ( typeof window !== 'undefined' ) window.scrollTo( { top: 0 } );
  }

  shiftDay ( older: boolean ): void {
    const target = older ? this.olderDay : this.newerDay;
    if ( target ) this.pickDay( target.key );
  }

  toggleCalendar (): void {
    this.calendarOpen = !this.calendarOpen;
    if ( this.calendarOpen ) {
      const base = this.day ? new Date( this.day.letters[0]?.time || Date.now() ) : new Date();
      this.calendarMonth = new Date( base.getFullYear(), base.getMonth(), 1 );
    }
  }

  get calendarTitle (): string {
    return `${ monthName( this.calendarMonth.getMonth() ) } ${ this.calendarMonth.getFullYear() }`;
  }

  /** Monday-first month grid; null cells pad the first week. */
  get calendarCells (): Array<CalendarCell | null> {
    const year = this.calendarMonth.getFullYear();
    const month = this.calendarMonth.getMonth();
    const lead = ( new Date( year, month, 1 ).getDay() + 6 ) % 7;
    const count = new Date( year, month + 1, 0 ).getDate();
    const byKey = new Map( this.days.map( day => [day.key, day] ) );
    const today = dayKeyOf( new Date() );
    const cells: Array<CalendarCell | null> = Array.from( { length: lead }, () => null );
    for ( let day = 1; day <= count; day++ ) {
      const key = dayKeyOf( new Date( year, month, day ) );
      const mail = byKey.get( key );
      cells.push( { day, key, hasMail: !!mail, waiting: !!mail?.waiting, future: key > today } );
    }
    return cells;
  }

  get canMonthBack (): boolean {
    const oldest = this.days[this.days.length - 1];
    return !!oldest && oldest.key < dayKeyOf( this.calendarMonth );
  }

  get canMonthForward (): boolean {
    const now = new Date();
    return this.calendarMonth < new Date( now.getFullYear(), now.getMonth(), 1 );
  }

  shiftMonth ( delta: number ): void {
    this.calendarMonth = new Date( this.calendarMonth.getFullYear(), this.calendarMonth.getMonth() + delta, 1 );
  }

  // ---------------------------------------------------------------- the letter

  get openLetter (): InboxLetter | null {
    return this.openId ? this.letters.find( letter => letter.id === this.openId ) || null : null;
  }

  get backLabel (): string {
    const day = this.days.find( item => item.key === this.openLetter?.dayKey );
    return this.queue ? 'Stop answering' : `Back to ${ day?.label || 'Inbox' }`;
  }

  get position (): string {
    const letter = this.openLetter;
    if ( !letter ) return '';
    let line: string;
    if ( this.queue ) {
      line = `${ this.waitingAll.length } still waiting`;
    } else {
      const ids = this.dayOrder( letter.dayKey );
      line = `${ ids.indexOf( letter.id ) + 1 } of ${ ids.length }`;
    }
    return this.narrow ? line : `${ line } · Esc to go back · ← → to move`;
  }

  openLetterView ( letter: InboxLetter ): void {
    this.router.navigate( ['/inbox', letter.id] );
  }

  closeLetter (): void {
    // Back returns to the letter's day (the queue may have walked to another).
    if ( this.openLetter ) this.selectedDay = this.openLetter.dayKey;
    this.queue = false;
    this.router.navigate( ['/inbox'] );
  }

  step ( delta: number ): void {
    const letter = this.openLetter;
    if ( !letter ) return;
    const ids = this.dayOrder( letter.dayKey );
    const next = ids[( ids.indexOf( letter.id ) + delta + ids.length ) % ids.length];
    if ( next && next !== letter.id ) this.router.navigate( ['/inbox', next], { replaceUrl: true } );
  }

  startAnswering (): void {
    const first = this.waitingAll[0];
    if ( !first ) return;
    this.queue = true;
    this.query = '';
    this.router.navigate( ['/inbox', first.id] );
  }

  // ---------------------------------------------------------------- actions

  quickAction ( letter: InboxLetter ): void {
    if ( letter.draft ) {
      this.scheduleSend( letter, letter.draft, `Sent TODD's reply to ${ letter.name }` );
      return;
    }
    const phone = letter.nextAction?.value || '';
    if ( !phone ) return;
    this.flash( { text: `Calling ${ letter.name } at ${ phone }` } );
    if ( typeof window !== 'undefined' ) window.location.href = `tel:${ phone.replace( /[^\d+]/g, '' ) }`;
  }

  sendFromLetter ( text: string ): void {
    const letter = this.openLetter;
    if ( !letter || !text.trim() ) return;
    this.scheduleSend( letter, text, `Sent to ${ letter.name }` );
    this.finish( letter );
  }

  markDone (): void {
    const letter = this.openLetter;
    if ( !letter ) return;
    this.done.add( letter.id );
    this.saveDone();
    this.touch();
    this.flash( {
      text: `${ letter.name } marked as done`,
      undo: () => { this.done.delete( letter.id ); this.saveDone(); this.touch(); },
    } );
    this.finish( letter );
  }

  async rewrite (): Promise<void> {
    const letter = this.openLetter;
    if ( !letter || this.rewriting ) return;
    if ( this.preview || !letter.contactId ) {
      if ( letter.draft ) {
        this.letterView?.setDraft( letter.draft );
      } else {
        this.flash( { text: 'TODD needs this sender in your contacts to write a reply.' } );
      }
      return;
    }
    this.rewriting = true;
    try {
      const text = await this.mailbox.draftReplyWithTodd( letter.contactId );
      if ( this.openId === letter.id ) this.letterView?.setDraft( text );
    } catch ( error: any ) {
      this.flash( { text: String( error?.message || "TODD couldn't write this one." ) } );
    } finally {
      this.rewriting = false;
    }
  }

  undoToast (): void {
    const undo = this.toast?.undo;
    this.toast = null;
    clearTimeout( this.toastTimer );
    undo?.();
  }

  // ---------------------------------------------------------------- select and delete

  /** The rows on screen, top to bottom: the day's groups, or the Ask TODD hits. */
  get visibleRows (): InboxLetter[] {
    if ( this.searching ) return this.ask.hits;
    return [...this.groupRows( 'waiting' ), ...this.groupRows( 'handled' ), ...this.groupRows( 'answered' )];
  }

  get selecting (): boolean {
    return this.selectMode || this.selectedIds.size > 0;
  }

  get allVisibleSelected (): boolean {
    const rows = this.visibleRows;
    return rows.length > 0 && rows.every( letter => this.selectedIds.has( letter.id ) );
  }

  toggleSelectMode (): void {
    if ( this.selecting ) this.clearSelection();
    else this.selectMode = true;
  }

  /** Tick or untick one row; Shift ticks everything between it and the last one. */
  tick ( { letter, range }: { letter: InboxLetter; range: boolean; } ): void {
    const rows = this.visibleRows;
    const from = this.lastTicked ? rows.findIndex( item => item.id === this.lastTicked ) : -1;
    const to = rows.findIndex( item => item.id === letter.id );
    if ( range && from >= 0 && to >= 0 ) {
      rows.slice( Math.min( from, to ), Math.max( from, to ) + 1 ).forEach( item => this.selectedIds.add( item.id ) );
    } else if ( this.selectedIds.has( letter.id ) ) {
      this.selectedIds.delete( letter.id );
    } else {
      this.selectedIds.add( letter.id );
    }
    this.lastTicked = letter.id;
    this.selectMode = true;
  }

  selectAllVisible (): void {
    const rows = this.visibleRows;
    const all = this.allVisibleSelected;
    rows.forEach( letter => all ? this.selectedIds.delete( letter.id ) : this.selectedIds.add( letter.id ) );
  }

  clearSelection (): void {
    this.selectMode = false;
    this.selectedIds.clear();
    this.lastTicked = null;
  }

  async deleteSelected (): Promise<void> {
    const ids = [...this.selectedIds];
    if ( !ids.length || this.mailbox.isDeletingMailboxMessage ) return;
    if ( !window.confirm( `Delete ${ ids.length } message${ ids.length === 1 ? '' : 's' } from the connected mailbox?` ) ) return;
    const deleted = await this.deleteMessages( ids );
    deleted.forEach( id => this.selectedIds.delete( id ) );
    if ( !this.selectedIds.size ) this.clearSelection();
  }

  /** Delete in the letter: confirm, then go on to the next letter like Send and Done do. */
  async deleteOpenLetter (): Promise<void> {
    const letter = this.openLetter;
    if ( !letter || this.mailbox.isDeletingMailboxMessage ) return;
    if ( !window.confirm( 'Delete this message from the connected mailbox?' ) ) return;
    const ids = this.dayOrder( letter.dayKey );
    const next = this.queue
      ? this.waitingAll.find( item => item.id !== letter.id )?.id
      : ids.length > 1 ? ids[( ids.indexOf( letter.id ) + 1 ) % ids.length] : undefined;
    const deleted = await this.deleteMessages( [letter.id] );
    if ( !deleted.length || this.openId !== letter.id ) return;
    if ( next ) {
      this.router.navigate( ['/inbox', next], { replaceUrl: true } );
    } else {
      this.selectedDay = letter.dayKey;
      this.closeLetter();
    }
  }

  /** Returns the ids that went; the service reports successes and failures. */
  private async deleteMessages ( ids: string[] ): Promise<string[]> {
    const before = new Set( this.mailbox.mailboxMessages.map( message => message.id ) );
    if ( this.preview ) {
      this.mailbox.mailboxMessages = this.mailbox.mailboxMessages.filter( message => !ids.includes( message.id ) );
      this.flash( { text: `Deleted ${ ids.length } message${ ids.length === 1 ? '' : 's' }` } );
    } else {
      await this.mailbox.deleteMailboxMessages( ids );
    }
    const after = new Set( this.mailbox.mailboxMessages.map( message => message.id ) );
    return ids.filter( id => before.has( id ) && !after.has( id ) );
  }

  // ---------------------------------------------------------------- keyboard

  @HostListener( 'document:keydown', ['$event'] )
  onKey ( event: KeyboardEvent ): void {
    const target = event.target as HTMLElement | null;
    const typing = !!target && ( ['TEXTAREA', 'INPUT', 'SELECT'].includes( target.tagName ) || target.isContentEditable );
    if ( event.metaKey || event.ctrlKey || event.altKey ) return;
    if ( event.key === '/' && !typing && !this.openId ) {
      event.preventDefault();
      this.askField?.nativeElement.focus();
      return;
    }
    if ( typing ) {
      if ( event.key === 'Escape' && target === this.askField?.nativeElement ) {
        this.query = '';
        target.blur();
      }
      return;
    }
    if ( this.openId ) {
      if ( event.key === 'Escape' ) this.closeLetter();
      if ( event.key === 'ArrowRight' ) this.step( 1 );
      if ( event.key === 'ArrowLeft' ) this.step( -1 );
      return;
    }
    if ( event.key === 'ArrowLeft' ) this.shiftDay( true );
    if ( event.key === 'ArrowRight' ) this.shiftDay( false );
    if ( event.key === 'Escape' ) {
      if ( this.calendarOpen ) this.calendarOpen = false;
      else if ( this.selecting ) this.clearSelection();
    }
  }

  @HostListener( 'document:click', ['$event'] )
  onDocumentClick ( event: MouseEvent ): void {
    if ( this.calendarOpen && !( event.target as HTMLElement | null )?.closest?.( '.earlier' ) ) this.calendarOpen = false;
  }

  @HostListener( 'window:resize' )
  onResize (): void {
    this.narrow = window.innerWidth < 820;
  }

  // ---------------------------------------------------------------- internals

  private model () {
    const messages = this.mailbox.mailboxMessages;
    const mailboxId = this.mailbox.connectedMailbox?.id || '';
    if ( mailboxId !== this.doneLoadedFor ) {
      this.doneLoadedFor = mailboxId;
      this.loadDone();
      this.version++;
    }
    if ( this.cache.messages !== messages || this.cache.version !== this.version ) {
      const done = new Set( [...this.done, ...this.answeredNow] );
      const ownEmail = this.mailbox.connectedMailbox?.emailAddress || '';
      const letters = ( messages || [] ).map( message => toLetter( message, { ownEmail, done } ) );
      this.cache = { messages, version: this.version, letters, days: buildDays( letters ) };
    }
    return this.cache;
  }

  /** Rebuild the letters after a local change (sent, done, undone). */
  private touch (): void {
    this.version++;
  }

  private dayOrder ( key: string ): string[] {
    return ( this.days.find( day => day.key === key )?.letters || [] ).map( letter => letter.id );
  }

  private readRoute (): void {
    const id = this.route.snapshot.firstChild?.paramMap.get( 'id' ) || null;
    if ( id === this.openId ) return;
    this.openId = id;
    this.detail = null;
    if ( !id ) {
      this.queue = false;
      return;
    }
    const letter = this.letters.find( item => item.id === id );
    if ( letter ) this.selectedDay = letter.dayKey;
    this.loadDetail( id );
  }

  private async loadDetail ( id: string ): Promise<void> {
    const detail = this.preview
      ? ( INBOX_PREVIEW_LETTERS.find( letter => letter.id === id ) || null )
      : await this.mailbox.fetchMessageDetail( id );
    if ( this.openId === id ) this.detail = detail;
  }

  /** After Send or Done: the next waiting letter in queue mode, else back to the day. */
  private finish ( letter: InboxLetter ): void {
    if ( this.queue ) {
      const next = this.waitingAll.find( item => item.id !== letter.id );
      if ( next ) {
        this.router.navigate( ['/inbox', next.id], { replaceUrl: true } );
        return;
      }
    }
    this.closeLetter();
  }

  /** Sends after the Undo window, so Undo really takes it back. */
  private scheduleSend ( letter: InboxLetter, text: string, message: string ): void {
    const subject = String( letter.source.replyDraftSubject || '' ).trim()
      || ( /^re:/i.test( letter.subject ) ? letter.subject : `Re: ${ letter.subject }` );
    this.answeredNow.add( letter.id );
    this.touch();
    const timer = setTimeout( () => this.flushSend( letter.id ), UNDO_MS );
    this.pending.set( letter.id, { timer, subject, text, name: letter.name } );
    this.flash( {
      text: message,
      undo: () => {
        const pending = this.pending.get( letter.id );
        if ( !pending ) return;
        clearTimeout( pending.timer );
        this.pending.delete( letter.id );
        this.answeredNow.delete( letter.id );
        this.touch();
      },
    } );
  }

  private async flushSend ( id: string ): Promise<void> {
    const pending = this.pending.get( id );
    if ( !pending ) return;
    clearTimeout( pending.timer );
    this.pending.delete( id );
    if ( this.preview ) return;
    try {
      await this.mailbox.sendReplyTo( id, { subject: pending.subject, text: pending.text } );
    } catch ( error: any ) {
      this.logger.error( 'Inbox reply failed', error );
      this.answeredNow.delete( id );
      this.touch();
      this.flash( { text: `Couldn't send to ${ pending.name }: ${ error?.message || 'try again' }` } );
    }
  }

  private flash ( toast: Toast ): void {
    clearTimeout( this.toastTimer );
    this.toast = toast;
    this.toastTimer = setTimeout( () => this.toast = null, toast.undo ? UNDO_MS : 2400 );
  }

  private get doneStorageKey (): string {
    return `outreach.inbox.done.${ this.mailbox.connectedMailbox?.id || '' }`;
  }

  private loadDone (): void {
    if ( this.preview ) return;
    try {
      const saved = JSON.parse( localStorage.getItem( this.doneStorageKey ) || '[]' );
      this.done = new Set( Array.isArray( saved ) ? saved.map( String ) : [] );
    } catch {
      this.done = new Set();
    }
  }

  private saveDone (): void {
    if ( this.preview ) return;
    try {
      // The newest 500 are plenty: the inbox only lists recent mail.
      localStorage.setItem( this.doneStorageKey, JSON.stringify( [...this.done].slice( -500 ) ) );
    } catch {
      // Private windows can refuse storage; done still holds for this visit.
    }
  }

  private syncContext (): void {
    if ( !this.userId || !this.tenantId ) return;
    this.mailbox.initialize( {
      tenantId: this.tenantId,
      userId: this.userId,
      userEmail: this.userEmail || undefined,
      displayName: '',
      companyName: this.companyName,
    } );
  }
}
