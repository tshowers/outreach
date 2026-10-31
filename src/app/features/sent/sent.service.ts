import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Email } from '../../models/email.model';
import { MomentumThread } from '../../models/momentum-thread.model';
import { EmailApiService } from '../../services/email-api.service';
import { OutreachApiService } from '../../services/outreach-api.service';

export type SentGroup = 'engaged' | 'opened' | 'none';

/** Who sent it, as the "Sent by" select names it. */
export type SentBy = 'catalyst' | 'manual' | 'reviewed_reply' | 'maya' | 'campaign' | 'hot_lead';

export const SENT_BY_LABELS: Record<SentBy, string> = {
  catalyst: 'Catalyst',
  manual: 'You, from Composer',
  reviewed_reply: 'Reviewed reply',
  maya: 'Marketing Assistant',
  campaign: 'A campaign',
  hot_lead: 'Hot-lead follow-up',
};

/** The meta line's "· Sent by …" wording. */
const SENT_BY_META: Record<SentBy, string> = {
  catalyst: 'Sent by Catalyst',
  manual: 'Sent by you from Composer',
  reviewed_reply: 'Reviewed reply',
  maya: 'Sent by the Marketing Assistant',
  campaign: 'Sent by a campaign',
  hot_lead: 'Hot-lead follow-up',
};

export interface SentRow {
  id: string;
  contactId: string;
  email: string;
  name: string;
  company: string;
  subject: string;
  sentAt: Date | null;
  meta: string;
  by: SentBy;
  opens: number;
  clicks: number;
  group: SentGroup;
  activity: string;
  /** "Maya follows up Wed, Oct 28", when her next step is known. */
  next: string;
  /** Maya already has a draft waiting for this person. */
  hasDraft: boolean;
}

const RANGE_DAYS = 30;
/** Same rule as the follow-up engine (momentum.contact-cap.js): a mail scanner
 *  opens and clicks every link within five minutes of a send, seconds apart. */
const SCANNER_AFTER_SEND_MS = 5 * 60 * 1000;
const SCANNER_BURST_MS = 5 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/**
 * Sent (design_handoff_outreach_mail 1j): the last 30 days of sent email,
 * with each person's company and Maya's next step from their momentum
 * thread. Sent-by follows the old Signal Engine Sent tab's rules
 * (email-sent.component.ts resolveSendPresentation).
 */
@Injectable( { providedIn: 'root' } )
export class SentService {
  private readonly http = inject( HttpClient );
  private readonly emailApi = inject( EmailApiService );
  private readonly outreachApi = inject( OutreachApiService );

  async load ( opts: { tenantId: string; userId?: string; userEmail?: string; }, now = new Date() ): Promise<SentRow[]> {
    const since = now.getTime() - RANGE_DAYS * 86400000;
    const [emails, threads] = await Promise.all( [
      this.loadEmails( since ),
      firstValueFrom( this.outreachApi.getSignalEngineBootstrap( opts ) )
        .then( ( response ) => ( Array.isArray( response?.data?.threads ) ? response.data.threads : [] ) as MomentumThread[] )
        .catch( () => [] as MomentumThread[] ),
    ] );

    const byContact = new Map<string, MomentumThread>();
    const byEmail = new Map<string, MomentumThread>();
    for ( const thread of threads ) {
      if ( thread.contactId ) byContact.set( String( thread.contactId ), thread );
      const address = String( ( thread as any ).emailAddress || '' ).trim().toLowerCase();
      if ( address ) byEmail.set( address, thread );
    }

    return emails
      .filter( ( email ) => !email.isTestSend )
      .map( ( email ) => {
        const address = String( email.to || '' ).trim().toLowerCase();
        const thread = ( email.contactId && byContact.get( String( email.contactId ) ) ) || byEmail.get( address ) || null;
        return toRow( email, thread, now );
      } )
      .filter( ( row ) => !row.sentAt || row.sentAt.getTime() >= since );
  }

  /** Asks Maya for an outbound follow-up; it lands in Drafts (momentum.assist-draft.js). */
  async draftFollowUp ( contactId: string, opts: { tenantId: string; userId?: string; userEmail?: string; } ): Promise<void> {
    let headers = new HttpHeaders().set( 'x-tenant-id', opts.tenantId );
    if ( opts.userId ) headers = headers.set( 'x-user-id', opts.userId );
    if ( opts.userEmail ) headers = headers.set( 'x-user-email', opts.userEmail );
    await firstValueFrom( this.http.post( `${ environment.backendURL }/outreach/momentum-threads/draft-assist`, { contactId, purpose: 'follow_up' }, { headers } ) );
  }

  /** Newest first, page by page, until a page reaches past the range. */
  private async loadEmails ( since: number ): Promise<Email[]> {
    const all: Email[] = [];
    let cursor: string | undefined;
    for ( let page = 0; page < MAX_PAGES; page++ ) {
      const response = await firstValueFrom( this.emailApi.getEmails( { pageSize: PAGE_SIZE, ...( cursor ? { cursor } : {} ) } ) );
      const records = response?.data?.records || [];
      all.push( ...records );
      const oldest = records.length ? sentDate( records[records.length - 1] ) : null;
      cursor = response?.data?.nextCursor || undefined;
      if ( !response?.data?.hasMore || !cursor || ( oldest && oldest.getTime() < since ) ) break;
    }
    return all;
  }
}

export function sentDate ( email: Email ): Date | null {
  const raw = email?.date;
  if ( !raw ) return null;
  if ( raw instanceof Date ) return raw;
  if ( typeof raw.toDate === 'function' ) return raw.toDate();
  if ( raw.seconds ) return new Date( raw.seconds * 1000 );
  const parsed = new Date( raw );
  return Number.isNaN( parsed.getTime() ) ? null : parsed;
}

function countOf ( list: unknown, fallback: unknown ): number {
  return Array.isArray( list ) ? list.length : Number( fallback || 0 ) || 0;
}

function timeOf ( value: any ): number {
  if ( !value ) return 0;
  if ( typeof value.toDate === 'function' ) return value.toDate().getTime();
  if ( value.seconds ) return value.seconds * 1000;
  return Date.parse( String( value ) ) || 0;
}

/**
 * Clicks a person made (Ty, 2026-10-31): scanners "clicked" every link,
 * phone number included, seconds after the send, so 165 of 441 emails read
 * as clicked when about 5 were. A click with no time is counted as before.
 */
export function personClicks ( clicks: unknown, sentAt: Date | null ): number {
  if ( !Array.isArray( clicks ) ) return 0;
  const sent = sentAt?.getTime() || 0;
  const times = clicks.map( ( click: any ) => timeOf( click?.timestamp ) ).sort( ( a, b ) => a - b );
  return times.filter( ( at, i ) => !at || ( ( !sent || at - sent >= SCANNER_AFTER_SEND_MS ) && ( i === 0 || at - times[i - 1] >= SCANNER_BURST_MS ) ) ).length;
}

/** An open within five minutes of the send is the scanner, not the person. */
export function personOpened ( email: any, sentAt: Date | null ): boolean {
  if ( !email?.opened && !email?.openedAt ) return false;
  const at = timeOf( email.openedAt );
  const sent = sentAt?.getTime() || 0;
  return !at || !sent || at - sent >= SCANNER_AFTER_SEND_MS;
}

export function sentBy ( email: Email ): SentBy {
  const type = String( email?.messageType || '' ).toLowerCase();
  const authority = String( email?.sendAuthority || '' ).toLowerCase();
  const origin = String( email?.signalOrigin || '' ).toLowerCase();
  const source = String( email?.sourceSystem || '' ).toLowerCase();
  if ( type === 'hot_lead_seizure_auto_send' || authority === 'exception_hot_lead' ) return 'hot_lead';
  if ( type === 'reply_review_send' || authority === 'manual_reviewed' ) return 'reviewed_reply';
  if ( type.startsWith( 'momentum_' ) || authority === 'momentum_auto' || type === 'maya_send' || authority === 'maya' || origin === 'maya' || source === 'maya' ) return 'maya';
  if ( type.startsWith( 'campaign_' ) || authority === 'campaign' || !!email?.campaignId ) return 'campaign';
  if ( type === 'catalyst_send' || authority === 'catalyst' || origin === 'catalyst' ) return 'catalyst';
  return 'manual';
}

function activityLabel ( opens: number, clicks: number ): string {
  if ( clicks && opens ) return `Opened, clicked ${ clicks }×`;
  if ( clicks ) return `Clicked ${ clicks }×`;
  if ( opens ) return opens > 1 ? `Opened ${ opens }×` : 'Opened';
  return 'No opens yet';
}

/** "Today, 1:41 PM" or "Oct 5, 8:32 AM". */
function whenLabel ( date: Date | null, now: Date ): string {
  if ( !date ) return '';
  const time = date.toLocaleTimeString( 'en-US', { hour: 'numeric', minute: '2-digit' } );
  if ( date.toDateString() === now.toDateString() ) return `Today, ${ time }`;
  if ( date.toDateString() === new Date( now.getTime() - 86400000 ).toDateString() ) return `Yesterday, ${ time }`;
  return `${ date.toLocaleDateString( 'en-US', { month: 'short', day: 'numeric' } ) }, ${ time }`;
}

function nameFromAddress ( address: string ): string {
  return address.split( '@' )[0].split( /[._-]+/ ).filter( Boolean ).map( ( part ) => part[0].toUpperCase() + part.slice( 1 ) ).join( ' ' );
}

function toRow ( email: Email, thread: MomentumThread | null, now: Date ): SentRow {
  const address = String( email.to || '' ).trim();
  const raw = email as any;
  const date = sentDate( email );
  const opens = Array.isArray( raw.opens ?? raw.openEvents ) || raw.openCount != null
    ? countOf( raw.opens ?? raw.openEvents, raw.openCount )
    : personOpened( raw, date ) ? 1 : 0;
  const clicks = Array.isArray( raw.clicks ) ? personClicks( raw.clicks, date ) : countOf( null, raw.clickCount );
  const by = sentBy( email );
  const nextAt = thread?.nextActionAt ? new Date( thread.nextActionAt ) : null;
  const next = nextAt && !Number.isNaN( nextAt.getTime() ) && nextAt.getTime() > now.getTime()
    ? `The Marketing Assistant follows up ${ nextAt.toLocaleDateString( 'en-US', { weekday: 'short', month: 'short', day: 'numeric' } ) }`
    : '';
  return {
    id: String( email.id || `${ address }-${ date?.getTime() || '' }` ),
    contactId: String( email.contactId || thread?.contactId || '' ),
    email: address,
    name: String( email.contactName || thread?.contactName || '' ).trim() || nameFromAddress( address ) || address,
    company: String( thread?.companyName || '' ).trim(),
    subject: String( email.subject || '' ).trim() || '(no subject)',
    sentAt: date,
    meta: [whenLabel( date, now ), SENT_BY_META[by]].filter( Boolean ).join( ' · ' ),
    by,
    opens,
    clicks,
    group: clicks ? 'engaged' : opens ? 'opened' : 'none',
    activity: activityLabel( opens, clicks ),
    next,
    hasDraft: thread?.userLane === 'drafts',
  };
}
