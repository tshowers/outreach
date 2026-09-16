import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, TimeoutError, catchError, map, throwError, timeout } from 'rxjs';

import { environment } from '../../environments/environment';
import { LoggerService } from './logger.service';
import { Contact } from '../models/contact.model';
import { Email } from '../models/email.model';

export interface EmailDraftingStageOption {
  key: string;
  label: string;
  description: string;
}

export interface EmailDraftingToneOption {
  key: string;
  label: string;
  description: string;
}

export interface EmailDraftingMetadata {
  stages: EmailDraftingStageOption[];
  tones: EmailDraftingToneOption[];
}

export interface StructuredEmailDraftRequest {
  tenantId?: string | null;
  userId?: string | null;
  subject?: string;
  htmlContext?: string;
  selectedContact?: any;
  sender?: any;
  reason?: string | null;
  campaignName?: string | null;
  handoffSource?: string | null;
  draftIntent?: string | null;
  selectedStageKey?: string | null;
  selectedToneKey?: string | null;
  toneCode?: string | null;
  promptMode?: string | null;
  priorSendContext?: any;
  recipientEmail?: string | null;
  threadContactId?: string | null;
  threadId?: string | null;
  threadCampaignId?: string | null;
  threadCampaignName?: string | null;
  threadDraftKind?: string | null;
  senderPersona?: string | null;
  rewriteMode?: boolean | null;
  rejectedDraftSubject?: string | null;
  rejectedDraftBody?: string | null;
}

export interface StructuredEmailDraftResponse {
  subject: string;
  bodyHtml: string;
  summary: string;
  draftMode: string;
  sourceContextType: string;
  metadata?: any;
}

/**
 * Trimmed copy of services/email.service.ts (987 lines in the monorepo).
 * Ported only the methods a grep of every in-scope component/service in
 * this extraction actually calls: sendEmail (EmailCreateComponent),
 * generateEmailDraftFromEditor + onCheckGrammar (EmailEditorComponent's
 * Maya-rewrite/grammar-check toolbar buttons, also used by
 * EmailCreateComponent and shared/page/email-option-button),
 * getEmailDraftingMetadata (EmailCreateComponent's stage/tone pickers),
 * verifyEmailWithSendGrid (EmailCreateComponent's send-time validation),
 * and the in-memory campaign-draft handoff cache
 * (storeCampaignDrafts/getCampaignDrafts/updateDraftStage/clearDrafts,
 * used to pass a freshly-generated campaign's per-stage drafts from
 * EmailComposerParentComponent into EmailCreateComponent without a round
 * trip through the backend).
 *
 * generateEmailDraftFromEditor/getEmailDraftingMetadata/onCheckGrammar
 * called through the monorepo's separate 500+ line OpenAIService, which
 * itself just POSTs/GETs the same backend endpoints with a static Bearer
 * API key header (same pattern as NetworkInsightService's contactInsight
 * call) - folded directly in here rather than porting that whole service
 * for three thin wrappers.
 */
@Injectable( { providedIn: 'root' } )
export class EmailService {
  private campaignDrafts: any;

  constructor ( private http: HttpClient, private logger: LoggerService ) { }

  private buildSendEmailError ( err: unknown ): Error {
    if ( err instanceof TimeoutError ) {
      return new Error( 'The email service did not respond within 25 seconds. No retry was made because the email may already have been accepted. Check your inbox before trying again.' );
    }

    if ( err instanceof HttpErrorResponse ) {
      const payload = err.error && typeof err.error === 'object' ? err.error as Record<string, any> : {};
      const backendError = String( payload?.['error'] || payload?.['message'] || '' ).trim();
      const cap = Number( payload?.['cap'] );
      const used = Number( payload?.['used'] );
      const maxHtmlBytes = Number( payload?.['maxHtmlBytes'] );
      const actualHtmlBytes = Number( payload?.['actualHtmlBytes'] );

      if ( backendError === 'daily_cap_exceeded' ) {
        const detail = Number.isFinite( cap ) && Number.isFinite( used )
          ? `Daily email cap reached for this sender warmup (${used}/${cap} used today).`
          : 'Daily email cap reached for this sender warmup.';
        return new Error( detail );
      }

      if ( backendError === 'email_html_too_large' ) {
        const detail = Number.isFinite( maxHtmlBytes ) && Number.isFinite( actualHtmlBytes )
          ? `Email HTML is too large for safe delivery (${Math.round( actualHtmlBytes / 1024 )} KiB). Keep it under ${Math.round( maxHtmlBytes / 1024 )} KiB.`
          : 'Email HTML is too large for safe delivery. Reduce the pasted template size and try again.';
        return new Error( detail );
      }

      if ( err.status === 503 ) {
        return new Error( 'The email service is temporarily unavailable (503). Your preview is still open; wait a moment and try again.' );
      }

      if ( err.status === 0 ) {
        return new Error( 'The email service could not be reached. This may be a temporary outage or a browser CORS/network failure. Your preview is still open; try again in a moment.' );
      }

      if ( backendError ) {
        return new Error( backendError );
      }

      if ( err.message ) {
        return new Error( err.message );
      }
    }

    if ( err instanceof Error ) {
      return err;
    }

    return new Error( 'Email send failed.' );
  }

  public sendEmail ( email: Email, tenantId: string, user: string ): Observable<any> {
    this.logger.info( 'SEND EMAIL', {
      tenantId,
      user,
      to: ( email as any )?.to,
      subject: ( email as any )?.subject
    } );

    const headers = new HttpHeaders().set( 'Authorization', `Bearer ${environment.apiKey}` );

    return this.http.post( `${environment.backendURL}/send-email`, { ...email, tenantId }, { headers } ).pipe(
      // Do not retry this POST: a delayed response can mean the provider already
      // accepted the message, and retrying could send a duplicate email.
      timeout( { each: 25_000 } ),
      catchError( err => {
        const sendError = this.buildSendEmailError( err );
        this.logger.error( 'Email server returned error:', {
          originalError: err,
          message: sendError.message
        } );
        return throwError( () => sendError );
      } )
    );
  }

  /** Verify an email address with SendGrid's Email Validation API. */
  verifyEmailWithSendGrid ( email: string ): Observable<any> {
    return this.http.post<any>( `${environment.backendURL}/verify-email-sendgrid`, { email } );
  }

  storeCampaignDrafts ( drafts: any ): void {
    this.campaignDrafts = drafts;
  }

  updateDraftStage ( stage: string, subject: string, body: string ): void {
    if ( this.campaignDrafts?.drafts?.[stage] ) {
      this.campaignDrafts.drafts[stage].subject = subject;
      this.campaignDrafts.drafts[stage].body = body;
    }
  }

  getCampaignDrafts (): any {
    return this.campaignDrafts;
  }

  clearDrafts () {
    this.campaignDrafts = undefined;
  }

  /**
   * Masks an email address for logging purposes (e.g. "jo***@domain.com").
   */
  private maskEmailForLog ( email: any ): string {
    const s = String( email || '' ).trim();
    if ( !s || !s.includes( '@' ) ) return s;
    const [u, d] = s.split( '@' );
    const uMasked = u.length <= 2 ? `${u[0] || '*'}*` : `${u.slice( 0, 2 )}***`;
    return `${uMasked}@${d}`;
  }

  /**
   * Generate an email draft via the backend's /email-drafting/draft
   * endpoint (the monorepo's OpenAIService.requestStructuredEmailDraft).
   * Subject is optional - any text already in the editor is treated as
   * context, and the backend may suggest its own subject.
   */
  public generateEmailDraftFromEditor ( args: {
    userId: string;
    tenantId?: string;
    subject: string;
    htmlContext?: string;
    selectedContact?: Contact | null;
    sender?: Contact | undefined;
    reason?: string | null;
    campaignName?: string | null;
    toneCode?: string | null;
    promptMode?: 'cold_first_touch' | 'signal_engine_followup' | 'engaged_followup' | 'campaign_followup' | null;
    handoffSource?: string | null;
    draftIntent?: string | null;
    priorSendContext?: any;
    threadContactId?: string | null;
    threadId?: string | null;
    threadCampaignId?: string | null;
    threadCampaignName?: string | null;
    threadDraftKind?: string | null;
    senderPersona?: string | null;
    rewriteMode?: boolean | null;
    rejectedDraftSubject?: string | null;
    rejectedDraftBody?: string | null;
  }, _correspondenceHistory: any ): Observable<{ subject: string; body: string; ctaLink: string | null; }> {
    const subject = String( args.subject || '' ).trim();
    const htmlContext = String( args.htmlContext || '' ).trim();
    const toneCode = String( args.toneCode || 'direct' ).trim();
    const tenantId = String( ( args as any )?.tenantId || '' ).trim();
    const inferredDraftIntent =
      String( args.handoffSource || '' ).trim().toLowerCase() === 'signal_engine_thread'
        ? 'needs_you_assist'
        : ( String( args.promptMode || '' ).trim().toLowerCase() === 'campaign_followup'
          ? 'campaign_followup'
          : ( String( args.promptMode || '' ).trim().toLowerCase() === 'engaged_followup'
            ? 'manual_followup'
            : 'fresh_outbound' ) );
    const draftIntent = String( args.draftIntent || inferredDraftIntent ).trim();

    const contactEmail = ( args.selectedContact as any )?.email
      || ( Array.isArray( ( args.selectedContact as any )?.emailAddresses )
        ? ( args.selectedContact as any )?.emailAddresses?.[0]?.emailAddress
        : '' );

    this.logger.info( 'Structured Email Draft request (preview):', {
      userId: args.userId,
      tenantId,
      subject,
      toneCode,
      draftIntent,
      promptMode: args.promptMode || null,
      handoffSource: args.handoffSource || null,
      threadId: args.threadId || null,
      hasReason: !!String( args.reason || '' ).trim(),
      contactEmail: this.maskEmailForLog( contactEmail ),
    } );

    const payload: StructuredEmailDraftRequest = {
      tenantId,
      userId: args.userId,
      subject,
      htmlContext,
      selectedContact: args.selectedContact || null,
      sender: args.sender || null,
      reason: args.reason || null,
      campaignName: args.campaignName || null,
      handoffSource: args.handoffSource || null,
      draftIntent,
      selectedStageKey: String( ( args.selectedContact as any )?.emailStage || '' ).trim() || null,
      selectedToneKey: toneCode || null,
      toneCode,
      promptMode: args.promptMode || null,
      priorSendContext: args.priorSendContext || null,
      recipientEmail: contactEmail || null,
      threadContactId: args.threadContactId || null,
      threadId: args.threadId || null,
      threadCampaignId: args.threadCampaignId || null,
      threadCampaignName: args.threadCampaignName || null,
      threadDraftKind: args.threadDraftKind || null,
      senderPersona: String( args.senderPersona || '' ).trim() || null,
      rewriteMode: args.rewriteMode === true,
      rejectedDraftSubject: String( args.rejectedDraftSubject || '' ).trim() || null,
      rejectedDraftBody: String( args.rejectedDraftBody || '' ).trim() || null,
    };

    const headers = new HttpHeaders().set( 'Authorization', `Bearer ${environment.apiKey}` );

    return this.http.post<{ success: boolean; data: StructuredEmailDraftResponse; }>(
      `${environment.backendURL}/email-drafting/draft`,
      payload,
      { headers }
    ).pipe(
      map( ( resp: any ) => {
        const parsed = resp?.data || resp || {};
        return {
          subject: String( parsed?.subject || '' ).trim(),
          body: String( parsed?.bodyHtml || parsed?.body || '' ).trim(),
          ctaLink: null
        };
      } ),
      catchError( ( err: any ) => {
        this.logger.error( 'generateEmailDraftFromEditor failed:', err );
        return throwError( () => err );
      } )
    );
  }

  public getEmailDraftingMetadata (): Observable<EmailDraftingMetadata> {
    const headers = new HttpHeaders().set( 'Authorization', `Bearer ${environment.apiKey}` );
    return this.http.get<{ success: boolean; data: EmailDraftingMetadata; }>(
      `${environment.backendURL}/email-drafting/metadata`,
      { headers }
    ).pipe(
      map( response => response?.data || { stages: [], tones: [] } )
    );
  }

  onCheckGrammar ( _userId: string, plainText: string ): Observable<any> {
    const prompt = `
  Act as a grammar assistant.
  Review the following text for grammar, spelling, and punctuation issues.
  Return ONLY a JSON array of issues where each issue has:
    - "original": the incorrect text,
    - "suggestion": the corrected text,
    - "explanation": a short explanation of the fix.

  TEXT:
  ${plainText}
  `;

    const headers = new HttpHeaders().set( 'Authorization', `Bearer ${environment.apiKey}` );
    return this.http.post<any>( `${environment.backendURL}/grammar-check`, { prompt }, { headers } ).pipe(
      catchError( ( error ) => {
        this.logger.error( error );
        return throwError( () => error );
      } )
    );
  }
}
