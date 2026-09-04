import { Injectable } from '@angular/core';
import { LoggerService } from './logger.service';
import {
  MomentumActionLogEntry,
  MomentumMode,
  MomentumThread,
} from '../models/momentum-thread.model';

export interface MomentumThreadCreatePayload {
  contactId: string;
  emailAddress?: string;
  contactName?: string;
  companyName?: string;
  senderEmail?: string;
  senderName?: string;
  campaignId?: string;
  actionId?: string | null;
  planId?: string | null;
  strategyId?: string | null;
  segmentId?: string | null;
  angleId?: string | null;
  subject?: string;
  origin?: MomentumThread['origin'];
  signalEngineEnabled?: boolean;
  owner?: MomentumThread['owner'];
  mode?: MomentumMode;
}

const MOMENTUM_THREADS_STORAGE_KEY = 'todd.momentumThreads';

/**
 * Trimmed copy of services/momentum-thread.service.ts (1,181 lines) - a
 * localStorage-backed, per-browser cache of "what did I personally see/do
 * for this contact's Signal Engine thread in this browser." Unlike
 * OutreachHomeComponent (which reads real thread state straight from
 * getSignalEngineBootstrap() instead - see that component's own comment
 * on why), EmailCreateComponent and EmailerComponent genuinely depend on
 * this cache's actual read-after-write behavior within a single session
 * (e.g. "I just sent to this contact - show Signal Engine as active for
 * them now"), and confirmed against the original signal-engine.component.ts
 * that nothing else populates or reads this cache from the backend - it's
 * real, working client state, not dead weight, so it's ported instead of
 * dropped. Kept to the exact methods those two components call:
 * getThreadByContactId, upsertThread, createThreadFromSentEmail,
 * takeOverThread, hasToddOwnedActiveThread, getSignalEngineLabel,
 * getSignalEngineWarning - dropping every other momentum lifecycle
 * method (markOpened/markClicked/markReplied/setOwner/importSignalSnapshot/
 * etc.) that no ported component calls.
 */
@Injectable( { providedIn: 'root' } )
export class OutreachMomentumThreadService {
  private readonly threads = new Map<string, MomentumThread>();
  private lastPersistedSnapshot = '';
  private persistTimeoutId: number | null = null;

  constructor ( private logger: LoggerService ) {
    this.loadThreadsFromStorage();
  }

  getThreadByContactId ( contactId: string ): MomentumThread | null {
    if ( !contactId ) return null;
    return this.threads.get( contactId ) || null;
  }

  upsertThread ( thread: MomentumThread, options?: { persist?: boolean; } ): void {
    if ( !thread?.contactId ) return;
    const nextThread = { ...thread };
    const existingThread = this.threads.get( thread.contactId );
    if ( this.areThreadsEquivalent( existingThread, nextThread ) ) {
      return;
    }

    this.threads.set( thread.contactId, nextThread );
    if ( options?.persist !== false ) {
      this.schedulePersistThreads();
    }
  }

  createThreadFromSentEmail ( payload: MomentumThreadCreatePayload ): MomentumThread {
    const existingThread = this.getThreadByContactId( payload.contactId );
    const now = new Date().toISOString();
    const signalEngineEnabled = payload.signalEngineEnabled !== false;
    const resolvedMode: MomentumMode = signalEngineEnabled
      ? ( payload.mode || existingThread?.mode || 'auto_send' )
      : 'handoff';
    const resolvedOwner = signalEngineEnabled
      ? ( payload.owner || existingThread?.owner || 'todd' )
      : 'user';
    const resetReason = existingThread?.contactId
      ? 'A new outbound email restarted the signal sequence for this contact.'
      : 'Initial thread created from sent email.';

    const thread: MomentumThread = {
      id: existingThread?.id || this.buildThreadId( payload.contactId ),
      contactId: payload.contactId,
      emailAddress: this.normalizeEmailAddress( payload.emailAddress || existingThread?.emailAddress ),
      contactName: payload.contactName || existingThread?.contactName,
      companyName: payload.companyName || existingThread?.companyName,
      senderEmail: this.normalizeEmailAddress( payload.senderEmail || existingThread?.senderEmail ),
      senderName: payload.senderName || existingThread?.senderName,
      campaignId: payload.campaignId || existingThread?.campaignId,
      actionId: payload.actionId || existingThread?.actionId || existingThread?.actionPlanId || null,
      actionPlanId: payload.actionId || existingThread?.actionPlanId || existingThread?.actionId || null,
      planId: payload.planId || existingThread?.planId || null,
      strategyId: payload.strategyId || existingThread?.strategyId || null,
      segmentId: payload.segmentId || existingThread?.segmentId || null,
      angleId: payload.angleId || existingThread?.angleId || null,
      origin: payload.origin || existingThread?.origin || 'unknown',
      signalEngineEnabled,
      lastResetAt: existingThread?.contactId ? now : existingThread?.lastResetAt,
      lastResetReason: resetReason,
      owner: resolvedOwner,
      mode: resolvedMode,
      signalState: 'no_open',
      stage: 'first_touch',
      isMomentumActive: signalEngineEnabled && this.resolveMomentumActive( resolvedMode ),
      touchCount: 1,
      openCount: 0,
      clickCount: 0,
      replyCount: 0,
      followUpCount: 0,
      draftedCount: 0,
      autoSentCount: resolvedMode === 'auto_send' ? 1 : 0,
      lastSubject: payload.subject,
      lastSentAt: now,
      lastOpenedAt: undefined,
      lastClickedAt: undefined,
      lastClickedUrl: undefined,
      nextActionAt: undefined,
      nextActionType: signalEngineEnabled ? 'wait' : 'handoff_to_user',
      nextActionReason: signalEngineEnabled
        ? 'Signal Engine took control after the latest send.'
        : 'Signal Engine is off for this thread. You now own the follow-up.',
      queueState: signalEngineEnabled
        ? ( resolvedMode === 'auto_send' ? 'sending' : 'waiting' )
        : 'handoff',
      scheduledAt: undefined,
      lastEvaluatedAt: now,
      strategy: signalEngineEnabled ? 'Initial outreach' : 'Manual follow-up',
      draftSubject: undefined,
      draftBody: undefined,
      strategySummary: undefined,
      lastAutomationNote: signalEngineEnabled
        ? 'Signal Engine owns this thread after the latest send.'
        : 'Signal Engine is off for this thread.',
      actionLog: [
        this.buildLogEntry(
          'created',
          existingThread?.contactId ? 'Signal sequence restarted' : 'Signal thread started',
          resetReason,
          now
        )
      ]
    };

    this.upsertThread( thread );
    return thread;
  }

  takeOverThread ( contactId: string, reason = 'User took over this conversation.' ): void {
    const thread = this.getThreadByContactId( contactId );
    if ( !thread ) return;

    this.upsertThread( {
      ...thread,
      owner: 'user',
      mode: 'handoff',
      isMomentumActive: false,
      nextActionType: 'handoff_to_user',
      nextActionReason: reason,
      queueState: 'handoff',
      lastEvaluatedAt: new Date().toISOString(),
      actionLog: this.appendThreadLog(
        thread,
        'handoff',
        'User took over',
        reason
      )
    } );
  }

  hasToddOwnedActiveThread ( contactId: string ): boolean {
    const thread = this.getThreadByContactId( contactId );
    return !!thread
      && thread.isMomentumActive
      && thread.owner === 'todd'
      && thread.signalEngineEnabled !== false;
  }

  getSignalEngineLabel ( contactId: string ): string {
    const thread = this.getThreadByContactId( contactId );
    if ( !thread ) return 'Signal Idle';
    if ( thread.signalEngineEnabled === false ) return 'Manual Control';
    if ( thread.mode === 'paused' ) return 'Signal Paused';
    if ( thread.mode === 'handoff' || thread.owner === 'user' ) {
      return 'Needs You';
    }
    if ( thread.signalState === 'clicked' ) return 'Signal Engaged';
    if ( thread.signalState === 'multi_open' ) return 'Signal Watching';
    if ( thread.isMomentumActive ) return 'Signal Active';
    return 'Signal Idle';
  }

  getSignalEngineWarning ( contactId: string ): string {
    const thread = this.getThreadByContactId( contactId );
    if ( !thread ) return 'No signal thread is active for this contact.';
    if ( thread.signalEngineEnabled === false ) {
      return 'Signal Engine is off, so your manual follow-up will lead this relationship.';
    }
    return thread.nextActionReason
      || 'TODD is already managing the timing and next move for this contact.';
  }

  private buildThreadId ( contactId: string ): string {
    return `momentum_${contactId}`;
  }

  private areThreadsEquivalent ( left?: MomentumThread | null, right?: MomentumThread | null ): boolean {
    if ( !left || !right ) return false;

    try {
      return JSON.stringify( left ) === JSON.stringify( right );
    } catch {
      return false;
    }
  }

  private normalizeEmailAddress ( emailAddress?: string ): string {
    return String( emailAddress || '' ).trim().toLowerCase();
  }

  private resolveMomentumActive ( mode: MomentumMode ): boolean {
    return mode === 'draft_only' || mode === 'auto_send';
  }

  private appendThreadLog (
    thread: MomentumThread,
    type: MomentumActionLogEntry['type'],
    title: string,
    detail?: string
  ): MomentumActionLogEntry[] {
    return this.appendLogEntry(
      thread.actionLog,
      this.buildLogEntry( type, title, detail )
    );
  }

  private appendLogEntry (
    existingLog: MomentumActionLogEntry[] | undefined,
    entry: MomentumActionLogEntry,
    dedupe = false
  ): MomentumActionLogEntry[] {
    const baseLog = Array.isArray( existingLog ) ? [...existingLog] : [];
    const lastEntry = baseLog[baseLog.length - 1];

    if (
      dedupe
      && lastEntry
      && lastEntry.type === entry.type
      && lastEntry.title === entry.title
      && lastEntry.detail === entry.detail
    ) {
      return baseLog;
    }

    const nextLog = [...baseLog, entry];
    return nextLog.slice( -20 );
  }

  private buildLogEntry (
    type: MomentumActionLogEntry['type'],
    title: string,
    detail?: string,
    at = new Date().toISOString()
  ): MomentumActionLogEntry {
    return {
      at,
      type,
      title,
      detail
    };
  }

  private loadThreadsFromStorage (): void {
    if ( typeof localStorage === 'undefined' ) return;

    try {
      const raw = localStorage.getItem( MOMENTUM_THREADS_STORAGE_KEY );
      if ( !raw ) return;

      const parsed = JSON.parse( raw );
      if ( !Array.isArray( parsed ) ) return;

      this.threads.clear();

      parsed.forEach( ( thread: MomentumThread ) => {
        if ( thread?.contactId ) {
          this.threads.set( thread.contactId, { ...thread } );
        }
      } );

      this.lastPersistedSnapshot = raw;
    } catch ( error ) {
      this.logger.error( '[Signal Engine] Failed to load momentum threads from localStorage.', error );
    }
  }

  private persistThreads (): void {
    if ( typeof localStorage === 'undefined' ) return;

    try {
      const serialized = JSON.stringify( Array.from( this.threads.values() ) );
      if ( serialized === this.lastPersistedSnapshot ) {
        return;
      }

      localStorage.setItem( MOMENTUM_THREADS_STORAGE_KEY, serialized );
      this.lastPersistedSnapshot = serialized;
    } catch ( error ) {
      this.logger.error( '[Signal Engine] Failed to persist momentum threads to localStorage.', error );
    }
  }

  private schedulePersistThreads (): void {
    if ( typeof window === 'undefined' || !window.setTimeout ) {
      this.persistThreads();
      return;
    }

    if ( this.persistTimeoutId ) {
      return;
    }

    this.persistTimeoutId = window.setTimeout( () => {
      this.persistTimeoutId = null;
      this.persistThreads();
    }, 100 ) as unknown as number;
  }
}
