/**
 * Ported near-verbatim from shared/data/interfaces/momentum-thread.model.ts -
 * this is Signal Engine's core data shape (a per-contact outreach thread:
 * owner/mode/signal/stage, draft fields, reply-analysis fields, action
 * log). Kept whole rather than trimmed since SignalEngineComponent,
 * EmailSentComponent, and the momentum-thread endpoints on
 * OutreachApiService all read across most of its fields.
 */
export type MomentumOwner = 'user' | 'todd' | 'shared' | 'idle';

export type MomentumMode =
    | 'draft_only'
    | 'auto_send'
    | 'paused'
    | 'handoff'
    | 'completed'
    | 'close_mode'
    | 'unsubscribed';

export type MomentumSignal =
    | 'no_open'
    | 'opened'
    | 'multi_open'
    | 'clicked'
    | 'replied'
    | 'negative'
    | 'stalled';

export type MomentumStage =
    | 'first_touch'
    | 'network_followup'
    | 'follow_up_1'
    | 'follow_up_2'
    | 'engaged'
    | 'meeting_push'
    | 'breakup'
    | 'won'
    | 'lost';

export type MomentumQueueState =
    | 'idle'
    | 'waiting'
    | 'drafting'
    | 'queued'
    | 'sending'
    | 'paused'
    | 'handoff'
    | 'completed';

export type MomentumOrigin =
    | 'campaign'
    | 'composer'
    | 'catalyst'
    | 'maya'
    | 'unknown';

export type MomentumActionLogType =
    | 'created'
    | 'signal'
    | 'drafted'
    | 'queued'
    | 'sending'
    | 'completed'
    | 'close_mode'
    | 'handoff'
    | 'paused'
    | 'control';

export interface MomentumCloseRecommendation {
    contactId: string;
    contactName?: string;
    companyName?: string;
    selectedOfferId?: string;
    selectedOfferName?: string;
    selectedOfferUrl?: string;
    selectedOfferPriceLabel?: string;
    reason?: string;
    closeSubject?: string;
    closeMessage?: string;
    summary?: string;
    aiGenerated?: boolean;
    ctaLabel?: string;
    ctaUrl?: string;
    confidence?: string | number;
    status?: 'ready_for_review' | 'sent' | 'dismissed' | string;
    createdAt?: string;
    sourceSequenceId?: string;
}

export interface MomentumCloseModeState {
    type: 'close_mode';
    status: 'active' | 'ready_for_review' | 'sent' | string;
    label: string;
    recommendation?: MomentumCloseRecommendation;
}

export interface MomentumActionLogEntry {
    at: string;
    type: MomentumActionLogType;
    title: string;
    detail?: string;
}

export interface ContentEvaluationDimension {
    score: number;
    label: 'strong' | 'workable' | 'weak' | string;
    summary: string;
}

export interface ContentEvaluation {
    channel: string;
    verdict: 'strong' | 'workable' | 'weak' | string;
    approved: boolean;
    overallScore: number;
    strengths: string[];
    improvements: string[];
    dimensions: Record<string, ContentEvaluationDimension>;
    draft?: {
        subject?: string;
        body?: string;
        content?: string;
    };
    improvedDraft?: {
        subject?: string;
        body?: string;
        content?: string;
    };
    summary?: string;
    evaluatedAt?: string;
    routing?: {
        autoQueue: boolean;
        needsRevision: boolean;
        reason: string;
    };
}

export interface MomentumThreadStopReason {
    title: string;
    detail: string;
    badge: string;
}

export interface MomentumThreadNeedsYouReason {
    key: string;
    label: string;
    reason: string;
    nextMove: string;
}

export interface MomentumThread {
    id: string;
    userLane?: 'plan' | 'drafts' | 'outbox' | 'sent' | string;
    userLaneReason?: string;
    bucket?: 'waiting' | 'watching' | 'engaged' | 'needs_you' | 'needs_human_edit' | 'stalled' | 'drafting' | 'queued' | null;
    stopReason?: MomentumThreadStopReason | null;
    needsYouReason?: MomentumThreadNeedsYouReason | null;
    needsHumanEdit?: boolean;

    rewriteQueueState?: 'pending' | 'processing';
    rewriteQueuedAt?: string;
    rewriteDraftKind?: 'reply' | 'outbound';
    rewriteError?: string;

    contactId: string;
    emailAddress?: string;
    contactName?: string;
    companyName?: string;
    senderEmail?: string;
    senderName?: string;
    senderSignature?: string;

    campaignId?: string;
    actionId?: string | null;
    actionPlanId?: string | null;
    planId?: string | null;
    strategyId?: string | null;
    segmentId?: string | null;
    angleId?: string | null;
    sequenceEnabled?: boolean;
    launchMode?: 'single' | 'sequence';
    sequenceState?: 'active' | 'waiting' | 'paused' | 'stopped' | 'completed';
    sequenceStepNumber?: number;
    currentStepNumber?: number;
    nextEligibleAt?: string;
    stoppedReason?: string;
    lastStepSentAt?: string;
    origin?: MomentumOrigin;
    signalEngineEnabled?: boolean;
    createdAt?: string;
    lastUpdated?: string;
    lastResetAt?: string;
    lastResetReason?: string;

    owner: MomentumOwner;
    mode: MomentumMode;

    signalState: MomentumSignal;
    stage: MomentumStage;

    isMomentumActive: boolean;

    touchCount: number;
    openCount: number;
    clickCount: number;
    replyCount: number;

    followUpCount?: number;
    draftedCount?: number;
    autoSentCount?: number;

    lastSubject?: string;

    lastSentAt?: string;
    lastOpenedAt?: string;
    lastClickedAt?: string;
    lastClickedUrl?: string;

    nextActionAt?: string;
    nextActionType?: 'wait' | 'draft_followup' | 'send_followup' | 'handoff_to_user' | 'pause';
    nextActionReason?: string;
    sortAt?: string;
    archived?: boolean;
    archivedAt?: string | null;
    archiveReason?: string | null;

    queueState?: MomentumQueueState;
    scheduledAt?: string;
    lastEvaluatedAt?: string;
    contentEvaluation?: ContentEvaluation;
    closeMode?: MomentumCloseModeState;
    closeRecommendation?: MomentumCloseRecommendation;

    strategy?: string;
    journeySource?: string;
    dailyBatchDate?: string;
    lastStageAdvancedAt?: string;
    lastStageAdvanceReason?: string;
    autoSendBlocker?: string;

    draftSubject?: string;
    draftBody?: string;
    rejectedDraftSubject?: string;
    rejectedDraftBody?: string;
    strategySummary?: string;
    lastAutomationNote?: string;
    latestReplyText?: string;
    latestReplyAt?: string;
    latestReplyMessageId?: string;
    latestReplyMailboxId?: string;
    replyClassification?:
    | 'positive_interest'
    | 'soft_interest'
    | 'objection'
    | 'pricing_objection'
    | 'timing_objection'
    | 'authority_objection'
    | 'fit_objection'
    | 'trust_objection'
    | 'question'
    | 'not_now'
    | 'wrong_person'
    | 'unsubscribe'
    | 'negative'
    | 'needs_human';
    replySentiment?: 'positive' | 'neutral' | 'negative';
    replyRisk?: 'low' | 'medium' | 'high';
    replySummary?: string;
    replyRecommendedAction?: 'send_draft' | 'needs_human' | 'pause' | 'stop';
    replyApprovalMode?: 'recommended_send' | 'review_before_send' | 'human_only' | 'do_not_send';
    replyApprovalReason?: string;
    replyDraftPlaybook?: string;
    replyDraftRationale?: string;
    replyDraftSubject?: string;
    replyDraftBody?: string;
    replyDraftMessageId?: string | null;
    lastSentReplySubject?: string;
    lastSentReplyBody?: string;
    lastSentReplyAt?: string;
    lastSentSubject?: string;
    lastSentBody?: string;
    lastSentHtml?: string;
    lastRespondedInboundMessageId?: string | null;
    lastRespondedAt?: string;
    lastSentReplyPlaybook?: string;
    lastSentReplyApprovalMode?: 'recommended_send' | 'review_before_send' | 'human_only' | 'do_not_send';
    lastSentReplyEdited?: boolean;
    lastSentReplyRationale?: string;
    secondaryReplyDraftPlaybook?: string;
    secondaryReplyDraftRationale?: string;
    secondaryReplyDraftSubject?: string;
    secondaryReplyDraftBody?: string;
    secondaryReplyDraftGeneratedAt?: string;
    replyConfidence?: number;
    replyNeedsHuman?: boolean;
    replyReviewedByUser?: boolean;
    replyReviewedAt?: string | null;
    replyReviewedByUserId?: string;
    replyAnalyzedAt?: string;
    latestResponderDecision?: 'draft_only' | 'responded' | 'skipped' | string;
    latestResponderReason?: string;
    latestResponderProcessedMessageId?: string;
    latestResponderGeneratedAt?: string;
    outcomeResolvedAt?: string | null;
    outcomeResolvedBy?: 'user' | 'todd' | null;
    actionLog?: MomentumActionLogEntry[];
}
