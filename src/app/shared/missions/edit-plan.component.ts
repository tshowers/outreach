import { ChangeDetectionStrategy, Component, inject, input, output, signal, OnInit } from '@angular/core';

import { MissionsApiService } from './missions-api.service';
import { KIND_LABEL, MissionView, Person, StepKind, StepView, Who, nameOf, whoOf } from './missions.model';
import { OwnerTokenComponent } from './owner-token.component';

interface DraftStep {
  step: StepView;
  deleted: boolean;
  menu: boolean;
}

/**
 * Edit plan (design 4a): reorder, change who does a step, delete (with
 * Undo), add a step. The server checks every change; saving waits until
 * the plan is valid, and each problem says how to fix it. Approvals, tasks
 * and decisions need a person; a person taking a tool step makes it a task.
 * Synced from taliferro-ui/missions.
 */
@Component( {
  selector: 'tm-edit-plan',
  standalone: true,
  imports: [OwnerTokenComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="edit" data-cy="edit-plan">
      <header>
        <div>
          <span class="kicker">Edit plan</span>
          <h2>{{ mission().title }}</h2>
        </div>
        <div class="actions">
          <button type="button" class="btn" (click)="cancelled.emit()" data-cy="edit-cancel">Cancel</button>
          <button type="button" class="btn primary" [disabled]="errors().length || saving() || checking()" (click)="save()" data-cy="edit-save">
            {{ errors().length ? 'Fix ' + errors().length + ' problem' + (errors().length === 1 ? '' : 's') + ' to save' : saving() ? 'Saving…' : 'Save plan' }}
          </button>
        </div>
      </header>

      @if (errors().length) {
        <div class="errors" data-cy="edit-errors">
          @for (e of errors(); track e) { <p>{{ e }}</p> }
          @if (lastDeleted(); as d) {
            <div class="fixes"><button type="button" class="btn small" (click)="restore(d)" data-cy="edit-put-back">Put step {{ d.step.number }} back</button></div>
          }
        </div>
      }

      <ol class="rows">
        @for (d of drafts(); track d.step.id; let i = $index) {
          <li class="row" [class.deleted]="d.deleted" [class.bad]="hasError(d)" [attr.data-cy]="'edit-row-' + d.step.id">
            <span class="handle">
              <button type="button" (click)="move(i, -1)" [disabled]="i === 0 || locked(d)" aria-label="Move up">▲</button>
              <button type="button" (click)="move(i, 1)" [disabled]="i === drafts().length - 1 || locked(d)" aria-label="Move down">▼</button>
            </span>
            <span class="num">{{ i + 1 }}</span>
            <input class="title" [value]="d.step.title" (change)="rename(d, $any($event.target).value)" [disabled]="d.deleted || locked(d)" [attr.aria-label]="'Step ' + (i + 1) + ' title'">
            <span class="kind">{{ kindLabel(d.step.kind) }}{{ d.step.branch ? ' · ' + d.step.branch.if : '' }}</span>
            <span class="owner-wrap">
              <button type="button" class="owner" (click)="toggleMenu(d)" [disabled]="d.deleted || locked(d)" [attr.data-cy]="'edit-owner-' + d.step.id">
                <tm-owner-token [who]="who(d.step)" [size]="22" [people]="people()" /> {{ ownerName(d.step) }} ▾
              </button>
              @if (d.menu) {
                <div class="menu" role="menu" data-cy="edit-owner-menu">
                  @for (o of ownerOptions(d.step); track o.id) {
                    <button type="button" role="menuitem" [disabled]="o.disabled" (click)="setOwner(d, o.id)" [attr.data-cy]="'owner-option-' + o.id">
                      <tm-owner-token [who]="o.who" [size]="22" [people]="people()" />
                      <span>{{ o.name }}@if (o.note) { <small>{{ o.note }}</small> }</span>
                      @if (o.current) { <span class="tick">✓</span> }
                    </button>
                  }
                </div>
              }
            </span>
            @if (d.deleted) {
              <button type="button" class="undo" (click)="restore(d)" data-cy="edit-undo">Undo</button>
            } @else {
              <button type="button" class="del" (click)="remove(d)" [disabled]="locked(d)" aria-label="Delete step" [attr.data-cy]="'edit-delete-' + d.step.id">×</button>
            }
            @if (rowError(d); as msg) { <span class="row-error">{{ msg }}</span> }
          </li>
        }
      </ol>
      <div class="adds">
        <button type="button" class="dashed" (click)="addStep()" data-cy="edit-add-step">+ Add a step</button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .edit { display: flex; flex-direction: column; gap: 16px; }
    header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .kicker { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    h2 { margin: 4px 0 0; font-size: 28px; font-weight: 700; letter-spacing: -0.03em; }
    .actions { display: flex; gap: 8px; }
    .btn { height: 44px; padding: 0 20px; border-radius: 999px; border: 0; background: var(--surface); color: var(--text); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
    .btn.primary { background: var(--blue); color: #fff; }
    .btn.small { height: 36px; padding: 0 14px; background: var(--bg); }
    .btn:disabled { opacity: .45; cursor: default; }
    .errors { background: var(--t-red); color: var(--t-red-fg); border-radius: 18px; padding: 14px 16px; font-size: 14px; font-weight: 600; display: flex; flex-direction: column; gap: 6px; }
    .errors p { margin: 0; }
    .fixes { display: flex; gap: 8px; margin-top: 4px; }
    .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .row { display: grid; grid-template-columns: 28px 26px minmax(0, 1fr) auto auto 32px; align-items: center; gap: 10px; background: var(--surface); border-radius: 18px; padding: 10px 12px; }
    .row.deleted { background: transparent; box-shadow: inset 0 0 0 2px var(--surface2); border: 0; }
    .row.deleted .title { text-decoration: line-through; color: var(--muted); }
    .row.bad { box-shadow: inset 0 0 0 2px var(--red); }
    .handle { display: flex; flex-direction: column; }
    .handle button { border: 0; background: none; color: var(--muted); font-size: 10px; line-height: 1; cursor: pointer; padding: 2px; }
    .num { width: 26px; height: 26px; border-radius: 50%; background: var(--bg); font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
    .title { min-width: 0; border: 0; background: transparent; font: inherit; font-size: 15px; font-weight: 700; color: var(--text); padding: 6px 4px; border-radius: 8px; }
    .title:focus { outline: 2px solid var(--blue); }
    .kind { font-size: 12px; font-weight: 700; color: var(--muted); white-space: nowrap; }
    .owner-wrap { position: relative; }
    .owner { height: 34px; padding: 0 12px 0 6px; border-radius: 999px; border: 0; background: var(--bg); color: var(--text); font: inherit; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .menu { position: absolute; right: 0; top: 40px; z-index: 5; min-width: 260px; background: var(--bg); border-radius: 18px; box-shadow: var(--shadow); padding: 6px; display: flex; flex-direction: column; }
    .menu button { display: flex; align-items: center; gap: 10px; border: 0; background: none; color: var(--text); font: inherit; font-size: 14px; text-align: left; padding: 8px 10px; border-radius: 12px; cursor: pointer; }
    .menu button:hover:not(:disabled) { background: var(--surface); }
    .menu button:disabled { opacity: .45; cursor: default; }
    .menu small { display: block; font-size: 12px; color: var(--muted); }
    .tick { margin-left: auto; font-weight: 700; }
    .del, .undo { border: 0; background: none; color: var(--muted); font: inherit; font-weight: 700; cursor: pointer; }
    .del { font-size: 20px; }
    .undo { color: var(--blue-ink); font-size: 13px; }
    .row-error { grid-column: 3 / -1; font-size: 13px; font-weight: 600; color: var(--t-red-fg); }
    .adds { display: flex; gap: 8px; }
    .dashed { height: 40px; padding: 0 18px; border-radius: 999px; border: 2px dashed var(--surface2); background: none; color: var(--text); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
    @media (max-width: 640px) {
      .row { grid-template-columns: 28px 26px minmax(0, 1fr) 32px; }
      .kind { display: none; }
      .owner-wrap { grid-column: 3 / 4; }
    }
  `],
} )
export class EditPlanComponent implements OnInit {
  private readonly api = inject( MissionsApiService );

  readonly mission = input.required<MissionView>();
  readonly viewerId = input( '' );
  readonly people = input<Record<string, Person>>( {} );
  readonly saved = output<MissionView>();
  readonly cancelled = output<void>();

  readonly drafts = signal<DraftStep[]>( [] );
  readonly errors = signal<string[]>( [] );
  readonly checking = signal( false );
  readonly saving = signal( false );
  readonly lastDeleted = signal<DraftStep | null>( null );
  private checkTimer: ReturnType<typeof setTimeout> | null = null;
  private added = 0;

  ngOnInit (): void {
    this.drafts.set( this.mission().steps.filter( ( s ) => s.tool !== 'todd.report' ).map( ( step ) => ( { step: { ...step }, deleted: false, menu: false } ) ) );
  }

  /** Steps that already ran (or are running) can't be changed: an edit changes what's ahead. */
  locked ( d: DraftStep ): boolean {
    return d.step.status !== 'pending';
  }

  kindLabel ( kind: StepKind ): string {
    return KIND_LABEL[kind];
  }

  who ( step: StepView ): Who {
    return whoOf( step.holder, this.viewerId() );
  }

  ownerName ( step: StepView ): string {
    return nameOf( this.who( step ), this.people() );
  }

  ownerOptions ( step: StepView ) {
    const personKind = step.kind === 'approval' || step.kind === 'task' || step.kind === 'decision';
    const current = this.who( step );
    const people = [
      { id: this.viewerId(), who: 'you' as Who, name: 'You', note: this.mission().isOwner ? 'Mission owner' : '', disabled: false },
      ...Object.values( this.people() ).filter( ( p ) => !p.left && p.id !== this.viewerId() ).map( ( p ) => ( { id: p.id, who: p.id as Who, name: p.name, note: '', disabled: false } ) ),
    ];
    const agents = ( step.tool ? [step.owner === 'maya' ? 'maya' : 'todd'] : ['todd', 'maya'] ).map( ( id ) => ( {
      id, who: id as Who, name: id === 'todd' ? 'TODD' : 'Maya', note: personKind ? 'Approvals need a person' : '', disabled: personKind,
    } ) );
    return [...people, ...agents].map( ( o ) => ( { ...o, current: o.who === current } ) );
  }

  toggleMenu ( d: DraftStep ): void {
    this.drafts.update( ( list ) => list.map( ( x ) => ( { ...x, menu: x === d ? !x.menu : false } ) ) );
  }

  setOwner ( d: DraftStep, id: string ): void {
    this.update( d, ( step ) => {
      if ( id === 'todd' || id === 'maya' ) {
        return { ...step, owner: id, assigneeId: '', holder: { owner: id, assigneeId: '' } };
      }
      // A person taking a tool step makes it their task.
      const kind = step.kind === 'tool' || step.kind === 'wait' ? 'task' : step.kind;
      return { ...step, owner: 'person', kind, tool: kind === 'task' && step.tool ? '' : step.tool, assigneeId: id, holder: { owner: 'person', assigneeId: id } };
    } );
  }

  rename ( d: DraftStep, title: string ): void {
    this.update( d, ( step ) => ( { ...step, title: title.trim() || step.title } ) );
  }

  move ( index: number, by: number ): void {
    const list = [...this.drafts()];
    const [item] = list.splice( index, 1 );
    list.splice( index + by, 0, item );
    this.drafts.set( list );
    this.check();
  }

  remove ( d: DraftStep ): void {
    this.lastDeleted.set( d );
    this.drafts.update( ( list ) => list.map( ( x ) => ( x === d ? { ...x, deleted: true, menu: false } : x ) ) );
    this.check();
  }

  restore ( d: DraftStep ): void {
    this.drafts.update( ( list ) => list.map( ( x ) => ( x.step.id === d.step.id ? { ...x, deleted: false } : x ) ) );
    if ( this.lastDeleted() && this.lastDeleted()!.step.id === d.step.id ) this.lastDeleted.set( null );
    this.check();
  }

  addStep (): void {
    this.added += 1;
    const id = `added${this.added}`;
    const step = {
      ...this.mission().steps[0], id, number: 0, title: 'New step', detail: '', owner: 'person', kind: 'task', tool: '', product: '', effect: '',
      automated: false, status: 'pending', skipReason: '', when: '', branch: null, why: 'Added by hand.', doneWhen: '', options: [], minutes: 10,
      dependsOn: [], assigneeId: this.viewerId(), holder: { owner: 'person', assigneeId: this.viewerId() }, output: null, resultSummary: '',
      activeSince: null, waitUntil: null, finishedAt: null, finishedBy: null, handoff: null, timedOut: false, error: null, revisions: 0,
    } as StepView;
    const last = this.drafts().filter( ( x ) => !x.deleted ).pop();
    if ( last ) step.dependsOn = [last.step.id];
    this.drafts.update( ( list ) => [...list, { step, deleted: false, menu: false }] );
    this.check();
  }

  hasError ( d: DraftStep ): boolean {
    return Boolean( this.rowError( d ) );
  }

  rowError ( d: DraftStep ): string {
    if ( d.deleted ) return '';
    return this.errors().find( ( e ) => e.includes( `"${d.step.id}"` ) ) || '';
  }

  private update ( d: DraftStep, change: ( step: StepView ) => StepView ): void {
    this.drafts.update( ( list ) => list.map( ( x ) => ( x === d ? { ...x, step: change( x.step ), menu: false } : x ) ) );
    this.check();
  }

  /** The steps as the server reads them: deleted ones dropped, references to them dropped too. */
  private payload (): Partial<StepView>[] {
    const kept = this.drafts().filter( ( d ) => !d.deleted ).map( ( d ) => d.step );
    const report = this.mission().steps.filter( ( s ) => s.tool === 'todd.report' );
    return [...kept, ...report].map( ( step ) => ( {
      id: step.id, title: step.title, detail: step.detail, owner: step.owner, kind: step.kind, tool: step.tool,
      input: ( step as any ).input || {}, dependsOn: step.dependsOn, when: step.when, branch: step.branch, why: step.why,
      doneWhen: step.doneWhen, stuckAfter: ( step as any ).stuckAfter || '', onStuck: ( step as any ).onStuck || '',
      minutes: step.minutes || 0, options: step.options, assigneeId: step.assigneeId,
    } as any ) );
  }

  private check (): void {
    if ( this.checkTimer ) clearTimeout( this.checkTimer );
    this.checking.set( true );
    this.checkTimer = setTimeout( async () => {
      try {
        const result = await this.api.validate( this.mission().id, this.payload() );
        this.errors.set( result.errors );
      } catch {
        this.errors.set( ['TODD couldn’t check the plan. Try again.'] );
      } finally {
        this.checking.set( false );
      }
    }, 350 );
  }

  async save (): Promise<void> {
    this.saving.set( true );
    try {
      const mission = await this.api.savePlan( this.mission().id, this.payload() );
      this.saved.emit( mission );
    } catch ( error: any ) {
      this.errors.set( ( error && error.error && error.error.errors ) || [( error && error.error && error.error.message ) || 'It didn’t save.'] );
    } finally {
      this.saving.set( false );
    }
  }
}
