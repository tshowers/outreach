import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { InboxIconComponent } from '../inbox/inbox-icon.component';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { AudienceQuery, DripPatch, DripsApiError, DripsApiService } from '../../services/drips-api.service';
import { EMAIL_CREATOR_URL } from './drips.component';
import {
  DRIP_MAX_DAYS, DRIP_RATES, Drip, DripConflict, DripDetail, DripKind, KIND_LABELS, KIND_TINTS, STATUS_LABELS, STATUS_TINTS,
  addDays, archivedSentence, countdown, dayNumber, dayOf, daysBetween, daysLeft, dripWindow, emailLinks, expiryTitle,
  findConflict, heatColor, percent, projectedReach, rateLabel, sendsPerWeekday, shortDate, sourceLabel, statusSentence,
} from '../../models/drips.model';

type Dialog =
  | { type: 'start'; title: string; body: string; note: string; action: string }
  | { type: 'overlap'; conflict: DripConflict }
  | { type: 'archive'; queued: number };

interface AudienceRow { id: string; name: string; source: string; count: string; selected: boolean }
interface ClickRow { label: string; count: number; width: number }
interface Tile { value: string; label: string }

/** One drip (design screens 03-11). */
@Component( {
  selector: 'app-drip-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, InboxIconComponent],
  templateUrl: './drip-detail.component.html',
  styleUrls: ['./drips-shared.css', './drip-detail.component.css'],
} )
export class DripDetailComponent implements OnInit, OnDestroy {
  private readonly api = inject( DripsApiService );
  private readonly auth = inject( OutreachAuthService );
  private readonly route = inject( ActivatedRoute );
  private readonly router = inject( Router );
  private readonly sanitizer = inject( DomSanitizer );
  private subscriptions: Subscription[] = [];
  private clock?: ReturnType<typeof setInterval>;
  private poll?: ReturnType<typeof setInterval>;
  private toastTimer?: ReturnType<typeof setTimeout>;
  @ViewChild( 'mailFrame' ) mailFrame?: ElementRef<HTMLIFrameElement>;

  readonly emailCreatorUrl = EMAIL_CREATOR_URL;
  readonly maxDays = DRIP_MAX_DAYS;
  readonly rateMax = DRIP_RATES.length - 1;
  readonly kinds: { value: DripKind; label: string }[] = ( Object.keys( KIND_LABELS ) as DripKind[] ).map( ( value ) => ( { value, label: KIND_LABELS[value] } ) );

  userId = '';
  dripId = '';
  loading = true;
  errorMessage = '';
  busy = false;
  inlineError = '';
  toast = '';
  dialog: Dialog | null = null;

  detail: DripDetail | null = null;
  drip: Drip | null = null;
  today = '';

  // What the template shows, worked out in refresh().
  kindLabel = '';
  kindTint = '';
  statusLabel = '';
  statusTint = '';
  live = false;
  archived = false;
  started = false;
  editableSetup = false;
  isOn = false;
  switchState: 'on' | 'scheduled' | 'off' = 'off';
  sentence = '';
  rateIndex = 2;
  rateText = '';
  perWeekdayText = '';
  audienceRows: AudienceRow[] = [];
  lockedAudience = '';
  scheduleDays = '';
  startFixedText = '';
  startValue = '';
  startMin = '';
  startMax = '';
  endValue = '';
  endMin = '';
  endMax = '';
  scheduleNote = '';
  conflictNote = '';
  expiryTint: 'yellow' | 'pink' | 'plain' = 'plain';
  expiryTitleText = '';
  expiryProgress = 0;
  expirySentence = '';
  reach = '';
  soFarEnd = '';
  tiles: Tile[] = [];
  clickRows: ClickRow[] = [];
  clickSub = '';
  hasClicks = false;
  previewMode: 'email' | 'clicks' = 'clicks';
  fromLine = '';
  archivedOn = '';
  archivedText = '';
  frameDoc: SafeHtml | null = null;
  frameHeight = 600;

  // "New audience"
  audienceOpen = false;
  audienceForm: AudienceQuery = { source: 'contacts', mode: 'search', query: '' };
  audienceName = '';
  categories: { name: string; count: number }[] = [];
  audiencePreview: { count: number; sample: string[] } | null = null;
  audienceError = '';
  audienceBusy = false;

  ngOnInit (): void {
    this.subscriptions.push( this.route.paramMap.subscribe( ( params ) => {
      this.dripId = params.get( 'id' ) || '';
      if ( this.userId ) void this.load();
    } ) );
    // The server takes the workspace from the login token, so the signed-in user is all this waits for.
    this.subscriptions.push( this.auth.getUserId().subscribe( ( userId ) => {
      if ( !userId || userId === this.userId ) return;
      this.userId = userId;
      void this.load();
    } ) );
    this.clock = setInterval( () => this.tickClock(), 1000 );
    // Every 10s: a starting drip refreshes each time, a running one every third time.
    let polls = 0;
    this.poll = setInterval( () => {
      polls++;
      const status = this.drip?.status;
      const due = status === 'starting' || ( status === 'running' && polls % 3 === 0 );
      if ( due && !this.busy && !this.dialog ) void this.load( { quiet: true } );
    }, 10000 );
  }

  ngOnDestroy (): void {
    this.subscriptions.forEach( ( subscription ) => subscription.unsubscribe() );
    clearInterval( this.clock );
    clearInterval( this.poll );
    clearTimeout( this.toastTimer );
  }

  async load ( { quiet = false } = {} ): Promise<void> {
    if ( !this.dripId ) return;
    if ( !quiet ) this.loading = true;
    try {
      const detail = await this.api.get( this.dripId );
      const htmlChanged = detail.drip.html !== this.drip?.html;
      this.detail = detail;
      this.drip = detail.drip;
      this.today = detail.today;
      this.errorMessage = '';
      this.refresh();
      if ( htmlChanged ) this.renderFrame();
      else this.decorateFrame();
    } catch ( error: any ) {
      if ( !quiet ) this.errorMessage = error?.message || 'Couldn\'t load this drip.';
    } finally {
      this.loading = false;
    }
  }

  // ---- the switch -----------------------------------------------------------

  onToggle (): void {
    const drip = this.drip;
    if ( !drip || this.busy || this.archived || drip.status === 'starting' ) return;
    if ( drip.status === 'running' ) {
      void this.run( () => this.api.toggle( drip.id, false ), ( next ) => `Paused. It still archives on ${ shortDate( next.endDate ) }.` );
    } else if ( drip.status === 'paused' ) {
      void this.run( () => this.api.toggle( drip.id, true ), () => 'Sending again.' );
    } else if ( drip.status === 'scheduled' ) {
      void this.run( () => this.api.toggle( drip.id, false ), () => 'Schedule cancelled. It\'s back in Ready.' );
    } else if ( !drip.audience ) {
      this.inlineError = 'Choose who gets it first.';
    } else {
      const window = dripWindow( drip, this.today );
      const conflict = findConflict( drip.id, window, this.detail?.others || [] );
      if ( conflict ) {
        this.dialog = { type: 'overlap', conflict };
        return;
      }
      const future = window.start > this.today;
      const people = `${ drip.audience.name } (${ drip.audience.count.toLocaleString( 'en-US' ) } people)`;
      this.dialog = {
        type: 'start',
        title: future ? 'Schedule this drip?' : 'Start this drip?',
        body: `${ future ? `Starting ${ shortDate( window.start ) }, it` : 'It' } sends ${ rateLabel( drip.rateMinutes ) } to ${ people }, weekdays 9 am–5 pm in each person's time zone.`,
        note: `It archives on ${ shortDate( window.end ) }, whether it's on or off. Archived drips can't be restarted, but you can duplicate them.`,
        action: future ? 'Schedule drip' : 'Start drip',
      };
    }
  }

  async confirmStart (): Promise<void> {
    const drip = this.drip;
    if ( !drip ) return;
    this.dialog = null;
    await this.run( () => this.api.toggle( drip.id, true ), ( next ) => next.status === 'scheduled' ?
      `Scheduled. It starts ${ shortDate( next.startDate ) } and archives ${ shortDate( next.endDate ) }.` :
      `Drip started. The first email goes out within a few minutes; it archives on ${ shortDate( next.endDate ) }.` );
  }

  /** Frees a slot from the overlap dialog, then checks again. */
  async freeSlot ( other: { id: string; status: string } ): Promise<void> {
    this.busy = true;
    try {
      if ( other.status === 'scheduled' ) await this.api.toggle( other.id, false );
      else await this.api.archive( other.id );
      await this.load( { quiet: true } );
      const conflict = this.drip ? findConflict( this.drip.id, dripWindow( this.drip, this.today ), this.detail?.others || [] ) : null;
      this.dialog = conflict ? { type: 'overlap', conflict } : null;
      this.showToast( other.status === 'scheduled' ? 'Unscheduled. That slot is free.' : 'Archived. That slot is free.' );
    } catch ( error: any ) {
      this.showToast( error?.message || 'Couldn\'t free that slot.' );
    } finally {
      this.busy = false;
    }
  }

  askArchive (): void {
    this.dialog = { type: 'archive', queued: this.drip?.counters.queued || 0 };
  }

  async confirmArchive (): Promise<void> {
    const drip = this.drip;
    if ( !drip ) return;
    this.dialog = null;
    await this.run( () => this.api.archive( drip.id ), () => 'Archived. That slot is free.' );
  }

  async duplicate (): Promise<void> {
    if ( !this.drip ) return;
    this.busy = true;
    try {
      const copy = await this.api.duplicate( this.drip.id );
      await this.router.navigate( ['/drips', copy.id] );
      this.showToast( 'Duplicated. It\'s in Ready.' );
    } catch ( error: any ) {
      this.showToast( error?.message || 'Couldn\'t duplicate it.' );
    } finally {
      this.busy = false;
    }
  }

  closeDialog (): void {
    this.dialog = null;
  }

  // ---- settings -------------------------------------------------------------

  onRateInput ( index: number ): void {
    const rate = DRIP_RATES[Number( index )] || DRIP_RATES[2];
    this.rateText = rateLabel( rate );
    this.perWeekdayText = `about ${ sendsPerWeekday( rate ) } a weekday`;
  }

  onRateChange ( index: number ): void {
    void this.patch( { rateMinutes: DRIP_RATES[Number( index )] } );
  }

  setKind ( kind: DripKind ): void {
    if ( kind !== this.drip?.kind ) void this.patch( { kind } );
  }

  chooseAudience ( id: string ): void {
    if ( id !== this.drip?.audience?.id ) void this.patch( { audienceId: id } );
  }

  setStartMode ( mode: 'now' | 'date' ): void {
    if ( !this.drip || mode === this.drip.startMode ) return;
    void this.patch( mode === 'date' ? { startMode: 'date', startDate: addDays( this.today, 1 ) } : { startMode: 'now' } );
  }

  setStart ( date: string ): void {
    if ( date && date !== this.drip?.startDate ) void this.patch( { startDate: date } );
  }

  setEnd ( date: string ): void {
    if ( date && date !== this.drip?.endDate ) void this.patch( { endDate: date } );
  }

  setPreviewMode ( mode: 'email' | 'clicks' ): void {
    this.previewMode = mode;
    this.decorateFrame();
  }

  // ---- new audience -----------------------------------------------------------

  async openAudience (): Promise<void> {
    this.audienceOpen = !this.audienceOpen;
    this.audienceError = '';
    this.audiencePreview = null;
    if ( this.audienceOpen && !this.categories.length ) {
      const categories = await this.api.categories().catch( () => [] );
      this.categories = categories.sort( ( a, b ) => a.name.localeCompare( b.name, undefined, { sensitivity: 'base' } ) );
    }
  }

  audienceUses ( from: 'contacts' | 'leadVault' ): boolean {
    return this.audienceForm.source === from || this.audienceForm.source === 'both';
  }

  /** Contacts and Lead Vault switch on and off independently; one stays on. */
  toggleAudienceSource ( from: 'contacts' | 'leadVault' ): void {
    const contacts = from === 'contacts' ? !this.audienceUses( 'contacts' ) : this.audienceUses( 'contacts' );
    const leadVault = from === 'leadVault' ? !this.audienceUses( 'leadVault' ) : this.audienceUses( 'leadVault' );
    if ( !contacts && !leadVault ) return;
    const source: AudienceQuery['source'] = contacts && leadVault ? 'both' : contacts ? 'contacts' : 'leadVault';
    // A description carries over; a category only means something to Contacts.
    const query = this.audienceForm.mode === 'search' ? this.audienceForm.query : '';
    this.audienceForm = { source, mode: 'search', query };
    this.audiencePreview = null;
    this.audienceError = '';
  }

  setAudienceMode ( mode: AudienceQuery['mode'] ): void {
    this.audienceForm = { ...this.audienceForm, mode, query: mode === 'category' ? this.categories[0]?.name || '' : '' };
    this.audiencePreview = null;
  }

  onAudienceQuery (): void {
    this.audiencePreview = null;
  }

  async findAudience (): Promise<void> {
    if ( !this.audienceForm.query.trim() ) return;
    this.audienceBusy = true;
    this.audienceError = '';
    try {
      this.audiencePreview = await this.api.previewAudience( this.audienceForm );
      if ( !this.audienceName ) this.audienceName = this.audienceForm.query.trim().slice( 0, 60 );
    } catch ( error: any ) {
      this.audienceError = error?.message || 'Couldn\'t find anyone.';
    } finally {
      this.audienceBusy = false;
    }
  }

  async saveAudience (): Promise<void> {
    const drip = this.drip;
    if ( !drip ) return;
    this.audienceBusy = true;
    this.audienceError = '';
    try {
      const audience = await this.api.createAudience( { ...this.audienceForm, name: this.audienceName } );
      await this.api.update( drip.id, { audienceId: audience.id } );
      this.audienceOpen = false;
      this.audienceName = '';
      this.audiencePreview = null;
      this.audienceForm = { source: 'contacts', mode: 'search', query: '' };
      await this.load( { quiet: true } );
      this.showToast( `${ audience.name } saved, ${ audience.count.toLocaleString( 'en-US' ) } people.` );
    } catch ( error: any ) {
      this.audienceError = error?.message || 'Couldn\'t save that audience.';
    } finally {
      this.audienceBusy = false;
    }
  }

  // ---- the preview frame -------------------------------------------------------

  onFrameLoad (): void {
    this.decorateFrame();
  }

  private renderFrame (): void {
    const html = this.drip?.html || '';
    const page = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
      html,body{margin:0;padding:0;background:#fff;}
      body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#0f1115;overflow:hidden;}
      img{max-width:100%;height:auto;}
    </style></head><body>${ html.replace( /href\s*=\s*(["'])taliferro-tech-unsubscribe\1/gi, 'href="#"' ) }</body></html>`;
    // The workspace's own email from Email Creator, in a frame sandboxed without scripts.
    this.frameDoc = this.sanitizer.bypassSecurityTrustHtml( page );
  }

  /** Rings each tracked link by its share of clicks (Clicks mode), or clears the rings. */
  private decorateFrame (): void {
    const doc = this.mailFrame?.nativeElement.contentDocument;
    if ( !doc || !doc.body ) return;
    doc.querySelectorAll( '[data-drip-heat]' ).forEach( ( node ) => node.remove() );
    doc.querySelectorAll<HTMLElement>( '[data-drip-ring]' ).forEach( ( node ) => {
      node.style.boxShadow = '';
      node.style.backgroundColor = node.dataset['dripBg'] || '';
      node.style.borderRadius = node.dataset['dripRadius'] || '';
      node.removeAttribute( 'data-drip-ring' );
    } );
    const links = this.drip?.stats?.links || [];
    const total = links.reduce( ( sum, link ) => sum + link.count, 0 );
    if ( this.previewMode === 'clicks' && total ) {
      const counts = new Map( links.map( ( link ) => [link.url, link.count] ) );
      doc.body.style.position = 'relative';
      doc.querySelectorAll<HTMLAnchorElement>( 'a[href]' ).forEach( ( anchor ) => {
        const count = counts.get( anchor.getAttribute( 'href' ) || '' );
        if ( !count ) return;
        const share = count / total;
        const { ring, text } = heatColor( share );
        const view = doc.defaultView;
        const isText = !anchor.querySelector( 'img' ) && ( !view || view.getComputedStyle( anchor ).backgroundColor.replace( /\s/g, '' ) === 'rgba(0,0,0,0)' );
        anchor.dataset['dripBg'] = anchor.style.backgroundColor;
        anchor.dataset['dripRadius'] = anchor.style.borderRadius;
        anchor.setAttribute( 'data-drip-ring', '' );
        anchor.style.boxShadow = `0 0 0 3px ${ ring }, 0 0 ${ Math.round( 10 + share * 50 ) }px ${ ring }`;
        if ( isText ) {
          anchor.style.backgroundColor = `${ ring }1f`;
          anchor.style.borderRadius = anchor.style.borderRadius || '6px';
        }
        const rect = anchor.getBoundingClientRect();
        const bodyRect = doc.body.getBoundingClientRect();
        const badge = doc.createElement( 'span' );
        badge.setAttribute( 'data-drip-heat', '' );
        badge.textContent = `${ Math.round( share * 100 ) }% · ${ count }`;
        badge.style.cssText = `position:absolute;top:${ rect.top - bodyRect.top - 10 }px;left:${ rect.right - bodyRect.left - 12 }px;transform:translateX(-50%);padding:2px 7px;border-radius:999px;background:${ ring };color:${ text };font:700 11px/1.4 "Helvetica Neue",Helvetica,Arial,sans-serif;white-space:nowrap;pointer-events:none;z-index:2;`;
        doc.body.appendChild( badge );
      } );
    }
    this.frameHeight = Math.max( 200, doc.documentElement.scrollHeight );
  }

  // ---- internals ---------------------------------------------------------------

  private async patch ( patch: DripPatch ): Promise<void> {
    if ( !this.drip ) return;
    this.busy = true;
    this.inlineError = '';
    try {
      this.drip = { ...this.drip, ...( await this.api.update( this.drip.id, patch ) ) };
      if ( this.detail ) this.detail = { ...this.detail, drip: this.drip };
      this.refresh();
    } catch ( error: any ) {
      this.inlineError = error?.message || 'Couldn\'t save that change.';
      this.refresh();
    } finally {
      this.busy = false;
    }
  }

  private async run ( action: () => Promise<Drip>, success: ( drip: Drip ) => string ): Promise<void> {
    this.busy = true;
    this.inlineError = '';
    try {
      const next = await action();
      await this.load( { quiet: true } );
      this.showToast( success( next ) );
    } catch ( error ) {
      if ( error instanceof DripsApiError && error.code === 'DRIP_SLOTS_FULL' && error.conflict ) {
        this.dialog = { type: 'overlap', conflict: error.conflict };
      } else {
        this.inlineError = ( error as Error )?.message || 'Something went wrong. Please try again.';
      }
    } finally {
      this.busy = false;
    }
  }

  private refresh (): void {
    const drip = this.drip;
    if ( !drip ) return;
    const today = this.today;
    const window = dripWindow( drip, today );
    const status = drip.status;
    this.kindLabel = KIND_LABELS[drip.kind];
    this.kindTint = KIND_TINTS[drip.kind];
    this.statusLabel = STATUS_LABELS[status];
    this.statusTint = STATUS_TINTS[status];
    this.live = status === 'running' || status === 'starting';
    this.archived = status === 'archived';
    this.started = status === 'running' || status === 'paused' || status === 'starting';
    this.editableSetup = status === 'ready' || status === 'scheduled';
    this.isOn = status === 'running' || status === 'scheduled' || status === 'starting';
    this.switchState = status === 'running' || status === 'starting' ? 'on' : status === 'scheduled' ? 'scheduled' : 'off';
    this.sentence = statusSentence( drip, today );
    this.fromLine = drip.fromName || drip.fromEmail ? `From ${ [drip.fromName, drip.fromEmail].filter( Boolean ).join( ' · ' ) }` : 'From your Outreach sender';

    this.rateIndex = Math.max( 0, DRIP_RATES.indexOf( drip.rateMinutes ) );
    this.onRateInput( this.rateIndex );

    this.audienceRows = ( this.detail?.audiences || [] ).map( ( audience ) => ( {
      id: audience.id, name: audience.name, source: sourceLabel( audience.source ),
      count: audience.count.toLocaleString( 'en-US' ), selected: audience.id === drip.audience?.id,
    } ) );
    if ( drip.audience && !this.audienceRows.some( ( row ) => row.selected ) && this.editableSetup ) {
      this.audienceRows.unshift( { id: drip.audience.id, name: drip.audience.name, source: sourceLabel( drip.audience.source ), count: drip.audience.count.toLocaleString( 'en-US' ), selected: true } );
    }
    this.lockedAudience = drip.audience ? `${ sourceLabel( drip.audience.source ) } · ${ drip.audience.name } · ${ ( drip.counters.total || drip.audience.count ).toLocaleString( 'en-US' ) }` : '';

    const length = daysBetween( window.start, window.end );
    this.scheduleDays = `${ length } of ${ DRIP_MAX_DAYS } days max`;
    this.startFixedText = status === 'ready' && drip.startMode !== 'date' ? 'Today, when you turn it on' : shortDate( window.start );
    this.startValue = window.start;
    this.startMin = addDays( today, 1 );
    this.startMax = addDays( today, this.detail?.maxLeadDays || 120 );
    this.endValue = window.end;
    this.endMin = this.started ? addDays( today, 1 ) : addDays( window.start, 1 );
    this.endMax = addDays( window.start, DRIP_MAX_DAYS );
    this.scheduleNote = status === 'running' || status === 'paused' ? 'You can end it sooner, or extend it up to 30 days from its start.' : 'It archives on the end day, whether it\'s on or off.';
    const conflict = this.editableSetup ? findConflict( drip.id, window, this.detail?.others || [] ) : null;
    this.conflictNote = conflict ? `Two drips already run on ${ shortDate( conflict.date ) }. Move these dates or free a slot.` : '';

    const left = daysLeft( drip, today );
    this.expiryTint = this.started ? ( left <= 5 ? 'pink' : 'yellow' ) : 'plain';
    this.expiryTitleText = expiryTitle( drip, today );
    this.expiryProgress = this.started ? Math.min( 100, ( dayNumber( drip, today ) / Math.max( 1, length ) ) * 100 ) : 0;
    this.expirySentence = this.started ? `Started ${ shortDate( drip.startDate ) }. On or off, it archives on ${ shortDate( window.end ) } and can't be restarted.` : '';
    this.reach = projectedReach( drip, today );

    const sent = drip.counters.sent;
    const stats = drip.stats;
    const total = drip.counters.total || drip.audience?.count || 0;
    this.tiles = [
      { value: sent.toLocaleString( 'en-US' ), label: `sent of ${ total.toLocaleString( 'en-US' ) }` },
      { value: ( this.started ? drip.counters.queued : this.archived ? 0 : total ).toLocaleString( 'en-US' ), label: 'still in the queue' },
      { value: percent( stats?.opens || 0, sent ), label: `opened · ${ ( stats?.opens || 0 ).toLocaleString( 'en-US' ) }` },
      { value: percent( stats?.clickers || 0, sent ), label: `clicked · ${ ( stats?.clickers || 0 ).toLocaleString( 'en-US' ) }` },
      { value: drip.counters.unsubscribed.toLocaleString( 'en-US' ), label: 'unsubscribed' },
      { value: drip.counters.bounced.toLocaleString( 'en-US' ), label: 'bounced' },
    ];

    const labels = new Map( emailLinks( drip.html || '' ).map( ( link ) => [link.url, link.label] ) );
    const links = stats?.links || [];
    const top = links[0]?.count || 1;
    this.clickRows = links.map( ( link ) => ( { label: labels.get( link.url ) || link.url, count: link.count, width: Math.max( 4, ( link.count / top ) * 100 ) } ) );
    this.hasClicks = !!stats?.clicks;
    this.clickSub = stats?.clicks ? `${ stats.clicks.toLocaleString( 'en-US' ) } clicks from ${ sent.toLocaleString( 'en-US' ) } sent` : 'No clicks yet';
    if ( !this.hasClicks && this.previewMode === 'clicks' && !this.started && !this.archived ) this.previewMode = 'email';

    this.archivedOn = `Archived ${ shortDate( dayOf( drip.archivedAt, drip.timezone ) ) }`;
    this.archivedText = archivedSentence( drip );
    this.tickClock();
  }

  private tickClock (): void {
    const drip = this.drip;
    if ( !drip ) return;
    if ( drip.status === 'running' ) {
      const ms = ( drip.nextSendAt || 0 ) - Date.now();
      this.soFarEnd = drip.counters.queued ? ( ms > 0 ? `Next send in ${ countdown( ms ) }` : 'Next send soon' ) : 'Finished';
    } else if ( drip.status === 'paused' ) this.soFarEnd = 'Paused';
    else if ( drip.status === 'starting' ) this.soFarEnd = 'Starting';
    else if ( drip.status === 'scheduled' ) this.soFarEnd = `Starts ${ shortDate( drip.startDate ) }`;
    else if ( drip.status === 'archived' ) this.soFarEnd = 'Finished';
    else this.soFarEnd = 'Not started';
  }

  private showToast ( text: string ): void {
    this.toast = text;
    clearTimeout( this.toastTimer );
    this.toastTimer = setTimeout( () => ( this.toast = '' ), 3200 );
  }
}
