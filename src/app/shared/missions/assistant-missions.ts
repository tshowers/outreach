import { ChangeDetectionStrategy, Component, Injectable, inject, input } from '@angular/core';

import { MissionDetailComponent } from './mission-detail.component';
import { MissionsApiService } from './missions-api.service';

/** What the assistant does with an ask: show a Mission, show an answer, or carry on as before. */
export type AssistantRoute = { kind: 'mission'; missionId: string } | { kind: 'answer'; text: string } | null;

/**
 * The TODD assistant's Missions gate, the same in every app (first built in
 * Outreach, 2026-10-20). Real work becomes a Mission shown right in the
 * conversation; a quick question is answered by the right tool; help
 * questions (no tool) and any error return null so the app's assistant
 * answers as before. The app's own intercepts (navigation, composers) run
 * first. Synced from taliferro-ui/missions - edit the .tmpl there.
 */
@Injectable( { providedIn: 'root' } )
export class AssistantMissionsService {
  private readonly api = inject( MissionsApiService );

  async route ( request: string, app: string, page?: unknown ): Promise<AssistantRoute> {
    try {
      const res: any = await this.api.ask( request, { origin: 'ask', context: this.context( app, page ) } );
      if ( res?.mode === 'mission' && res.mission?.id ) return { kind: 'mission', missionId: res.mission.id };
      if ( res?.tool && res?.summary ) return { kind: 'answer', text: String( res.summary ) };
      return null;
    } catch {
      return null;
    }
  }

  /** Bring the newest Mission card into view: it's the answer, and it can land below the fold. */
  reveal (): void {
    setTimeout( () => {
      if ( typeof document === 'undefined' ) return;
      const cards = document.querySelectorAll( '[data-cy="assistant-mission"]' );
      cards[cards.length - 1]?.scrollIntoView( { block: 'start', behavior: 'smooth' } );
    }, 80 );
  }

  /** What's on screen, for the planner: the app, the page, and its summary numbers. */
  private context ( app: string, page?: unknown ): Record<string, unknown> {
    const base = page && typeof page === 'object' ? page as Record<string, unknown> : {};
    return { ...base, app, path: typeof window !== 'undefined' ? window.location.pathname : '' };
  }
}

/**
 * A Mission inside the assistant's conversation: its live plan, Start, and
 * every step that needs you, finished here in the step drawer. "Open in
 * Moves" for the full view.
 */
@Component( {
  selector: 'tm-assistant-mission',
  standalone: true,
  imports: [MissionDetailComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="assistant-mission" data-cy="assistant-mission">
      <tm-mission-detail [missionId]="missionId()" [viewerId]="viewerId()" />
      <a class="open" [href]="'https://moves.16ahead.com/missions/' + missionId()" target="_blank" rel="noopener">Open in Moves ↗</a>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .assistant-mission {
      display: flex; flex-direction: column; gap: 10px;
      margin: 8px 0 14px; padding: 18px; border-radius: 22px;
      background: var(--bg, transparent);
      box-shadow: inset 0 0 0 1px var(--surface2, rgba(127, 127, 127, .2));
    }
    .open { align-self: flex-end; font-size: 13px; font-weight: 700; color: var(--blue-ink, #1f55e0); text-decoration: none; }
  `],
} )
export class AssistantMissionComponent {
  readonly missionId = input.required<string>();
  readonly viewerId = input<string>( '' );
}
