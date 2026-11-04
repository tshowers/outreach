import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';

import { MissionsApiService } from './missions-api.service';
import { MissionView, Person, missionState, stripColumns } from './missions.model';
import { PlanStripComponent } from './plan-strip.component';

type Filter = 'all' | 'mine' | 'others';
const KIND: Record<string, string> = { action: 'Action', insight: 'Insight', shortlist: 'Shortlist', program: 'Program', assetSet: 'Asset set' };

/**
 * Missions as Moves rows (design 5a): each row carries a compact plan strip
 * that says who holds it now, in place of the old "Maya" / "Person" pill.
 * Filters: all, waiting on you, waiting on others. Synced from taliferro-ui/missions.
 */
@Component( {
  selector: 'tm-missions-list',
  standalone: true,
  imports: [PlanStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="list" data-cy="missions-list">
      <header>
        <h1>Missions</h1>
        <div class="seg" role="tablist">
          @for (f of filters(); track f.id) {
            <button type="button" role="tab" [class.on]="filter() === f.id" (click)="filter.set(f.id)" [attr.data-cy]="'filter-' + f.id">{{ f.label }} <span>{{ f.count }}</span></button>
          }
        </div>
      </header>
      @if (!loaded()) {
        <p class="muted">Loading…</p>
      } @else if (!shown().length) {
        <p class="muted" data-cy="missions-empty">{{ filter() === 'mine' ? 'Nothing is waiting on you.' : 'No Missions here yet. Ask the General Assistant for something to get one started.' }}</p>
      } @else {
        <ol>
          @for (row of shown(); track row.m.id) {
            @let m = row.m;
            <li>
              <a class="row" [href]="detailBase() + m.id" data-cy="mission-row" [attr.data-phase]="m.phase" [attr.data-tone]="row.tone">
                <span class="meta"><span class="dot"></span>{{ row.meta }}</span>
                <b>{{ m.title || m.request }}</b>
                <span class="strip"><tm-plan-strip [steps]="m.steps" mode="compact" [viewerId]="viewerId()" [people]="people()" /></span>
              </a>
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: [`
    :host { display: block; font-family: var(--font); color: var(--text); }
    .list { display: flex; flex-direction: column; gap: 16px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    h1 { margin: 0; font-size: 34px; font-weight: 700; letter-spacing: -0.04em; }
    .seg { display: inline-flex; background: var(--surface); border-radius: 999px; padding: 3px; }
    .seg button { height: 34px; padding: 0 14px; border: 0; border-radius: 999px; background: none; color: var(--text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
    .seg button.on { background: var(--text); color: var(--bg); }
    .seg span { opacity: .6; margin-left: 4px; }
    ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 1.4fr); grid-template-areas: "meta strip" "title strip"; gap: 4px 20px; align-items: center; background: var(--surface); border-radius: 20px; padding: 14px 18px; color: inherit; text-decoration: none; }
    .meta { grid-area: meta; font-size: 13px; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; }
    .meta .dot { width: 7px; height: 7px; border-radius: 50%; background: #86aeff; flex: none; }
    .row[data-tone="you"] .meta { color: var(--text); font-weight: 600; }
    .row[data-tone="you"] .dot { background: #f2b84b; }
    .row[data-tone="waiting"] .dot { background: #8a91a0; }
    .row[data-tone="done"] .dot { background: #3ccf8e; }
    .row[data-tone="stopped"] .dot { background: #e5484d; }
    b { grid-area: title; font-size: 17px; font-weight: 700; }
    .strip { grid-area: strip; min-width: 0; }
    .muted { color: var(--muted); }
    @media (max-width: 760px) { .row { grid-template-columns: 1fr; grid-template-areas: "meta" "title" "strip"; } }
  `],
} )
export class MissionsListComponent implements OnInit {
  private readonly api = inject( MissionsApiService );

  readonly viewerId = input( '' );
  readonly people = input<Record<string, Person>>( {} );
  readonly detailBase = input( '/missions/' );
  readonly initialFilter = input<Filter>( 'all' );
  readonly initial = input<MissionView[] | null>( null );

  readonly missions = signal<MissionView[]>( [] );
  readonly loaded = signal( false );
  readonly filter = signal<Filter>( 'all' );

  async ngOnInit (): Promise<void> {
    this.filter.set( this.initialFilter() );
    if ( this.initial() ) {
      this.missions.set( this.initial()! );
      this.loaded.set( true );
      return;
    }
    try {
      this.missions.set( ( await this.api.list( { limit: 100 } ) ).filter( ( m ) => m.status !== 'cancelled' ) );
    } finally {
      this.loaded.set( true );
    }
  }

  /**
   * Each Mission with its state in words (missionState, as the detail page
   * says it): "Needs you", "Waiting on replies · until Nov 10", "Done · 2
   * follow-ups for you". A finished one that left you follow-ups is waiting on you.
   */
  readonly rows = computed( () => this.missions().map( ( m ) => {
    const columns = stripColumns( m.steps, this.viewerId(), this.people() );
    const state = missionState( m, columns, this.viewerId(), this.people() );
    const holder: 'mine' | 'others' | 'none' = state.tone === 'you' && m.status !== 'proposed' ? 'mine' : state.teammate ? 'others' : 'none';
    return { m, holder, tone: state.tone, meta: `${KIND[m.outcomeType] || 'Action'} · ${state.label}` };
  } ) );

  readonly filters = computed( () => {
    const all = this.rows();
    return [
      { id: 'all' as Filter, label: 'All', count: all.length },
      { id: 'mine' as Filter, label: 'Waiting on you', count: all.filter( ( r ) => r.holder === 'mine' ).length },
      { id: 'others' as Filter, label: 'Waiting on others', count: all.filter( ( r ) => r.holder === 'others' ).length },
    ];
  } );

  readonly shown = computed( () => {
    const filter = this.filter();
    return this.rows().filter( ( r ) => filter === 'all' || r.holder === filter );
  } );
}
