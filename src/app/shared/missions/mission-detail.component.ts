import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';

import { EditPlanComponent } from './edit-plan.component';
import { MissionOutcomeComponent } from './mission-outcome.component';
import { MissionReportComponent } from './mission-report.component';
import { MissionsApiService } from './missions-api.service';
import { ColumnView, MissionView, Person, PRODUCT_LABEL, Who, currentColumn, leftUntil, nameOf, stripColumns } from './missions.model';
import { OwnerTokenComponent } from './owner-token.component';
import { PlanStripComponent, paint } from './plan-strip.component';
import { StepDrawerComponent } from './step-drawer.component';

const ORIGIN: Record<string, string> = { ask: 'Ask TODD', maya: 'Maya', playbook: 'a playbook', suggestion: 'a suggestion', move: 'Moves', signal: 'the Signal Engine', schedule: 'a schedule', backlog: 'your backlog' };
const OUTCOME: Record<string, string> = { action: 'Action', insight: 'Insight', shortlist: 'Shortlist', program: 'Program', assetSet: 'Asset set' };

/**
 * Mission detail (design 2a, 13a), the core screen: who is doing what right
 * now. A banner for the current step, the strip, the timeline with results,
 * who does what, and - once it's finished - the report. Every step opens the
 * drawer. Refreshes while TODD and Maya work. Synced from taliferro-ui/missions.
 */
@Component( {
  selector: 'tm-mission-detail',
  standalone: true,
  imports: [OwnerTokenComponent, PlanStripComponent, StepDrawerComponent, EditPlanComponent, MissionReportComponent, MissionOutcomeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (mission(); as m) {
      @if (editing()) {
        <tm-edit-plan [mission]="m" [viewerId]="viewerId()" [people]="people()" (saved)="onSaved($event)" (cancelled)="editing.set(false)" />
      } @else {
        <div class="detail" data-cy="mission-detail">
          <header>
            <div class="titles">
              <span class="kicker" data-cy="mission-kicker">{{ kicker() }}</span>
              <h1 data-cy="mission-title">{{ m.title || m.request }}</h1>
            </div>
            <div class="head-actions">
              @if (canEdit()) { <button type="button" class="btn" (click)="editing.set(true)" data-cy="edit-plan">Edit plan</button> }
              @if (m.status === 'proposed' && m.isOwner) { <button type="button" class="btn primary" (click)="start()" [disabled]="busy()" data-cy="start">Start</button> }
            </div>
          </header>

          @if (banner(); as b) {
            <div class="banner" [style.background]="b.bg" data-cy="mission-banner" [attr.data-state]="b.state">
              <tm-owner-token [who]="b.who" [size]="40" [people]="people()" />
              <div class="banner-text">
                <b [style.color]="b.fg">{{ b.title }}</b>
                @if (b.detail) { <span>{{ b.detail }}</span> }
              </div>
              @if (b.cta) { <button type="button" class="btn primary" (click)="open(b.column)" data-cy="banner-cta">{{ b.cta }}</button> }
            </div>
          }

          @if (m.status === 'queued' || m.status === 'running') {
            @if (!m.steps.length) {
              <div class="planning" data-cy="planning"><b>Planning…</b><span>{{ m.statusDetail || 'Working out the steps' }}</span>
                <div class="skeleton">@for (i of skeleton; track i) { <span [style.opacity]="1 - i * 0.1"></span> }</div>
              </div>
            }
          }

          @if (m.steps.length) {
            <div class="strip-full"><tm-plan-strip [steps]="m.steps" mode="full" [viewerId]="viewerId()" [people]="people()" (stepClick)="open($event)" /></div>
            <div class="strip-compact"><tm-plan-strip [steps]="m.steps" mode="compact" [viewerId]="viewerId()" [people]="people()" /></div>
          }

          @if (assets().length && approvalColumn(); as approval) {
            <section class="assets" data-cy="asset-set">
              <div class="assets-head">
                <h2>{{ assets().length }} pieces ready</h2>
                <button type="button" class="btn primary" (click)="open(approval)" data-cy="asset-approve">Approve {{ assets().length }}</button>
              </div>
              <div class="tiles">
                @for (a of assets(); track a.stepId) {
                  <div class="tile" data-cy="asset-tile"><span class="preview" [class.violet]="a.kind !== 'doc'">{{ a.channel }}</span><b>{{ a.title }}</b><span class="ready">Ready</span></div>
                }
              </div>
            </section>
          }

          <tm-mission-outcome [mission]="m" [viewerId]="viewerId()" [people]="people()" />

          @if (m.status === 'done' && m.report) {
            <tm-mission-report [mission]="m" [viewerId]="viewerId()" [people]="people()" />
          }

          @if (m.steps.length) {
            <div class="columns">
              <section class="timeline">
                <h2>Timeline</h2>
                <tm-plan-strip [steps]="m.steps" mode="list" [viewerId]="viewerId()" [people]="people()" (stepClick)="open($event)" />
              </section>
              <aside class="side" data-cy="who-does-it">
                <h3>Who does it</h3>
                @for (o of owners(); track o.who) {
                  <div class="who-row"><tm-owner-token [who]="o.who" [size]="28" [label]="true" [people]="people()" /><span>{{ o.count }} step{{ o.count === 1 ? '' : 's' }}</span></div>
                }
                <h3>Your time</h3>
                <p>{{ yourTime() }}</p>
                @if (m.products.length) {
                  <h3>Uses</h3>
                  <div class="chips">@for (p of m.products; track p) { <span class="chip">{{ productLabel(p) }}</span> }</div>
                }
              </aside>
            </div>
          }
        </div>
      }

      @if (drawer(); as column) {
        <tm-step-drawer [mission]="m" [column]="column" [viewerId]="viewerId()" [people]="people()" (closed)="drawer.set(null)" (acted)="refreshSoon()" />
      }
    } @else if (error()) {
      <p class="error" data-cy="mission-error">{{ error() }}</p>
    } @else {
      <p class="loading">Loading…</p>
    }
  `,
  styles: [`
    :host { display: block; font-family: var(--font); color: var(--text); }
    .detail { display: flex; flex-direction: column; gap: 22px; }
    header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .kicker { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
    h1 { margin: 0; font-size: 34px; font-weight: 700; letter-spacing: -0.04em; line-height: 1.1; }
    .head-actions { display: flex; gap: 8px; }
    .btn { height: 44px; padding: 0 22px; border-radius: 999px; border: 0; background: var(--surface); color: var(--text); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap; }
    .btn.primary { background: var(--blue); color: #fff; }
    .btn:disabled { opacity: .5; }
    .banner { display: flex; align-items: center; gap: 14px; border-radius: 22px; padding: 16px 18px; flex-wrap: wrap; }
    .banner-text { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 2px; }
    .banner-text b { font-size: 18px; }
    .banner-text span { font-size: 14px; }
    .planning { display: flex; flex-direction: column; gap: 8px; background: var(--surface); border-radius: 22px; padding: 18px; }
    .planning span { color: var(--muted); font-size: 14px; }
    .skeleton { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; margin-top: 6px; }
    .skeleton span { height: 10px; border-radius: 999px; background: var(--surface2); }
    .strip-compact { display: none; }
    .assets { display: flex; flex-direction: column; gap: 12px; }
    .assets-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .assets h2, .timeline h2 { margin: 0; font-size: 20px; font-weight: 700; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
    .tile { display: flex; flex-direction: column; gap: 6px; background: var(--surface); border-radius: 18px; padding: 10px; font-size: 13px; }
    .preview { height: 96px; border-radius: 14px; background: var(--t-blue); color: var(--t-blue-fg); display: flex; align-items: flex-end; padding: 8px 10px; font-size: 12px; font-weight: 700; box-sizing: border-box; }
    .preview.violet { background: var(--t-violet); color: var(--t-violet-fg); }
    .ready { align-self: flex-start; height: 22px; padding: 0 9px; border-radius: 999px; background: var(--t-green); color: var(--t-green-fg); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; }
    .columns { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
    .timeline { flex: 1 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
    .side { flex: 0 1 320px; min-width: 280px; background: var(--surface); border-radius: 24px; padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
    .side h3 { margin: 8px 0 0; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    .side p { margin: 0; font-size: 15px; }
    .who-row { display: flex; align-items: center; justify-content: space-between; font-size: 14px; color: var(--muted); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { height: 28px; padding: 0 10px; border-radius: 999px; background: var(--bg); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; }
    .error, .loading { color: var(--muted); }
    @media (max-width: 760px) {
      h1 { font-size: 28px; }
      .strip-full { display: none; }
      .strip-compact { display: block; }
      .side { flex: 1 1 100%; }
    }
  `],
} )
export class MissionDetailComponent implements OnDestroy {
  private readonly api = inject( MissionsApiService );

  readonly missionId = input.required<string>();
  readonly viewerId = input( '' );
  readonly people = input<Record<string, Person>>( {} );
  /** A Mission already loaded (fixtures, or a parent that has it). */
  readonly initial = input<MissionView | null>( null );

  readonly mission = signal<MissionView | null>( null );
  readonly error = signal( '' );
  readonly busy = signal( false );
  readonly editing = signal( false );
  readonly drawer = signal<ColumnView | null>( null );
  readonly skeleton = [0, 1, 2, 3, 4, 5, 6, 7];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor () {
    effect( () => {
      const id = this.missionId();
      const initial = this.initial();
      if ( initial ) this.mission.set( initial );
      void this.load( id );
    } );
  }

  ngOnDestroy (): void {
    if ( this.timer ) clearTimeout( this.timer );
  }

  readonly columns = computed( () => stripColumns( this.mission()?.steps || [], this.viewerId(), this.people() ) );

  readonly kicker = computed( () => {
    const m = this.mission()!;
    const started = m.startedAt ? ` · Started ${new Date( m.startedAt ).toLocaleDateString( undefined, { month: 'short', day: 'numeric' } )}` : m.status === 'proposed' ? ' · Not started' : '';
    return `Mission · ${OUTCOME[m.outcomeType] || 'Action'}${started} from ${ORIGIN[m.origin] || 'Ask TODD'}`;
  } );

  readonly canEdit = computed( () => {
    const m = this.mission();
    return Boolean( m && m.isOwner && m.steps.length && ['proposed', 'active'].includes( m.status ) );
  } );

  /** The current-step banner (2a): Maya/TODD working, waiting on you, waiting on the world, failed. */
  readonly banner = computed( () => {
    const m = this.mission();
    if ( !m || m.status === 'done' || m.status === 'proposed' || m.status === 'cancelled' ) return null;
    const column = currentColumn( this.columns() );
    if ( !column ) return null;
    const step = column.step && column.step.status === 'active' ? column.step : m.steps.find( ( s ) => column.stepIds.includes( s.id ) && s.status === 'active' ) || column.step;
    const colors = paint( column.look, column.who );
    const base = { column, who: column.who as Who, bg: colors.bg, fg: colors.lfg, state: column.look, cta: '' };
    const title = step ? step.title.charAt( 0 ).toLowerCase() + step.title.slice( 1 ) : column.title;
    switch ( column.look ) {
      case 'run':
        return { ...base, title: `${nameOf( column.who, this.people() )} is working: ${title}`, detail: '' };
      case 'wait': {
        const left = leftUntil( step ? step.waitUntil : null );
        return { ...base, who: 'todd' as Who, title: `Waiting${left ? `: ${left} left` : ''}`, detail: step ? step.detail || step.title : '' };
      }
      case 'fail':
        return { ...base, title: `A step failed and came to ${column.who === 'you' ? 'you' : nameOf( column.who, this.people() )}: ${title}`, detail: step ? step.why : '', cta: column.who === 'you' ? 'Take a look' : '' };
      default: {
        const mine = column.who === 'you';
        const cta = mine ? ( step && step.kind === 'approval' ? 'Review and approve' : step && step.kind === 'decision' ? 'Choose' : 'Open' ) : '';
        const minutes = step && step.minutes ? `About ${step.minutes} minute${step.minutes === 1 ? '' : 's'}. ` : step && step.kind === 'approval' ? 'About 3 minutes. ' : '';
        const tail = step && step.kind === 'approval' && step.why.toLowerCase().includes( 'send' ) ? 'Nothing sends until you approve.' : step ? step.why : '';
        return { ...base, title: `Waiting on ${mine ? 'you' : nameOf( column.who, this.people() )}: ${title}`, detail: mine ? `${minutes}${tail}`.trim() : '', cta };
      }
    }
  } );

  readonly owners = computed( () => {
    const counts = new Map<Who, number>();
    this.columns().forEach( ( column ) => {
      if ( column.kind === 'branch' ) return;
      counts.set( column.who, ( counts.get( column.who ) || 0 ) + 1 );
    } );
    const order: Who[] = ['todd', 'maya', 'you'];
    return [...counts.entries()].sort( ( a, b ) => ( order.indexOf( a[0] ) + 9 ) % 9 - ( order.indexOf( b[0] ) + 9 ) % 9 ).map( ( [who, count] ) => ( { who, count } ) );
  } );

  readonly yourTime = computed( () => {
    const m = this.mission()!;
    const mine = m.steps.filter( ( s ) => s.owner === 'person' && s.holder.assigneeId === this.viewerId() && !s.when );
    const minutes = mine.reduce( ( sum, s ) => sum + ( s.minutes || ( s.kind === 'approval' ? 3 : s.kind === 'decision' ? 1 : 10 ) ), 0 );
    const approvals = mine.filter( ( s ) => s.kind === 'approval' ).length;
    if ( !minutes ) return 'None. TODD and Maya do every step.';
    return `About ${minutes} minute${minutes === 1 ? '' : 's'}${approvals ? `, for ${approvals} approval${approvals === 1 ? '' : 's'}` : ''}`;
  } );

  /** Asset set (13a): what Maya made that the waiting approval covers. */
  readonly assets = computed( () => {
    const m = this.mission();
    if ( !m || m.outcomeType !== 'assetSet' ) return [];
    return m.steps.filter( ( s ) => s.status === 'done' && s.output && ( s.output['documentId'] || s.output['postId'] ) && ['email.create', 'image.obtain', 'social.draftPost', 'sayit.draftPost', 'todd.write'].includes( s.tool ) )
      .map( ( s ) => ( { stepId: s.id, title: s.resultSummary || s.title, channel: PRODUCT_LABEL[s.product] || s.product, kind: s.tool === 'todd.write' ? 'doc' : 'media' } ) );
  } );

  readonly approvalColumn = computed( () => this.columns().find( ( c ) => c.active && c.step && c.step.kind === 'approval' && c.who === 'you' ) || null );

  productLabel ( product: string ): string {
    return PRODUCT_LABEL[product] || product;
  }

  open ( column: ColumnView ): void {
    this.drawer.set( column );
  }

  onSaved ( mission: MissionView ): void {
    this.mission.set( mission );
    this.editing.set( false );
    this.refreshSoon();
  }

  async start (): Promise<void> {
    this.busy.set( true );
    try {
      this.mission.set( await this.api.start( this.missionId() ) );
      this.refreshSoon();
    } catch ( error: any ) {
      this.error.set( ( error && error.error && error.error.message ) || 'It didn’t start. Try again.' );
    } finally {
      this.busy.set( false );
    }
  }

  refreshSoon ( ms = 1200 ): void {
    if ( this.timer ) clearTimeout( this.timer );
    this.timer = setTimeout( () => void this.load( this.missionId() ), ms );
  }

  private async load ( id: string ): Promise<void> {
    try {
      const mission = await this.api.get( id );
      this.mission.set( mission );
      this.error.set( '' );
      // Keep it live while TODD and Maya are working; slow down when it's waiting on people.
      if ( ['queued', 'running'].includes( mission.status ) || mission.phase === 'working' ) this.refreshSoon( 4000 );
      else if ( mission.status === 'active' ) this.refreshSoon( 30000 );
    } catch ( error: any ) {
      if ( !this.mission() ) this.error.set( error && error.status === 404 ? 'That Mission isn’t in this workspace.' : 'Couldn’t load this Mission.' );
    }
  }
}
