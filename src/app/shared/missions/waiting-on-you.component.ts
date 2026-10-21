import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';

import { MissionsApiService } from './missions-api.service';
import { KIND_LABEL, Person, StepActionType, WaitingItem } from './missions.model';
import { PlanStripComponent } from './plan-strip.component';

interface Done { label: string; undo: boolean }

/**
 * Waiting on you (design 6a, 10c): every step across every Mission that
 * needs you now, handled right here. Approve with Undo, reject with a note,
 * pick one of two people, finish a task. Synced from taliferro-ui/missions.
 */
@Component( {
  selector: 'tm-waiting-on-you',
  standalone: true,
  imports: [PlanStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="waiting" data-cy="waiting-on-you">
      <span class="kicker">{{ today }}</span>
      <h2>Waiting on you <span class="badge" [class.zero]="!remaining()" data-cy="waiting-count">{{ remaining() }}</span></h2>
      @if (loaded() && !items().length) {
        <div class="empty" data-cy="waiting-empty">
          <b>Nothing is waiting on you.</b>
          <p>{{ inFlightText() }}</p>
          @if (askLink()) { <a class="btn primary" [href]="askLink()">Ask TODD</a> }
        </div>
      } @else if (items().length) {
        <p class="sub">Across {{ missions() }} Mission{{ missions() === 1 ? '' : 's' }} · about {{ minutes() }} minute{{ minutes() === 1 ? '' : 's' }} in all</p>
        <ol class="cards">
          @for (item of items(); track item.missionId + item.step.id) {
            <li class="card" data-cy="waiting-item" [attr.data-kind]="item.step.kind">
              <div class="head">
                <span class="mission">{{ item.missionTitle }} · step {{ item.step.number }} of {{ item.stepsTotal }}</span>
                <span class="tag">{{ kind(item) }}</span>
              </div>
              <div class="strip"><tm-plan-strip [steps]="item.steps" mode="compact" [viewerId]="viewerId()" [people]="people()" /></div>
              <h3>{{ item.step.title }}</h3>

              @if (preview(item); as p) {
                <div class="preview" data-cy="waiting-preview"><span class="band"></span><div><b>{{ p.title }}</b>@if (p.text) { <span>{{ p.text }}</span> }</div></div>
              }
              @if (item.step.why && item.step.kind !== 'approval') { <p class="why">Why you: {{ item.step.why }}</p> }

              @if (done()[key(item)]; as d) {
                <div class="confirm" data-cy="waiting-done">{{ d.label }}@if (d.undo) { <button type="button" (click)="undo(item)" data-cy="waiting-undo">Undo</button> }</div>
              } @else {
                @if (noteFor() === key(item)) {
                  <textarea rows="3" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="What should change?" data-cy="waiting-note"></textarea>
                }
                <div class="actions">
                  @switch (item.step.kind) {
                    @case ('approval') {
                      @if (noteFor() === key(item)) {
                        <button type="button" class="btn" (click)="noteFor.set('')">Cancel</button>
                        <button type="button" class="btn primary" [disabled]="!note().trim()" (click)="act(item, 'reject')" data-cy="waiting-send-back">Send back to {{ sendBackTo(item) }}</button>
                      } @else {
                        <button type="button" class="btn" (click)="openNote(item)" data-cy="waiting-reject">Reject with a note</button>
                        <button type="button" class="btn primary" (click)="act(item, 'approve')" data-cy="waiting-approve">Approve</button>
                      }
                    }
                    @case ('decision') {
                      @for (o of options(item); track o) { <button type="button" class="btn option" (click)="act(item, 'answer', o)" data-cy="waiting-option">{{ o }}</button> }
                    }
                    @default {
                      <input [value]="note()" (input)="note.set($any($event.target).value)" placeholder="Add a note or a link" data-cy="waiting-task-note">
                      <button type="button" class="btn primary" (click)="act(item, 'complete')" data-cy="waiting-done-btn">Mark done</button>
                    }
                  }
                </div>
              }
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: [`
    :host { display: block; font-family: var(--font); color: var(--text); }
    .waiting { display: flex; flex-direction: column; gap: 12px; }
    .kicker { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
    h2 { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -0.03em; display: flex; align-items: center; gap: 10px; }
    .badge { min-width: 32px; height: 32px; padding: 0 10px; border-radius: 999px; background: var(--c-you); color: #fff; font-size: 16px; display: inline-flex; align-items: center; justify-content: center; }
    .badge.zero { background: var(--green); }
    .sub { margin: 0; color: var(--muted); font-size: 15px; }
    .cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .card { background: var(--surface); border-radius: 24px; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .mission { font-size: 13px; font-weight: 700; color: var(--muted); }
    .tag { height: 24px; padding: 0 10px; border-radius: 999px; background: var(--t-pink); color: var(--t-pink-fg); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; }
    .strip { max-width: 340px; }
    h3 { margin: 0; font-size: 19px; font-weight: 700; }
    .preview { border-radius: 16px; background: var(--bg); overflow: hidden; display: flex; flex-direction: column; max-width: 520px; }
    .preview .band { height: 40px; background: var(--t-violet); }
    .preview div { padding: 10px 14px 12px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
    .preview span { color: var(--muted); }
    .why { margin: 0; font-size: 14px; font-weight: 600; color: var(--t-pink-fg); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .actions input { flex: 1; min-width: 200px; height: 44px; border-radius: 999px; border: 0; background: var(--bg); padding: 0 16px; font: inherit; color: var(--text); }
    textarea { font: inherit; font-size: 15px; color: var(--text); background: var(--bg); border-radius: 14px; border: 0; box-shadow: inset 0 0 0 2px var(--blue); padding: 10px 12px; }
    .btn { height: 44px; padding: 0 20px; border-radius: 999px; border: 0; background: var(--bg); color: var(--text); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
    .btn.primary { background: var(--blue); color: #fff; }
    .btn.option { flex: 1 1 260px; justify-content: flex-start; }
    .btn:disabled { opacity: .5; }
    .confirm { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--t-green); color: var(--t-green-fg); border-radius: 16px; padding: 12px 14px; font-weight: 700; font-size: 14px; }
    .confirm button { border: 0; background: none; color: inherit; font: inherit; text-decoration: underline; cursor: pointer; }
    .empty { background: var(--surface); border-radius: 24px; padding: 22px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .empty b { font-size: 20px; }
    .empty p { margin: 0; color: var(--muted); }
  `],
} )
export class WaitingOnYouComponent implements OnInit {
  private readonly api = inject( MissionsApiService );

  readonly viewerId = input( '' );
  readonly people = input<Record<string, Person>>( {} );
  readonly askLink = input( '' );
  readonly inFlight = input<number | null>( null );

  readonly items = signal<WaitingItem[]>( [] );
  readonly missions = signal( 0 );
  readonly minutes = signal( 0 );
  readonly loaded = signal( false );
  readonly done = signal<Record<string, Done>>( {} );
  readonly noteFor = signal( '' );
  readonly note = signal( '' );
  readonly today = `Today · ${new Date().toLocaleDateString( undefined, { weekday: 'long', month: 'short', day: 'numeric' } )}`;
  private pendingUndo = new Map<string, ReturnType<typeof setTimeout>>();

  readonly remaining = computed( () => this.items().filter( ( item ) => !this.done()[this.key( item )] ).length );
  readonly inFlightText = computed( () => {
    const n = this.inFlight();
    return n ? `TODD and Maya have ${n} Mission${n === 1 ? '' : 's'} in flight. New steps for you show up here.` : 'New steps for you show up here.';
  } );

  ngOnInit (): void {
    void this.load();
  }

  async load (): Promise<void> {
    try {
      const res = await this.api.waiting();
      this.items.set( res.items );
      this.missions.set( res.missions );
      this.minutes.set( res.minutes );
    } finally {
      this.loaded.set( true );
    }
  }

  key ( item: WaitingItem ): string {
    return `${item.missionId}:${item.step.id}`;
  }

  /** A step handed to you is your task now, whatever it was planned as. */
  kind ( item: WaitingItem ): string {
    return item.step.handoff ? KIND_LABEL.task : KIND_LABEL[item.step.kind];
  }

  preview ( item: WaitingItem ) {
    const source = [...item.inputs].reverse().find( ( input ) => input.output && ( input.output['subject'] || input.output['documentId'] || input.output['summary'] ) );
    if ( !source || !source.output ) return null;
    const out = source.output;
    return { title: out['subject'] || out['title'] || source.title, text: out['summary'] && out['summary'] !== out['title'] ? String( out['summary'] ) : source.resultSummary !== ( out['subject'] || '' ) ? source.resultSummary : '' };
  }

  options ( item: WaitingItem ): string[] {
    if ( item.step.options.length ) return item.step.options;
    const source = item.inputs.find( ( input ) => input.output && Array.isArray( input.output['candidates'] ) );
    if ( source ) return ( source.output!['candidates'] as any[] ).map( ( c ) => `${c.name}${c.title || c.company ? ` · ${[c.title, c.company].filter( Boolean ).join( ', ' )}` : ''}` );
    return ['Yes', 'No'];
  }

  sendBackTo ( item: WaitingItem ): string {
    const source = item.inputs[item.inputs.length - 1];
    return source && source.tool && ( source.tool.startsWith( 'email.' ) || source.tool.startsWith( 'maya.' ) || source.tool.startsWith( 'image.' ) || source.tool.startsWith( 'social.' ) ) ? 'Maya' : 'TODD';
  }

  openNote ( item: WaitingItem ): void {
    this.note.set( '' );
    this.noteFor.set( this.key( item ) );
  }

  /** Approvals wait a few seconds before they're sent, so Undo really undoes. */
  act ( item: WaitingItem, type: StepActionType, value = '' ): void {
    const k = this.key( item );
    const note = this.note();
    if ( type === 'approve' ) {
      const sends = this.sendBackTo( item ) === 'Maya' ? 'TODD is sending it now.' : 'TODD is on it.';
      this.done.update( ( all ) => ( { ...all, [k]: { label: `Approved. ${sends}`, undo: true } } ) );
      this.pendingUndo.set( k, setTimeout( () => {
        this.pendingUndo.delete( k );
        void this.api.act( item.missionId, item.step.id, 'approve' );
      }, 5000 ) );
      return;
    }
    const label = type === 'reject' ? `Sent back to ${this.sendBackTo( item )}.` : type === 'answer' ? `Picked ${value.split( ' · ' )[0]}.` : 'Done.';
    this.done.update( ( all ) => ( { ...all, [k]: { label, undo: false } } ) );
    this.noteFor.set( '' );
    this.note.set( '' );
    void this.api.act( item.missionId, item.step.id, type, type === 'answer' ? { value } : { note } );
  }

  undo ( item: WaitingItem ): void {
    const k = this.key( item );
    const timer = this.pendingUndo.get( k );
    if ( timer ) clearTimeout( timer );
    this.pendingUndo.delete( k );
    this.done.update( ( all ) => {
      const next = { ...all };
      delete next[k];
      return next;
    } );
  }
}
