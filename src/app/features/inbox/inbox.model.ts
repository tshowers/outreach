import { MailboxMessageListItem } from '../../services/outreach-api.service';
import { cleanMessageText, messageKind } from '../../shared/utils/message-kind.util';

/**
 * Outreach Inbox 2026 (design_handoff_outreach_inbox_2026): one day at a
 * time, letters grouped as Waiting on you / TODD handled / Answered. A
 * letter is a mailbox message plus TODD's read of it. The server's TODD
 * fields (ask, toddSummary, draft, ...) win; until it sends them, they are
 * worked out here from signalSummary, the responder draft and the sender.
 */
export type LetterKind = NonNullable<MailboxMessageListItem['kind']>;
export type NextAction = NonNullable<MailboxMessageListItem['nextAction']>;
export type LetterGroup = 'waiting' | 'handled' | 'answered';

export interface InboxLetter {
  id: string;
  threadKey: string;
  receivedAt: string;
  time: number;
  dayKey: string;
  name: string;
  email: string;
  company: string;
  subject: string;
  kind: LetterKind;
  needsAnswer: boolean;
  answered: boolean;
  ask: string;
  toddSummary: string;
  toddDid: string;
  draft: string;
  nextAction: NextAction | null;
  filed: boolean;
  contactId: string;
  /** The one category it's filed under, or null. */
  categoryId: string | null;
  source: MailboxMessageListItem;
}

export interface InboxDay {
  key: string;
  /** "Today", "Yesterday", "Monday", then "Tue, Oct 13". */
  label: string;
  /** "Tuesday, October 20". */
  long: string;
  age: number;
  letters: InboxLetter[];
  waiting: number;
}

/** What the row's prep pill shows: TODD's draft, the next action, or what TODD did. */
export interface LetterPrep {
  text: string;
  tone: 'draft' | 'action' | 'done' | 'quiet';
  icon: 'spark' | 'phone' | 'msg' | 'mail' | 'cal' | 'file' | 'check';
}

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PERSONAL_DOMAINS = new Set( ['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'me.com', 'aol.com', 'live.com', 'msn.com'] );

/** YYYY-MM-DD in the viewer's timezone. */
export function dayKeyOf ( date: Date ): string {
  return `${ date.getFullYear() }-${ String( date.getMonth() + 1 ).padStart( 2, '0' ) }-${ String( date.getDate() ).padStart( 2, '0' ) }`;
}

export function dateOfKey ( key: string ): Date {
  const [y, m, d] = key.split( '-' ).map( Number );
  return new Date( y, m - 1, d );
}

/** Whole days between a day key and today, in local time. */
export function dayAge ( key: string, now = new Date() ): number {
  const today = new Date( now.getFullYear(), now.getMonth(), now.getDate() );
  return Math.round( ( today.getTime() - dateOfKey( key ).getTime() ) / 86400000 );
}

export function dayLabel ( key: string, now = new Date() ): string {
  const age = dayAge( key, now );
  const date = dateOfKey( key );
  if ( age === 0 ) return 'Today';
  if ( age === 1 ) return 'Yesterday';
  if ( age > 1 && age < 7 ) return DOW[date.getDay()];
  return `${ DOW[date.getDay()].slice( 0, 3 ) }, ${ MONTHS[date.getMonth()].slice( 0, 3 ) } ${ date.getDate() }`;
}

/** The filtered view's time column: "Today", "Yest.", "Fri", then "Oct 13". */
export function shortDayLabel ( key: string, now = new Date() ): string {
  const age = dayAge( key, now );
  const date = dateOfKey( key );
  if ( age === 0 ) return 'Today';
  if ( age === 1 ) return 'Yest.';
  if ( age > 1 && age < 7 ) return DOW[date.getDay()].slice( 0, 3 );
  return `${ MONTHS[date.getMonth()].slice( 0, 3 ) } ${ date.getDate() }`;
}

export function dayLong ( key: string ): string {
  const date = dateOfKey( key );
  return `${ DOW[date.getDay()] }, ${ MONTHS[date.getMonth()] } ${ date.getDate() }`;
}

export function monthName ( month: number ): string {
  return MONTHS[month];
}

export function shortDate ( iso: string ): string {
  const date = new Date( iso );
  return Number.isFinite( date.getTime() ) ? `${ MONTHS[date.getMonth()].slice( 0, 3 ) } ${ date.getDate() }` : '';
}

export function timeOfDay ( iso: string ): string {
  const date = new Date( iso );
  if ( !Number.isFinite( date.getTime() ) ) return '';
  const hours = date.getHours() % 12 || 12;
  return `${ hours }:${ String( date.getMinutes() ).padStart( 2, '0' ) } ${ date.getHours() < 12 ? 'AM' : 'PM' }`;
}

export function initials ( name: string ): string {
  return String( name || '?' ).trim().split( /\s+/ ).slice( 0, 2 ).map( part => part[0] || '' ).join( '' ).toUpperCase() || '?';
}

export function firstName ( name: string ): string {
  return String( name || '' ).trim().split( /\s+/ )[0] || '';
}

/** Avatar tint by kind: reply blue, out of office yellow, bounce pink, forward violet, the rest neutral. */
export function kindTint ( kind: LetterKind ): string {
  return ( { reply: 'blue', out_of_office: 'yellow', bounce: 'pink', forward: 'violet' } as Record<string, string> )[kind] || '';
}

export function htmlToText ( html: string ): string {
  return String( html || '' )
    .replace( /<(head|style|script|title)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi, '' )
    .replace( /<br\s*\/?>/gi, '\n' )
    .replace( /<\/(p|div|li|h\d)>/gi, '\n\n' )
    .replace( /<[^>]+>/g, '' )
    // A preview cut mid-tag ("<div dir…").
    .replace( /<[^>]*$/, '' )
    .replace( /&nbsp;/g, ' ' )
    .replace( /&amp;/g, '&' )
    .replace( /&lt;/g, '<' )
    .replace( /&gt;/g, '>' )
    .replace( /&#39;|&apos;/g, "'" )
    .replace( /&quot;/g, '"' )
    .replace( /\n{3,}/g, '\n\n' )
    .trim();
}

/** Text the server stored as HTML (HTML-only mail) reads as text. */
export function plainText ( value: string | null | undefined ): string {
  const text = String( value || '' );
  return /<\/?[a-z][\w-]*(?:\s[^>]*)?>|^\s*<[a-z]/i.test( text ) ? htmlToText( text ) : text;
}

function firstSentence ( text: string, max = 90 ): string {
  const flat = String( text || '' ).replace( /\s+/g, ' ' ).trim();
  if ( !flat ) return '';
  const sentence = ( flat.match( /^.+?[.!?](?=\s|$)/ ) || [flat] )[0];
  return sentence.length > max ? `${ sentence.slice( 0, max - 1 ).trimEnd() }…` : sentence;
}

const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;

function kindOf ( message: MailboxMessageListItem, ownEmail: string ): LetterKind {
  if ( message.kind ) return message.kind;
  const subject = String( message.subject || '' ).trim();
  const from = String( message.fromEmail || '' ).toLowerCase();
  if ( /^\[test\]/i.test( subject ) || ( ownEmail && from === ownEmail ) ) return 'test';
  const kind = messageKind( message );
  return kind === 'outOfOffice' ? 'out_of_office' : kind;
}

function companyOf ( message: MailboxMessageListItem ): string {
  if ( message.fromCompany ) return message.fromCompany;
  const domain = String( message.fromEmail || '' ).split( '@' )[1] || '';
  return PERSONAL_DOMAINS.has( domain.toLowerCase() ) ? '' : domain;
}

function fallbackDid ( kind: LetterKind, message: MailboxMessageListItem ): string {
  if ( String( message.responderDecision || '' ).toLowerCase() === 'responded' ) return '16Ahead replied';
  switch ( kind ) {
    case 'out_of_office': return 'Out of office. Nothing to answer';
    case 'bounce': return 'Address bounced';
    case 'newsletter':
    case 'test':
    case 'automated': return 'Filed';
    default: return 'Nothing to answer';
  }
}

export function toLetter ( message: MailboxMessageListItem, opts: { ownEmail?: string; done?: Set<string>; categories?: Record<string, string>; } = {} ): InboxLetter {
  const ownEmail = String( opts.ownEmail || '' ).toLowerCase();
  const kind = kindOf( message, ownEmail );
  const responded = String( message.responderDecision || '' ).toLowerCase() === 'responded';
  const filed = message.filed ?? ['newsletter', 'test', 'automated'].includes( kind );
  const needsAnswer = message.needsAnswer ?? ( ( kind === 'reply' || kind === 'forward' ) && !filed && !responded );
  const answered = needsAnswer && ( !!message.replied || !!message.answeredAt || !!opts.done?.has( message.id ) );
  const preview = cleanMessageText( plainText( message.preview ) ).replace( /\n/g, ' ' );
  const summary = plainText( message.toddSummary || message.signalSummary ).trim();
  const draft = message.draft !== undefined
    ? String( message.draft || '' ).trim()
    : htmlToText( String( message.replyDraftBody || '' ) );
  let nextAction = message.nextAction ?? null;
  if ( message.nextAction === undefined && needsAnswer && !draft ) {
    const phone = ( `${ preview } ${ summary }`.match( PHONE ) || [] )[0];
    if ( phone ) nextAction = { type: 'call', label: `Call ${ phone.trim() }`, value: phone.trim() };
  }
  const received = new Date( message.receivedAt );
  const time = Number.isFinite( received.getTime() ) ? received.getTime() : 0;
  const name = String( message.fromName || message.fromEmail || 'Unknown sender' ).replace( /^"|"$/g, '' ).trim();
  return {
    id: message.id,
    threadKey: String( message.threadId || message.id ),
    receivedAt: message.receivedAt,
    time,
    dayKey: dayKeyOf( time ? received : new Date( 0 ) ),
    name,
    email: String( message.fromEmail || '' ),
    company: companyOf( message ),
    subject: String( message.subject || '(no subject)' ),
    kind,
    needsAnswer,
    answered,
    ask: String( message.ask || '' ).trim() || firstSentence( summary, 80 ) || firstSentence( preview, 80 ) || String( message.subject || '' ),
    toddSummary: summary || firstSentence( preview, 200 ),
    toddDid: String( message.toddDid || '' ).trim() || fallbackDid( kind, message ),
    draft,
    nextAction,
    filed,
    contactId: String( message.contactId || '' ),
    categoryId: opts.categories?.[message.id] || null,
    source: message,
  };
}

export function groupOf ( letter: InboxLetter ): LetterGroup {
  if ( !letter.needsAnswer ) return 'handled';
  return letter.answered ? 'answered' : 'waiting';
}

export function isWaiting ( letter: InboxLetter ): boolean {
  return letter.needsAnswer && !letter.answered;
}

/** Waiting first, then TODD handled (filed last), then answered; newest first inside each. */
export function orderDay ( letters: InboxLetter[] ): InboxLetter[] {
  const rank = ( letter: InboxLetter ) => {
    const group = groupOf( letter );
    return group === 'waiting' ? 0 : group === 'handled' ? ( letter.filed ? 2 : 1 ) : 3;
  };
  return [...letters].sort( ( a, b ) => rank( a ) - rank( b ) || b.time - a.time );
}

/** One row per thread per day (the latest message), days newest first. */
export function buildDays ( letters: InboxLetter[], now = new Date() ): InboxDay[] {
  const byDay = new Map<string, Map<string, InboxLetter>>();
  for ( const letter of letters ) {
    if ( !letter.time ) continue;
    const threads = byDay.get( letter.dayKey ) || new Map<string, InboxLetter>();
    const current = threads.get( letter.threadKey );
    if ( !current || current.time < letter.time ) threads.set( letter.threadKey, letter );
    byDay.set( letter.dayKey, threads );
  }
  return [...byDay.entries()]
    .sort( ( [a], [b] ) => ( a < b ? 1 : -1 ) )
    .map( ( [key, threads] ) => {
      const dayLetters = orderDay( [...threads.values()] );
      return {
        key,
        label: dayLabel( key, now ),
        long: dayLong( key ),
        age: dayAge( key, now ),
        letters: dayLetters,
        waiting: dayLetters.filter( isWaiting ).length,
      };
    } );
}

export function prepOf ( letter: InboxLetter ): LetterPrep {
  if ( letter.needsAnswer && letter.answered ) return { text: 'Answered', tone: 'done', icon: 'check' };
  if ( !letter.needsAnswer ) return { text: letter.toddDid, tone: 'quiet', icon: 'check' };
  if ( letter.draft ) {
    const lines = letter.draft.split( '\n' ).map( line => line.trim() ).filter( Boolean );
    // Skip the greeting: the first line people see should say something.
    const line = ( lines.length > 1 && /^(hi|hello|hey|dear|good (morning|afternoon))\b|,$/i.test( lines[0] ) ) ? lines[1] : lines[0];
    return { text: `"${ line }"`, tone: 'draft', icon: 'spark' };
  }
  if ( letter.nextAction ) {
    const icon = ( { call: 'phone', text: 'msg', email: 'mail', calendar: 'cal', attach: 'file' } as const )[letter.nextAction.type] || 'phone';
    return { text: letter.nextAction.label, tone: 'action', icon };
  }
  return { text: 'Write back', tone: 'action', icon: 'mail' };
}

export interface QuickAction {
  label: 'Send' | 'Call';
  icon: 'send' | 'phone';
}

/** Send uses TODD's draft without opening; Call when there's only a number. */
export function quickActionOf ( letter: InboxLetter ): QuickAction | null {
  if ( !isWaiting( letter ) ) return null;
  if ( letter.draft ) return { label: 'Send', icon: 'send' };
  if ( letter.nextAction?.type === 'call' && letter.nextAction.value ) return { label: 'Call', icon: 'phone' };
  return null;
}

const STOP_WORDS = new Set( 'what did does do say said about the a an to from who when is are was for of on in me my any has have with and or tell us we you i it that this'.split( ' ' ) );

export interface AskResult {
  answer: string;
  source: InboxLetter | null;
  hits: InboxLetter[];
}

/** Ask TODD, the keyword version: names count three times, everything else once. */
export function askTodd ( query: string, letters: InboxLetter[] ): AskResult {
  const terms = query.toLowerCase().replace( /[^a-z0-9@.\s]/g, ' ' ).split( /\s+/ ).filter( term => term.length > 1 && !STOP_WORDS.has( term ) );
  if ( !terms.length ) return { answer: 'Ask about a person, a company or a topic.', source: null, hits: [] };
  const scored = letters.map( letter => {
    const name = `${ letter.name } ${ letter.email } ${ letter.company }`.toLowerCase();
    const text = [letter.subject, letter.ask, letter.toddSummary, letter.source.preview || ''].join( ' ' ).toLowerCase();
    const score = terms.reduce( ( total, term ) => total + ( name.includes( term ) ? 3 : 0 ) + ( text.includes( term ) ? 1 : 0 ), 0 );
    return { letter, score };
  } ).filter( item => item.score > 0 ).sort( ( a, b ) => b.score - a.score || b.letter.time - a.letter.time );
  const top = scored[0]?.letter || null;
  return {
    answer: top ? ( top.toddSummary || top.ask ) : "16Ahead didn't find anything about that in the last two weeks.",
    source: top,
    hits: scored.map( item => item.letter ),
  };
}
