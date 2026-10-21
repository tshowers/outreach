import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';

import { MissionsApiService } from './missions-api.service';
import { PRODUCT_LABEL, Playbook, appOf } from './missions.model';
import { PlanStripComponent } from './plan-strip.component';

const APPS = ['network', 'find', 'outreach', 'maya', 'docs', 'pulse', 'moves'];

/**
 * Playbooks (design 14a): plans that worked, by what you want to do, with
 * the apps each one uses as a filter. "Use this" opens the plan reply,
 * planned for you. They're starting points: TODD still plans each request
 * from every product's tools. Synced from taliferro-ui/missions.
 */
@Component( {
  selector: 'tm-playbooks',
  standalone: true,
  imports: [PlanStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="playbooks" data-cy="playbooks">
      <nav class="cats" aria-label="What you want to do">
        <h2>Playbooks</h2>
        <span class="kicker">What you want to do</span>
        <button type="button" [class.on]="category() === ''" (click)="category.set('')" data-cy="cat-all">All playbooks <span>{{ playbooks().length }}</span></button>
        @for (c of categories(); track c.id) {
          <button type="button" [class.on]="category() === c.id" (click)="category.set(c.id)" [attr.data-cy]="'cat-' + c.id">{{ c.label }} <span>{{ countIn(c.id) }}</span></button>
        }
      </nav>
      <main>
        <h1 data-cy="playbooks-title">{{ title() }}</h1>
        <input class="search" type="search" placeholder="Search playbooks" [value]="query()" (input)="query.set($any($event.target).value)" data-cy="playbooks-search">
        <div class="apps">
          <button type="button" [class.on]="app() === ''" (click)="app.set('')" data-cy="app-all">All apps</button>
          @for (a of apps; track a) { <button type="button" [class.on]="app() === a" (click)="app.set(a)" [attr.data-cy]="'app-' + a">{{ label(a) }}</button> }
        </div>
        @if (!shown().length) {
          <p class="muted" data-cy="playbooks-empty">{{ app() ? 'No playbooks use ' + label(app()) + ' in this category.' : 'No playbooks match.' }}</p>
        }
        <div class="cards">
          @for (p of shown(); track p.id) {
            <article class="card" data-cy="playbook-card" [attr.data-id]="p.id">
              <span class="kicker">{{ appsLine(p) }}</span>
              <b>{{ p.title }}</b>
              <span class="desc">“{{ p.request }}”</span>
              <tm-plan-strip [steps]="p.steps" mode="compact" [viewerId]="viewerId()" />
              <span class="owners">{{ ownersLine(p) }}</span>
              <button type="button" class="btn primary" (click)="use.emit(p)" data-cy="playbook-use">Use this</button>
            </article>
          }
        </div>
      </main>
    </div>
  `,
  styles: [`
    :host { display: block; font-family: var(--font); color: var(--text); }
    .playbooks { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 24px; align-items: start; }
    .cats { background: var(--surface); border-radius: 24px; padding: 18px; display: flex; flex-direction: column; gap: 4px; position: sticky; top: 16px; }
    .cats h2 { margin: 0 0 10px; font-size: 20px; }
    .kicker { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
    .cats .kicker { margin-bottom: 6px; }
    .cats button { display: flex; justify-content: space-between; height: 38px; align-items: center; padding: 0 12px; border: 0; border-radius: 999px; background: none; color: var(--text); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; text-align: left; }
    .cats button.on { background: var(--text); color: var(--bg); }
    .cats span { opacity: .6; }
    main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    h1 { margin: 0; font-size: 34px; font-weight: 700; letter-spacing: -0.04em; }
    .search { height: 44px; border-radius: 999px; border: 0; background: var(--surface); padding: 0 18px; font: inherit; font-size: 15px; color: var(--text); }
    .apps { display: flex; flex-wrap: wrap; gap: 6px; }
    .apps button { height: 34px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
    .apps button.on { background: var(--text); color: var(--bg); }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 12px; }
    .card { background: var(--surface); border-radius: 24px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .card b { font-size: 18px; }
    .desc { font-size: 14px; color: var(--muted); line-height: 1.45; }
    .owners { font-size: 12px; color: var(--muted); }
    .btn { align-self: flex-start; height: 40px; padding: 0 18px; border-radius: 999px; border: 0; background: var(--blue); color: #fff; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
    .muted { color: var(--muted); }
    @media (max-width: 760px) {
      .playbooks { grid-template-columns: 1fr; }
      .cats { position: static; flex-direction: row; flex-wrap: wrap; padding: 12px; }
      .cats h2, .cats .kicker { display: none; }
    }
  `],
} )
export class PlaybooksComponent implements OnInit {
  private readonly api = inject( MissionsApiService );
  readonly use = output<Playbook>();
  readonly viewerId = input( '' );
  readonly initial = input<{ categories: { id: string; label: string }[]; playbooks: Playbook[] } | null>( null );

  readonly categories = signal<{ id: string; label: string }[]>( [] );
  readonly playbooks = signal<Playbook[]>( [] );
  readonly category = signal( '' );
  readonly app = signal( '' );
  readonly query = signal( '' );
  readonly apps = APPS;

  async ngOnInit (): Promise<void> {
    const data = this.initial() || await this.api.playbooks();
    this.categories.set( data.categories );
    this.playbooks.set( data.playbooks );
  }

  readonly title = computed( () => {
    const found = this.categories().find( ( c ) => c.id === this.category() );
    return found ? found.label : 'All playbooks';
  } );

  readonly shown = computed( () => {
    const q = this.query().trim().toLowerCase();
    return this.playbooks().filter( ( p ) =>
      ( !this.category() || p.category === this.category() ) &&
      ( !this.app() || p.products.some( ( product ) => appOf( product ) === this.app() ) ) &&
      ( !q || `${p.title} ${p.request}`.toLowerCase().includes( q ) ) );
  } );

  countIn ( id: string ): number {
    return this.playbooks().filter( ( p ) => p.category === id ).length;
  }

  label ( app: string ): string {
    return PRODUCT_LABEL[app] || app;
  }

  appsLine ( p: Playbook ): string {
    return [...new Set( p.products.map( appOf ).filter( ( product ) => product !== 'todd' ) )].map( ( product ) => this.label( product ) ).join( ' · ' );
  }

  ownersLine ( p: Playbook ): string {
    return [p.owners.todd ? `${p.owners.todd} by TODD` : '', p.owners.maya ? `${p.owners.maya} by Maya` : '', p.owners.person ? `${p.owners.person} by you` : ''].filter( Boolean ).join( ' · ' );
  }

}
