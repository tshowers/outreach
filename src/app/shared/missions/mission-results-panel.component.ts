import { ChangeDetectionStrategy, Component, ElementRef, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';

import { MissionView, Person, ReportRow, whoOf } from './missions.model';

export type ResultsTab = 'insights' | 'report';

/**
 * What a finished Mission found and did, in a wide slide-out
 * (design_handoff_mission_insights_report, Ty 2026-11-03): Insights (the
 * headline, the findings with their people, next action and evidence) and
 * Report (the outcome, key numbers, what's next, what was kept, every step).
 * Opened from the mission header; Esc, × or the scrim close it.
 * Synced from taliferro-ui/missions.
 */
@Component( {
  selector: 'tm-mission-results-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (mission().report; as r) {
      <div class="scrim" [class.shown]="shown()" (click)="close()" data-cy="results-scrim"></div>
      <aside class="panel" [class.shown]="shown()" role="dialog" aria-modal="true" [attr.aria-label]="tab() === 'insights' ? 'Insights' : 'Report'" tabindex="-1" data-cy="results-panel">
        <div class="top">
          <div class="tabs" role="tablist">
            <button type="button" role="tab" [class.on]="tab() === 'insights'" [attr.aria-selected]="tab() === 'insights'" [disabled]="!r.insights" (click)="tabChange.emit('insights')" data-cy="results-tab-insights">Insights</button>
            <button type="button" role="tab" [class.on]="tab() === 'report'" [attr.aria-selected]="tab() === 'report'" (click)="tabChange.emit('report')" data-cy="results-tab-report">Report</button>
          </div>
          <span class="context">{{ mission().title || mission().request }}@if (finished()) { · Finished {{ finished() }} }</span>
          <button type="button" class="close" aria-label="Close" (click)="close()" data-cy="results-close">×</button>
        </div>

        <div class="body">
          <div class="col">
            @if (tab() === 'insights' && r.insights; as ins) {
              <section data-cy="results-insights">
                <span class="eyebrow">What 16Ahead found</span>
                <h2 class="headline" data-cy="insights-headline">{{ ins.headline }}</h2>
                @if (ins.summary) { <p class="summary">{{ ins.summary }}</p> }
                <ol class="findings">
                  @for (f of ins.findings; track f.id; let i = $index) {
                    <li class="finding" data-cy="insights-finding">
                      <div class="f-head"><span class="num">{{ pad(i + 1) }}</span><div><h3>{{ f.title }}</h3><p>{{ f.body }}</p></div></div>
                      <div class="f-rest">
                        @if (f.contacts.length) {
                          <div class="chips">
                            @for (c of f.contacts; track c.email || c.name) {
                              <span class="chip" [attr.title]="c.email"><span class="avatar">{{ initial(c.name || c.email) }}</span><b>{{ c.name || c.email }}</b>@if (c.firm) { <span class="muted">{{ c.firm }}</span> }</span>
                            }
                          </div>
                        }
                        @if (f.nextAction) { <div class="next"><span class="next-label">Next</span>{{ f.nextAction }}</div> }
                        @if (f.evidence) {
                          <button type="button" class="link" (click)="toggleEvidence(f.id)" data-cy="insights-evidence-toggle">{{ evidenceOpen()[f.id] ? 'Hide evidence' : 'Show evidence' }}</button>
                          @if (evidenceOpen()[f.id]) { <pre class="evidence" data-cy="insights-evidence">{{ f.evidence }}</pre> }
                        }
                      </div>
                    </li>
                  }
                </ol>
              </section>
            } @else {
              <section data-cy="results-report">
                <div class="report-head">
                  <span class="eyebrow">Mission report{{ r.days !== null ? ' · done in ' + r.days + ' day' + (r.days === 1 ? '' : 's') : '' }}</span>
                  <span class="actions">
                    <button type="button" class="pill" (click)="copyLink()" data-cy="report-copy-link">{{ copied() ? 'Copied' : 'Copy link' }}</button>
                    <button type="button" class="pill primary" (click)="downloadPdf()" data-cy="report-pdf">Download PDF</button>
                  </span>
                </div>
                <h2 class="headline" data-cy="report-outcome">{{ r.outcome || r.headline }}</h2>

                @if (r.stats?.length) {
                  <div class="stats" data-cy="report-stats">
                    @for (s of r.stats; track s.label) {
                      <div class="stat"><b [class.accent]="s.tone === 'accent'" [class.muted]="s.tone === 'muted'">{{ s.value }}</b><span>{{ s.label }}</span></div>
                    }
                  </div>
                }

                @if (r.next?.length) {
                  <h3 class="section">What’s next</h3>
                  <ol class="next-list" data-cy="report-next">
                    @for (n of r.next; track n; let i = $index) { <li><span class="n">{{ i + 1 }}</span>{{ n }}</li> }
                  </ol>
                }

                @if (r.kept?.length) {
                  <div class="kept-head"><h3 class="section">Kept</h3><span class="muted">{{ r.kept!.length }} of {{ r.candidateCount }} candidates</span></div>
                  <div class="fund-chips" data-cy="report-kept">@for (k of r.kept; track k) { <span class="fund">{{ k }}</span> }</div>
                  @if (r.dropped?.length) {
                    <span class="muted small">Dropped</span>
                    <div class="fund-chips">@for (d of r.dropped; track d) { <span class="fund muted">{{ d }}</span> }</div>
                  }
                }

                <button type="button" class="steps-toggle" (click)="stepsOpen.set(!stepsOpen())" [attr.aria-expanded]="stepsOpen()" data-cy="report-steps-toggle">
                  <b>Every step</b><span class="muted">{{ r.rows.length }} step{{ r.rows.length === 1 ? '' : 's' }} · {{ stepsOpen() ? 'Hide' : 'Show' }}</span>
                </button>
                @if (stepsOpen()) {
                  <ol class="steps" data-cy="report-steps">
                    @for (row of r.rows; track row.stepId) {
                      <li data-cy="report-row" [attr.data-step]="row.stepId">
                        <span class="icon" [class.you]="who(row) !== 'todd' && who(row) !== 'maya'">{{ who(row) === 'todd' || who(row) === 'maya' ? '✓' : 'You' }}</span>
                        <div><b>{{ row.title }}</b><span class="muted">{{ byName(row) }}@if (row.finishedAt) { · {{ when(row.finishedAt) }} }</span>@if (row.result) { <span class="result">{{ row.result }}</span> }@if (row.timedOut) { <span class="tag" data-cy="report-timeout">Wait ended · counted as a result</span> }@if (row.handedOff) { <span class="tag">Done by hand</span> }</div>
                      </li>
                    }
                  </ol>
                }
                @if (r.line) { <p class="muted small" data-cy="report-split">{{ r.line }}</p> }
              </section>
            }
          </div>
        </div>
      </aside>
    }
  `,
  styles: [`
    :host { font-family: var(--font); color: var(--text);
      --rp-panel: var(--bg); --rp-line: var(--surface2); --rp-text-2: color-mix(in srgb, var(--text) 72%, var(--muted));
      --rp-accent: var(--t-blue-fg); --rp-btn: var(--blue); --rp-btn-hover: var(--blue-ink); }
    .scrim { position: fixed; inset: 0; z-index: 60; background: rgba(15, 17, 21, .32); opacity: 0; transition: opacity 300ms ease; }
    .scrim.shown { opacity: 1; }
    .panel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 61; width: min(1180px, 94vw); background: var(--rp-panel); box-shadow: -30px 0 80px rgba(0, 0, 0, .35);
      display: flex; flex-direction: column; transform: translateX(105%); transition: transform 420ms cubic-bezier(.2, .8, .2, 1); outline: none; }
    .panel.shown { transform: translateX(0); }
    .top { display: flex; align-items: center; gap: 16px; padding: 20px 32px; border-bottom: 1px solid var(--rp-line); }
    .tabs { display: inline-flex; padding: 4px; border-radius: 999px; background: var(--surface); flex: none; }
    .tabs button { height: 36px; padding: 0 18px; border: 0; border-radius: 999px; background: transparent; color: var(--rp-text-2); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
    .tabs button.on { background: var(--text); color: var(--bg); }
    .tabs button:disabled { opacity: .4; cursor: not-allowed; }
    .context { flex: 1; min-width: 0; font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .close { width: 40px; height: 40px; flex: none; border: 0; border-radius: 50%; background: var(--surface); color: var(--text); font-size: 20px; cursor: pointer; }
    .close:hover { background: var(--surface2); }
    .body { flex: 1; overflow-y: auto; padding: 48px 32px 80px; }
    .col { max-width: 780px; margin: 0 auto; }
    section { display: flex; flex-direction: column; gap: 20px; }
    .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
    .headline { margin: 0; font-size: 40px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.08; text-wrap: balance; }
    .summary { margin: 0; font-size: 17px; line-height: 1.55; color: var(--rp-text-2); }
    .findings { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
    .finding { padding: 24px; border-radius: 20px; background: var(--surface); display: flex; flex-direction: column; gap: 16px; }
    .f-head { display: grid; grid-template-columns: 28px 1fr; align-items: baseline; }
    .num { font-size: 13px; font-weight: 800; color: var(--muted); }
    .f-head h3 { margin: 0 0 6px; font-size: 21px; font-weight: 800; letter-spacing: -0.02em; }
    .f-head p { margin: 0; font-size: 15px; line-height: 1.55; color: var(--rp-text-2); }
    .f-rest { padding-left: 28px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { height: 34px; padding: 0 14px 0 4px; border-radius: 999px; background: var(--bg); display: inline-flex; align-items: center; gap: 8px; font-size: 14px; }
    .avatar { width: 26px; height: 26px; border-radius: 50%; background: var(--surface2); font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
    .muted { color: var(--muted); }
    .small { font-size: 13px; }
    .next { padding: 10px 14px; border-radius: 12px; background: var(--t-blue); color: var(--t-blue-fg); font-size: 14px; font-weight: 600; }
    .next-label { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; margin-right: 10px; opacity: .8; }
    .link { border: 0; background: none; padding: 0; color: var(--muted); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .link:hover { color: var(--text); }
    .evidence { margin: 0; align-self: stretch; padding: 14px 16px; border-radius: 12px; background: var(--rp-panel); font-size: 13px; line-height: 1.55; color: var(--muted); white-space: pre-wrap; word-break: break-word; }
    .report-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .actions { display: inline-flex; gap: 8px; }
    .pill { height: 36px; padding: 0 16px; border: 0; border-radius: 999px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
    .pill.primary { background: var(--rp-btn); color: #fff; }
    .pill.primary:hover { background: var(--rp-btn-hover); }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .stat { padding: 20px; border-radius: 18px; background: var(--surface); display: flex; flex-direction: column; gap: 4px; }
    .stat b { font-size: 36px; font-weight: 800; letter-spacing: -0.03em; }
    .stat b.accent { color: var(--rp-accent); }
    .stat b.muted { color: var(--muted); }
    .stat span { font-size: 13px; color: var(--muted); }
    .section { margin: 20px 0 0; font-size: 20px; font-weight: 800; }
    .next-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .next-list li { padding: 16px 20px; border-radius: 16px; background: var(--surface); display: flex; gap: 14px; align-items: center; font-size: 15px; }
    .n { width: 28px; height: 28px; flex: none; border-radius: 50%; background: var(--t-blue); color: var(--t-blue-fg); font-size: 13px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
    .kept-head { display: flex; align-items: baseline; gap: 12px; }
    .kept-head .muted { font-size: 14px; }
    .fund-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .fund { height: 32px; padding: 0 14px; border-radius: 999px; background: var(--surface); font-size: 13px; display: inline-flex; align-items: center; }
    .steps-toggle { margin-top: 20px; width: 100%; padding: 18px 20px; border: 0; border-radius: 16px; background: var(--surface); color: var(--text); font: inherit; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
    .steps-toggle:hover { background: var(--surface2); }
    .steps-toggle b { font-size: 16px; }
    .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
    .steps li { display: grid; grid-template-columns: 28px 1fr; gap: 14px; align-items: start; }
    .steps li div { display: flex; flex-direction: column; gap: 2px; }
    .steps b { font-size: 15px; }
    .steps .muted { font-size: 13px; }
    .result { font-size: 14px; color: var(--rp-text-2); }
    .tag { align-self: flex-start; margin-top: 4px; height: 24px; padding: 0 10px; border-radius: 999px; background: var(--t-yellow); color: var(--t-yellow-fg); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; }
    .icon { width: 28px; height: 28px; border-radius: 50%; background: var(--t-blue); color: var(--rp-accent); font-size: 13px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
    .icon.you { background: var(--text); color: var(--bg); font-size: 10px; }
    @media (max-width: 720px) { .panel { width: 100vw; } .body { padding: 24px 20px; } .top { padding: 16px 20px; } .headline { font-size: 30px; } }
    @media (prefers-reduced-motion: reduce) { .panel, .scrim { transition: none; } }
  `],
} )
export class MissionResultsPanelComponent implements OnInit {
  private readonly host = inject( ElementRef<HTMLElement> );

  readonly mission = input.required<MissionView>();
  readonly tab = input<ResultsTab>( 'report' );
  readonly viewerId = input( '' );
  readonly people = input<Record<string, Person>>( {} );
  readonly tabChange = output<ResultsTab>();
  readonly closed = output<void>();

  readonly shown = signal( false );
  readonly evidenceOpen = signal<Record<string, boolean>>( {} );
  readonly stepsOpen = signal( false );
  readonly copied = signal( false );

  readonly finished = computed( () => {
    const at = this.mission().report?.finishedAt || this.mission().finishedAt;
    return at ? new Date( at ).toLocaleDateString( undefined, { month: 'short', day: 'numeric' } ) : '';
  } );

  ngOnInit (): void {
    // Slide in on the next frame, then take focus (design: 420ms from the right).
    requestAnimationFrame( () => {
      this.shown.set( true );
      ( this.host.nativeElement.querySelector( '.panel' ) as HTMLElement | null )?.focus();
    } );
  }

  @HostListener( 'document:keydown.escape' )
  close (): void {
    this.shown.set( false );
    setTimeout( () => this.closed.emit(), 300 );
  }

  /** Keeps Tab inside the panel while it's open. */
  @HostListener( 'keydown.tab', ['$event'] )
  trap ( event: Event ): void {
    const panel = this.host.nativeElement.querySelector( '.panel' ) as HTMLElement | null;
    if ( !panel ) return;
    const focusable = Array.from( panel.querySelectorAll<HTMLElement>( 'button:not([disabled]), a[href]' ) );
    if ( !focusable.length ) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const e = event as KeyboardEvent;
    if ( e.shiftKey && document.activeElement === first ) { last.focus(); e.preventDefault(); }
    else if ( !e.shiftKey && document.activeElement === last ) { first.focus(); e.preventDefault(); }
  }

  toggleEvidence ( id: string ): void {
    this.evidenceOpen.update( ( all ) => ( { ...all, [id]: !all[id] } ) );
  }

  pad ( n: number ): string {
    return String( n ).padStart( 2, '0' );
  }

  initial ( name: string ): string {
    return ( name.trim()[0] || '?' ).toUpperCase();
  }

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

  when ( iso: string ): string {
    return new Date( iso ).toLocaleString( undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } );
  }

  async copyLink (): Promise<void> {
    const url = new URL( window.location.href );
    url.searchParams.set( 'panel', this.tab() );
    try {
      await navigator.clipboard.writeText( url.toString() );
      this.copied.set( true );
      setTimeout( () => this.copied.set( false ), 2000 );
    } catch {
      window.prompt( 'Copy this link', url.toString() );
    }
  }

  /** The report as a clean page the browser saves as a PDF. */
  downloadPdf (): void {
    const r = this.mission().report;
    if ( !r ) return;
    const esc = ( value: unknown ) => String( value ?? '' ).replace( /[&<>"]/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string ) );
    const stats = ( r.stats || [] ).map( ( s ) => `<div class="s"><b>${esc( s.value )}</b><span>${esc( s.label )}</span></div>` ).join( '' );
    const next = ( r.next || [] ).map( ( n ) => `<li>${esc( n )}</li>` ).join( '' );
    const rows = r.rows.map( ( row ) => `<li><b>${esc( row.title )}</b> <span>${esc( this.byName( row ) )}${row.finishedAt ? ` · ${esc( this.when( row.finishedAt ) )}` : ''}</span><br>${esc( row.result )}</li>` ).join( '' );
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc( this.mission().title )} · Report</title><style>
      body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#0f1115;max-width:720px;margin:40px auto;padding:0 24px}
      .e{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#5a6170}h1{font-size:30px;letter-spacing:-.03em;margin:8px 0 24px}
      .g{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.s{background:#f2f3f6;border-radius:14px;padding:14px}.s b{display:block;font-size:26px}.s span{font-size:12px;color:#5a6170}
      h2{font-size:17px;margin:28px 0 10px}li{margin:6px 0;font-size:14px;line-height:1.45}li span{color:#5a6170;font-size:12px}
    </style></head><body><div class="e">${esc( this.mission().title )} · Mission report</div><h1>${esc( r.outcome || r.headline )}</h1>
      <div class="g">${stats}</div>${next ? `<h2>What’s next</h2><ol>${next}</ol>` : ''}
      ${r.kept?.length ? `<h2>Kept (${r.kept.length} of ${r.candidateCount})</h2><p>${r.kept.map( esc ).join( ', ' )}</p>` : ''}
      <h2>Every step</h2><ol>${rows}</ol></body></html>`;
    const win = window.open( '', '_blank' );
    if ( !win ) return;
    win.document.write( html );
    win.document.close();
    win.focus();
    setTimeout( () => win.print(), 300 );
  }
}
