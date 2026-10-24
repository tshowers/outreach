import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { InboxIconComponent } from '../inbox/inbox-icon.component';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { DripsApiService } from '../../services/drips-api.service';
import {
  DRIP_MAX_DAYS, DRIP_MAX_SLOTS, Drip, KIND_LABELS, KIND_TINTS, STATUS_LABELS, STATUS_TINTS,
  audienceLine, countdown, dayNumber, dayOf, percent, shortDate,
} from '../../models/drips.model';

export const EMAIL_CREATOR_URL = 'https://emails.taliferro.tech';

interface SlotCard {
  id: string;
  title: string;
  kindLabel: string;
  kindTint: string;
  statusLabel: string;
  statusTint: string;
  live: boolean;
  meta: string;
  nextSendAt: number | null;
  next: string;
  progress: number;
  late: boolean;
  day: number;
  archives: string;
  sent: string;
  ofTotal: string;
  opened: string;
  clicked: string;
}

interface ListRow {
  id: string;
  title: string;
  kindLabel: string;
  kindTint: string;
  meta: string;
}

/** Drips list (design screens 01-02): two slots, then scheduled, ready and archived. */
@Component( {
  selector: 'app-drips',
  standalone: true,
  imports: [CommonModule, RouterLink, InboxIconComponent],
  templateUrl: './drips.component.html',
  styleUrls: ['./drips-shared.css', './drips.component.css'],
} )
export class DripsComponent implements OnInit, OnDestroy {
  private readonly api = inject( DripsApiService );
  private readonly auth = inject( OutreachAuthService );
  private readonly router = inject( Router );
  private tenantSubscription?: Subscription;
  private timer?: ReturnType<typeof setInterval>;
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly emailCreatorUrl = EMAIL_CREATOR_URL;
  readonly maxDays = DRIP_MAX_DAYS;
  userId = '';
  loading = true;
  errorMessage = '';
  slotLabel = '';
  slots: SlotCard[] = [];
  openSlots: number[] = [];
  scheduled: ListRow[] = [];
  ready: ListRow[] = [];
  archived: ListRow[] = [];
  duplicating = '';
  toast = '';

  ngOnInit (): void {
    // The server takes the workspace from the login token, so the signed-in user is all this waits for.
    this.tenantSubscription = this.auth.getUserId().subscribe( ( userId ) => {
      if ( !userId || userId === this.userId ) return;
      this.userId = userId;
      void this.load();
    } );
    this.timer = setInterval( () => this.tickCountdowns(), 1000 );
  }

  ngOnDestroy (): void {
    this.tenantSubscription?.unsubscribe();
    clearInterval( this.timer );
    clearTimeout( this.toastTimer );
  }

  async load (): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      const { drips } = await this.api.list();
      this.build( drips );
    } catch ( error: any ) {
      this.errorMessage = error?.message || 'Couldn\'t load your drips.';
    } finally {
      this.loading = false;
    }
  }

  async duplicate ( row: ListRow ): Promise<void> {
    this.duplicating = row.id;
    try {
      const copy = await this.api.duplicate( row.id );
      await this.router.navigate( ['/drips', copy.id] );
    } catch ( error: any ) {
      this.showToast( error?.message || 'Couldn\'t duplicate it.' );
    } finally {
      this.duplicating = '';
    }
  }

  private build ( drips: Drip[] ): void {
    const today = ( drip: Drip ) => dayOf( new Date().toISOString(), drip.timezone );
    const inSlots = drips.filter( ( drip ) => ['starting', 'running', 'paused'].includes( drip.status ) )
        .sort( ( a, b ) => String( a.startDate ).localeCompare( String( b.startDate ) ) );
    this.slots = inSlots.map( ( drip ) => {
      const day = dayNumber( drip, today( drip ) );
      const stats = drip.stats;
      return {
        id: drip.id, title: drip.title,
        kindLabel: KIND_LABELS[drip.kind], kindTint: KIND_TINTS[drip.kind],
        statusLabel: STATUS_LABELS[drip.status], statusTint: STATUS_TINTS[drip.status], live: drip.status === 'running' || drip.status === 'starting',
        meta: audienceLine( drip ), nextSendAt: drip.status === 'running' ? drip.nextSendAt : null, next: drip.status === 'paused' ? 'Paused' : drip.status === 'starting' ? 'Starting' : '',
        progress: Math.min( 100, ( day / DRIP_MAX_DAYS ) * 100 ), late: day >= 25, day, archives: `Archives ${ shortDate( drip.endDate ) }`,
        sent: drip.counters.sent.toLocaleString( 'en-US' ), ofTotal: `of ${ drip.counters.total.toLocaleString( 'en-US' ) } sent`,
        opened: percent( stats?.opens || 0, drip.counters.sent ), clicked: percent( stats?.clickers || 0, drip.counters.sent ),
      };
    } );
    this.openSlots = Array.from( { length: Math.max( 0, DRIP_MAX_SLOTS - this.slots.length ) }, ( _, i ) => i );
    this.slotLabel = `${ this.slots.length } of ${ DRIP_MAX_SLOTS } in use · a paused drip keeps its slot until it archives`;
    const row = ( drip: Drip, meta: string ): ListRow => ( { id: drip.id, title: drip.title, kindLabel: KIND_LABELS[drip.kind], kindTint: KIND_TINTS[drip.kind], meta } );
    this.scheduled = drips.filter( ( drip ) => drip.status === 'scheduled' )
        .sort( ( a, b ) => String( a.startDate ).localeCompare( String( b.startDate ) ) )
        .map( ( drip ) => row( drip, [`Starts ${ shortDate( drip.startDate ) }`, `archives ${ shortDate( drip.endDate ) }`, drip.audience?.name].filter( Boolean ).join( ' · ' ) ) );
    this.ready = drips.filter( ( drip ) => drip.status === 'ready' ).map( ( drip ) => row( drip, audienceLine( drip ) ) );
    this.archived = drips.filter( ( drip ) => drip.status === 'archived' )
        .sort( ( a, b ) => String( b.archivedAt ).localeCompare( String( a.archivedAt ) ) )
        .map( ( drip ) => row( drip, [
          `Archived ${ shortDate( dayOf( drip.archivedAt, drip.timezone ) ) }`,
          `${ drip.counters.sent.toLocaleString( 'en-US' ) } sent`,
          `${ percent( drip.stats?.clickers || 0, drip.counters.sent ) } clicked`,
        ].join( ' · ' ) ) );
    this.tickCountdowns();
  }

  private tickCountdowns (): void {
    const now = Date.now();
    this.slots.forEach( ( slot ) => {
      if ( slot.nextSendAt === null ) return;
      slot.next = slot.nextSendAt > now ? `Next send in ${ countdown( slot.nextSendAt - now ) }` : 'Next send soon';
    } );
  }

  private showToast ( text: string ): void {
    this.toast = text;
    clearTimeout( this.toastTimer );
    this.toastTimer = setTimeout( () => ( this.toast = '' ), 3200 );
  }
}
