import { MomentumThread, MomentumMode } from '../../models/momentum-thread.model';

export interface MomentumThreadCreatePayload {
  contactId: string;
  emailAddress?: string;
  contactName?: string;
  companyName?: string;
  senderEmail?: string;
  senderName?: string;
  subject?: string;
  origin?: MomentumThread['origin'];
  signalEngineEnabled?: boolean;
  owner?: MomentumThread['owner'];
  mode?: MomentumMode;
}

function normalizeEmailAddress ( emailAddress?: string ): string {
  return String( emailAddress || '' ).trim().toLowerCase();
}

function resolveMomentumActive ( mode: MomentumMode ): boolean {
  return mode === 'draft_only' || mode === 'auto_send';
}

/**
 * Standalone extraction of MomentumThreadService.createThreadFromSentEmail
 * (momentum-thread.service.ts) - a pure builder, not a service method, since
 * the "merge with an existing local thread" behavior it had in the
 * monorepo only mattered because that service kept a localStorage-backed
 * cache of previously-seen threads (see the comment on why that cache was
 * dropped from this extraction - nothing here populates it, so
 * `existingThread` would always have been null anyway in this app).
 * EmailerComponent calls this after a Catalyst send, then POSTs the result
 * straight to the backend via OutreachApiService.upsertMomentumThread -
 * that server-side write is the one that actually matters.
 */
export function createThreadFromSentEmail ( payload: MomentumThreadCreatePayload ): MomentumThread {
  const now = new Date().toISOString();
  const signalEngineEnabled = payload.signalEngineEnabled !== false;
  const resolvedMode: MomentumMode = signalEngineEnabled ? ( payload.mode || 'auto_send' ) : 'handoff';
  const resolvedOwner = signalEngineEnabled ? ( payload.owner || 'todd' ) : 'user';

  const thread: MomentumThread = {
    id: `momentum_${payload.contactId}`,
    contactId: payload.contactId,
    emailAddress: normalizeEmailAddress( payload.emailAddress ),
    contactName: payload.contactName,
    companyName: payload.companyName,
    senderEmail: normalizeEmailAddress( payload.senderEmail ),
    senderName: payload.senderName,
    origin: payload.origin || 'unknown',
    signalEngineEnabled,
    lastResetAt: now,
    lastResetReason: 'Initial thread created from sent email.',
    owner: resolvedOwner,
    mode: resolvedMode,
    signalState: 'no_open',
    stage: 'first_touch',
    isMomentumActive: signalEngineEnabled && resolveMomentumActive( resolvedMode ),
    touchCount: 1,
    openCount: 0,
    clickCount: 0,
    replyCount: 0,
    followUpCount: 0,
    draftedCount: 0,
    autoSentCount: resolvedMode === 'auto_send' ? 1 : 0,
    lastSubject: payload.subject,
    lastSentAt: now,
    nextActionType: signalEngineEnabled ? 'wait' : 'handoff_to_user',
    nextActionReason: signalEngineEnabled
      ? 'Signal Engine took control after the latest send.'
      : 'Signal Engine is off for this thread. You now own the follow-up.',
    queueState: signalEngineEnabled
      ? ( resolvedMode === 'auto_send' ? 'sending' : 'waiting' )
      : 'handoff',
    lastEvaluatedAt: now,
    strategy: signalEngineEnabled ? 'Initial outreach' : 'Manual follow-up',
    lastAutomationNote: signalEngineEnabled
      ? 'Signal Engine owns this thread after the latest send.'
      : 'Signal Engine is off for this thread.',
    actionLog: [
      {
        at: now,
        type: 'created',
        title: 'Signal thread started',
        detail: 'Initial thread created from sent email.'
      }
    ]
  };

  return thread;
}
