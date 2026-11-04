import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { MissionsApiService } from './missions-api.service';
import { ColumnView, KIND_LABEL, MissionView, Person, StepActionType, StepView, labelOf, leftUntil, lookOf, nameOf, whoOf } from './missions.model';
import { OwnerTokenComponent } from './owner-token.component';
import { paint } from './plan-strip.component';
import { ShortlistPicksStore } from './shortlist-picks.store';

/**
 * The step drawer (design 3a-3d, 10e): what a step does, why it's yours,
 * what it uses and what comes next, and the buttons for what you can do
 * with it. Desktop: a 480px side drawer. Phone: a bottom sheet.
 * Synced from taliferro-ui/missions.
 */
@Component( {
  selector: 'tm-step-drawer',
  standalone: true,
  imports: [OwnerTokenComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" (click)="closed.emit()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" [attr.aria-label]="step().title" data-cy="step-drawer">
      <span class="grabber"></span>
      <header>
        <div class="titles">
          <span class="kicker" data-cy="drawer-kicker">{{ kicker() }}</span>
          <h2>{{ step().title }}</h2>
        </div>
        <button type="button" class="close" (click)="closed.emit()" aria-label="Close">×</button>
      </header>

      <div class="who">
        <tm-owner-token [who]="who()" [size]="32" [label]="true" [people]="people()" />
        <span class="pill" [style.background]="colors().lbg" [style.color]="colors().lfg" data-cy="drawer-state">{{ stateLabel() }}</span>
      </div>

      @if (leftTeam(); as from) {
        <div class="box cyan" data-cy="owner-left">
          <b>{{ from }} left the team.</b> This step came to you as the Mission's owner.
        </div>
      }

      @if (showWhy()) {
        <div class="box" [class.red]="isFailure()" [class.pink]="!isFailure()" data-cy="drawer-why">
          <b>Why you:</b> {{ step().why }}
        </div>
      }

      @if (step().detail || step().doneWhen) {
        <section>
          <h3>What it does</h3>
          <p>{{ step().detail || step().doneWhen }}</p>
          @if (step().detail && step().doneWhen) { <p class="muted">Done when: {{ step().doneWhen }}</p> }
        </section>
      }

      @if (preview(); as p) {
        <section>
          <h3>{{ p.kind === 'email' ? 'The email' : 'What you’re approving' }}</h3>
          @if (p.kind === 'email') {
            <!-- The email itself, so an approval is never blind (Ty, 2026-11-03). -->
            <div class="email" data-cy="drawer-email">
              <div class="email-head">
                <span class="muted">Subject</span><b data-cy="drawer-email-subject">{{ emailCheck()?.subject || p.title }}</b>
                @if (p.preheader) { <span class="muted">{{ p.preheader }}</span> }
              </div>
              @if (emailHtml(); as html) {
                <iframe class="email-frame" sandbox="" [srcdoc]="html" title="The email" data-cy="drawer-email-body"></iframe>
              } @else if (emailLoading()) {
                <span class="muted pad">Loading the email…</span>
              } @else {
                <span class="band"></span>
                @if (p.note) { <span class="muted pad">{{ p.note }}</span> }
              }
              @if (emailCheck(); as c) {
                <!-- Checked before the yes: blanks nothing fills stop it (Ty, 2026-11-03). -->
                <div class="check" [class.bad]="!c.ok" data-cy="drawer-email-check">
                  @if (c.ok) {
                    <b>Ready to send to {{ c.recipients }} {{ c.recipients === 1 ? 'person' : 'people' }}.</b>
                  } @else {
                    <b>Not ready to send yet.</b>
                    @if (c.problem) { <span>{{ c.problem }}</span> }
                    @if (c.blanks.length) { <span data-cy="drawer-email-blanks">Nothing fills these in: @for (b of c.blanks; track b.token) { <code>{{ '{{' + b.token + '}}' }}</code> } Fill them in or remove them.</span> }
                    @if (c.broken) { <span>It has broken characters (a box where an apostrophe should be).</span> }
                  }
                  @for (s of c.skipped; track s.token) {
                    <span class="muted" data-cy="drawer-email-skipped">{{ s.count }} of {{ c.recipients }} have no {{ s.label.toLowerCase() }}, so they’ll be skipped (like {{ s.examples.join(', ') }}).</span>
                  }
                  <!-- Always there, so you can tweak an email that's ready too (Ty, 2026-11-03). -->
                  <a class="btn small" [href]="docsEditUrl(c.documentId)" target="_blank" rel="noopener" data-cy="drawer-open-docs">{{ c.ok ? 'Edit the email in Docs ↗' : 'Open the email in Docs ↗' }}</a><span class="muted">Save it there, then come back; this updates when you return.</span>
                </div>
              } @else if (p.fillIns.length) { <span class="muted pad" data-cy="drawer-email-fillins">Still needs: {{ p.fillIns.join(', ') }}</span> }
            </div>
          } @else if (p.kind === 'image') {
            <img class="img" [src]="p.src" alt="">
          } @else {
            <span class="doc"><span class="tag">Docs</span>{{ p.title }} ↗</span>
          }
        </section>
      }

      @if (uses().length) {
        <section>
          <h3>Uses</h3>
          <div class="chips">@for (u of uses(); track u.id) { <span class="chip">{{ u.number }} · {{ u.title }}</span> }</div>
        </section>
      }

      @if (then().length) {
        <section>
          <h3>Then</h3>
          <ul class="then">@for (t of then(); track t.id) { <li>{{ t.title }}@if (t.branch) { <span class="muted"> ({{ t.branch.if }})</span> }</li> }</ul>
        </section>
      }

      @if (history().length) {
        <section>
          <h3>History</h3>
          <ul class="history">
            @for (h of history(); track $index) {
              <li><span class="time">{{ h.time }}</span><tm-owner-token [who]="h.who" [size]="22" [people]="people()" /><span>{{ h.text }}</span></li>
            }
          </ul>
        </section>
      }

      @if (actionable()) {
        @if (noteOpen() || needsNote()) {
          <label class="note">
            <span>{{ notePrompt() }}</span>
            <textarea rows="3" [value]="note()" (input)="note.set($any($event.target).value)" data-cy="drawer-note"></textarea>
            @if (step().kind === 'approval') { <span class="muted">{{ revisable() ? 'The Marketing Assistant revises once and sends it back to you.' : 'It won’t go out.' }}</span> }
            @if (mode() === 'task') { <span class="muted">Paste a list, or attach a file. Anything longer than a quick note is saved to your Docs, and the next steps use it.</span> }
          </label>
        }
        @if (shortlist().length) {
          <section class="picks" data-cy="drawer-shortlist">
            <p>Keep or drop each one in the list on the page; this uses what you chose there.</p>
            @if (keptNames()) { <p class="muted" data-cy="drawer-kept-names">Kept: {{ keptNames() }}</p> } @else { <p class="muted">None kept yet.</p> }
          </section>
        }
        @for (r of recipients(); track r.stepId) {
          <section class="recipients" data-cy="drawer-recipients">
            <h3>{{ r.title }}: {{ r.pending ? 'the list isn’t ready yet' : r.count + (r.count === 1 ? ' person' : ' people') }}</h3>
            <ul>
              @for (p of r.people; track p.email) {
                <li>{{ p.name || p.email }}@if (p.name) { <span class="muted"> {{ p.email }}</span> }@if (p.company) { <span class="muted"> · {{ p.company }}</span> }</li>
              }
            </ul>
            @if (r.count > r.people.length) { <span class="muted">and {{ r.count - r.people.length }} more</span> }
          </section>
        }
        @if (mode() === 'task') {
          <div class="attach">
            @if (attachment(); as file) {
              <span class="chip" data-cy="drawer-attachment">{{ file.name }}</span>
              <button type="button" class="btn" (click)="attachment.set(null)" [disabled]="busy()">Remove</button>
            } @else {
              <label class="btn" data-cy="drawer-attach">Attach a file<input type="file" accept=".txt,.csv,.tsv,.md,text/plain,text/csv" (change)="attach($event)" hidden></label>
            }
          </div>
        }
        @if (reassigning()) {
          <label class="note">
            <span>Give it to</span>
            <select (change)="reassignTo.set($any($event.target).value)" data-cy="drawer-reassign-select">
              <option value="">Choose a teammate</option>
              @for (p of teammates(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
            </select>
          </label>
        }
        @if (error()) { <p class="error" data-cy="drawer-error">{{ error() }}</p> }

        <footer>
          @switch (mode()) {
            @case ('approval') {
              @if (teammates().length) { <button type="button" class="btn" (click)="toggleReassign()" data-cy="drawer-reassign">Reassign</button> }
              @if (noteOpen()) {
                <button type="button" class="btn" (click)="act('reject')" [disabled]="busy() || !note().trim()" data-cy="drawer-send-back">Send back with the note</button>
              } @else {
                <button type="button" class="btn" (click)="noteOpen.set(true)" data-cy="drawer-reject">Reject with a note</button>
              }
              <button type="button" class="btn primary" (click)="act('approve')" [disabled]="busy() || emailNotReady()" data-cy="drawer-approve">Approve</button>
            }
            @case ('decision') {
              @if (shortlist().length) {
                <button type="button" class="btn" (click)="closed.emit()" data-cy="drawer-back-to-list">Back to the list</button>
                <button type="button" class="btn primary" (click)="act('answer', keptNames())" [disabled]="busy() || !keptCount()" data-cy="drawer-continue-kept">Continue with {{ keptCount() }} kept</button>
              } @else if (choices().length) {
                @for (o of choices(); track o) {
                  <button type="button" class="btn option" (click)="act('answer', o)" [disabled]="busy()" data-cy="drawer-option">{{ o }}</button>
                }
              } @else {
                <button type="button" class="btn primary" (click)="act('answer', note())" [disabled]="busy() || !note().trim()" data-cy="drawer-answer">Answer</button>
              }
            }
            @case ('wait') {
              <button type="button" class="btn" (click)="outcome('bounced')" [disabled]="busy()" data-cy="drawer-bounced">It bounced</button>
              <button type="button" class="btn" (click)="outcome('no_reply')" [disabled]="busy()" data-cy="drawer-no-reply">No reply</button>
              <button type="button" class="btn primary" (click)="outcome('replied')" [disabled]="busy()" data-cy="drawer-replied">They replied</button>
            }
            @default {
              @if (teammates().length) { <button type="button" class="btn" (click)="toggleReassign()" data-cy="drawer-reassign">Reassign</button> }
              @if (step().handoff) { <button type="button" class="btn" (click)="act('without')" [disabled]="busy()" data-cy="drawer-without">{{ withoutLabel() }}</button> }
              <button type="button" class="btn primary" (click)="act('complete', note())" [disabled]="busy()" data-cy="drawer-done">Mark done</button>
            }
          }
          @if (reassigning() && reassignTo()) {
            <button type="button" class="btn primary" (click)="act('reassign', reassignTo())" [disabled]="busy()" data-cy="drawer-reassign-confirm">Give it to {{ nameOf(reassignTo()) }}</button>
          }
        </footer>
      }
    </aside>
  `,
  styles: [`
    /* A modal: above every app's sidebar (10002) and the assistant (10011). */
    :host { position: fixed; inset: 0; z-index: 10020; display: block; }
    .scrim { position: absolute; inset: 0; background: rgba(15, 17, 21, .32); }
    .drawer { position: absolute; top: 0; right: 0; bottom: 0; width: 480px; max-width: 100%; background: var(--bg); color: var(--text); box-shadow: var(--shadow); overflow-y: auto; padding: 22px 24px 0; display: flex; flex-direction: column; gap: 18px; font-family: var(--font); }
    .grabber { display: none; }
    header { display: flex; align-items: flex-start; gap: 12px; }
    .titles { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    .kicker { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    h2 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.15; }
    .close { flex: none; width: 36px; height: 36px; border-radius: 50%; border: 0; background: var(--surface); color: var(--text); font-size: 22px; cursor: pointer; }
    .who { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .pill { height: 28px; padding: 0 12px; border-radius: 999px; font-size: 13px; font-weight: 700; display: flex; align-items: center; }
    .box { border-radius: 18px; padding: 14px 16px; font-size: 14px; line-height: 1.45; }
    .pink { background: var(--t-pink); color: var(--t-pink-fg); }
    .red { background: var(--t-red); color: var(--t-red-fg); }
    .cyan { background: var(--t-cyan); color: var(--t-cyan-fg); }
    section { display: flex; flex-direction: column; gap: 8px; }
    h3 { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
    p { margin: 0; font-size: 15px; line-height: 1.5; }
    .muted { color: var(--muted); font-size: 13px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { height: 30px; padding: 0 12px; border-radius: 999px; background: var(--surface); font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; }
    .then, .history { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
    .then li::before { content: "→ "; color: var(--muted); }
    .history li { display: grid; grid-template-columns: 82px 22px 1fr; gap: 10px; align-items: center; }
    .time { font-size: 12px; color: var(--muted); }
    .email { border-radius: 16px; background: var(--surface); overflow: hidden; display: flex; flex-direction: column; }
    .email .band { height: 56px; background: var(--t-violet); }
    .email-head { padding: 10px 14px 10px; display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
    .email-frame { display: block; width: 100%; height: 420px; border: 0; background: #fff; }
    .email .pad { padding: 8px 14px 12px; font-size: 13px; }
    .check { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; font-size: 13px; background: var(--surface2); }
    .check.bad { background: var(--t-red); color: var(--t-red-fg); }
    .check.bad .muted { color: inherit; opacity: .8; }
    .check code { font-size: 12px; margin-right: 4px; }
    .check .btn.small { align-self: flex-start; height: 34px; padding: 0 12px; font-size: 13px; display: inline-flex; align-items: center; text-decoration: none; }
    .img { width: 100%; max-height: 220px; border-radius: 14px; object-fit: cover; background: var(--t-violet); }
    .doc { align-self: flex-start; height: 32px; padding: 0 12px; border-radius: 999px; background: var(--surface); font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; }
    .tag { height: 20px; padding: 0 7px; border-radius: 999px; background: var(--bg); font-size: 11px; display: flex; align-items: center; }
    .note { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 700; }
    .attach { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .picks, .recipients { display: flex; flex-direction: column; gap: 6px; }
    .picks p { margin: 0; font-size: 14px; }
    .recipients ul { margin: 0; padding-left: 18px; font-size: 14px; max-height: 260px; overflow: auto; }
    label.btn { display: inline-flex; align-items: center; }
    textarea, select { font: inherit; font-weight: 400; font-size: 15px; color: var(--text); background: var(--bg); border-radius: 14px; border: 0; box-shadow: inset 0 0 0 2px var(--blue); padding: 10px 12px; }
    select { box-shadow: inset 0 0 0 2px var(--surface2); height: 44px; }
    .error { color: var(--t-red-fg); font-size: 14px; font-weight: 600; }
    footer { position: sticky; bottom: 0; margin: auto -24px 0; padding: 14px 24px 18px; background: var(--surface); display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .btn { height: 44px; padding: 0 20px; border-radius: 999px; border: 0; background: var(--bg); color: var(--text); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
    .btn.primary { background: var(--blue); color: #fff; }
    .btn.option { flex: 1 1 100%; text-align: left; height: auto; min-height: 44px; padding: 10px 18px; border-radius: 18px; }
    .btn:disabled { opacity: .5; cursor: default; }
    @media (max-width: 640px) {
      .drawer { top: auto; left: 0; width: auto; max-height: 88vh; border-radius: 24px 24px 0 0; padding: 10px 20px 0; }
      .grabber { display: block; align-self: center; width: 44px; height: 5px; border-radius: 5px; background: var(--surface2); }
      footer { margin: auto -20px 0; padding: 12px 20px 18px; }
    }
  `],
} )
export class StepDrawerComponent {
  private readonly api = inject( MissionsApiService );
  private readonly picks = inject( ShortlistPicksStore );
  private readonly sanitizer = inject( DomSanitizer );

  readonly mission = input.required<MissionView>();
  readonly column = input.required<ColumnView>();
  readonly viewerId = input( '' );
  readonly people = input<Record<string, Person>>( {} );
  readonly closed = output<void>();
  readonly acted = output<{ stepId: string; type: StepActionType }>();

  readonly note = signal( '' );
  readonly noteOpen = signal( false );
  readonly reassigning = signal( false );
  readonly reassignTo = signal( '' );
  readonly busy = signal( false );
  readonly error = signal( '' );

  /** The step this drawer is about: the column's own step, or the live step on a branch path. */
  readonly step = computed<StepView>( () => {
    const column = this.column();
    const steps = this.mission().steps;
    const live = column.stepIds.map( ( id ) => steps.find( ( s ) => s.id === id )! ).find( ( s ) => s && s.status === 'active' );
    // Always the step as it is now, not as it was when the drawer opened: a
    // refresh that finishes it must not leave stale buttons on screen.
    return live || steps.find( ( s ) => s.id === ( column.step ? column.step.id : column.stepIds[0] ) ) || column.step!;
  } );

  readonly who = computed( () => whoOf( this.step().holder, this.viewerId() ) );
  readonly look = computed( () => lookOf( this.step() ) );
  readonly colors = computed( () => paint( this.look(), this.who() ) );
  readonly isFailure = computed( () => this.look() === 'fail' );
  readonly stateLabel = computed( () => labelOf( this.look(), this.who(), this.people(), this.look() === 'wait' ? leftUntil( this.step().waitUntil ) : '', this.step().handoff ? this.who() : null ) );

  readonly kicker = computed( () => {
    const step = this.step();
    const total = this.mission().steps.length;
    const kind = step.handoff && step.handoff.code !== 'not_wired' ? `${KIND_LABEL.task}, was ${KIND_LABEL[step.kind].toLowerCase()}` : KIND_LABEL[step.kind];
    return `Step ${step.number} of ${total} · ${kind}`;
  } );

  readonly mine = computed( () => {
    const step = this.step();
    return step.holder.assigneeId === this.viewerId() || this.mission().isOwner;
  } );

  readonly actionable = computed( () => {
    const step = this.step();
    if ( step.status !== 'active' || !this.mine() ) return false;
    return Boolean( step.handoff ) || step.owner === 'person';
  } );

  readonly mode = computed( () => {
    const step = this.step();
    if ( step.kind === 'approval' ) return 'approval';
    if ( step.kind === 'decision' ) return 'decision';
    if ( step.kind === 'wait' && step.handoff ) return 'wait';
    return 'task';
  } );

  readonly showWhy = computed( () => Boolean( this.step().why ) && this.step().status === 'active' && ( this.step().owner === 'person' || Boolean( this.step().handoff ) ) );
  /** A decision's choices: its own options, else the candidates the step before it found ("which Roland Martin?"). */
  readonly choices = computed<string[]>( () => {
    if ( this.step().options.length ) return this.step().options;
    const source = this.uses().find( ( s ) => s.output && Array.isArray( s.output['candidates'] ) && s.output['candidates'].length );
    return source ? ( source.output!['candidates'] as any[] ).map( ( c ) => `${c.name}${c.title || c.company ? ` · ${[c.title, c.company].filter( Boolean ).join( ', ' )}` : ''}` ) : [];
  } );
  // A task always offers the box: what the person hands over is often what the next steps need (Ty, 2026-11-03).
  /** A pick from a shortlist: the ranked candidates to keep or drop, never a typed answer (Ty, 2026-11-03). */
  readonly shortlist = computed<{ id: string; name: string; why: string; fit: string }[]>( () => {
    if ( this.mode() !== 'decision' ) return [];
    const source = this.uses().find( ( s ) => s.tool === 'todd.shortlist' && s.output && Array.isArray( s.output['items'] ) );
    return source ? ( source.output!['items'] as any[] ).filter( ( item ) => item && item.name ).map( ( item ) => ( { id: String( item.id || item.name ), name: String( item.name ), why: String( item.why || '' ), fit: String( item.fit || '' ) } ) ) : [];
  } );
  /** What you kept in the list on the mission page: one place to choose (Ty, 2026-11-03). */
  private readonly keptItems = computed( () => {
    const picks = this.picks.picksFor( this.mission().id, this.step().id );
    return this.shortlist().filter( ( item ) => picks[item.id] === 'keep' );
  } );
  readonly keptCount = computed( () => this.keptItems().length );
  readonly keptNames = computed( () => this.keptItems().map( ( item ) => item.name ).join( ', ' ) );
  /** For an approval that sends an email: the server's check of it (blanks, who'd be skipped). */
  readonly emailCheck = computed<{ ok: boolean; documentId: string; subject?: string; recipients: number; problem?: string; broken: boolean; blanks: { token: string; label: string }[]; skipped: { token: string; label: string; count: number; examples: string[] }[] } | null>( () => ( this.step() as any ).emailCheck || null );
  readonly emailNotReady = computed( () => Boolean( this.emailCheck() && !this.emailCheck()!.ok ) );

  docsEditUrl ( documentId: string ): string {
    return `https://docs.16ahead.com/docs/editor/${encodeURIComponent( documentId )}`;
  }

  /** For an approval: who each send right after it goes to (the server's preview). */
  readonly recipients = computed<{ stepId: string; title: string; count: number; pending: boolean; people: { email: string; name: string; company: string }[] }[]>( () => ( this.step() as any ).recipients || [] );
  readonly needsNote = computed( () => ( this.mode() === 'decision' && !this.choices().length && !this.shortlist().length ) || this.mode() === 'task' );
  readonly notePrompt = computed( () => ( this.mode() === 'approval' ? 'What should change?' : this.mode() === 'decision' ? 'Your answer' : 'Add a note or paste a list (optional)' ) );
  /** A text file the person attaches to a task; the server saves it to their Docs. */
  readonly attachment = signal<{ name: string; text: string } | null>( null );
  readonly withoutLabel = computed( () => ( this.step().tool === 'image.obtain' ? 'Design without it' : 'Go ahead without it' ) );

  readonly revisable = computed( () => this.step().dependsOn.some( ( id ) => {
    const dep = this.mission().steps.find( ( s ) => s.id === id );
    return dep && ( dep.owner === 'maya' || dep.owner === 'todd' ) && dep.effect === 'create';
  } ) && !this.step().revisions );

  /** Design 10e: the name of the teammate who left, when that's how this step came to you. */
  readonly leftTeam = computed( () => {
    const moved = this.step().reassigned;
    return moved && moved.reason === 'left_team' ? nameOf( moved.from, this.people() ) : '';
  } );

  readonly teammates = computed( () => Object.values( this.people() ).filter( ( p ) => !p.left && p.id !== this.viewerId() ) );

  readonly uses = computed( () => this.step().dependsOn.map( ( id ) => this.mission().steps.find( ( s ) => s.id === id ) ).filter( ( s ): s is StepView => Boolean( s ) ) );
  readonly then = computed( () => this.mission().steps.filter( ( s ) => s.dependsOn.includes( this.step().id ) && s.status !== 'skipped' ) );

  /**
   * What a person is approving or deciding on: the output of a step this one
   * depends on. An approval shows the email it sends when there is one, not
   * whichever input finished last (Ty, 2026-11-03: it showed the attached CSV
   * and never the email); the recipient lists show below.
   */
  readonly preview = computed<{ kind: 'email' | 'image' | 'doc'; title: string; note: string; src: string; preheader: string; fillIns: string[]; documentId: string } | null>( () => {
    const step = this.step();
    if ( step.kind !== 'approval' && !( step.status === 'done' && step.output ) ) return null;
    const done = this.uses().filter( ( s ) => s.status === 'done' && s.output );
    const isEmail = ( s: StepView ) => s.tool === 'email.create' || Boolean( s.output && s.output['subject'] );
    const source = step.kind === 'approval'
      ? done.filter( isEmail ).pop() || done.filter( ( s ) => s.tool === 'image.obtain' && s.output!['src'] ).pop() || done.pop()
      : step;
    const out = source && source.output;
    if ( !out ) return null;
    const base = { note: '', src: '', preheader: '', fillIns: [] as string[], documentId: String( out['documentId'] || '' ) };
    if ( isEmail( source! ) ) {
      return { ...base, kind: 'email', title: out['subject'] || source!.title, note: source!.resultSummary !== out['subject'] ? source!.resultSummary || '' : '', preheader: String( out['preheader'] || '' ), fillIns: Array.isArray( out['fillIns'] ) ? out['fillIns'].map( String ) : [] };
    }
    if ( source!.tool === 'image.obtain' && out['src'] ) return { ...base, kind: 'image', title: source!.title, src: out['src'] };
    if ( out['documentId'] ) return { ...base, kind: 'doc', title: out['title'] || source!.title };
    return null;
  } );

  /** The email's HTML from Docs, shown sandboxed (no scripts) in the drawer. */
  readonly emailHtml = signal<SafeHtml | null>( null );
  readonly emailLoading = signal( false );
  private emailFor = '';

  constructor () {
    effect( () => {
      const p = this.preview();
      const id = p && p.kind === 'email' ? p.documentId : '';
      if ( id === this.emailFor ) return;
      this.emailFor = id;
      this.emailHtml.set( null );
      if ( !id ) return;
      this.emailLoading.set( true );
      this.api.doc( id )
        .then( ( doc ) => {
          const html = doc && ( doc['htmlContent'] || doc['html'] );
          if ( this.emailFor === id && html ) this.emailHtml.set( this.sanitizer.bypassSecurityTrustHtml( String( html ) ) );
        } )
        .catch( () => null )
        .finally( () => { if ( this.emailFor === id ) this.emailLoading.set( false ); } );
    } );
  }

  readonly history = computed( () => {
    const step = this.step();
    const rows: { time: string; who: string; text: string }[] = [];
    const fmt = ( iso: string | null ) => ( iso ? new Date( iso ).toLocaleString( undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } ) : '' );
    if ( step.handoff ) rows.push( { time: fmt( step.handoff.at ), who: step.handoff.from === 'maya' ? 'maya' : 'todd', text: step.handoff.reason } );
    if ( step.activeSince ) rows.push( { time: fmt( step.activeSince ), who: this.who(), text: step.handoff ? 'Came to you' : step.owner === 'person' ? 'Waiting since' : 'Started' } );
    if ( step.revisions ) rows.push( { time: '', who: 'maya', text: `Revised ${step.revisions} time${step.revisions === 1 ? '' : 's'}` } );
    if ( step.finishedAt ) rows.push( { time: fmt( step.finishedAt ), who: step.finishedBy && step.finishedBy.type === 'person' ? whoOf( { owner: 'person', assigneeId: step.finishedBy.id || '' }, this.viewerId() ) : step.owner, text: step.resultSummary || ( step.status === 'skipped' ? 'Skipped' : 'Done' ) } );
    return rows;
  } );

  nameOf ( id: string ): string {
    return nameOf( id, this.people() );
  }

  toggleReassign (): void {
    this.reassigning.update( ( value ) => !value );
  }

  outcome ( outcome: 'replied' | 'no_reply' | 'bounced' ): void {
    void this.send( 'complete', this.note(), { outcome, replyText: outcome === 'replied' ? this.note() : '', opens: 0, clicks: 0 } );
  }

  async attach ( event: Event ): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if ( !file ) return;
    if ( file.size > 200 * 1024 ) {
      this.error.set( 'That file is over 200 KB. Attach a smaller one, or paste the part you need.' );
      return;
    }
    this.error.set( '' );
    this.attachment.set( { name: file.name, text: await file.text() } );
  }

  act ( type: StepActionType, value = '' ): void {
    void this.send( type, value );
  }

  private async send ( type: StepActionType, value = '', output?: Record<string, unknown> ): Promise<void> {
    this.busy.set( true );
    this.error.set( '' );
    try {
      const extra: { note?: string; value?: string; output?: Record<string, unknown>; attachment?: { name: string; text: string } } = {};
      if ( type === 'reject' || type === 'complete' ) extra.note = type === 'reject' ? this.note() : value;
      const file = this.attachment();
      if ( type === 'complete' && file ) extra.attachment = file;
      if ( type === 'answer' || type === 'reassign' ) extra.value = value;
      if ( output ) extra.output = output;
      await this.api.act( this.mission().id, this.step().id, type, extra );
      this.acted.emit( { stepId: this.step().id, type } );
      this.closed.emit();
    } catch ( error: any ) {
      this.error.set( ( error && error.error && error.error.message ) || 'That didn’t go through. Try again.' );
    } finally {
      this.busy.set( false );
    }
  }
}
