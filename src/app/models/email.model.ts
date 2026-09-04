/**
 * Ported near-verbatim from shared/data/interfaces/email.model.ts - kept
 * whole (not trimmed field-by-field) since Campaign/CatalystRun are read
 * across many places in EmailProcessorComponent/OutreachHomeComponent/
 * EmailComposerParentComponent and trimming individual fields risks
 * breaking a template binding that was hard to spot by inspection alone.
 */
import { Contact } from './contact.model';

export interface LeadVaultAudiencePreview {
  allowed?: boolean;
  code?: string;
  reason?: string;
  message?: string;
  additionalCount?: number;
  nextAvailableAt?: string | null;
  lastUsedAt?: string | null;
  lastCampaignId?: string | null;
  lastAddedCount?: number;
  entitled?: boolean;
  isMasterTenant?: boolean;
}

export interface Email {
  id?: string;
  actionId?: string | null;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  text?: string;
  html?: string;
  textAsHtml?: any;
  contactName?: string | null;
  contactId?: string | null;
  from?: any;
  fromName?: string;
  signalEngineEnabled?: boolean;
  signalOrigin?: string;
  sourceSystem?: string;
  campaignId?: string | null;
  catalystRunId?: string | null;
  catalystRunName?: string | null;
  isTestSend?: boolean;
  planId?: string | null;
  planVersion?: number | null;
  strategyId?: string | null;
  segmentId?: string | null;
  angleId?: string | null;
  messageType?: string;
  sendAuthority?: string;
  sendReasonLabel?: string;
  sendPolicyModeAtSend?: string;
  policyBlockReason?: string;
  sequenceEnabled?: boolean;
  sequenceStepId?: string | null;
  sequenceStepNumber?: number | null;
  launchMode?: string;

  date?: any;
  seen?: boolean;
  size?: number;
  spam?: boolean;
  messageId?: any;
  openedAt?: any;
  opened?: boolean;
  clicks?: any;
  isRead?: boolean;
}

export interface CatalystRun {
  id: string;
  name: string;
  source: string;
  status: string;
  includeLeadVaultContacts?: boolean;
  plannedCount?: number;
  eligibleCount?: number;
  invalidCount?: number;
  queuedCount?: number;
  skippedCount?: number;
  removedCount?: number;
  sentCount?: number;
  uniqueOpenedCount?: number;
  uniqueClickedCount?: number;
  clickCount?: number;
  openRate?: number;
  clickRate?: number;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  lastSentAt?: string;
  lastOpenedAt?: string;
  lastClickedAt?: string;
  createdByUserId?: string;
  createdByUserEmail?: string;
  contactIds?: string[];
  sentEmailIds?: string[];
  openedEmailIds?: string[];
  clickedEmailIds?: string[];
  lastSubject?: string;
  lastEmailAddress?: string;
}

export interface Campaign {
  id?: any;
  actionId?: string | null;
  signalOrigin?: string;
  sourceSystem?: string;
  planId?: string | null;
  strategyId?: string | null;
  segmentId?: string | null;
  angleId?: string | null;
  desiredStartDate?: string;
  scheduledStartAt?: string | null;
  startedByUserAt?: string;
  dateAdded?: Date;
  lastUpdated?: Date | any;
  desiredStartTime?: any;
  name?: string;
  subject?: string;
  from: string;
  progress: number;
  openRate?: number;
  queue: Contact[];
  sent: Contact[];
  status?: string;
  cc?: string;
  bcc?: string;
  text?: string;
  html?: string;
  interval?: any;
  nextContact?: Contact;
  timeStamp?: {
    seconds: number;
    nanoseconds: number;
  };
  sentCount?: number;
  openCount?: number;
  source?: string;
  composerHandoffId?: string;
  composerReviewRoute?: string;
  campaignIdea?: {
    title?: string;
    idea?: string;
    audience?: string;
    offer?: string;
    urgency?: string;
    notes?: string;
  };
  ideaEvaluation?: any;
  preparedSegment?: any;
  monitoringContext?: any;
  currentStepNumber?: number;
  launchState?: 'not_launched' | 'launched';
  launchedAt?: any;
  sequenceEnabled?: boolean;
  launchMode?: 'single' | 'sequence';
  sequenceStatus?: 'planned' | 'launched' | 'in_progress' | 'paused' | 'completed';
  launchStepNumber?: number | null;
  launchPayloadSnapshot?: {
    stepId?: string;
    stepNumber?: number;
    subject?: string;
    html?: string;
    text?: string;
    approvalHash?: string;
    launchedAt?: string;
  };
  healthSummary?: CampaignHealthSummary;
  sequenceSteps?: CampaignSequenceStep[];
  operatorSummary?: {
    operatorState?: string;
    liveSignals?: {
      sentCount?: number;
      openCount?: number;
      clickCount?: number;
      replyCount?: number;
      sendStatus?: string;
    };
    replyInsight?: {
      count?: number;
      mix?: {
        positiveInterest?: number;
        objection?: number;
        unsubscribeNotInterested?: number;
        wrongContact?: number;
        neutralUnclear?: number;
      };
      topReplyLabel?: string;
      topReplyBucket?: string;
      dominantConcernCategory?: string;
      whatToddSees?: string;
      recommendedHumanAction?: string;
    };
    responseGuidance?: {
      dominantType?: string;
      dominantConcernCategory?: string;
      whatToddThinksIsHappening?: string;
      suggestedAngle?: string;
      suggestedDraft?: string;
      suggestedNextMove?: string;
      shouldHandoffToHuman?: boolean;
    };
    reviewWindowGuidance?: string;
    whatIsHappening?: string;
    whatToddSees?: string;
    handoffSummary?: string;
    recommendedNextMove?: {
      key?: string;
      label?: string;
      rationale?: string;
    };
  };
  includeLeadVaultContacts?: boolean;
  leadVaultContactIds?: string[];
  leadVaultAudiencePreview?: LeadVaultAudiencePreview | null;
}

export interface CampaignHealthSummary {
  openRateTrend?: 'rising' | 'flat' | 'declining' | 'unknown';
  clickRateTrend?: 'rising' | 'flat' | 'declining' | 'unknown';
  replyRateTrend?: 'rising' | 'flat' | 'declining' | 'unknown';
  healthStatus?: 'improving' | 'warning' | 'flat' | 'declining' | 'pending';
  lastEvaluatedAt?: any;
  warningMessage?: string;
  recommendedNextMove?: string;
  reviewWindow?: string;
}

export interface CampaignSequenceStep {
  id?: string;
  stepNumber: number;
  goal?: string;
  stageKey?: string;
  stageLabel?: string;
  sequenceType?: string;
  delayHours?: number;
  sendConditionType?: 'time_only' | 'no_open' | 'opened_no_click' | 'clicked_no_reply';
  successCriteria?: string;
  failureCriteria?: string;
  subjectStrategy?: string;
  bodyStrategy?: string;
  draftSubject?: string | null;
  draftBody?: string | null;
  draftText?: string | null;
  draftStatus?: 'strategy_ready' | 'draft_pending' | 'draft_generated' | 'approved' | string;
  draftSource?: 'ai' | 'fallback_template' | 'user_edit' | string;
  draftQuality?: 'strong' | 'workable' | 'weak' | 'fallback' | string;
  draftWarnings?: string[];
  strategyContext?: any;
  generationContextVersion?: string;
  approvedSubject?: string | null;
  approvedHtml?: string | null;
  approvedText?: string | null;
  approvalStatus?: 'pending' | 'approved';
  approvalHash?: string | null;
  approvedAt?: string | null;
  editedByUser?: boolean;
  lastGeneratedAt?: string | null;
  lastEditedAt?: string | null;
  lastApprovedAt?: string | null;
  placeholderRules?: CampaignPlaceholderRule[];
  fallbackSentenceRules?: CampaignFallbackSentenceRule[];
  status?: 'planned' | 'ready' | 'queued' | 'sent' | 'skipped';
  stepSummary?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface CampaignContactProgress {
  contactId: string;
  campaignId: string;
  sequenceState?: 'active' | 'waiting' | 'paused' | 'stopped' | 'completed';
  currentStepId?: string | null;
  currentStepNumber?: number | null;
  lastStepSentAt?: string | null;
  nextEligibleAt?: string | null;
  lastStepMessageId?: string | null;
  lastStepEmailId?: string | null;
  stoppedReason?: 'reply' | 'unsubscribe' | 'bounce' | 'handoff' | 'manual_pause' | null;
  completedAt?: string | null;
}

export interface CampaignPlaceholderRule {
  placeholder: string;
  sourceFields: string[];
}

export interface CampaignFallbackSentenceRule {
  placeholder: string;
  fallbackText: string;
}
