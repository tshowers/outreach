import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface OutreachAssistantPageContext {
  feature: string;
  page: string;
  route?: string;
  mode?: string;
  title?: string;
  description?: string;
  allowedActions?: string[];
  selectedEntityType?: string;
  selectedEntityId?: string;
  summary?: Record<string, any>;
  dataPreview?: Record<string, any>;
  /** Composer-specific fields email-create.component.ts embeds - what
   * AssistantComposerFlowService reads to know the current recipient/draft
   * state of the open composer. */
  composerContext?: Record<string, any>;
}

export interface OutreachAssistantActivityEvent {
  feature: string;
  page: string;
  action: string;
  route?: string;
  mode?: string;
  summary?: Record<string, any>;
  meta?: Record<string, any>;
}

export interface OutreachAssistantTranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantDraftPayload {
  subject?: string;
  html?: string;
  body?: string;
}

export interface AssistantComposerContactPayload {
  contact: unknown;
  source?: string;
  draftPayload?: AssistantDraftPayload;
}

/**
 * Real implementation of the bus every ported Outreach page already calls
 * into - same pattern as Network's/Pulse's/Moves'/Docs' signal services,
 * but wider: EmailCreateComponent already subscribes to
 * `assistantDraftApply$` and `assistantComposerContactApply$` expecting the
 * assistant chat to push a drafted email and a resolved contact into the
 * composer - that hand-off is the actual point of Outreach's assistant, so
 * (unlike every other no-op stub in this rollout) these two get real
 * `request*` methods that push into the subjects, not just observables that
 * sit there. `engagementActionRequest$` stays inert (never emits) - that's
 * suite-wide engagement-decision territory, same call as every other
 * product's port.
 */
@Injectable( { providedIn: 'root' } )
export class OutreachAssistantSignalService {
  private readonly engagementActionRequestSubject = new Subject<{ action: string;[key: string]: unknown; } | null>();
  readonly engagementActionRequest$: Observable<{ action: string;[key: string]: unknown; } | null> = this.engagementActionRequestSubject.asObservable();

  private readonly assistantDraftApplySubject = new Subject<AssistantDraftPayload | null>();
  readonly assistantDraftApply$: Observable<AssistantDraftPayload | null> = this.assistantDraftApplySubject.asObservable();

  private readonly assistantComposerContactApplySubject = new Subject<AssistantComposerContactPayload | null>();
  readonly assistantComposerContactApply$: Observable<AssistantComposerContactPayload | null> = this.assistantComposerContactApplySubject.asObservable();

  private readonly pageContextSubject = new BehaviorSubject<OutreachAssistantPageContext | null>( null );
  private readonly transcriptInSubject = new Subject<OutreachAssistantTranscriptMessage>();
  private readonly activitySubject = new Subject<OutreachAssistantActivityEvent>();
  private readonly unreadSubject = new BehaviorSubject<boolean>( false );
  private readonly readySubject = new BehaviorSubject<boolean>( false );

  readonly pageContext$ = this.pageContextSubject.asObservable();
  readonly transcriptIn$ = this.transcriptInSubject.asObservable();
  readonly activity$ = this.activitySubject.asObservable();
  readonly unread$ = this.unreadSubject.asObservable();
  readonly ready$ = this.readySubject.asObservable();

  get currentPageContext (): OutreachAssistantPageContext | null {
    return this.pageContextSubject.value;
  }

  emitAssistantActivity ( event: OutreachAssistantActivityEvent ): void {
    this.activitySubject.next( event );
  }

  setPageContext ( context: OutreachAssistantPageContext ): void {
    this.pageContextSubject.next( context );
  }

  /** Alias kept for email-composer-parent/email-processor call sites that
   * already use this name - loosely typed (matches the original stub's
   * `unknown` param) since email-processor/emailer.component.ts (Catalyst)
   * passes its own CatalystAssistantContext shape here, not
   * OutreachAssistantPageContext. Catalyst is deferred in this rollout (see
   * the assistant-box scoping decision notes), so this just stores
   * whatever it's given rather than validating a shape nothing reads yet. */
  setAssistantPageContext ( context: OutreachAssistantPageContext | Record<string, any> | null ): void {
    this.pageContextSubject.next( context as OutreachAssistantPageContext | null );
  }

  getPageContextSnapshot (): OutreachAssistantPageContext | null {
    return this.currentPageContext;
  }

  clearPageContext (): void {
    this.pageContextSubject.next( null );
  }

  pushTranscript ( message: OutreachAssistantTranscriptMessage ): void {
    this.transcriptInSubject.next( message );
  }

  markAssistantUnread (): void {
    this.unreadSubject.next( true );
  }

  clearAssistantUnread (): void {
    this.unreadSubject.next( false );
  }

  setSignalReady (): void {
    this.readySubject.next( true );
  }

  /** Hands a drafted email to whichever composer page is listening. */
  requestAssistantDraftApply ( payload: AssistantDraftPayload | null ): void {
    this.assistantDraftApplySubject.next( payload );
  }

  /** Hands a resolved contact (from the composer contact-choice flow) to whichever composer page is listening. */
  requestAssistantComposerContactApply ( payload: AssistantComposerContactPayload | null ): void {
    this.assistantComposerContactApplySubject.next( payload );
  }
}
