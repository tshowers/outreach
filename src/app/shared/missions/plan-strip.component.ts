import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { OwnerTokenComponent } from './owner-token.component';
import { ColumnView, GLYPH, KIND_LABEL, Look, Person, StepView, Who, currentColumn, doneCount, nameOf, stripColumns } from './missions.model';

const HATCH = 'repeating-linear-gradient(135deg,var(--surface2) 0 3px,transparent 3px 6px)';
const DASH = 'repeating-linear-gradient(90deg,var(--yellow) 0 6px,transparent 6px 9px)';

function hue ( who: Who ): string {
  return who === 'todd' ? 'var(--c-todd)' : who === 'maya' ? 'var(--c-maya)' : who === 'you' ? 'var(--c-you)' : 'var(--c-team)';
}

function tint ( who: Who ): [string, string] {
  if ( who === 'todd' ) return ['var(--t-blue)', 'var(--t-blue-fg)'];
  if ( who === 'maya' ) return ['var(--t-violet)', 'var(--t-violet-fg)'];
  if ( who === 'you' ) return ['var(--t-pink)', 'var(--t-pink-fg)'];
  return ['var(--t-cyan)', 'var(--t-cyan-fg)'];
}

/** Segment, label background and label color for a state (PlanStrip look()). */
export function paint ( look: Look, who: Who ): { seg: string; lbg: string; lfg: string; bg: string } {
  const [tb, tf] = tint( who );
  switch ( look ) {
    case 'done': return { seg: 'var(--text)', lbg: 'var(--surface)', lfg: 'var(--muted)', bg: 'transparent' };
    case 'run':
    case 'person': return { seg: hue( who ), lbg: tb, lfg: tf, bg: tb };
    case 'wait': return { seg: DASH, lbg: 'var(--t-yellow)', lfg: 'var(--t-yellow-fg)', bg: 'var(--t-yellow)' };
    case 'skip': return { seg: HATCH, lbg: 'transparent', lfg: 'var(--muted)', bg: 'transparent' };
    case 'fail': return { seg: 'var(--red)', lbg: 'var(--t-red)', lfg: 'var(--t-red-fg)', bg: 'var(--t-red)' };
    default: return { seg: 'var(--surface2)', lbg: 'transparent', lfg: 'var(--muted)', bg: 'transparent' };
  }
}

/**
 * The plan strip (design 0a): one component for every place a plan shows.
 *   full     a column per step (desktop plan reply, Mission detail header)
 *   compact  segments plus who holds it now (Moves rows, Waiting on you, Playbooks)
 *   list     the timeline: a card per step with its result (phones, Mission detail)
 * Synced from taliferro-ui/missions.
 */
@Component( {
  selector: 'tm-plan-strip',
  standalone: true,
  imports: [OwnerTokenComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (mode()) {
      @case ('full') {
        <div class="full" [style.grid-template-columns]="gridColumns()" data-cy="plan-strip-full">
          @for (c of columns(); track c.stepId) {
            <button type="button" class="col" [class.active]="c.active" [style.background]="c.active ? paintOf(c).bg : 'transparent'" (click)="pick(c)" [attr.data-cy]="'strip-col-' + c.stepId" [attr.data-look]="c.look">
              <span class="tokens">
                @if (c.kind === 'branch') {
                  @for (p of c.paths; track p.stepIds[0]) { <tm-owner-token [who]="p.who" [size]="24" [people]="people()" /> }
                } @else { <tm-owner-token [who]="c.who" [size]="28" [people]="people()" /> }
              </span>
              <span class="seg" [class.tall]="c.active" [style.background]="paintOf(c).seg"></span>
              <span class="kicker">{{ c.number }} · {{ kind(c) }}</span>
              <span class="title" [class.struck]="c.look === 'skip'">{{ c.title }}</span>
              <span class="state" [style.color]="paintOf(c).lfg">{{ glyph(c.look) }} {{ c.label }}</span>
              @if (c.paths.length) {
                <span class="paths">
                  @for (p of c.paths; track p.stepIds[0]) {
                    <span class="path" [class.struck]="p.look === 'skip'" [style.color]="p.look === 'skip' ? 'var(--muted)' : 'inherit'">
                      <span class="swatch" [style.background]="paintOf(p).seg"></span>
                      <span><b>{{ p.if }}</b> {{ p.title }}</span>
                    </span>
                  }
                </span>
              }
            </button>
          }
        </div>
      }
      @case ('compact') {
        <div class="compact" data-cy="plan-strip-compact">
          <div class="segs" [style.grid-template-columns]="'repeat(' + columns().length + ', minmax(0, 1fr))'">
            @for (c of columns(); track c.stepId) {
              <span class="seg" [class.tall]="c.active" [style.background]="paintOf(c).seg" [attr.data-look]="c.look"></span>
            }
          </div>
          <div class="now">
            <tm-owner-token [who]="nowWho()" [size]="22" [people]="people()" />
            <span class="line" data-cy="strip-now"><b [style.color]="nowColor()">{{ nowLabel() }}</b>{{ nowTitle() ? ' · ' + nowTitle() : '' }}</span>
            <span class="count">{{ done() }} of {{ columns().length }}</span>
          </div>
        </div>
      }
      @default {
        <div class="list" data-cy="plan-strip-list">
          @for (c of columns(); track c.stepId; let last = $last) {
            <div class="row">
              <div class="rail">
                @if (c.kind === 'branch') { <tm-owner-token who="branch" [size]="32" /> } @else { <tm-owner-token [who]="c.who" [size]="32" [people]="people()" /> }
                @if (!last) { <span class="wire" [style.background]="c.look === 'done' || c.look === 'skip' ? 'var(--text)' : 'var(--surface2)'"></span> }
              </div>
              <button type="button" class="card" [style.background]="c.active ? paintOf(c).bg : 'transparent'" (click)="pick(c)" [attr.data-cy]="'step-' + c.stepId" [attr.data-look]="c.look">
                <span class="head">
                  <span class="kicker">{{ c.number }} · {{ kind(c) }}{{ c.kind === 'branch' ? ' · depends' : ' · ' + whoName(c.who) }}</span>
                  <span class="pill" [style.background]="paintOf(c).lbg" [style.color]="paintOf(c).lfg">{{ glyph(c.look) }} {{ c.label }}</span>
                </span>
                <span class="title big" [class.struck]="c.look === 'skip'">{{ c.title }}</span>
                @if (c.step?.resultSummary && c.look === 'done') { <span class="detail">{{ c.step!.resultSummary }}</span> }
                @else if (c.detail) { <span class="detail">{{ c.detail }}</span> }
                @if (c.active && c.why && (c.who === 'you' || c.look === 'fail')) { <span class="why">Why you: {{ c.why }}</span> }
                @if (c.look === 'done' && c.step?.output; as out) {
                  @if (c.step!.tool === 'email.create' && out['subject']) {
                    <span class="email"><span class="band"></span><span class="email-body"><b>{{ out['subject'] }}</b></span></span>
                  } @else if (c.step!.tool === 'image.obtain' && out['src']) {
                    <img class="img" [src]="out['src']" alt="">
                  } @else if (out['documentId']) {
                    <span class="doc"><span class="tag">Docs</span>{{ out['title'] || out['subject'] || c.title }} ↗</span>
                  }
                }
                @if (c.paths.length) {
                  <span class="paths rows">
                    @for (p of c.paths; track p.stepIds[0]) {
                      <span class="path-row" [style.background]="p.look === 'skip' || p.look === 'next' ? 'var(--surface)' : paintOf(p).bg">
                        <tm-owner-token [who]="p.who" [size]="22" [people]="people()" />
                        <span class="path-text" [class.struck]="p.look === 'skip'"><b>{{ p.if }}</b> {{ p.title }}</span>
                        <span class="path-label" [style.color]="paintOf(p).lfg">{{ p.label }}</span>
                      </span>
                    }
                  </span>
                }
              </button>
            </div>
          }
        </div>
      }
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    button { font: inherit; color: inherit; text-align: left; border: 0; cursor: pointer; }
    .full { display: grid; gap: 6px; align-items: stretch; }
    .col { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 10px 10px 12px; border-radius: 16px; }
    .tokens { height: 28px; display: flex; align-items: center; gap: 2px; }
    .seg { height: 8px; border-radius: 999px; display: block; }
    .seg.tall { height: 12px; }
    .kicker { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    .title { font-size: 13px; font-weight: 700; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .title.big { font-size: 15px; -webkit-line-clamp: unset; display: block; }
    .struck { text-decoration: line-through; }
    .state { font-size: 12px; font-weight: 700; line-height: 1.3; }
    .paths { display: flex; flex-direction: column; gap: 4px; padding-top: 2px; font-size: 12px; line-height: 1.35; }
    .path { display: flex; gap: 6px; align-items: baseline; }
    .swatch { flex: none; width: 10px; height: 5px; border-radius: 5px; }
    .compact { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .segs { display: grid; gap: 3px; align-items: center; }
    .segs .seg { height: 6px; border-radius: 6px; }
    .segs .seg.tall { height: 12px; }
    .now { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .line { flex: 1; min-width: 0; font-size: 13px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .count { flex: none; font-size: 12px; color: var(--muted); }
    .list { display: flex; flex-direction: column; }
    .row { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 12px; }
    .rail { display: flex; flex-direction: column; align-items: center; gap: 4px; padding-top: 10px; }
    .wire { flex: 1; width: 3px; min-height: 10px; border-radius: 3px; }
    .card { display: flex; flex-direction: column; gap: 6px; padding: 10px 14px 14px; margin-bottom: 6px; border-radius: 18px; min-width: 0; }
    .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .head .kicker { flex: 1; min-width: 0; }
    .pill { height: 24px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 700; display: flex; align-items: center; white-space: nowrap; }
    .detail { font-size: 13px; color: var(--muted); line-height: 1.45; }
    .why { font-size: 13px; font-weight: 600; line-height: 1.45; color: var(--t-pink-fg); }
    .doc { align-self: flex-start; height: 32px; padding: 0 12px; border-radius: 999px; background: var(--surface); font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .tag { height: 20px; padding: 0 7px; border-radius: 999px; background: var(--bg); font-size: 11px; display: flex; align-items: center; }
    .img { width: 220px; max-width: 100%; height: 96px; border-radius: 14px; object-fit: cover; background: var(--t-violet); }
    .email { max-width: 420px; border-radius: 16px; background: var(--surface); overflow: hidden; display: flex; flex-direction: column; }
    .band { height: 56px; background: var(--t-violet); }
    .email-body { padding: 10px 14px 12px; font-size: 14px; }
    .rows { gap: 4px; }
    .path-row { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 12px; }
    .path-text { flex: 1; min-width: 0; font-size: 13px; line-height: 1.35; }
    .path-label { font-size: 12px; font-weight: 700; white-space: nowrap; }
  `],
} )
export class PlanStripComponent {
  readonly steps = input.required<StepView[]>();
  readonly mode = input<'full' | 'compact' | 'list'>( 'compact' );
  readonly viewerId = input( '' );
  readonly people = input<Record<string, Person>>( {} );
  readonly stepClick = output<ColumnView>();

  readonly columns = computed( () => stripColumns( this.steps(), this.viewerId(), this.people() ) );
  readonly gridColumns = computed( () => this.columns().map( ( c ) => ( c.paths.length ? 'minmax(0,1.7fr)' : 'minmax(0,1fr)' ) ).join( ' ' ) );
  readonly current = computed( () => currentColumn( this.columns() ) );
  readonly done = computed( () => doneCount( this.columns() ) );

  readonly nowWho = computed<Who>( () => {
    const cur = this.current();
    if ( cur ) return cur.who;
    const first = this.columns()[0];
    return first ? first.who : 'todd';
  } );
  readonly nowLabel = computed( () => {
    const cols = this.columns();
    if ( cols.length && this.done() === cols.length ) return 'Done';
    const cur = this.current();
    if ( cur ) return cur.label;
    return this.done() === 0 ? 'Not started' : 'Next';
  } );
  readonly nowTitle = computed( () => {
    const cols = this.columns();
    if ( cols.length && this.done() === cols.length ) return 'every step finished';
    const cur = this.current();
    if ( cur ) return cur.title;
    if ( this.done() === 0 ) return 'first step';
    const next = cols.find( ( c ) => c.look === 'next' );
    return next ? next.title : '';
  } );
  readonly nowColor = computed( () => {
    const cur = this.current();
    return cur ? paint( cur.look, cur.who ).lfg : 'var(--text)';
  } );

  paintOf ( c: { look: Look; who: Who } ) {
    return paint( c.look, c.who );
  }

  glyph ( look: Look ): string {
    return GLYPH[look];
  }

  kind ( c: ColumnView ): string {
    return KIND_LABEL[c.kind];
  }

  whoName ( who: Who ): string {
    return nameOf( who, this.people() );
  }

  pick ( c: ColumnView ): void {
    this.stepClick.emit( c );
  }
}
