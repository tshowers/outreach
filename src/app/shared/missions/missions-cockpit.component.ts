import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';

import { MissionsApiService } from './missions-api.service';
import { Cockpit } from './missions.model';

interface Dial { id: 'stuck' | 'inFlight' | 'waitingOnPeople' | 'waitingOnWorld'; label: string; value: number; pct: number; color: string; light: string }

/**
 * The Missions cockpit (design 9a): four dials and a light each, no lists,
 * no copy beyond the labels. Stuck is green at 0 and red above it. Tapping
 * a dial asks the host to show Missions in that state.
 * Synced from taliferro-ui/missions.
 */
@Component( {
  selector: 'tm-missions-cockpit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dials" data-cy="missions-cockpit">
      @for (d of dials(); track d.id) {
        <button type="button" class="dial" (click)="picked.emit(d.id)" [attr.data-cy]="'dial-' + d.id" [attr.aria-label]="d.label + ': ' + d.value">
          <span class="ring" [style.background]="'conic-gradient(' + d.color + ' ' + d.pct + '%, var(--surface2) 0)'">
            <span class="disc"><span class="num">{{ d.value }}</span></span>
          </span>
          <span class="light" [style.background]="d.light" [style.box-shadow]="'0 0 12px ' + d.light"></span>
          <span class="label">{{ d.label }}</span>
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: block; font-family: var(--font); color: var(--text); }
    .dials { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; }
    .dial { position: relative; border: 0; background: var(--surface); border-radius: 24px; padding: 20px 16px 16px; display: flex; flex-direction: column; align-items: center; gap: 12px; cursor: pointer; font: inherit; color: inherit; }
    .ring { width: 100%; max-width: 180px; aspect-ratio: 1; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .disc { width: 80%; height: 80%; border-radius: 50%; background: var(--bg); display: flex; align-items: center; justify-content: center; }
    .num { font-size: 60px; font-weight: 700; letter-spacing: -0.04em; }
    .light { position: absolute; top: 16px; right: 16px; width: 18px; height: 18px; border-radius: 50%; }
    .label { font-size: 15px; font-weight: 700; }
    @media (max-width: 640px) { .dials { grid-template-columns: 1fr 1fr; } .num { font-size: 40px; } }
  `],
} )
export class MissionsCockpitComponent implements OnInit {
  private readonly api = inject( MissionsApiService );
  readonly initial = input<Cockpit | null>( null );
  readonly picked = output<Dial['id']>();
  readonly data = signal<Cockpit>( { stuck: 0, inFlight: 0, waitingOnPeople: 0, waitingOnWorld: 0 } );

  ngOnInit (): void {
    if ( this.initial() ) this.data.set( this.initial()! );
    else void this.api.cockpit().then( ( data ) => this.data.set( data ) ).catch( () => null );
  }

  readonly dials = computed<Dial[]>( () => {
    const d = this.data();
    const share = ( n: number ) => ( d.inFlight ? Math.round( ( n / d.inFlight ) * 1000 ) / 10 : 0 );
    return [
      { id: 'stuck', label: 'Stuck', value: d.stuck, pct: share( d.stuck ), color: 'var(--red)', light: d.stuck ? 'var(--red)' : 'var(--green)' },
      { id: 'inFlight', label: 'In flight', value: d.inFlight, pct: d.inFlight ? 100 : 0, color: 'var(--blue)', light: 'var(--blue)' },
      { id: 'waitingOnPeople', label: 'Waiting on people', value: d.waitingOnPeople, pct: share( d.waitingOnPeople ), color: 'var(--c-you)', light: 'var(--c-you)' },
      { id: 'waitingOnWorld', label: 'Waiting on the world', value: d.waitingOnWorld, pct: share( d.waitingOnWorld ), color: 'var(--yellow)', light: 'var(--yellow)' },
    ];
  } );
}
