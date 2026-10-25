/**
 * Outreach Drips (design_handoff_outreach_drips): one Email Creator email
 * sent one person at a time, weekdays 9-5 in each person's time zone, for at
 * most 30 days. The rules live on the server (todd-backend outreach/drips);
 * this file is the page's words, dates and arithmetic, kept pure for tests.
 */

// 'starting' is the minute or so the server takes to build the queue.
export type DripStatus = 'ready' | 'scheduled' | 'starting' | 'running' | 'paused' | 'archived';
export type DripKind = 'newsletter' | 'blog' | 'announcement';

export interface DripAudienceRef {
  id: string;
  name: string;
  source: 'contacts' | 'leadVault' | 'both';
  count: number;
  lockedAt?: string;
}

export interface DripAudience extends DripAudienceRef {
  mode: 'search' | 'category';
  query: string;
  createdAt: string | null;
}

export interface DripCounters {
  total: number;
  queued: number;
  sent: number;
  bounced: number;
  unsubscribed: number;
  skipped: number;
  failed: number;
}

export interface DripStats {
  emails: number;
  opens: number;
  clickers: number;
  clicks: number;
  links: { url: string; count: number }[];
}

export interface Drip {
  id: string;
  title: string;
  kind: DripKind;
  subject: string;
  preheader: string;
  html?: string;
  status: DripStatus;
  audience: DripAudienceRef | null;
  rateMinutes: number;
  startMode: 'now' | 'date';
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  startedAt: string | null;
  archivedAt: string | null;
  archivedReason: 'ended' | 'finished' | 'manual' | null;
  sourceDripId: string | null;
  counters: DripCounters;
  stats: DripStats | null;
  nextSendAt: number | null;
  lastSentAt: string | null;
  blocker: { code: string; message: string } | null;
  fromName: string;
  fromEmail: string;
}

export interface DripSlotHolder {
  id: string;
  title: string;
  status: DripStatus;
  startDate: string | null;
  endDate: string | null;
}

export interface DripDetail {
  drip: Drip;
  others: DripSlotHolder[];
  audiences: DripAudience[];
  today: string;
  rates: number[];
  maxDays: number;
  maxLeadDays: number;
}

export interface DripConflict {
  date: string;
  drips: DripSlotHolder[];
}

export const DRIP_RATES = [1, 5, 15, 30, 60, 120, 240, 1440];
export const DRIP_MAX_DAYS = 30;
export const DRIP_MAX_SLOTS = 2;

export const KIND_LABELS: Record<DripKind, string> = { newsletter: 'Newsletter', blog: 'Blog post', announcement: 'Announcement' };
export const KIND_TINTS: Record<DripKind, string> = { newsletter: 'violet', blog: 'yellow', announcement: 'pink' };
export const STATUS_LABELS: Record<DripStatus, string> = { starting: 'Starting', running: 'Sending', paused: 'Paused', ready: 'Ready', scheduled: 'Scheduled', archived: 'Archived' };
export const STATUS_TINTS: Record<DripStatus, string> = { starting: 'green', running: 'green', paused: 'yellow', ready: 'blue', scheduled: 'violet', archived: 'grey' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function rateLabel ( minutes: number ): string {
  if ( minutes === 1 ) return '1 a minute';
  if ( minutes === 60 ) return '1 an hour';
  if ( minutes === 1440 ) return '1 a day';
  return minutes > 60 ? `1 every ${ minutes / 60 } hours` : `1 every ${ minutes } minutes`;
}

export function sendsPerWeekday ( minutes: number ): number {
  return minutes >= 1440 ? 1 : Math.floor( 480 / minutes );
}

export function addDays ( date: string, days: number ): string {
  const next = new Date( `${ date }T00:00:00Z` );
  next.setUTCDate( next.getUTCDate() + days );
  return next.toISOString().slice( 0, 10 );
}

export function daysBetween ( from: string, to: string ): number {
  return Math.round( ( Date.parse( `${ to }T00:00:00Z` ) - Date.parse( `${ from }T00:00:00Z` ) ) / 86400000 );
}

/** "2026-11-13" -> "Nov 13" */
export function shortDate ( date: string | null | undefined ): string {
  if ( !date ) return '';
  const [, month, day] = date.slice( 0, 10 ).split( '-' ).map( Number );
  return `${ MONTHS[month - 1] } ${ day }`;
}

/** An ISO time as the day it fell on in the workspace's time zone. */
export function dayOf ( iso: string | null | undefined, timezone: string ): string {
  if ( !iso ) return '';
  try {
    return new Intl.DateTimeFormat( 'en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' } ).format( new Date( iso ) );
  } catch {
    return iso.slice( 0, 10 );
  }
}

export function percent ( part: number, whole: number ): string {
  if ( !whole ) return '0%';
  const value = ( part / whole ) * 100;
  return `${ value >= 10 ? Math.round( value ) : Number( value.toFixed( 1 ) ) }%`;
}

export function countdown ( ms: number ): string {
  const total = Math.max( 0, Math.ceil( ms / 1000 ) );
  const hours = Math.floor( total / 3600 );
  const minutes = Math.floor( ( total % 3600 ) / 60 );
  const seconds = String( total % 60 ).padStart( 2, '0' );
  return hours ? `${ hours }:${ String( minutes ).padStart( 2, '0' ) }:${ seconds }` : `${ minutes }:${ seconds }`;
}

/** The window a drip has, or would get if it were turned on today. */
export function dripWindow ( drip: Drip, today: string ): { start: string; end: string } {
  if ( drip.status !== 'ready' && drip.startDate && drip.endDate ) return { start: drip.startDate, end: drip.endDate };
  const start = drip.startMode === 'date' && drip.startDate ? drip.startDate : today;
  const end = drip.endDate && drip.endDate > start && daysBetween( start, drip.endDate ) <= DRIP_MAX_DAYS ? drip.endDate : addDays( start, DRIP_MAX_DAYS );
  return { start, end };
}

/** The first day two other drips already hold, like the server's check. */
export function findConflict ( id: string, window: { start: string; end: string }, others: DripSlotHolder[] ): DripConflict | null {
  const holders = others.filter( ( other ) => other.id !== id && ['running', 'paused', 'scheduled', 'starting'].includes( other.status ) && other.startDate && other.endDate );
  for ( let day = window.start; day < window.end; day = addDays( day, 1 ) ) {
    const covering = holders.filter( ( other ) => ( other.startDate as string ) <= day && day < ( other.endDate as string ) );
    if ( covering.length >= DRIP_MAX_SLOTS ) return { date: day, drips: covering };
  }
  return null;
}

export function dayNumber ( drip: Drip, today: string ): number {
  return drip.startDate ? Math.min( DRIP_MAX_DAYS, Math.max( 1, daysBetween( drip.startDate, today ) + 1 ) ) : 0;
}

export function daysLeft ( drip: Drip, today: string ): number {
  const window = dripWindow( drip, today );
  return Math.max( 0, daysBetween( ['running', 'paused', 'starting'].includes( drip.status ) ? today : window.start, window.end ) );
}

/** The switch's sentence. */
export function statusSentence ( drip: Drip, today: string ): string {
  const window = dripWindow( drip, today );
  switch ( drip.status ) {
    case 'starting': return 'On. Getting the list ready; the first email goes out within a few minutes.';
    case 'running': return `On. Sending ${ rateLabel( drip.rateMinutes ) }.`;
    case 'paused': return `Off. The clock keeps running; it still archives ${ shortDate( window.end ) }.`;
    case 'scheduled': return `Scheduled for ${ shortDate( window.start ) }. Turn off to cancel.`;
    case 'ready': return drip.startMode === 'date' && drip.startDate ? `Off. Turn on to schedule it for ${ shortDate( drip.startDate ) }.` : 'Off. Turning it on starts sending today.';
    default: return '';
  }
}

/** How many it reaches before it archives. Capacity = sends per weekday × weekdays left. */
export function projectedReach ( drip: Drip, today: string ): string {
  const total = drip.status === 'ready' || drip.status === 'scheduled' ? drip.audience?.count || 0 : drip.counters.total;
  if ( !total ) return '';
  const sent = drip.counters.sent;
  const remaining = drip.status === 'ready' || drip.status === 'scheduled' ? total : drip.counters.queued;
  const perDay = sendsPerWeekday( drip.rateMinutes );
  const capacity = perDay * Math.round( daysLeft( drip, today ) * 5 / 7 );
  const people = total.toLocaleString( 'en-US' );
  if ( capacity >= remaining ) {
    const from = drip.status === 'running' || drip.status === 'paused' ? today : dripWindow( drip, today ).start;
    const by = addDays( from, Math.max( 0, Math.ceil( ( remaining / perDay ) * 7 / 5 ) - 1 ) );
    return `Reaches all ${ people } people by about ${ shortDate( by ) }, then stops on its own.`;
  }
  return `Reaches about ${ ( sent + capacity ).toLocaleString( 'en-US' ) } of ${ people } people before it archives. Speed it up to reach everyone.`;
}

/** The expiry card's title. */
export function expiryTitle ( drip: Drip, today: string ): string {
  const window = dripWindow( drip, today );
  if ( drip.status === 'running' || drip.status === 'paused' || drip.status === 'starting' ) {
    const left = daysLeft( drip, today );
    return `${ left } day${ left === 1 ? '' : 's' } left · archives ${ shortDate( window.end ) }`;
  }
  if ( drip.status === 'scheduled' ) {
    const until = daysBetween( today, window.start );
    return `Starts in ${ until } day${ until === 1 ? '' : 's' } · archives ${ shortDate( window.end ) }`;
  }
  return `${ daysBetween( window.start, window.end ) } days once it starts`;
}

export function archivedSentence ( drip: Drip ): string {
  if ( drip.archivedReason === 'finished' ) return 'Everyone in its audience got it, so it archived itself. It can\'t be turned back on. Duplicate it to send the same email to a new audience.';
  if ( drip.archivedReason === 'manual' ) return 'It was archived early. It can\'t be turned back on. Duplicate it to send the same email to a new audience.';
  return 'This drip ran to its end day. It can\'t be turned back on. Duplicate it to send the same email to a new audience.';
}

export function audienceLine ( drip: Drip ): string {
  return [drip.audience?.name || 'No audience yet', rateLabel( drip.rateMinutes )].join( ' · ' );
}

export function sourceLabel ( source: DripAudienceRef['source'] ): string {
  return source === 'both' ? 'Contacts + Lead Vault' : source === 'leadVault' ? 'Lead Vault' : 'Contacts';
}

/** Each link in the email: what it says, keyed by where it goes. */
export function emailLinks ( html: string ): { url: string; label: string }[] {
  if ( typeof DOMParser === 'undefined' ) return [];
  const doc = new DOMParser().parseFromString( html || '', 'text/html' );
  const seen = new Map<string, string>();
  doc.querySelectorAll( 'a[href]' ).forEach( ( anchor ) => {
    const url = anchor.getAttribute( 'href' ) || '';
    if ( !url || url.startsWith( '#' ) || url.startsWith( 'mailto:' ) || /unsubscribe/i.test( url ) ) return;
    const label = ( anchor.textContent || '' ).replace( /\s+/g, ' ' ).trim() || anchor.querySelector( 'img' )?.getAttribute( 'alt' ) || url;
    if ( !seen.has( url ) ) seen.set( url, label );
  } );
  return [...seen].map( ( [url, label] ) => ( { url, label } ) );
}

/** Heatmap colour by share of all clicks. */
export function heatColor ( share: number ): { ring: string; text: string } {
  if ( share >= 0.4 ) return { ring: '#ff4fa8', text: '#ffffff' };
  if ( share >= 0.15 ) return { ring: '#f2b600', text: '#2b2200' };
  return { ring: '#2f6bff', text: '#ffffff' };
}
