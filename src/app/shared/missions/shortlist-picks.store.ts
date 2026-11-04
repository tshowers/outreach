import { Injectable, signal } from '@angular/core';

export type ShortlistPick = 'keep' | 'later' | 'drop' | '';

/**
 * Keep, later or drop on a Mission's shortlist, held in one place: you choose
 * in the list on the mission page, and the step drawer's "Continue with N
 * kept" uses the same choices (Ty, 2026-11-03).
 * Synced from taliferro-ui/missions.
 */
@Injectable( { providedIn: 'root' } )
export class ShortlistPicksStore {
  private readonly all = signal<Record<string, Record<string, ShortlistPick>>>( {} );

  picksFor ( missionId: string, stepId: string ): Record<string, ShortlistPick> {
    return this.all()[ `${missionId}:${stepId}` ] || {};
  }

  /** Picking the same choice again clears it. */
  pick ( missionId: string, stepId: string, itemId: string, pick: ShortlistPick ): void {
    const key = `${missionId}:${stepId}`;
    this.all.update( ( all ) => {
      const mine = all[key] || {};
      return { ...all, [key]: { ...mine, [itemId]: mine[itemId] === pick ? '' : pick } };
    } );
  }
}
