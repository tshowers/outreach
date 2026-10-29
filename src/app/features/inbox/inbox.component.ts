import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { Subscription, filter } from 'rxjs';

import { LoggerService } from '../../services/logger.service';
import { MailboxAccessService } from '../../services/mailbox-access.service';
import { InboxCategory, InboxCategoryColor, MailboxAttachment, MailboxConfigSummary, MailboxMessageDetail, MailboxMessageListItem } from '../../services/outreach-api.service';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { OutreachDataService } from '../../services/outreach-data.service';
import { isDesignPreview } from '../../shared/utils/design-preview';
import { mailboxConnectionLabel } from '../../shared/utils/mailbox-label';
import { BrowseNoticeComponent } from '../../shared/write-access/browse-notice.component';
import { WriteActionDirective } from '../../shared/write-access/write-action.directive';
import { CategoryMenuMode, CategoryOption, InboxCategoryMenuComponent } from './inbox-category-menu.component';
import { InboxIconComponent } from './inbox-icon.component';
import { InboxLetterComponent } from './inbox-letter.component';
import { InboxRowComponent } from './inbox-row.component';
import { INBOX_PREVIEW_CATEGORIES, INBOX_PREVIEW_LETTERS } from './inbox.preview';
import {
  AskResult, InboxDay, InboxLetter, LetterGroup, askTodd, buildDays, dayAge, dayKeyOf, dayLabel, dayLong, groupOf, isWaiting, monthName,
  orderDay, shortDayLabel, timeOfDay, toLetter,
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

interface Section {
  group: LetterGroup;
  title: string;
  sub: string;
  rows: InboxLetter[];
}

/** How long Undo stays on screen; a send or delete waits this long before it goes. */
const UNDO_MS = 5000;
const COLORS: InboxCategoryColor[] = ['blue', 'violet', 'green', 'yellow', 'pink'];

const letters = ( count: number ) => count === 1 ? '1 letter' : `${ count } letters`;

/**
 * Outreach Inbox 2026 (design_handoff_outreach_inbox_2026, v2 in
 * design_handoff_outreach_inbox_2026-b): replaces the three-pane inbox.
 * One day at a time, grouped Waiting on you / TODD handled / Answered; the
 * letter fills the screen at /inbox/:id; Start answering walks every
 * waiting letter; Ask TODD searches every day. Categories file letters
 * across days; select rows to categorize, mark done or delete them
 * together. Mailbox settings stay at /inbox-access.
 */
@Component( {
  selector: 'app-inbox',
  standalone: true,
  imports: [FormsModule, RouterLink, WriteActionDirective, BrowseNoticeComponent, InboxIconComponent, InboxRowComponent, InboxLetterComponent, InboxCategoryMenuComponent],
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

  /** Ticked rows, for the bulk bar. */
  selectedIds = new Set<string>();
  private lastTicked: string | null = null;

  /** Categories: the chip bar, the filter and the menu. */
  categories: InboxCategory[] = [];
  private assignments: Record<string, string> = {};
  /** The category filter: letters from every day in that category. */
  topicId: string | null = null;
  categoryMenu: { mode: CategoryMenuMode; anchor: { left: number; top: number; bottom: number; }; } | null = null;

  /** Marked done here; kept per mailbox until the server has POST /inbox/{id}/done. */
  private done = new Set<string>();
  /** Sent (or waiting out Undo) this session, so they read Answered at once. */
  private answeredNow = new Set<string>();
  private pending = new Map<string, PendingSend>();
  /** Deleted but still inside the Undo window: hidden now, removed from the mailbox after it. */
  private deleting = new Map<number, { ids: string[]; timer: ReturnType<typeof setTimeout>; }>();
  private hidden = new Set<string>();
  private deleteBatch = 0;
  /** The mailbox takes one delete at a time, so batches go in turn. */
  private deleteChain: Promise<void> = Promise.resolve();
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
      this.categories = INBOX_PREVIEW_CATEGORIES.categories.map( category => ( { ...category } ) );
      this.assignments = { ...INBOX_PREVIEW_CATEGORIES.assignments };
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
    for ( const batch of [...this.deleting.keys()] ) this.flushDelete( batch );
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
    return !!this.topic || this.pillDays.some( day => day.key === this.dayKey );
  }

  get earlierLabel (): string {
    return this.inPills || !this.day ? 'Earlier' : this.day.label;
  }

  get waitingAll (): InboxLetter[] {
    return this.days.flatMap( day => day.letters.filter( isWaiting ) );
  }

  get handledLine (): string {
    const count = this.letters.filter( letter => !letter.needsAnswer && dayAge( letter.dayKey ) < 7 ).length;
    return `16Ahead handled ${ count } this week`;
  }

  get topic (): InboxCategory | null {
    return this.topicId ? this.categories.find( category => category.id === this.topicId ) || null : null;
  }

  /** What the sheet lists: the day, or the category across every day. */
  get scope (): InboxLetter[] {
    const topic = this.topic;
    if ( !topic ) return this.day?.letters || [];
    return orderDay( this.days.flatMap( day => day.letters ).filter( letter => letter.categoryId === topic.id ) );
  }

  get headTitle (): string {
    return this.topic?.name || this.day?.label || '';
  }

  get headSub (): string {
    const need = this.scope.filter( isWaiting ).length;
    const answerLine = need ? `${ need } ${ need === 1 ? 'needs' : 'need' } an answer` : 'all answered';
    if ( this.topic ) return `${ letters( this.scope.length ) } across all days · ${ answerLine }`;
    const day = this.day;
    return day ? `${ day.long } · ${ day.letters.length } ${ day.letters.length === 1 ? 'letter' : 'letters' } · ${ answerLine }` : '';
  }

  /** Letters on the sheet, none of them waiting. */
  get nobodyWaiting (): boolean {
    const scope = this.scope;
    return scope.length > 0 && !scope.some( isWaiting );
  }

  get clearLine (): string {
    return this.topic ? `Nobody in ${ this.topic.name } is waiting on you.` : `Nobody from ${ this.day?.label || 'this day' } is waiting on you.`;
  }

  get sections (): Section[] {
    const rows = ( group: LetterGroup ) => this.scope.filter( letter => groupOf( letter ) === group );
    const waiting = rows( 'waiting' );
    const handled = rows( 'handled' );
    const answered = rows( 'answered' );
    return ( [
      { group: 'waiting', title: 'Waiting on you', sub: `${ waiting.length } ${ waiting.length === 1 ? 'person' : 'people' }`, rows: waiting },
      { group: 'handled', title: '16Ahead handled', sub: `${ handled.length } without you`, rows: handled },
      { group: 'answered', title: 'Answered', sub: `${ answered.length }`, rows: answered },
    ] as Section[] ).filter( section => section.rows.length );
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
    return older ? `${ older.long } · ${ letters( older.letters.length ) }` : '';
  }

  /** "9:42 AM" in a day; "Fri 2:51 PM" in a category. */
  time ( letter: InboxLetter ): string {
    return this.topic ? `${ shortDayLabel( letter.dayKey ) } ${ timeOfDay( letter.receivedAt ) }` : timeOfDay( letter.receivedAt );
  }

  categoryOf ( letter: InboxLetter ): InboxCategory | null {
    return letter.categoryId ? this.categories.find( category => category.id === letter.categoryId ) || null : null;
  }

  /** Letters per category, across every loaded day. */
  categoryCount ( category: InboxCategory ): number {
    return this.days.reduce( ( total, day ) => total + day.letters.filter( letter => letter.categoryId === category.id ).length, 0 );
  }

  sourceLine ( letter: InboxLetter ): string {
    return `From ${ letter.name } · ${ dayLong( letter.dayKey ) }`;
  }

  /** The address, plus how it's connected when the same address is connected twice. */
  boxLabel ( box: MailboxConfigSummary ): string {
    const configs = this.mailbox.mailboxConfigs;
    const shared = configs.some( other => other.id !== box.id && other.emailAddress === box.emailAddress );
    return shared ? `${ box.emailAddress } · ${ mailboxConnectionLabel( box, configs ) }` : box.emailAddress;
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
  }

  // ---------------------------------------------------------------- days and categories

  /** Picking a day (pill, calendar, arrows or ← →) clears the category filter and the selection. */
  pickDay ( key: string ): void {
    this.clearSelection();
    this.topicId = null;
    this.selectedDay = key;
    this.calendarOpen = false;
    this.query = '';
    if ( typeof window !== 'undefined' ) window.scrollTo( { top: 0 } );
  }

  shiftDay ( older: boolean ): void {
    const target = this.topic ? this.day : older ? this.olderDay : this.newerDay;
    if ( target ) this.pickDay( target.key );
  }

  /** A chip turns its category filter on; the active chip turns it off. */
  pickTopic ( category: InboxCategory ): void {
    this.topicId = this.topicId === category.id ? null : category.id;
    this.clearSelection();
    this.calendarOpen = false;
    this.query = '';
  }

  clearTopic (): void {
    this.topicId = null;
    this.clearSelection();
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
    if ( this.queue ) return 'Stop answering';
    if ( this.topic ) return `Back to ${ this.topic.name }`;
    const day = this.days.find( item => item.key === this.openLetter?.dayKey );
    return `Back to ${ day?.label || 'Inbox' }`;
  }

  get position (): string {
    const letter = this.openLetter;
    if ( !letter ) return '';
    let line: string;
    if ( this.queue ) {
      line = `${ this.waitingAll.length } still waiting`;
    } else {
      const ids = this.listOf( letter );
      line = `${ ids.indexOf( letter.id ) + 1 } of ${ ids.length }`;
    }
    return this.narrow ? line : `${ line } · Esc to go back · ← → to move`;
  }

  openLetterView ( letter: InboxLetter ): void {
    this.categoryMenu = null;
    this.router.navigate( ['/inbox', letter.id] );
  }

  closeLetter (): void {
    // Back returns to the letter's day (the queue may have walked to another).
    if ( this.openLetter && !this.topic ) this.selectedDay = this.openLetter.dayKey;
    this.queue = false;
    this.categoryMenu = null;
    this.router.navigate( ['/inbox'] );
  }

  /** Prev/next move through the day, or through the category it was opened from. */
  step ( delta: number ): void {
    const letter = this.openLetter;
    if ( !letter ) return;
    const ids = this.listOf( letter );
    const next = ids[( ids.indexOf( letter.id ) + delta + ids.length ) % ids.length];
    if ( next && next !== letter.id ) this.router.navigate( ['/inbox', next], { replaceUrl: true } );
  }

  startAnswering (): void {
    const first = this.waitingAll[0];
    if ( !first ) return;
    this.queue = true;
    this.query = '';
    this.clearSelection();
    this.router.navigate( ['/inbox', first.id] );
  }

  // ---------------------------------------------------------------- actions

  quickAction ( letter: InboxLetter ): void {
    if ( letter.draft ) {
      this.scheduleSend( letter, letter.draft, `Sent 16Ahead's reply to ${ letter.name }` );
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
        this.flash( { text: '16Ahead needs this sender in your contacts to write a reply.' } );
      }
      return;
    }
    this.rewriting = true;
    try {
      const text = await this.mailbox.draftReplyWithTodd( letter.contactId );
      if ( this.openId === letter.id ) this.letterView?.setDraft( text );
    } catch ( error: any ) {
      this.flash( { text: String( error?.message || "16Ahead couldn't write this one." ) } );
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

  // ---------------------------------------------------------------- selection and the bulk bar

  /** Ticked letters that are still listed. */
  get selectedLetters (): InboxLetter[] {
    return this.letters.filter( letter => this.selectedIds.has( letter.id ) );
  }

  get showBulkBar (): boolean {
    return !this.openId && this.selectedLetters.length > 0;
  }

  get selectionHasWaiting (): boolean {
    return this.selectedLetters.some( isWaiting );
  }

  /** Tick or untick one row; Shift ticks everything between it and the last one. */
  tick ( { letter, range }: { letter: InboxLetter; range: boolean; } ): void {
    const rows = this.sections.flatMap( section => section.rows );
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
  }

  allSelected ( rows: InboxLetter[] ): boolean {
    return rows.length > 0 && rows.every( letter => this.selectedIds.has( letter.id ) );
  }

  /** Each section's "Select all" / "Clear". */
  toggleSection ( rows: InboxLetter[] ): void {
    const all = this.allSelected( rows );
    rows.forEach( letter => all ? this.selectedIds.delete( letter.id ) : this.selectedIds.add( letter.id ) );
  }

  clearSelection (): void {
    this.selectedIds.clear();
    this.lastTicked = null;
  }

  bulkDone (): void {
    const waiting = this.selectedLetters.filter( isWaiting );
    if ( !waiting.length ) return;
    waiting.forEach( letter => this.done.add( letter.id ) );
    this.saveDone();
    this.touch();
    this.clearSelection();
    this.flash( { text: `${ letters( waiting.length ) } marked as done` } );
  }

  deleteSelected (): void {
    this.deleteLetters( this.selectedLetters.map( letter => letter.id ) );
  }

  /**
   * An attachment tile: pictures, PDFs and text open in a new tab, the rest
   * download. The tab opens now, before the fetch, so Safari doesn't block it.
   */
  async openAttachment ( file: MailboxAttachment ): Promise<void> {
    const letterId = this.openId;
    if ( !letterId || !file.id ) return;
    const viewable = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain)$/i.test( file.contentType || '' );
    const tab = viewable ? window.open( '', '_blank' ) : null;
    const blob = this.preview
      ? ( file.preview ? await ( await fetch( file.preview ) ).blob() : null )
      : await this.mailbox.fetchAttachment( letterId, file.id );
    if ( !blob ) {
      tab?.close();
      this.flash( { text: `Couldn't open ${ file.name }.` } );
      return;
    }
    const url = URL.createObjectURL( blob.type ? blob : new Blob( [blob], { type: file.contentType || 'application/octet-stream' } ) );
    if ( tab ) {
      tab.location.href = url;
    } else {
      const link = document.createElement( 'a' );
      link.href = url;
      link.download = file.name;
      document.body.appendChild( link );
      link.click();
      link.remove();
    }
    setTimeout( () => URL.revokeObjectURL( url ), 60_000 );
  }

  deleteOpenLetter (): void {
    if ( this.openId ) this.deleteLetters( [this.openId] );
  }

  /**
   * Soft delete: the letters go from the list now and from the mailbox
   * after the Undo window, so Undo really brings them back. An open letter
   * moves on to the next one in its list, or closes when none are left.
   */
  deleteLetters ( ids: string[] ): void {
    const gone = [...new Set( ids )].filter( id => !this.hidden.has( id ) );
    if ( !gone.length ) return;
    const open = this.openLetter;
    let nextOpen: string | null = null;
    if ( open && gone.includes( open.id ) ) {
      const list = this.listOf( open ).filter( id => id === open.id || !gone.includes( id ) );
      const index = list.indexOf( open.id );
      nextOpen = list[index + 1] || list[index - 1] || null;
    }
    gone.forEach( id => this.hidden.add( id ) );
    this.touch();
    this.clearSelection();
    this.categoryMenu = null;
    const batch = ++this.deleteBatch;
    this.deleting.set( batch, { ids: gone, timer: setTimeout( () => this.flushDelete( batch ), UNDO_MS ) } );
    if ( open && gone.includes( open.id ) ) {
      if ( nextOpen ) this.router.navigate( ['/inbox', nextOpen], { replaceUrl: true } );
      else this.closeLetter();
    }
    this.flash( {
      text: `Deleted ${ letters( gone.length ) }`,
      undo: () => {
        const pending = this.deleting.get( batch );
        if ( !pending ) return;
        clearTimeout( pending.timer );
        this.deleting.delete( batch );
        pending.ids.forEach( id => this.hidden.delete( id ) );
        this.touch();
      },
    } );
  }

  // ---------------------------------------------------------------- the category menu

  openCategoryMenu ( mode: CategoryMenuMode, event: Event ): void {
    event.preventDefault();
    event.stopPropagation();
    const rect = ( event.currentTarget as HTMLElement ).getBoundingClientRect();
    this.categoryMenu = { mode, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom } };
  }

  /** Who the menu acts on: the selection, or the open letter. */
  private get menuTargets (): InboxLetter[] {
    const mode = this.categoryMenu?.mode;
    if ( mode === 'bulk' ) return this.selectedLetters;
    if ( mode === 'letter' && this.openLetter ) return [this.openLetter];
    return [];
  }

  get menuOptions (): CategoryOption[] {
    const targets = this.menuTargets;
    return this.categories.map( category => ( {
      category,
      count: this.categoryCount( category ),
      checked: targets.length > 0 && targets.every( letter => letter.categoryId === category.id ),
    } ) );
  }

  get menuCount (): number {
    return this.menuTargets.length;
  }

  get menuCanRemove (): boolean {
    return this.menuTargets.some( letter => !!letter.categoryId );
  }

  /** Files the menu's letters under a category, or (null) takes them out. */
  async assignCategory ( category: InboxCategory | null ): Promise<void> {
    const mode = this.categoryMenu?.mode;
    const targets = this.menuTargets;
    this.categoryMenu = null;
    if ( !targets.length ) return;
    const ids = targets.map( letter => letter.id );
    const before = { ...this.assignments };
    ids.forEach( id => category ? this.assignments[id] = category.id : delete this.assignments[id] );
    this.touch();
    if ( mode === 'bulk' ) this.clearSelection();
    this.flash( { text: !category ? 'Category removed' : mode === 'bulk' ? `${ letters( ids.length ) } moved to ${ category.name }` : `Filed under ${ category.name }` } );
    if ( this.preview ) return;
    try {
      await this.mailbox.categorizeMessages( ids, category?.id || null );
    } catch ( error: any ) {
      this.logger.error( 'Inbox categorize failed', error );
      this.assignments = before;
      this.touch();
      this.flash( { text: `Couldn't file ${ ids.length === 1 ? 'that letter' : 'those letters' }. Try again.` } );
    }
  }

  /** "New category": a name that exists (any case) reuses that category. From a bulk or letter menu it's also assigned. */
  async addCategory ( name: string ): Promise<void> {
    const clean = name.trim().replace( /\s+/g, ' ' );
    if ( !clean ) return;
    let category = this.categories.find( item => item.name.toLowerCase() === clean.toLowerCase() ) || null;
    if ( !category ) {
      try {
        category = this.preview
          ? { id: `c${ Date.now() }`, name: clean, color: COLORS[this.categories.length % COLORS.length] }
          : await this.mailbox.createInboxCategory( clean );
      } catch ( error: any ) {
        this.logger.error( 'Inbox category create failed', error );
        this.flash( { text: `Couldn't add ${ clean }. Try again.` } );
        return;
      }
      if ( !this.categories.some( item => item.id === category!.id ) ) this.categories = [...this.categories, category];
    }
    if ( this.categoryMenu?.mode === 'filter' ) {
      this.categoryMenu = null;
      this.flash( { text: `Added ${ category.name }` } );
    } else {
      await this.assignCategory( category );
    }
  }

  // ---------------------------------------------------------------- keyboard

  @HostListener( 'document:keydown', ['$event'] )
  onKey ( event: KeyboardEvent ): void {
    const target = event.target as HTMLElement | null;
    const typing = !!target && ( ['TEXTAREA', 'INPUT', 'SELECT'].includes( target.tagName ) || target.isContentEditable );
    if ( event.metaKey || event.ctrlKey || event.altKey || this.categoryMenu ) return;
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
    if ( event.key === 'Delete' || event.key === 'Backspace' ) {
      if ( this.openId ) {
        event.preventDefault();
        this.deleteOpenLetter();
      } else if ( this.selectedLetters.length ) {
        event.preventDefault();
        this.deleteSelected();
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
      this.calendarOpen = false;
      this.clearSelection();
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
      this.loadCategories( mailboxId );
      this.version++;
    }
    if ( this.cache.messages !== messages || this.cache.version !== this.version ) {
      const done = new Set( [...this.done, ...this.answeredNow] );
      const ownEmail = this.mailbox.connectedMailbox?.emailAddress || '';
      const letters = ( messages || [] )
        .filter( message => !this.hidden.has( message.id ) )
        .map( message => toLetter( message, { ownEmail, done, categories: this.assignments } ) );
      this.cache = { messages, version: this.version, letters, days: buildDays( letters ) };
    }
    return this.cache;
  }

  /** Rebuild the letters after a local change (sent, done, filed, deleted, undone). */
  private touch (): void {
    this.version++;
  }

  /** The list a letter belongs to on screen: its category when one is picked, else its day. */
  private listOf ( letter: InboxLetter ): string[] {
    if ( this.topic ) return this.scope.map( item => item.id );
    return ( this.days.find( day => day.key === letter.dayKey )?.letters || [] ).map( item => item.id );
  }

  private loadCategories ( mailboxId: string ): void {
    if ( this.preview || !mailboxId ) return;
    this.mailbox.loadInboxCategories()
      .then( ( { categories, assignments } ) => {
        if ( this.mailbox.connectedMailbox?.id !== mailboxId ) return;
        this.categories = categories;
        this.assignments = assignments;
        this.touch();
      } )
      .catch( ( error ) => this.logger.error( 'Inbox categories failed to load', error ) );
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
    if ( letter && !this.topic ) this.selectedDay = letter.dayKey;
    this.loadDetail( id );
  }

  private async loadDetail ( id: string ): Promise<void> {
    const detail = this.preview
      ? ( INBOX_PREVIEW_LETTERS.find( letter => letter.id === id ) || null )
      : await this.mailbox.fetchMessageDetail( id );
    if ( this.openId === id ) this.detail = detail;
  }

  /** After Send or Done: the next waiting letter in queue mode, else back to the list. */
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

  /** The Undo window is over: remove them from the mailbox. Any that fail come back. */
  private flushDelete ( batch: number ): Promise<void> {
    const pending = this.deleting.get( batch );
    if ( !pending ) return this.deleteChain;
    clearTimeout( pending.timer );
    this.deleting.delete( batch );
    this.deleteChain = this.deleteChain.then( () => this.removeFromMailbox( pending.ids ) );
    return this.deleteChain;
  }

  private async removeFromMailbox ( ids: string[] ): Promise<void> {
    if ( this.preview ) {
      this.mailbox.mailboxMessages = this.mailbox.mailboxMessages.filter( message => !ids.includes( message.id ) );
      return;
    }
    // Deleted ones have left the list; any that failed are still in it, so they show again.
    const { failed } = await this.mailbox.deleteMailboxMessages( ids, { notify: false } );
    ids.forEach( id => this.hidden.delete( id ) );
    this.touch();
    if ( failed ) this.flash( { text: `Couldn't delete ${ letters( failed ) }. They're back in your inbox.` } );
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
