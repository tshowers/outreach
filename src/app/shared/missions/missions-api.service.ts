import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Cockpit, DirectAnswer, MissionReport, MissionView, Playbook, StepActionType, StepView, WaitingItem } from './missions.model';

/**
 * /api/orchestration/missions (todd-backend orchestrator/routes.js). The
 * app's id-token and tenant interceptors sign every call. Synced from
 * taliferro-ui/missions - edit the .tmpl there.
 */
@Injectable( { providedIn: 'root' } )
export class MissionsApiService {
  private readonly http = inject( HttpClient );
  private readonly base = `${environment.backendURL}/orchestration/missions`;

  /** A request: answered directly, or a Mission that starts planning. */
  ask ( request: string, opts: { origin?: string; title?: string; playbookId?: string; force?: 'mission'; autoStart?: boolean; sourceRef?: { kind: string; id: string }; context?: Record<string, unknown> } = {} ): Promise<DirectAnswer | { mode: 'mission'; mission: MissionView }> {
    return firstValueFrom( this.http.post<any>( this.base, { request, ...opts } ) );
  }

  list ( opts: { status?: string; phase?: string; limit?: number } = {} ): Promise<MissionView[]> {
    const params: Record<string, string> = {};
    Object.entries( opts ).forEach( ( [key, value] ) => {
      if ( value !== undefined && value !== '' ) params[key] = String( value );
    } );
    return firstValueFrom( this.http.get<{ missions: MissionView[] }>( this.base, { params } ) ).then( ( res ) => res.missions );
  }

  get ( id: string ): Promise<MissionView> {
    return firstValueFrom( this.http.get<{ mission: MissionView }>( `${this.base}/${encodeURIComponent( id )}` ) ).then( ( res ) => res.mission );
  }

  start ( id: string, steps?: StepView[] ): Promise<MissionView> {
    return firstValueFrom( this.http.post<{ mission: MissionView }>( `${this.base}/${encodeURIComponent( id )}/start`, steps ? { steps } : {} ) ).then( ( res ) => res.mission );
  }

  validate ( id: string, steps: Partial<StepView>[] ): Promise<{ valid: boolean; errors: string[]; steps: StepView[] }> {
    return firstValueFrom( this.http.post<any>( `${this.base}/${encodeURIComponent( id )}/validate`, { steps } ) );
  }

  savePlan ( id: string, steps: Partial<StepView>[] ): Promise<MissionView> {
    return firstValueFrom( this.http.put<{ mission: MissionView }>( `${this.base}/${encodeURIComponent( id )}/plan`, { steps } ) ).then( ( res ) => res.mission );
  }

  act ( id: string, stepId: string, type: StepActionType, extra: { note?: string; value?: string; output?: Record<string, unknown> } = {} ): Promise<unknown> {
    return firstValueFrom( this.http.post( `${this.base}/${encodeURIComponent( id )}/steps/${encodeURIComponent( stepId )}`, { type, ...extra } ) );
  }

  answer ( id: string, answers: { question: string; answer: string }[] ): Promise<MissionView> {
    return firstValueFrom( this.http.post<{ mission: MissionView }>( `${this.base}/${encodeURIComponent( id )}/answers`, { answers } ) ).then( ( res ) => res.mission );
  }

  cancel ( id: string ): Promise<MissionView> {
    return firstValueFrom( this.http.post<{ mission: MissionView }>( `${this.base}/${encodeURIComponent( id )}/cancel`, {} ) ).then( ( res ) => res.mission );
  }

  report ( id: string ): Promise<MissionReport> {
    return firstValueFrom( this.http.get<{ report: MissionReport }>( `${this.base}/${encodeURIComponent( id )}/report` ) ).then( ( res ) => res.report );
  }

  waiting (): Promise<{ items: WaitingItem[]; missions: number; minutes: number }> {
    return firstValueFrom( this.http.get<any>( `${this.base}/waiting` ) );
  }

  cockpit (): Promise<Cockpit> {
    return firstValueFrom( this.http.get<Cockpit>( `${this.base}/cockpit` ) );
  }

  playbooks (): Promise<{ categories: { id: string; label: string }[]; playbooks: Playbook[] }> {
    return firstValueFrom( this.http.get<any>( `${this.base}/playbooks` ) );
  }

  /** Polls a Mission until it leaves planning (queued/running), for the 1d "Planning…" state. */
  async waitForPlan ( id: string, onTick?: ( mission: MissionView ) => void, { everyMs = 1500, maxMs = 180000 } = {} ): Promise<MissionView> {
    const started = Date.now();
    for ( ;; ) {
      const mission = await this.get( id );
      if ( onTick ) onTick( mission );
      if ( mission.status !== 'queued' && mission.status !== 'running' ) return mission;
      if ( Date.now() - started > maxMs ) return mission;
      await new Promise( ( resolve ) => setTimeout( resolve, everyMs ) );
    }
  }
}
