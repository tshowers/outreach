import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { MissionsApiService } from './missions-api.service';
import { MissionView, Person, Proposal, ShortlistItem, StepView } from './missions.model';

type Pick = 'keep' | 'later' | 'drop' | '';

/**
 * What an Insight or Shortlist Mission found (design 7a, 11a). Insight:
 * the findings, then the proposed next Missions, each one Start away.
 * Shortlist: keep, later or drop each candidate; "Start N Missions" turns
 * every kept one into its own small Mission under one approval.
 * Synced from taliferro-ui/missions.
 */
@Component( {
  selector: 'tm-mission-outcome',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shortlistStep(); as decide) {
      <section class="shortlist" data-cy="shortlist">
        <span class="kicker">{{ kickerFor('shortlist') }}</span>
        <h2>{{ mission().title }}</h2>
        @if (shortlistSummary()) { <p class="lead">{{ shortlistSummary() }}</p> }
        <div class="counter" data-cy="shortlist-counter">{{ count('keep') }} kept · {{ count('later') }} for later · {{ count('drop') }} dropped</div>
        <div class="split">
          <ol class="items">
            @for (item of items(); track item.id) {
              <li [class.kept]="picks()[item.id] === 'keep'" [class.dropped]="picks()[item.id] === 'drop'" data-cy="shortlist-item">
                <div class="item-text"><b>{{ item.name }}</b><span>{{ item.why }}</span>@if (item.route) { <span class="route">Reach: {{ item.route }}</span> }</div>
                <span class="fit" [class.strong]="item.fit === 'strong'">{{ item.fit === 'strong' ? 'Strong' : item.fit === 'medium' ? 'Medium' : 'Weak' }}</span>
                <span class="seg3" role="group" [attr.aria-label]="'Decide on ' + item.name">
                  @for (p of choices; track p.id) {
                    <button type="button" [class.on]="picks()[item.id] === p.id" (click)="pick(item.id, p.id)" [attr.data-cy]="'pick-' + p.id">{{ p.label }}</button>
                  }
                </span>
              </li>
            }
          </ol>
          <aside class="side">
            <h3>What happens to the ones you keep</h3>
            <p>Each becomes its own small Mission: TODD finds a way in, Maya writes to them, and nothing sends until you approve it.</p>
            @if (batchDone()) {
              <span class="started" data-cy="batch-started">✓ {{ batchDone() }} Mission{{ batchDone() === 1 ? '' : 's' }} started · in Moves</span>
            } @else {
              <button type="button" class="btn primary" [disabled]="!count('keep') || busy()" (click)="startKept(decide)" data-cy="start-kept">Start {{ count('keep') }} Mission{{ count('keep') === 1 ? '' : 's' }}</button>
            }
          </aside>
        </div>
      </section>
    }

    @if (report(); as r) {
      @if (r.findings.length || r.proposals.length) {
        <section class="insight" data-cy="insight-result">
          <span class="kicker">{{ kickerFor('insight') }}</span>
          <p class="lead" data-cy="insight-headline">{{ r.headline }}</p>
          @if (r.findings.length) {
            <ol class="findings">
              @for (f of r.findings; track f.title) { <li data-cy="finding"><b>{{ f.title }}</b><span>{{ f.detail }}</span>@if (f.evidence) { <span class="evidence">From {{ f.evidence }}</span> }</li> }
            </ol>
          }
          @if (r.proposals.length) {
            <h3>Proposed next Missions</h3>
            <div class="proposals">
              @for (p of r.proposals; track p.title) {
                <article class="proposal" data-cy="proposal">
                  <span class="kicker">Action Mission</span>
                  <b>{{ p.title }}</b>
                  <span class="why">{{ p.why }}</span>
                  @if (state()[p.title] === 'started') {
                    <span class="started" data-cy="proposal-started">✓ Started · in Moves</span>
                  } @else {
                    <button type="button" class="btn primary" [disabled]="state()[p.title] === 'starting'" (click)="startProposal(p)" data-cy="proposal-start">{{ state()[p.title] === 'starting' ? 'Planning…' : 'Start' }}</button>
                  }
                </article>
              }
            </div>
          }
        </section>
      }
    }
  `,
  styles: [`
    :host { display: block; font-family: var(--font); color: var(--text); }
    section { display: flex; flex-direction: column; gap: 14px; }
    .kicker { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
    h2 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.03em; }
    h3 { margin: 6px 0 0; font-size: 20px; font-weight: 700; }
    .lead { margin: 0; font-size: 17px; line-height: 1.5; }
    .counter { align-self: flex-start; height: 34px; padding: 0 14px; border-radius: 999px; background: var(--surface); font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; }
    .split { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
    .items, .findings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .items { flex: 1 1 520px; min-width: 0; }
    .items li { display: grid; grid-template-columns: minmax(0, 1fr) auto 200px; gap: 12px; align-items: center; background: var(--surface); border-radius: 18px; padding: 12px 14px; }
    .items li.kept { background: var(--t-green); }
    .items li.dropped { opacity: .5; }
    .item-text, .findings li { display: flex; flex-direction: column; gap: 3px; font-size: 14px; }
    .item-text span, .findings span { color: var(--muted); line-height: 1.4; }
    .route, .evidence { font-size: 12px; }
    .fit { height: 26px; padding: 0 10px; border-radius: 999px; background: var(--t-blue); color: var(--t-blue-fg); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; }
    .fit.strong { background: var(--t-green); color: var(--t-green-fg); }
    .seg3 { display: grid; grid-template-columns: repeat(3, 1fr); background: var(--bg); border-radius: 999px; padding: 3px; }
    .seg3 button { height: 32px; border: 0; border-radius: 999px; background: none; color: var(--text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
    .seg3 button.on { background: var(--text); color: var(--bg); }
    .findings li { background: var(--bg); border-radius: 16px; padding: 12px 14px; }
    .side { flex: 0 1 320px; min-width: 260px; background: var(--surface); border-radius: 24px; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
    .side h3 { margin: 0; font-size: 15px; }
    .side p { margin: 0; font-size: 14px; color: var(--muted); line-height: 1.45; }
    .proposals { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
    .proposal { background: var(--surface); border-radius: 22px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
    .proposal b { font-size: 18px; }
    .why { font-size: 14px; color: var(--muted); line-height: 1.45; }
    .btn { align-self: flex-start; height: 44px; padding: 0 22px; border-radius: 999px; border: 0; background: var(--blue); color: #fff; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
    .btn:disabled { opacity: .5; }
    .started { align-self: flex-start; height: 40px; padding: 0 14px; border-radius: 999px; background: var(--t-green); color: var(--t-green-fg); font-size: 14px; font-weight: 700; display: inline-flex; align-items: center; }
    @media (max-width: 640px) { .items li { grid-template-columns: 1fr auto; } .seg3 { grid-column: 1 / -1; } }
  `],
} )
export class MissionOutcomeComponent {
  private readonly api = inject( MissionsApiService );

  readonly mission = input.required<MissionView>();
  readonly viewerId = input( '' );
  readonly people = input<Record<string, Person>>( {} );

  readonly picks = signal<Record<string, Pick>>( {} );
  readonly state = signal<Record<string, 'starting' | 'started'>>( {} );
  readonly busy = signal( false );
  readonly batchDone = signal( 0 );
  readonly choices: { id: Pick; label: string }[] = [{ id: 'keep', label: 'Keep' }, { id: 'later', label: 'Later' }, { id: 'drop', label: 'Drop' }];

  readonly report = computed( () => ( this.mission().status === 'done' ? this.mission().report : null ) );

  /** The waiting decision that follows a shortlist: that's where you keep or drop. */
  readonly shortlistStep = computed<StepView | null>( () => {
    const steps = this.mission().steps;
    return steps.find( ( s ) => s.kind === 'decision' && s.status === 'active' && s.dependsOn.some( ( id ) => {
      const dep = steps.find( ( d ) => d.id === id );
      return dep && dep.tool === 'todd.shortlist';
    } ) ) || null;
  } );

  private readonly shortlistSource = computed( () => {
    const decide = this.shortlistStep();
    if ( !decide ) return null;
    return this.mission().steps.find( ( s ) => decide.dependsOn.includes( s.id ) && s.tool === 'todd.shortlist' ) || null;
  } );

  readonly items = computed<ShortlistItem[]>( () => ( this.shortlistSource()?.output?.['items'] as ShortlistItem[] ) || [] );
  readonly shortlistSummary = computed( () => String( this.shortlistSource()?.output?.['summary'] || '' ) );

  kickerFor ( kind: 'shortlist' | 'insight' ): string {
    return kind === 'shortlist' ? `Shortlist Mission · ${this.mission().title} · results` : 'Insight Mission · what TODD found';
  }

  count ( pick: Pick ): number {
    return Object.values( this.picks() ).filter( ( value ) => value === pick ).length;
  }

  pick ( id: string, pick: Pick ): void {
    this.picks.update( ( all ) => ( { ...all, [id]: all[id] === pick ? '' : pick } ) );
  }

  async startKept ( decide: StepView ): Promise<void> {
    const kept = this.items().filter( ( item ) => this.picks()[item.id] === 'keep' );
    if ( !kept.length ) return;
    this.busy.set( true );
    try {
      await this.api.act( this.mission().id, decide.id, 'answer', { value: kept.map( ( item ) => item.name ).join( ', ' ) } );
      for ( const item of kept ) {
        await this.api.ask( `Reach ${item.name}. Why: ${item.why}${item.route ? ` Route: ${item.route}.` : ''}`, { origin: 'suggestion', force: 'mission', title: `Reach ${item.name}`, autoStart: true } );
      }
      this.batchDone.set( kept.length );
    } finally {
      this.busy.set( false );
    }
  }

  async startProposal ( proposal: Proposal ): Promise<void> {
    this.state.update( ( all ) => ( { ...all, [proposal.title]: 'starting' } ) );
    try {
      const res = await this.api.ask( proposal.request, { origin: 'suggestion', force: 'mission', title: proposal.title } );
      if ( res.mode === 'mission' ) {
        const planned = await this.api.waitForPlan( res.mission.id );
        if ( planned.status === 'proposed' ) await this.api.start( planned.id );
      }
      this.state.update( ( all ) => ( { ...all, [proposal.title]: 'started' } ) );
    } catch {
      this.state.update( ( all ) => {
        const next = { ...all };
        delete next[proposal.title];
        return next;
      } );
    }
  }
}
