import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { MissionView, Person, ReportRow, whoOf } from './missions.model';
import { OwnerTokenComponent } from './owner-token.component';
import { PlanStripComponent } from './plan-strip.component';

/**
 * The completion report (design 8a): every step that happened, who did it,
 * when, and the result, ending with the split and your time. A teammate's
 * timeout is a result, tagged so. Synced from taliferro-ui/missions.
 */
@Component( {
  selector: 'tm-mission-report',
  standalone: true,
  imports: [OwnerTokenComponent, PlanStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (mission().report; as r) {
      <article class="report" data-cy="mission-report">
        <span class="kicker">Report · {{ outcomeLabel() }}{{ r.days !== null ? ' · done in ' + r.days + ' day' + (r.days === 1 ? '' : 's') : '' }}</span>
        <h2 data-cy="report-headline">{{ r.headline }}</h2>
        <tm-plan-strip [steps]="mission().steps" mode="compact" [viewerId]="viewerId()" [people]="people()" />
        <ol class="rows">
          @for (row of r.rows; track row.stepId) {
            <li data-cy="report-row" [attr.data-step]="row.stepId">
              <tm-owner-token [who]="who(row)" [size]="32" [people]="people()" />
              <div class="text">
                <b>{{ row.title }}</b>
                <span class="meta">{{ byName(row) }} · {{ when(row.finishedAt) }}</span>
                <span class="result">{{ row.result }}</span>
                @if (row.timedOut) { <span class="tag yellow" data-cy="report-timeout">Wait ended · counted as a result</span> }
                @if (row.handedOff) { <span class="tag">Done by hand</span> }
              </div>
            </li>
          }
        </ol>
        <div class="split" data-cy="report-split">
          <div class="tokens">
            @for (row of r.rows; track row.stepId) { <tm-owner-token [who]="who(row)" [size]="24" [people]="people()" /> }
          </div>
          <p class="line">{{ splitHead() }}</p>
          @if (r.ownerMinutes) { <p class="time">About {{ r.ownerMinutes }} minute{{ r.ownerMinutes === 1 ? '' : 's' }} of your time.</p> }
        </div>
      </article>
    }
  `,
  styles: [`
    :host { display: block; }
    .report { display: flex; flex-direction: column; gap: 18px; max-width: 760px; }
    .kicker { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    h2 { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.15; }
    .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
    li { display: grid; grid-template-columns: 32px 1fr; gap: 14px; align-items: start; }
    .text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .text b { font-size: 15px; }
    .meta { font-size: 13px; color: var(--muted); }
    .result { font-size: 14px; color: var(--muted); line-height: 1.45; }
    .tag { align-self: flex-start; margin-top: 4px; height: 24px; padding: 0 10px; border-radius: 999px; background: var(--surface); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; }
    .tag.yellow { background: var(--t-yellow); color: var(--t-yellow-fg); }
    .split { background: var(--surface); border-radius: 24px; padding: 20px 22px; display: flex; flex-direction: column; gap: 10px; }
    .tokens { display: flex; flex-wrap: wrap; gap: 4px; }
    .line { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; }
    .time { margin: 0; font-size: 17px; color: var(--muted); }
  `],
} )
export class MissionReportComponent {
  readonly mission = input.required<MissionView>();
  readonly viewerId = input( '' );
  readonly people = input<Record<string, Person>>( {} );

  readonly outcomeLabel = computed( () => ( { action: 'Action', insight: 'Insight', shortlist: 'Shortlist', program: 'Program', assetSet: 'Asset set' }[this.mission().outcomeType] || 'Action' ) );

  /** "3 steps by TODD, 2 by teammates, 1 by you." - the line without the time, which gets its own line here. */
  readonly splitHead = computed( () => {
    const r = this.mission().report!;
    const s = r.split;
    const parts: string[] = [];
    if ( s.todd ) parts.push( `${s.todd} step${s.todd === 1 ? '' : 's'} by 16Ahead` );
    if ( s.maya ) parts.push( `${s.maya} by the Marketing Assistant` );
    if ( s.teammates ) parts.push( `${s.teammates} by teammates` );
    if ( s.owner ) parts.push( `${s.owner} by you` );
    return parts.length ? `${parts.join( ', ' )}.` : '';
  } );

  who ( row: ReportRow ): string {
    if ( row.by.type === 'todd' || row.by.type === 'maya' ) return row.by.type;
    return whoOf( { owner: 'person', assigneeId: row.by.id }, this.viewerId() );
  }

  byName ( row: ReportRow ): string {
    const who = this.who( row );
    if ( who === 'todd' ) return 'General Assistant';
    if ( who === 'maya' ) return 'Marketing Assistant';
    if ( who === 'you' ) return 'You';
    return ( this.people()[who] && this.people()[who].name ) || 'A teammate';
  }

  when ( iso: string | null ): string {
    return iso ? new Date( iso ).toLocaleString( undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } ) : '';
  }
}
