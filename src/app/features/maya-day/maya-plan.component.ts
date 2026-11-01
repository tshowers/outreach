import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MayaQueueHealth, OutreachApiService } from '../../services/outreach-api.service';
import { MomentumThread } from '../../models/momentum-thread.model';
import { isNeedsYou } from '../../shared/utils/needs-you.util';
import { WriteActionDirective } from '../../shared/write-access/write-action.directive';
import { PreloaderComponent } from '../../shared/preloader/preloader.component';

export type PlanFilter = 'all' | 'needs-you' | 'hot' | 'queued' | 'stalled';
type PlanWhen = 'today' | 'week' | 'later';

interface PlanRow {
  id: string;
  contactId: string;
  name: string;
  company: string;
  needsYou: boolean;
  hot: boolean;
  /** Waiting for the Marketing Assistant's next pass. */
  queued: boolean;
  /** Paused, unsubscribed or gone quiet: nothing more is planned. */
  stalled: boolean;
  meta: string;
  last: string;
  subject: string;
  nextWhen: string;
  next: string;
  action: { label: string; link: string; queryParams?: Record<string, string>; } | null;
  when: PlanWhen;
  at: number;
  thread: MomentumThread;
}

interface PlanGroup {
  key: PlanWhen;
  title: string;
  hint: string;
  rows: PlanRow[];
}

const GROUP_CAP = 50;
const DISCARDED = /discarded/i;
const DAY_MS = 86400000;
const NEXT_ACTION_WORDS: Record<string, string> = {
  draft_followup: 'The Marketing Assistant drafts a follow-up for you to approve.',
  send_followup: 'Marketing Assistant sends the follow-up.',
  wait: 'The Marketing Assistant watches for a response.',
  pause: 'The Marketing Assistant pauses this one.',
  handoff_to_user: 'it comes to you.',
};

/**
 * Activity → Maya's plan (design_handoff_outreach_mail 1k): what Maya will
 * do next for each person and when, grouped Today / This week / Later, with
 * anyone waiting on the user first. Replaces Signal Engine's Plan tab and
 * its Maya's plan / Active / Stalled / Hot / Warm filters.
 */
@Component( {
  selector: 'app-maya-plan',
  standalone: true,
  imports: [CommonModule, RouterModule, WriteActionDirective, PreloaderComponent],
  templateUrl: './maya-plan.component.html',
  styleUrls: ['./maya-plan.component.css'],
} )
export class MayaPlanComponent implements OnChanges {
  private readonly api = inject( OutreachApiService );
  private readonly router = inject( Router );

  @Input() tenantId: string | null = null;
  @Input() filter: PlanFilter = 'all';
  @Output() filterChange = new EventEmitter<PlanFilter>();

  loading = false;
  error = '';
  private rows: PlanRow[] = [];
  groups: PlanGroup[] = [];
  chips: Array<{ id: PlanFilter; label: string; count: number; }> = [];
  closed: Record<PlanWhen, boolean> = { today: false, week: false, later: true };
  showAll: Record<PlanWhen, boolean> = { today: false, week: false, later: false };
  pendingId = '';
  actionError = '';
  /** "Paused" banners: which review limit is holding new work back. */
  held: Array<{ id: string; text: string; label: string; link?: string; href?: string; }> = [];
  private loadedFor = '';

  readonly cap = GROUP_CAP;

  ngOnChanges (): void {
    if ( this.tenantId && this.tenantId !== this.loadedFor ) void this.load();
    else this.regroup();
  }

  async load (): Promise<void> {
    if ( !this.tenantId ) return;
    this.loadedFor = this.tenantId;
    this.loading = true;
    this.error = '';
    try {
      const [response, health] = await Promise.all( [
        firstValueFrom( this.api.getSignalEngineBootstrap( { tenantId: this.tenantId } ) ),
        firstValueFrom( this.api.getMayaQueueHealth( { tenantId: this.tenantId } ) ).then( ( res ) => res?.data?.queueHealth || null ).catch( () => null ),
      ] );
      const threads: MomentumThread[] = Array.isArray( response?.data?.threads ) ? response.data.threads : [];
      const now = new Date();
      this.held = heldBanners( health );
      const draftsFull = !!health?.draftBlocked;
      this.rows = threads.filter( isLive ).map( ( thread ) => toRow( thread, now, draftsFull ) );
      this.regroup();
    } catch ( error: any ) {
      this.error = String( error?.error?.message || error?.message || "Unable to load the Marketing Assistant's plan." );
    } finally {
      this.loading = false;
    }
  }

  setFilter ( filter: PlanFilter ): void {
    if ( filter === this.filter ) return;
    this.filter = filter;
    this.filterChange.emit( filter );
    this.regroup();
  }

  toggle ( key: PlanWhen ): void {
    this.closed[key] = !this.closed[key];
  }

  visibleRows ( group: PlanGroup ): PlanRow[] {
    return this.showAll[group.key] ? group.rows : group.rows.slice( 0, GROUP_CAP );
  }

  trackRow ( _index: number, row: PlanRow ): string {
    return row.id;
  }

  /** "Write it myself": open this person's next email in the composer to take it over. */
  async changePlan ( row: PlanRow ): Promise<void> {
    if ( !this.tenantId || this.pendingId ) return;
    this.pendingId = row.id;
    this.actionError = '';
    const thread = row.thread;
    const replyDraft = !String( thread.draftSubject || thread.draftBody || '' ).trim()
      && !!String( thread.replyDraftSubject || thread.replyDraftBody || '' ).trim();
    try {
      const returnRoute = this.router.createUrlTree( ['/maya-day'], { queryParams: { tab: 'plan' } } ).toString();
      const response = await firstValueFrom( this.api.createMomentumComposerHandoff( thread.contactId, {
        draftSubject: replyDraft ? thread.replyDraftSubject : ( thread.draftSubject || thread.rejectedDraftSubject || '' ),
        draftBody: replyDraft ? thread.replyDraftBody : ( thread.draftBody || thread.rejectedDraftBody || '' ),
        companyName: thread.companyName,
        returnRoute,
        returnThreadId: thread.contactId,
        draftKind: replyDraft ? 'reply' : 'outbound',
      }, { tenantId: this.tenantId } ) );
      const reviewRoute = String( ( response as any )?.data?.reviewRoute || '' );
      if ( reviewRoute ) {
        // The server sends a full URL; open its path and query in the app.
        const url = new URL( reviewRoute, window.location.origin );
        await this.router.navigateByUrl( `${ url.pathname }${ url.search }` );
      }
    } catch ( error: any ) {
      this.actionError = String( error?.error?.message || error?.message || 'Unable to open this in the composer.' );
    } finally {
      this.pendingId = '';
    }
  }

  private regroup (): void {
    const matches = FILTERS[this.filter] || FILTERS.all;
    this.chips = ( Object.keys( FILTER_LABELS ) as PlanFilter[] ).map( ( id ) => ( {
      id, label: FILTER_LABELS[id], count: this.rows.filter( FILTERS[id] ).length,
    } ) );
    const filtered = this.rows.filter( matches );
    const week = weekRange( new Date() );
    const groups: PlanGroup[] = [
      { key: 'today', title: 'Today', hint: 'people waiting on you come first', rows: [] },
      { key: 'week', title: 'This week', hint: week.label, rows: [] },
      { key: 'later', title: 'Later', hint: 'mostly pauses and final tries', rows: [] },
    ];
    for ( const row of filtered ) groups.find( ( group ) => group.key === row.when )!.rows.push( row );
    for ( const group of groups ) {
      group.rows.sort( ( a, b ) => Number( b.needsYou ) - Number( a.needsYou ) || a.at - b.at || a.name.localeCompare( b.name ) );
    }
    this.groups = groups;
  }
}

const FILTER_LABELS: Record<PlanFilter, string> = { all: 'All', 'needs-you': 'Needs you', hot: 'Hot leads', queued: 'Up next', stalled: 'Stalled' };
const FILTERS: Record<PlanFilter, ( row: PlanRow ) => boolean> = {
  all: () => true,
  'needs-you': ( row ) => row.needsYou,
  hot: ( row ) => row.hot,
  queued: ( row ) => row.queued,
  stalled: ( row ) => row.stalled,
};

const SOCIAL_REVIEW_URL = 'https://social.16ahead.com/today';

/**
 * Ty, 2026-10-31: with 100 drafts waiting, the Marketing Assistant stopped
 * making new ones for days and 469 people sat under "Stalled" with no word
 * why. Each full review queue gets a line and a way to clear it.
 */
export function heldBanners ( health: MayaQueueHealth | null ): Array<{ id: string; text: string; label: string; link?: string; href?: string; }> {
  if ( !health ) return [];
  const counts = health.counts || ( {} as MayaQueueHealth['counts'] );
  const banners: Array<{ id: string; text: string; label: string; link?: string; href?: string; }> = [];
  if ( health.draftBlocked ) {
    banners.push( { id: 'drafts', text: `The Marketing Assistant is paused: ${ counts.openDraftCount } email drafts are waiting for you (the limit is ${ counts.draftLimit }). Approve or dismiss some and it picks up everyone queued.`, label: 'Clear drafts', link: '/drafts' } );
  }
  if ( health.socialPostBlocked ) {
    banners.push( { id: 'social', text: `New social posts are paused: ${ counts.openSocialPostCount } are waiting for review (the limit is ${ counts.socialPostLimit }).`, label: 'Review social posts', href: SOCIAL_REVIEW_URL } );
  }
  return banners;
}

/** Everyone Maya still has a next step for: not sent and done, not archived. */
function isLive ( thread: MomentumThread ): boolean {
  if ( !thread || ( thread as any ).archived === true ) return false;
  if ( thread.userLane === 'sent' ) return false;
  const mode = String( thread.mode || '' );
  return mode !== 'completed' && mode !== 'unsubscribed';
}

function startOfDay ( date: Date ): number {
  return new Date( date.getFullYear(), date.getMonth(), date.getDate() ).getTime();
}

/** Tomorrow through the coming Saturday (next Saturday when today is the weekend). */
function weekRange ( now: Date ): { start: number; end: number; label: string; } {
  const today = startOfDay( now );
  const day = now.getDay();
  const daysToSaturday = day === 6 ? 7 : day === 0 ? 6 : 6 - day;
  const start = today + DAY_MS;
  const end = today + ( daysToSaturday + 1 ) * DAY_MS;
  // The hint names the weekdays in that span: "Mon, Oct 26 to Fri, Oct 30".
  let first = start;
  while ( [0, 6].includes( new Date( first ).getDay() ) && first < end ) first += DAY_MS;
  const friday = end - 2 * DAY_MS;
  const format = ( ms: number ) => new Date( ms ).toLocaleDateString( undefined, { weekday: 'short', month: 'short', day: 'numeric' } );
  return { start, end, label: first < friday ? `${ format( first ) } to ${ format( friday ) }` : format( first ) };
}

function parse ( iso: string | undefined | null ): number {
  const ms = iso ? Date.parse( iso ) : NaN;
  return Number.isFinite( ms ) ? ms : 0;
}

function dayLabel ( ms: number, now: Date ): string {
  const today = startOfDay( now );
  const day = startOfDay( new Date( ms ) );
  const time = new Date( ms ).toLocaleTimeString( undefined, { hour: 'numeric', minute: '2-digit' } );
  if ( day === today ) return `Today, ${ time }`;
  if ( day === today + DAY_MS ) return `Tomorrow, ${ time }`;
  return new Date( ms ).toLocaleDateString( undefined, { weekday: 'short', month: 'short', day: 'numeric' } );
}

function shortDate ( ms: number, now: Date ): string {
  const today = startOfDay( now );
  const day = startOfDay( new Date( ms ) );
  if ( day === today ) return 'today';
  if ( day === today - DAY_MS ) return 'yesterday';
  return new Date( ms ).toLocaleDateString( undefined, { month: 'short', day: 'numeric' } );
}

function activityLine ( thread: MomentumThread ): string {
  const opens = Number( thread.openCount || 0 );
  const clicks = Number( thread.clickCount || 0 );
  if ( clicks ) return opens ? `opened ${ opens }×, clicked ${ clicks }×` : `clicked ${ clicks }×`;
  if ( opens ) return `opened ${ opens }×`;
  return Number( thread.touchCount || 0 ) ? 'no opens' : 'no emails yet';
}

export function toRow ( thread: MomentumThread, now: Date, draftsFull = false ): PlanRow {
  const needsYou = isNeedsYou( thread );
  const lane = String( thread.userLane || '' );
  const touches = Number( thread.touchCount || 0 );
  const name = String( thread.contactName || thread.emailAddress || 'Unknown contact' ).trim();
  const first = name.split( /\s+/ )[0];
  const sentAt = parse( thread.lastSentAt );
  const replyAt = parse( thread.latestReplyAt );
  const at = lane === 'outbox' ? parse( thread.scheduledAt ) : parse( thread.nextActionAt ) || parse( thread.scheduledAt );
  const queued = !needsYou && lane === 'plan' && thread.bucket === 'waiting';

  // LAST: the most recent thing that happened.
  let last: string;
  if ( needsYou && replyAt ) last = `${ first } replied ${ shortDate( replyAt, now ) }`;
  else if ( lane === 'outbox' ) last = touches ? 'You approved a follow-up' : 'You approved the first email';
  else if ( sentAt ) last = `${ touches <= 1 ? 'First email' : 'Follow-up' } sent ${ shortDate( sentAt, now ) }`;
  else if ( lane === 'drafts' ) last = `The Marketing Assistant drafted a first email ${ thread.lastUpdated ? shortDate( parse( thread.lastUpdated ), now ) : '' }`.trim();
  else last = 'Nothing sent yet';
  const subject = String( ( lane === 'drafts' || lane === 'outbox' ? thread.draftSubject : thread.lastSubject ) || thread.lastSubject || thread.draftSubject || '' ).trim();

  // NEXT: when, and what Maya will do.
  let when: PlanWhen;
  let nextWhen: string;
  let next: string;
  if ( needsYou ) {
    when = 'today';
    nextWhen = 'Waiting on you:';
    next = String( thread.needsYouReason?.nextMove || 'reply, or mark it done.' );
  } else if ( lane === 'drafts' ) {
    when = 'today';
    nextWhen = 'Waiting on you:';
    next = touches ? 'approve the follow-up so it can send.' : 'approve the first email so it can send.';
  } else if ( queued && ( draftsFull || ( at && at < now.getTime() ) || DISCARDED.test( String( thread.nextActionReason || '' ) ) ) ) {
    // Waiting for the next pass: say so, not a date that has gone by.
    when = 'today';
    nextWhen = draftsFull ? 'Paused:' : 'Next pass:';
    next = draftsFull
      ? `the Marketing Assistant writes ${ touches ? 'the follow-up' : 'the first email' } once Drafts has room.`
      : `the Marketing Assistant writes ${ touches ? 'the follow-up' : 'the first email' } on its next morning run.`;
  } else {
    when = !at ? 'later' : at < startOfDay( now ) + DAY_MS ? 'today' : at < weekRange( now ).end ? 'week' : 'later';
    nextWhen = at ? `${ dayLabel( at, now ) }:` : 'Not scheduled:';
    next = lane === 'outbox'
      ? ( touches ? 'the follow-up sends.' : 'the first email sends.' )
      : String( thread.nextActionReason || NEXT_ACTION_WORDS[String( thread.nextActionType || '' )] || 'The Marketing Assistant watches for a response.' );
  }

  const action = lane === 'drafts' ? { label: 'Review draft', link: '/drafts' }
    : lane === 'outbox' ? { label: 'See in Outbox', link: '/outbox' }
    : needsYou ? { label: 'Open thread', link: '/needs-you', queryParams: { contact: thread.contactId } }
    : null;

  const activity = activityLine( thread );
  return {
    id: String( thread.id || thread.contactId ),
    contactId: thread.contactId,
    name,
    company: String( thread.companyName || '' ),
    needsYou,
    hot: thread.isHotLeadActive === true,
    queued,
    stalled: thread.bucket === 'stalled',
    meta: touches ? `Email ${ touches } · ${ activity }` : activity,
    last,
    subject,
    nextWhen,
    next,
    action,
    when,
    at: at || Number.MAX_SAFE_INTEGER,
    thread,
  };
}
