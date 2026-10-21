import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, OnInit } from '@angular/core';

import { EditPlanComponent } from './edit-plan.component';
import { MissionsApiService } from './missions-api.service';
import { DirectAnswer, MissionView, Person, PRODUCT_LABEL, splitLine, stripColumns } from './missions.model';
import { OwnerTokenComponent } from './owner-token.component';
import { PlanStripComponent } from './plan-strip.component';

type Phase = 'idle' | 'planning' | 'direct' | 'plan' | 'questions' | 'started' | 'error';

/**
 * The plan reply (design 1a-1d, 10a): ask TODD for something and get either
 * an answer on the spot or a plan - who does each step, what needs you, how
 * long it takes - to Start or Edit. The same reply for Ask TODD, Maya's chat,
 * a Playbook's "Use this" and a suggestion. Synced from taliferro-ui/missions.
 */
@Component( {
  selector: 'tm-plan-reply',
  standalone: true,
  imports: [OwnerTokenComponent, PlanStripComponent, EditPlanComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="reply" data-cy="plan-reply">
      @if (showAsk()) {
        <form class="ask" (submit)="submit($event)">
          <input [value]="draft()" (input)="draft.set($any($event.target).value)" [placeholder]="placeholder()" aria-label="What do you need?" data-cy="ask-input">
          <button type="submit" class="btn primary" [disabled]="!draft().trim() || phase() === 'planning'" data-cy="ask-send">Ask</button>
        </form>
      }

      @if (asked()) { <div class="bubble" data-cy="ask-bubble">{{ asked() }}</div> }

      @switch (phase()) {
        @case ('direct') {
          <div class="agent" data-cy="direct-answer">
            <tm-owner-token [who]="agent()" [size]="32" />
            <div class="answer">
              <p>{{ directText() }}</p>
              @if (direct()?.product) { <div class="chips"><span class="chip">{{ productLabel(direct()!.product!) }}</span></div> }
              <span class="muted">Answered here. No Mission.</span>
            </div>
          </div>
        }
        @case ('planning') {
          <div class="agent" data-cy="planning">
            <tm-owner-token [who]="agent()" [size]="32" />
            <div class="answer"><p><b>Planning…</b> <span class="muted">{{ status() }}</span></p>
              <div class="skeleton">@for (i of skeleton; track i) { <span [style.opacity]="1 - i * 0.1"></span> }</div>
            </div>
          </div>
        }
        @case ('error') { <p class="error" data-cy="reply-error">{{ status() }}</p> }
      }

      @if (mission(); as m) {
        @if (phase() === 'questions') {
          <div class="agent" data-cy="planner-questions">
            <tm-owner-token [who]="agent()" [size]="32" />
            <div class="answer">
              <p>Before I plan it:</p>
              @for (q of m.questions; track q; let i = $index) {
                <label class="q"><span>{{ q }}</span><input (input)="setAnswer(i, $any($event.target).value)" [attr.data-cy]="'question-' + i"></label>
              }
              <button type="button" class="btn primary" (click)="answer()" data-cy="answer-questions">Plan it</button>
            </div>
          </div>
        }

        @if (phase() === 'plan' || phase() === 'started') {
          @if (editing()) {
            <tm-edit-plan [mission]="m" [viewerId]="viewerId()" [people]="people()" (saved)="onEdited($event)" (cancelled)="editing.set(false)" />
          } @else {
            <div class="agent">
              <tm-owner-token [who]="agent()" [size]="32" />
              <p class="say" data-cy="plan-summary">{{ m.planFallback ? m.summary : (m.summary || 'This needs a plan.') }}</p>
            </div>
            <article class="card" [class.fallback]="m.planFallback" data-cy="plan-card">
              <span class="kicker">Mission · {{ outcome() }}</span>
              <h2 data-cy="plan-title">{{ m.title }}</h2>
              @if (!m.planFallback) {
                <div class="facts">
                  @if (approvals()) { <span class="fact pink" data-cy="fact-approvals">{{ approvals() }} approval{{ approvals() === 1 ? '' : 's' }} from you</span> }
                  <span class="fact" data-cy="fact-time">{{ minutesText() }}</span>
                  @if (durationText()) { <span class="fact">{{ durationText() }}</span> }
                </div>
              }
              <div class="strip-full"><tm-plan-strip [steps]="m.steps" mode="full" [viewerId]="viewerId()" [people]="people()" /></div>
              <div class="strip-list"><tm-plan-strip [steps]="m.steps" mode="list" [viewerId]="viewerId()" [people]="people()" /></div>
              <footer>
                <span class="split" data-cy="plan-split">{{ split() }}</span>
                @if (phase() === 'started') {
                  <span class="started" data-cy="started">✓ Started · <a [href]="detailLink()">in Moves</a></span>
                } @else if (m.planFallback) {
                  <button type="button" class="btn" (click)="retry()" data-cy="tell-more">Tell TODD more</button>
                  <button type="button" class="btn primary" (click)="start()" [disabled]="busy()" data-cy="plan-myself">Plan it myself</button>
                } @else {
                  <button type="button" class="btn" (click)="editing.set(true)" data-cy="plan-edit">Edit plan</button>
                  <button type="button" class="btn primary" (click)="start()" [disabled]="busy()" data-cy="plan-start">Start</button>
                }
              </footer>
            </article>
          }
        }
      }
    </div>
  `,
  styles: [`
    :host { display: block; font-family: var(--font); color: var(--text); }
    .reply { display: flex; flex-direction: column; gap: 16px; }
    .ask { display: flex; gap: 8px; }
    .ask input { flex: 1; min-width: 0; height: 48px; border-radius: 999px; border: 0; background: var(--surface); color: var(--text); font: inherit; font-size: 16px; padding: 0 20px; }
    .bubble { align-self: flex-end; max-width: 78%; background: var(--text); color: var(--bg); font-size: 16px; line-height: 1.4; border-radius: 22px; padding: 12px 18px; }
    .agent { display: flex; gap: 12px; align-items: flex-start; }
    .say, .answer p { margin: 0; font-size: 16px; line-height: 1.5; }
    .answer { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; }
    .muted { color: var(--muted); font-size: 13px; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { height: 28px; padding: 0 10px; border-radius: 999px; background: var(--surface); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; }
    .skeleton { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; }
    .skeleton span { height: 10px; border-radius: 999px; background: var(--surface2); }
    .q { display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 700; }
    .q input { height: 44px; border-radius: 14px; border: 0; background: var(--surface); padding: 0 14px; font: inherit; color: var(--text); }
    .card { background: var(--surface); border-radius: 24px; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
    .card.fallback { background: var(--t-pink); }
    .kicker { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
    h2 { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.03em; }
    .facts { display: flex; flex-wrap: wrap; gap: 8px; }
    .fact { height: 32px; padding: 0 14px; border-radius: 999px; background: var(--bg); font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; }
    .fact.pink { background: var(--t-pink); color: var(--t-pink-fg); }
    .strip-list { display: none; }
    footer { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .split { flex: 1; min-width: 200px; font-size: 13px; color: var(--muted); }
    .btn { height: 44px; padding: 0 22px; border-radius: 999px; border: 0; background: var(--bg); color: var(--text); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
    .btn.primary { background: var(--blue); color: #fff; }
    .btn:disabled { opacity: .5; }
    .started { height: 44px; padding: 0 18px; border-radius: 999px; background: var(--t-green); color: var(--t-green-fg); font-size: 14px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }
    .started a { color: inherit; }
    .error { color: var(--t-red-fg); }
    @media (max-width: 760px) {
      .strip-full { display: none; }
      .strip-list { display: block; }
      .bubble { max-width: 88%; }
    }
  `],
} )
export class PlanReplyComponent implements OnInit {
  private readonly api = inject( MissionsApiService );

  /** A request to plan right away (Playbook "Use this", a link with ?q=). */
  readonly request = input( '' );
  readonly origin = input<'ask' | 'maya' | 'playbook' | 'suggestion'>( 'ask' );
  readonly playbookId = input( '' );
  readonly viewerId = input( '' );
  readonly people = input<Record<string, Person>>( {} );
  readonly agent = input<'todd' | 'maya'>( 'todd' );
  readonly showAsk = input( true );
  /** Where a started Mission lives (Moves). */
  readonly detailBase = input( 'https://moves.taliferro.tech/missions/' );
  readonly started = output<MissionView>();

  readonly draft = signal( '' );
  readonly asked = signal( '' );
  readonly phase = signal<Phase>( 'idle' );
  readonly status = signal( '' );
  readonly mission = signal<MissionView | null>( null );
  readonly direct = signal<DirectAnswer | null>( null );
  readonly editing = signal( false );
  readonly busy = signal( false );
  readonly answers = signal<string[]>( [] );
  readonly skeleton = [0, 1, 2, 3, 4, 5, 6, 7];

  ngOnInit (): void {
    if ( this.request() ) void this.ask( this.request(), this.origin() !== 'ask' );
  }

  readonly placeholder = computed( () => ( this.agent() === 'maya' ? 'What should Maya work on?' : 'What do you need done?' ) );
  readonly outcome = computed( () => ( { action: 'Action', insight: 'Insight', shortlist: 'Shortlist', program: 'Program', assetSet: 'Asset set' }[this.mission()?.outcomeType || 'action'] ) );
  /** Approvals on the main path (the server's estimate leaves out the "if they reply" ones). */
  readonly approvals = computed( () => this.mission()?.estimate?.approvals ?? ( this.mission()?.steps || [] ).filter( ( s ) => s.kind === 'approval' && !s.when ).length );
  readonly minutesText = computed( () => {
    const m = this.mission();
    const minutes = m && m.estimate ? m.estimate.yourMinutes : 0;
    return minutes ? `About ${minutes} min of your time` : 'None of your time';
  } );
  readonly durationText = computed( () => {
    const days = this.mission()?.estimate?.waitBusinessDays || 0;
    return days ? `About ${days + 2} business days, mostly waiting` : '';
  } );
  readonly split = computed( () => splitLine( stripColumns( this.mission()?.steps || [], this.viewerId(), this.people() ) ) );
  readonly directText = computed( () => {
    const d = this.direct();
    if ( !d ) return '';
    // No tool: a question about TODD itself, which the assistant answers.
    return d.summary || ( d.tool ? 'Here’s what I found.' : 'No plan needed for that one. Ask it in the TODD chat and it answers right away.' );
  } );
  readonly detailLink = computed( () => `${this.detailBase()}${encodeURIComponent( this.mission()?.id || '' )}` );

  productLabel ( product: string ): string {
    return PRODUCT_LABEL[product] || product;
  }

  submit ( event: Event ): void {
    event.preventDefault();
    const text = this.draft().trim();
    if ( !text ) return;
    this.draft.set( '' );
    void this.ask( text, false );
  }

  setAnswer ( index: number, value: string ): void {
    const next = [...this.answers()];
    next[index] = value;
    this.answers.set( next );
  }

  retry (): void {
    this.phase.set( 'idle' );
    this.mission.set( null );
    this.draft.set( this.asked() );
  }

  async ask ( text: string, force: boolean ): Promise<void> {
    this.asked.set( text );
    this.direct.set( null );
    this.mission.set( null );
    this.phase.set( 'planning' );
    this.status.set( 'Sizing it up' );
    try {
      const res = await this.api.ask( text, { origin: this.origin(), playbookId: this.playbookId() || undefined, force: force ? 'mission' : undefined } );
      if ( res.mode === 'direct' ) {
        this.direct.set( res );
        this.phase.set( 'direct' );
        return;
      }
      await this.follow( res.mission.id );
    } catch ( error: any ) {
      this.phase.set( 'error' );
      this.status.set( ( error && error.error && error.error.message ) || 'TODD couldn’t take that on right now.' );
    }
  }

  private async follow ( id: string ): Promise<void> {
    const mission = await this.api.waitForPlan( id, ( m ) => this.status.set( m.statusDetail && m.statusDetail !== 'Planning…' ? m.statusDetail : 'Working out the steps' ) );
    this.mission.set( mission );
    this.phase.set( mission.status === 'awaiting_user' ? 'questions' : mission.status === 'proposed' ? 'plan' : mission.status === 'queued' || mission.status === 'running' ? 'planning' : 'started' );
  }

  async answer (): Promise<void> {
    const m = this.mission()!;
    const answers = m.questions.map( ( question, i ) => ( { question, answer: this.answers()[i] || '' } ) ).filter( ( a ) => a.answer.trim() );
    if ( !answers.length ) return;
    this.phase.set( 'planning' );
    await this.api.answer( m.id, answers );
    await this.follow( m.id );
  }

  onEdited ( mission: MissionView ): void {
    this.mission.set( mission );
    this.editing.set( false );
  }

  async start (): Promise<void> {
    const m = this.mission();
    if ( !m ) return;
    this.busy.set( true );
    try {
      const started = await this.api.start( m.id );
      this.mission.set( started );
      this.phase.set( 'started' );
      this.started.emit( started );
    } catch ( error: any ) {
      this.status.set( ( error && error.error && error.error.message ) || 'It didn’t start.' );
    } finally {
      this.busy.set( false );
    }
  }
}
