import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import { LoggerService } from './logger.service';
import { Campaign, CatalystRun, LeadVaultAudiencePreview } from '../models/email.model';
import { Contact } from '../models/contact.model';
import { MomentumThread } from '../models/momentum-thread.model';

/**
 * Trimmed copy of services/outreach-api.service.ts (1,965 lines in the
 * monorepo). That file is a shared god-service also used by Contact's
 * deal-flow-dashboard and the whole Social Media extraction elsewhere in
 * TODD - most of its surface (campaign list/test-send, momentum-operator
 * automation internals, outbox-cockpit bootstrap, the entire
 * outreach/social-* endpoint family) belongs to routes or extractions
 * this app doesn't carry. This keeps ONLY the methods the 10 live routes
 * ported into this app actually call (confirmed by grepping every
 * ported component/service for `outreachApi(Service)?.<method>(` calls
 * before writing this file) - mailboxes, momentum-threads, contacts,
 * sequence steps, composer-handoffs, provisioning access, and catalyst
 * runs. The `outreach/social-*` family (social-posts, social-accounts,
 * social-auth, social-strategy, social/bootstrap) is deliberately
 * dropped - that belongs to the separate Social extraction building its
 * own independent trimmed copy in parallel.
 */

export interface ContactResponse {
  success: boolean;
  message: string;
  data: Contact;
}

export interface ContactListResponse {
  success: boolean;
  message: string;
  data: Contact[];
}

export interface ComposerHandoff {
  id?: string;
  handoffId?: string;
  actionPlanId?: string;
  status?: string;
  source?: string;
  handoffMode?: string;
  reviewRoute?: string;
  returnRoute?: string;
  returnTab?: string;
  returnThreadId?: string;
  reopenDraftReview?: boolean;
  contactsCount?: number;
  selectedContactIds?: string[];
  selectedContacts?: Contact[];
  threadContext?: {
    contactId?: string;
    threadId?: string;
    campaignId?: string;
    campaignName?: string;
    companyName?: string;
    signalState?: string;
    queueState?: string;
    owner?: string;
    mode?: string;
    stage?: string;
    nextActionReason?: string;
    draftReason?: string;
    lastAutomationNote?: string;
    senderEmail?: string;
    senderName?: string;
    senderSignature?: string;
    recipientEmail?: string;
    draftKind?: 'reply' | 'outbound' | string;
    draftCreatedAt?: string;
    draftUpdatedAt?: string;
    lastSentAt?: string;
    draftedCount?: number;
  };
  emailData?: {
    campaignName?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    text?: string;
    html?: string;
    contactName?: string;
    signalEngineEnabled?: boolean;
    signalOrigin?: string;
  };
  campaignDrafts?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface ComposerHandoffResponse {
  success: boolean;
  message: string;
  data: ComposerHandoff;
}

export interface OutreachAccessResponse {
  success: boolean;
  message: string;
  data: any;
}

export interface MomentumThreadResponse {
  success: boolean;
  message: string;
  data: MomentumThread;
}

export interface MomentumThreadListResponse {
  success: boolean;
  message: string;
  data: MomentumThread[];
  nextCursor?: string | null;
  hasMore?: boolean;
  pageSize?: number;
}

export interface MomentumComposerHandoffRequest {
  subject?: string;
  draftSubject?: string;
  draftBody?: string;
  contextHint?: string;
  companyName?: string;
  returnRoute?: string;
  returnTab?: string;
  returnThreadId?: string;
  reopenDraftReview?: boolean;
  draftKind?: 'reply' | 'outbound' | string;
}

export interface LeadVaultAudiencePreviewResponse {
  success: boolean;
  message: string;
  data: LeadVaultAudiencePreview;
}

export interface LeadVaultAudienceActivateResponse {
  success: boolean;
  message: string;
  data: {
    queue: Contact[];
    leadVaultContactIds: string[];
    leadVaultAudiencePreview: LeadVaultAudiencePreview;
    addedCount: number;
    usageConsumed: boolean;
  };
}

export interface CampaignDetailResponse {
  success: boolean;
  message: string;
  data: Campaign;
}

export interface CatalystRunResponse {
  success: boolean;
  message: string;
  data: CatalystRun;
}

export interface CatalystRunListResponse {
  success: boolean;
  message: string;
  data: CatalystRun[];
}

export type MailboxProviderId =
  'gmail' |
  'outlook' |
  'icloud' |
  'yahoo' |
  'dreamhost' |
  'other_imap' |
  string;

export interface MailboxConnectionSettings {
  host: string;
  port: number;
  secure: boolean;
}

export interface MailboxConfigSummary {
  id: string;
  displayName: string;
  emailAddress: string;
  provider: MailboxProviderId;
  providerLabel?: string;
  status?: string;
  capabilities?: string[];
  isPrimary?: boolean;
  advancedRequired?: boolean;
  imap: MailboxConnectionSettings;
  smtp: MailboxConnectionSettings;
  auth?: {
    username?: string;
    hasSecret?: boolean;
  };
  lastConnectionTestAt?: string;
  lastConnectionStatus?: string;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  lastSeenUid?: number;
  lastSeenMessageId?: string;
  createdAt?: string;
  lastUpdated?: string;
}

export interface MailboxConnectionTestRequest {
  id?: string;
  displayName?: string;
  emailAddress: string;
  provider: MailboxProviderId;
  secret: string;
  auth?: {
    username?: string;
  };
  imap?: Partial<MailboxConnectionSettings>;
  smtp?: Partial<MailboxConnectionSettings>;
}

export interface MailboxConnectionTestResponse {
  success: boolean;
  message: string;
  data: {
    success: boolean;
    mailbox: MailboxConfigSummary;
    checks: {
      smtpVerified: boolean;
      imapVerified: boolean;
    };
    message: string;
  };
}

export interface MailboxMessageListItem {
  id: string;
  mailboxId: string;
  uid: number | null;
  messageId?: string;
  subject: string;
  fromName?: string;
  fromEmail: string;
  receivedAt: string;
  unread: boolean;
  replied: boolean;
  hasAttachments?: boolean;
  preview?: string;
  classification?: string;
  signalSummary?: string;
  recommendedAction?: string;
  contactId?: string;
  threadId?: string;
  threadMatched?: boolean;
  replyDraftSubject?: string;
  replyDraftBody?: string;
  responderDecision?: string;
  responderReason?: string;
  responderSuppressed?: boolean;
  responderProcessedMessageId?: string;
}

export interface MailboxMessageDetail extends MailboxMessageListItem {
  to?: Array<{ name?: string; email: string; }>;
  cc?: Array<{ name?: string; email: string; }>;
  replyTo?: Array<{ name?: string; email: string; }>;
  references?: string[];
  inReplyTo?: string;
  text?: string;
  html?: string;
}

export interface MailboxReplyRequest {
  subject?: string;
  body?: string;
  text?: string;
  html?: string;
}

export interface MailboxReplyResponse {
  success: boolean;
  message: string;
  data: {
    delivered: boolean;
    mailboxId: string;
    messageId: string;
    accepted: string[];
    rejected: string[];
    subject: string;
    to: string;
  };
}

export interface MailboxDeleteMessageResponse {
  success: boolean;
  message: string;
  data: {
    deleted: boolean;
    mailboxId: string;
    messageId: string;
  };
}

export interface MailboxSignalSummary {
  mailboxId: string;
  syncedCount: number;
  skipped?: boolean;
  reason?: string;
  messages: Array<{
    id: string;
    mailboxId: string;
    messageId: string;
    uid: number | null;
    subject: string;
    fromEmail: string;
    fromName?: string;
    receivedAt: string;
    unread: boolean;
    replied: boolean;
    classification?: string;
    signalSummary?: string;
    recommendedAction?: string;
    contactId?: string;
    threadId?: string;
    threadMatched?: boolean;
    replyDraftSubject?: string;
    replyDraftBody?: string;
    responderDecision?: string;
    responderReason?: string;
    responderSuppressed?: boolean;
    responderProcessedMessageId?: string;
    preview?: string;
  }>;
}

export interface MailboxConfigListResponse {
  success: boolean;
  message: string;
  data: MailboxConfigSummary[];
}

export interface MailboxConfigMutationResponse {
  success: boolean;
  message: string;
  data: MailboxConfigSummary;
}

export interface MailboxMessageListResponse {
  success: boolean;
  message: string;
  data: MailboxMessageListItem[];
}

export interface MailboxMessageDetailResponse {
  success: boolean;
  message: string;
  data: MailboxMessageDetail;
}

export interface MailboxSignalSummaryResponse {
  success: boolean;
  message: string;
  data: MailboxSignalSummary;
}

export interface OutreachProvisioningState {
  tenantId: string;
  outreachPaidAccess: boolean;
  provisioningStatus: string;
  provisioningMethod: string;
  provisioningMode: string;
  senderEmail: string;
  domain: string;
  authenticatedDomain: string;
  domainAuthenticationStatus: string;
  sendgridDomainAuthId: string;
  sendgridSenderId: string;
  sendgridSubuserUsername: string;
  notes: string;
  requestedAt?: string;
  provisionedAt?: string;
  updatedAt?: string;
}

export interface OutreachProvisioningResponse {
  success: boolean;
  message?: string;
  data: OutreachProvisioningState;
}

export interface OutreachProvisioningRequestPayload {
  tenantId?: string;
  userId?: string;
  userEmail?: string;
  provisioningStatus?: string;
  provisioningMethod?: string;
  provisioningMode?: string;
  senderEmail: string;
  domain?: string;
  authenticatedDomain?: string;
  domainAuthenticationStatus?: string;
  notes?: string;
  sendgridDomainAuthId?: string;
  sendgridSenderId?: string;
  sendgridSubuserUsername?: string;
}

@Injectable( { providedIn: 'root' } )
export class OutreachApiService {
  private baseUrl = `${environment.backendURL}`;
  constructor ( private http: HttpClient, private logger: LoggerService ) { }

  private buildHeaders ( tenantId?: string, userId?: string, userEmail?: string ): HttpHeaders {
    let h = new HttpHeaders();
    if ( tenantId ) h = h.set( 'x-tenant-id', tenantId );
    if ( userId ) h = h.set( 'x-user-id', userId );
    if ( userEmail ) h = h.set( 'x-user-email', userEmail );
    return h;
  }

  updateSequenceStep (
    sequenceId: string,
    stepId: string,
    payload: any,
    context?: { tenantId?: string; userId?: string; userEmail?: string; }
  ): Observable<any> {
    const headers = this.buildHeaders( context?.tenantId, context?.userId, context?.userEmail );
    return this.http.patch<any>(
      `${this.baseUrl}/outreach/sequences/${encodeURIComponent( sequenceId )}/steps/${encodeURIComponent( stepId )}`,
      payload,
      { headers }
    );
  }

  getSequenceById ( sequenceId: string, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<CampaignDetailResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.get<CampaignDetailResponse>( `${this.baseUrl}/outreach/sequences/${encodeURIComponent( sequenceId )}`, { headers } );
  }

  // The real, operator-configured Daily Auto-Send Cap (Operator Control
  // Panel's dailyAutoSendTarget) and how many auto-sends actually went out
  // today against it - used by EmailSendingStatusComponent's warmup gauge.
  getAutoSendCapStatus ( opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<{
    success: boolean;
    message: string;
    data: {
      dailyAutoSendTarget: number;
      sentToday: number;
      remaining: number;
      sendPolicyModeAtSend: string;
    };
  }> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.get<any>( `${this.baseUrl}/outreach/momentum/auto-send-cap-status`, { headers } );
  }

  previewLeadVaultAudience ( payload: { queue?: Contact[]; limit?: number; }, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<LeadVaultAudiencePreviewResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<LeadVaultAudiencePreviewResponse>( `${this.baseUrl}/outreach/lead-vault/preview`, payload, { headers } );
  }

  activateLeadVaultAudience ( payload: { queue?: Contact[]; limit?: number; }, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<LeadVaultAudienceActivateResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<LeadVaultAudienceActivateResponse>( `${this.baseUrl}/outreach/lead-vault/activate`, payload, { headers } );
  }

  getComposerHandoff ( handoffId: string, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<ComposerHandoffResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.get<ComposerHandoffResponse>( `${this.baseUrl}/outreach/composer-handoffs/${encodeURIComponent( handoffId )}`, { headers } );
  }

  getOutreachAccess ( opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<OutreachAccessResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.get<OutreachAccessResponse>( `${this.baseUrl}/outreach/access`, { headers } );
  }

  listOutreachContacts ( opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<ContactListResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.get<ContactListResponse>( `${this.baseUrl}/outreach/contacts`, { headers } );
  }

  getOutreachContactById ( contactId: string, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<ContactResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.get<ContactResponse>( `${this.baseUrl}/outreach/contacts/${encodeURIComponent( contactId )}`, { headers } );
  }

  getOutreachContactByEmail ( email: string, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<ContactResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    const params = new HttpParams().set( 'email', email );
    return this.http.get<ContactResponse>( `${this.baseUrl}/outreach/contacts/by-email`, { headers, params } );
  }

  logSentEmail ( contactId: string, payload: { subject?: string; html?: string; lastContacted?: string; sentConfirmed?: boolean; }, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<ContactResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<ContactResponse>( `${this.baseUrl}/outreach/contacts/${encodeURIComponent( contactId )}/log-email`, payload, { headers } );
  }

  updateOutreachContact ( contactId: string, payload: Partial<Contact>, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<ContactResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.put<ContactResponse>( `${this.baseUrl}/outreach/contacts/${encodeURIComponent( contactId )}`, payload, { headers } );
  }

  // Deliberately a separate endpoint from the monorepo's getOutboxCockpitBootstrap -
  // that endpoint (and outbox-cockpit itself) is dead code this extraction skips.
  getSignalEngineBootstrap ( opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<{
    success: boolean;
    message: string;
    data: {
      threads: MomentumThread[];
      summary: {
        activeThreads: number;
        queuedActions: number;
        sending: number;
        hotLeads: number;
        warmLeads: number;
        draftReady: number;
        stalledWaiting: number;
        needsHuman: number;
      };
      generatedAt: string;
    };
  }> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.get<any>( `${this.baseUrl}/outreach/signal-engine/bootstrap`, { headers } );
  }

  upsertMomentumThread ( payload: Partial<MomentumThread>, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<MomentumThreadResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<MomentumThreadResponse>( `${this.baseUrl}/outreach/momentum-threads`, payload, { headers } );
  }

  sendManualMomentumReplyDraft ( payload: { contactId: string; draftSubject?: string; draftBody?: string; }, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<MomentumThreadResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<MomentumThreadResponse>( `${this.baseUrl}/outreach/momentum-threads/manual-reply/send-draft`, payload, { headers } );
  }

  approveMomentumDraft ( contactId: string, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<MomentumThreadResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<MomentumThreadResponse>( `${this.baseUrl}/outreach/momentum-threads/${encodeURIComponent( contactId )}/approve-draft`, {}, { headers } );
  }

  approveMomentumDraftsBatch ( contactIds: string[], opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<{ success: boolean; message: string; data: { approvedCount: number; failedCount: number; results: Array<{ contactId: string; success: boolean; error?: string; message?: string; }>; }; }> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<{ success: boolean; message: string; data: { approvedCount: number; failedCount: number; results: Array<{ contactId: string; success: boolean; error?: string; message?: string; }>; }; }>( `${this.baseUrl}/outreach/momentum-threads/approve-drafts-batch`, { contactIds }, { headers } );
  }

  rejectMomentumDraft ( contactId: string, payload: { draftKind?: 'outbound' | 'reply'; rejectedDraftSubject?: string; rejectedDraftBody?: string; rejectionReason?: string; } = {}, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<MomentumThreadResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<MomentumThreadResponse>( `${this.baseUrl}/outreach/momentum-threads/${encodeURIComponent( contactId )}/reject-draft`, payload, { headers } );
  }

  // Queues selected drafts for Maya to rewrite in the background (paced,
  // rate-limited) instead of rewriting them synchronously one at a time -
  // queued drafts disappear from Drafts until the rewrite pass finishes.
  rejectRewriteMomentumDraftsBatch ( contactIds: string[], opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<{ success: boolean; message: string; data: { queuedCount: number; failedCount: number; results: Array<{ contactId: string; success: boolean; error?: string; message?: string; }>; }; }> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<{ success: boolean; message: string; data: { queuedCount: number; failedCount: number; results: Array<{ contactId: string; success: boolean; error?: string; message?: string; }>; }; }>( `${this.baseUrl}/outreach/momentum-threads/reject-rewrite-drafts-batch`, { contactIds }, { headers } );
  }

  sendMomentumDraftTest ( contactId: string, payload: { recipientEmail?: string; } = {}, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<{ success: boolean; message: string; data: { recipientEmail: string; subject: string; }; }> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<{ success: boolean; message: string; data: { recipientEmail: string; subject: string; }; }>( `${this.baseUrl}/outreach/momentum-threads/${encodeURIComponent( contactId )}/send-draft-test`, payload, { headers } );
  }

  // Plain reject - discards the current draft with no rewrite attempt (distinct
  // from rejectMomentumDraft, which always has Maya try again).
  discardMomentumDraft ( contactId: string, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<MomentumThreadResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<MomentumThreadResponse>( `${this.baseUrl}/outreach/momentum-threads/${encodeURIComponent( contactId )}/discard-draft`, {}, { headers } );
  }

  // Removes a needs-human-edit thread from the Plan tab (soft-archive, not a
  // hard delete) - the contact stays eligible for Maya's normal rotation to
  // pick back up later.
  dismissMomentumThreadFromPlan ( contactId: string, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<{ success: boolean; message: string; data: { contactId: string; archived: boolean; }; }> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<{ success: boolean; message: string; data: { contactId: string; archived: boolean; }; }>( `${this.baseUrl}/outreach/momentum-threads/${encodeURIComponent( contactId )}/dismiss-from-plan`, {}, { headers } );
  }

  listMailboxes ( opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<MailboxConfigListResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.get<MailboxConfigListResponse>( `${this.baseUrl}/outreach/mailboxes`, { headers } );
  }

  testMailboxConnection ( payload: MailboxConnectionTestRequest, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<MailboxConnectionTestResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<MailboxConnectionTestResponse>( `${this.baseUrl}/outreach/mailboxes/test`, payload, { headers } );
  }

  startGoogleMailboxOAuth ( opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<{ success: boolean; message: string; data: { url: string; provider: string; }; }> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<{ success: boolean; message: string; data: { url: string; provider: string; }; }>( `${this.baseUrl}/outreach/mailboxes/oauth/google/start`, {}, { headers } );
  }

  saveMailbox ( payload: MailboxConnectionTestRequest, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<MailboxConfigMutationResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<MailboxConfigMutationResponse>( `${this.baseUrl}/outreach/mailboxes`, payload, { headers } );
  }

  syncMailbox ( mailboxId: string, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<MailboxSignalSummaryResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<MailboxSignalSummaryResponse>( `${this.baseUrl}/outreach/mailboxes/${encodeURIComponent( mailboxId )}/sync`, {}, { headers } );
  }

  listMailboxMessages ( mailboxId: string, opts: { tenantId?: string; userId?: string; userEmail?: string; limit?: number; } = {} ): Observable<MailboxMessageListResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    let params = new HttpParams();
    if ( opts.limit ) params = params.set( 'limit', String( opts.limit ) );
    return this.http.get<MailboxMessageListResponse>( `${this.baseUrl}/outreach/mailboxes/${encodeURIComponent( mailboxId )}/messages`, { headers, params } );
  }

  getMailboxMessage ( mailboxId: string, messageId: string, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<MailboxMessageDetailResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.get<MailboxMessageDetailResponse>( `${this.baseUrl}/outreach/mailboxes/${encodeURIComponent( mailboxId )}/messages/${encodeURIComponent( messageId )}`, { headers } );
  }

  replyToMailboxMessage ( mailboxId: string, messageId: string, payload: MailboxReplyRequest, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<MailboxReplyResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<MailboxReplyResponse>( `${this.baseUrl}/outreach/mailboxes/${encodeURIComponent( mailboxId )}/messages/${encodeURIComponent( messageId )}/reply`, payload, { headers } );
  }

  deleteMailboxMessage ( mailboxId: string, messageId: string, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<MailboxDeleteMessageResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.delete<MailboxDeleteMessageResponse>( `${this.baseUrl}/outreach/mailboxes/${encodeURIComponent( mailboxId )}/messages/${encodeURIComponent( messageId )}`, { headers } );
  }

  disconnectMailbox ( mailboxId: string, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<{ success: boolean; message: string; data: { deleted: boolean; mailboxId: string; }; }> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.delete<{ success: boolean; message: string; data: { deleted: boolean; mailboxId: string; }; }>( `${this.baseUrl}/outreach/mailboxes/${encodeURIComponent( mailboxId )}`, { headers } );
  }

  setPrimaryMailbox ( mailboxId: string, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<MailboxConfigMutationResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<MailboxConfigMutationResponse>( `${this.baseUrl}/outreach/mailboxes/${encodeURIComponent( mailboxId )}/set-primary`, {}, { headers } );
  }

  getOutreachProvisioning ( opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<OutreachProvisioningResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.get<OutreachProvisioningResponse>( `${this.baseUrl}/outreach/provisioning`, { headers } );
  }

  requestOutreachProvisioning ( payload: OutreachProvisioningRequestPayload, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<OutreachProvisioningResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<OutreachProvisioningResponse>( `${this.baseUrl}/outreach/provisioning/request`, payload, { headers } );
  }

  createMomentumComposerHandoff ( contactId: string, payload: MomentumComposerHandoffRequest = {}, opts: { tenantId?: string; userId?: string; userEmail?: string; } = {} ): Observable<ComposerHandoffResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<ComposerHandoffResponse>( `${this.baseUrl}/outreach/momentum-threads/${encodeURIComponent( contactId )}/composer-handoff`, payload, { headers } );
  }

  createCatalystRun (
    payload: {
      name?: string;
      source?: string;
      includeLeadVaultContacts?: boolean;
      plannedCount?: number;
      eligibleCount?: number;
      invalidCount?: number;
      queuedCount?: number;
      skippedCount?: number;
      removedCount?: number;
      contactIds?: string[];
      createdByUserId?: string;
      createdByUserEmail?: string;
    },
    opts: { tenantId?: string; userId?: string; userEmail?: string; } = {}
  ): Observable<CatalystRunResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.post<CatalystRunResponse>( `${this.baseUrl}/outreach/catalyst-runs`, payload, { headers } );
  }

  listCatalystRuns (
    request: { limit?: number; } = {},
    opts: { tenantId?: string; userId?: string; userEmail?: string; } = {}
  ): Observable<CatalystRunListResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    let params = new HttpParams();
    if ( request.limit ) params = params.set( 'limit', String( request.limit ) );
    return this.http.get<CatalystRunListResponse>( `${this.baseUrl}/outreach/catalyst-runs`, { headers, params } );
  }

  finalizeCatalystRun (
    runId: string,
    payload: { status?: string; queuedCount?: number; skippedCount?: number; removedCount?: number; },
    opts: { tenantId?: string; userId?: string; userEmail?: string; } = {}
  ): Observable<CatalystRunResponse> {
    const headers = this.buildHeaders( opts.tenantId, opts.userId, opts.userEmail );
    return this.http.patch<CatalystRunResponse>(
      `${this.baseUrl}/outreach/catalyst-runs/${encodeURIComponent( runId )}`,
      payload,
      { headers }
    );
  }
}
