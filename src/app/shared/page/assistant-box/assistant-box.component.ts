import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { AssistantEngineService, AssistantEngineContext, AssistantEngineHelpers, AssistantEngineIO, AssistantEnginePatches } from '../../../services/assistant-engine.service';
import { OpenAIService } from '../../../services/open-ai.service';
import { OutreachAssistantCapabilitiesService } from '../../../services/outreach-assistant-capabilities.service';
import { AssistantBoxHelperService } from '../../../services/assistant-box-helper.service';
import { AssistantIntentRunnerService } from '../../../services/assistant-intent-runner.service';
import { AssistantComposerFlowService, ComposerAssistantResult, ComposerContactCandidate } from '../../../services/assistant-composer-flow.service';
import { EmailSentAssistantService } from '../../../services/email-sent-assistant.service';
import { EmailSentAssistantContext } from '../../../features/signal-engine/email-sent/email-sent.component';
import { SystemRecoveryService } from '../../../services/system-recovery.service';
import { OutreachAssistantSignalService, AssistantComposerContactPayload } from '../../../services/outreach-assistant-signal.service';
import { AssistantUiService } from '../../../services/assistant-ui.service';

type ChatMsg = { role: 'user' | 'assistant'; content: string; };

/**
 * Outreach's own assistant-box - trimmed port of TODD's
 * shared/page/assistant-box/assistant-box.component.ts. Unlike every other
 * product's port, this one KEEPS the composer flow (pendingComposer*
 * state, chooseComposerContactCandidate, handleComposerDraftResult,
 * isOnComposerPage, syncComposerConversationIdentity,
 * maybeSeedComposerGreeting, isAffirmativeReply/isNegativeReply/
 * isRetryReply) - that flow IS Outreach's product, not suite-wide
 * scaffolding. Dropped: the Catalyst early-intercept branch (deferred, see
 * the assistant-box scoping decision notes for this rollout's Outreach
 * pass), the Momentum Engine "goal" intercept, and TODD's landing-page
 * guest/demo mode - same drops as every other product's port.
 *
 * The 'email-sent' early intercept is wired up for real here (reconstructs
 * a lightweight EmailSentAssistantContext from the page-context summary/
 * dataPreview signal-engine.component.ts now publishes) - TODD's own
 * component never actually branched on that return value despite building
 * the full EmailSentAssistantService for it, so this finishes wiring
 * something that was already built upstream but left unused.
 */
@Component( {
    selector: 'app-assistant-box',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './assistant-box.component.html',
    styleUrls: ['./assistant-box.component.css']
} )
export class AssistantBoxComponent implements OnInit, OnChanges, OnDestroy {
    @Input() parentOwnsHistory = false;
    @Input() externalMode = false;
    @Input() pageContext: any = null;
    @Input() isOpen = false;
    @Input() userId: string | null | undefined;
    @Input() tenantId: string | null | undefined;
    @ViewChild( 'messageContainer' ) messageContainerRef?: ElementRef<HTMLElement>;
    @Output() message = new EventEmitter<ChatMsg>();
    @Output() navigateTo = new EventEmitter<any>();
    @Output() routeTo = new EventEmitter<any>();
    @Output() callAction = new EventEmitter<any>();

    inlineReply: any = null;
    showResponses = true;
    history: ChatMsg[] = [];
    pendingAction: { action: string; param: any; } | null = null;
    showConfirmPrompt = false;
    assistantPrompt = '';
    assistantResponse = '';
    isLoading = false;
    @Input() placeholder = 'Ask about an email, or tell me what you need.';
    PRODUCTION = false;

    private pendingComposerContactChoices: { prompt: string; candidates: ComposerContactCandidate[]; } | null = null;
    private pendingComposerGreetingContext: { firstName: string; fullName: string; } | null = null;
    private pendingComposerRetryPrompt: string | null = null;
    private lastComposerConversationIdentity: string | null = null;

    private openAISubscription: Subscription | null = null;
    private transcriptSubscription: Subscription | null = null;
    private lastContextSignature: string | null = null;

    constructor (
        private engine: AssistantEngineService,
        private openAIService: OpenAIService,
        private capabilities: OutreachAssistantCapabilitiesService,
        private boxHelper: AssistantBoxHelperService,
        private intentRunner: AssistantIntentRunnerService,
        private composerFlow: AssistantComposerFlowService,
        private emailSentAssistant: EmailSentAssistantService,
        private systemRecovery: SystemRecoveryService,
        private assistantBus: OutreachAssistantSignalService,
        private assistantUi: AssistantUiService,
    ) { }

    ngOnInit (): void {
        this.transcriptSubscription = this.assistantBus.transcriptIn$.subscribe( ( msg ) => {
            if ( !msg?.role || !msg?.content ) return;

            const content = msg.role === 'assistant'
                ? this.renderAssistantContent( msg.content )
                : String( msg.content );

            this.publishChatMessage( msg.role, content );
        } );
    }

    ngOnDestroy (): void {
        this.openAISubscription?.unsubscribe?.();
        this.transcriptSubscription?.unsubscribe?.();
    }

    ngOnChanges ( changes: SimpleChanges ): void {
        if ( changes['pageContext'] ) {
            this.syncComposerConversationIdentity();
            this.resetAssistantOnlyTranscriptIfContextShifted();
        }

        if ( changes['isOpen'] && this.isOpen ) {
            this.maybeSeedComposerGreeting();
        }

        if ( changes['pageContext'] && this.isOpen ) {
            this.maybeSeedComposerGreeting();
        }
    }

    // Template helpers ------------------------------------------------------
    private emitNavigation ( target: any ): void {
        const normalized = this.normalizeNavigationTarget( target );
        if ( !normalized ) return;

        this.navigateTo.emit( normalized );
        this.routeTo.emit( normalized );
    }

    private normalizeNavigationTarget ( target: any ): { path: string; queryParams?: any; fragment?: string; } | null {
        if ( !target ) return null;

        if ( typeof target === 'string' ) {
            const [pathWithMaybeLeadingSlash, fragment] = target.split( '#' );
            const [pathPart, queryString] = pathWithMaybeLeadingSlash.split( '?' );
            const path = pathPart.startsWith( '/' ) ? pathPart : `/${pathPart}`;
            const queryParams = queryString ? Object.fromEntries( new URLSearchParams( queryString ).entries() ) : undefined;
            return { path, queryParams, fragment: fragment || undefined };
        }

        if ( target.path ) {
            return {
                path: String( target.path ).startsWith( '/' ) ? String( target.path ) : `/${String( target.path )}`,
                queryParams: target.queryParams ?? target.params ?? undefined,
                fragment: target.fragment || undefined
            };
        }

        if ( target.route ) {
            return this.normalizeNavigationTarget( {
                path: target.route,
                queryParams: target.queryParams ?? target.param ?? target.params,
                fragment: target.fragment
            } );
        }

        return null;
    }

    private publishChatMessage ( role: 'user' | 'assistant', content: string ): void {
        if ( role === 'assistant' ) {
            const rendered = this.renderAssistantContent( content || '' );
            this.assistantResponse = rendered;
            content = rendered;
        }

        if ( !content ) return;

        if ( !this.parentOwnsHistory ) {
            this.history.push( { role, content } );
            this.scheduleAssistantScroll();
            return;
        }

        this.message.emit( { role, content } );
    }

    confirmAction (): void {
        if ( !this.pendingAction ) return;
        const { action, param } = this.pendingAction;
        if ( action === 'navigate' ) {
            this.emitNavigation( param );
        } else if ( action === 'applyAssistantComposerContact' ) {
            this.assistantBus.requestAssistantComposerContactApply( param as AssistantComposerContactPayload );
            this.pendingAction = null;
            this.showConfirmPrompt = false;

            if ( param?.draftPayload ) {
                this.pendingAction = {
                    action: 'applyAssistantDraftToPreview',
                    param: param.draftPayload
                };
                this.showConfirmPrompt = true;
                return;
            }
        } else if ( action === 'applyAssistantDraftToPreview' ) {
            this.assistantBus.requestAssistantDraftApply( param );
        } else {
            this.callAction.emit( { action, param } );
        }
        this.pendingAction = null;
        this.showConfirmPrompt = false;
    }

    cancelAction (): void {
        this.pendingAction = null;
        this.showConfirmPrompt = false;
    }

    onAssistantContentClick ( evt: MouseEvent ): void {
        const target = evt.target as HTMLElement | null;
        const routeLink = target?.closest?.( 'a.route-link' ) as HTMLAnchorElement | null;
        if ( !routeLink ) return;

        const dataPath = String( routeLink.getAttribute( 'data-path' ) || routeLink.getAttribute( 'href' ) || '' ).trim();
        const normalized = this.normalizeNavigationTarget( dataPath );
        if ( !normalized ) return;

        evt.preventDefault();
        evt.stopPropagation();
        this.emitNavigation( normalized );
    }

    onPromptChange ( v: string ): void {
        this.assistantPrompt = v;
    }

    applyInline (): void {
        const apply = this.inlineReply?.apply;
        if ( !apply ) return;
        this.emitNavigation( apply );
        this.inlineReply = null;
    }

    resetConversation (): void {
        this.history = [];
        this.inlineReply = null;
        this.pendingComposerContactChoices = null;
        this.pendingComposerGreetingContext = null;
        this.pendingComposerRetryPrompt = null;
        this.pendingAction = null;
        this.assistantPrompt = '';
        this.assistantResponse = '';
        this.showConfirmPrompt = false;
        this.isLoading = false;
    }

    private scheduleAssistantScroll ( delay = 0 ): void {
        if ( this.parentOwnsHistory ) return;
        this.assistantUi.scheduleScrollToBottom( this.messageContainerRef?.nativeElement || null, delay );
    }

    private renderAssistantContent ( content: string ): string {
        const raw = this.boxHelper.normalizeAssistantText( String( content || '' ) );
        if ( !raw ) return '';

        const withInlineMarkdown = this.boxHelper.stripBackticksAroundRoutes( raw )
            .replace( /\*\*(.*?)\*\*/g, '<strong>$1</strong>' );
        const looksHtml = /<\s*[a-zA-Z][\s\S]*?>/.test( raw );
        const html = looksHtml
            ? this.boxHelper.linkifyAppRoutes( withInlineMarkdown )
            : this.boxHelper.convertMarkdownToHtml( withInlineMarkdown );

        return this.boxHelper.normalizeAssistantHtml( html );
    }

    private buildRouteDisplayText ( target: any ): string {
        const normalized = this.normalizeNavigationTarget( target );
        if ( !normalized?.path ) return '';

        const query = normalized.queryParams
            ? new URLSearchParams(
                Object.entries( normalized.queryParams )
                    .filter( ( [_, value] ) => value !== undefined && value !== null && `${value}`.length > 0 )
                    .map( ( [key, value] ) => [key, String( value )] )
            ).toString()
            : '';

        const fragment = normalized.fragment ? `#${normalized.fragment}` : '';
        return `${normalized.path}${query ? `?${query}` : ''}${fragment}`;
    }

    private foldPendingActionIntoAssistantResponse (
        assistantResponse: string | null | undefined,
        pendingAction: { action: string; param: any; } | null | undefined,
        showConfirmPrompt: boolean | null | undefined
    ): { assistantResponse?: string; pendingAction: { action: string; param: any; } | null; showConfirmPrompt: boolean; } {
        const normalizedResponse = typeof assistantResponse === 'string' ? assistantResponse : '';
        const shouldConfirm = !!showConfirmPrompt;

        if ( !pendingAction || !shouldConfirm ) {
            return {
                assistantResponse: normalizedResponse || undefined,
                pendingAction: pendingAction ?? null,
                showConfirmPrompt: shouldConfirm
            };
        }

        if ( pendingAction.action === 'navigate' ) {
            const routeText = this.buildRouteDisplayText( pendingAction.param );
            const alreadyMentionsRoute = !!routeText && normalizedResponse.includes( routeText );
            const augmented = routeText
                ? `${normalizedResponse}${normalizedResponse ? '\n\n' : ''}${alreadyMentionsRoute ? '' : `Go to ${routeText}`}`.trim()
                : normalizedResponse;

            return { assistantResponse: augmented || undefined, pendingAction, showConfirmPrompt: false };
        }

        return { assistantResponse: normalizedResponse || undefined, pendingAction, showConfirmPrompt: false };
    }

    private extractAssistantErrorText ( err: any ): string {
        const parts = [
            err?.error?.message,
            err?.error?.error?.message,
            err?.message,
            err?.statusText,
            typeof err?.error === 'string' ? err.error : '',
        ]
            .filter( Boolean )
            .map( ( value ) => String( value ).toLowerCase() );

        return parts.join( ' ' );
    }

    private formatAssistantError ( err: any, area = 'general' ): string {
        const text = this.extractAssistantErrorText( err );
        const status = Number( err?.status || 0 );
        const looksLikeQuotaOrBilling = status === 429
            || text.includes( 'insufficient_quota' )
            || text.includes( 'quota' )
            || text.includes( 'rate limit' )
            || text.includes( 'too many requests' )
            || text.includes( 'billing' )
            || text.includes( 'credit balance' )
            || text.includes( 'credits' )
            || text.includes( 'exceeded your current quota' );

        if ( looksLikeQuotaOrBilling ) {
            return [
                '<div class="assistant-nudge">',
                '<strong>TODD could not finish that right now.</strong><br>',
                'It looks like the OpenAI Platform account may need attention because the balance, quota, or usage limit was reached.<br>',
                'Please try again shortly.',
                '</div>'
            ].join( '' );
        }

        const areaLabel = area === 'general' ? 'that' : `${area} right now`;
        return `<div class="assistant-nudge">I had trouble helping with ${areaLabel}. Please try again in a moment.</div>`;
    }

    private buildPageContextSnippet (): string {
        const ctx = this.pageContext;
        if ( !ctx || typeof ctx !== 'object' ) return '';

        const lines: string[] = [];
        if ( ctx.feature ) lines.push( `Feature: ${ctx.feature}` );
        if ( ctx.page ) lines.push( `Page: ${ctx.page}` );
        if ( ctx.mode ) lines.push( `Mode: ${ctx.mode}` );
        if ( ctx.title ) lines.push( `Page title: ${ctx.title}` );
        if ( ctx.description ) lines.push( `Page description: ${ctx.description}` );
        if ( ctx.summary ) lines.push( `Page summary: ${JSON.stringify( ctx.summary )}` );
        if ( ctx.dataPreview ) lines.push( `Page data preview: ${JSON.stringify( ctx.dataPreview )}` );

        return lines.length ? `\n\n[page-context]\n${lines.join( '\n' )}` : '';
    }

    private isOnComposerPage (): boolean {
        return String( this.pageContext?.page || '' ).trim().toLowerCase() === 'email-composer';
    }

    private hasEmailSentContext (): boolean {
        return String( this.pageContext?.page || '' ).trim().toLowerCase() === 'signal-engine'
            && String( this.pageContext?.summary?.activeLane || '' ).trim().toLowerCase() === 'sent';
    }

    /** Reconstructs a lightweight EmailSentAssistantContext from the plain
     * page-context object signal-engine.component.ts publishes (dataPreview/
     * summary), since this component only has the bus's serialized context,
     * not a live reference to EmailSentComponent's own state. */
    private buildEmailSentContextFromPageContext (): EmailSentAssistantContext | null {
        if ( !this.hasEmailSentContext() ) return null;
        const summary = this.pageContext?.summary || {};
        const preview = this.pageContext?.dataPreview || {};

        return {
            page: 'email-sent',
            rangeDays: 0,
            totalEmails: Number( preview.totalEmails || 0 ),
            openedEmails: Number( preview.openedEmails || 0 ),
            unopenedEmails: Number( preview.unopenedEmails || 0 ),
            clickedEmails: Number( preview.clickedEmails || 0 ),
            totalClicks: 0,
            clickThroughRate: Number( summary.emailClickThroughRate || 0 ),
            openRate: Number( summary.emailOpenRate || 0 ),
            followUpNow: Array.isArray( preview.followUpNow ) ? preview.followUpNow : [],
            warmRecipients: Array.isArray( preview.warmRecipients ) ? preview.warmRecipients : [],
            coldRecipients: Array.isArray( preview.coldRecipients ) ? preview.coldRecipients : [],
            openedNoClickRecipients: [],
            topSubjects: Array.isArray( preview.topSubjects ) ? preview.topSubjects : [],
            worstSubjects: [],
        } as EmailSentAssistantContext;
    }

    private getComposerConversationIdentity (): string | null {
        if ( !this.isOnComposerPage() ) return null;

        const composerContext = ( this.pageContext?.composerContext || {} ) as Record<string, any>;
        const selectedEntityId = String( this.pageContext?.selectedEntityId || '' ).trim();
        const selectedContactId = String( composerContext['selectedContactId'] || '' ).trim();
        const recipientEmail = String(
            composerContext['recipientEmail']
            || composerContext['selectedContactEmail']
            || ''
        ).trim().toLowerCase();

        return selectedEntityId || selectedContactId || recipientEmail || null;
    }

    private syncComposerConversationIdentity (): void {
        const nextIdentity = this.getComposerConversationIdentity();

        if ( !nextIdentity ) {
            this.lastComposerConversationIdentity = null;
            return;
        }

        const hasConversationState = this.history.length > 0
            || !!this.assistantResponse
            || !!this.pendingAction
            || !!this.inlineReply
            || !!this.pendingComposerContactChoices
            || !!this.pendingComposerGreetingContext;

        if (
            ( this.lastComposerConversationIdentity && this.lastComposerConversationIdentity !== nextIdentity )
            || ( !this.lastComposerConversationIdentity && hasConversationState )
        ) {
            this.resetConversation();
        }

        this.lastComposerConversationIdentity = nextIdentity;
    }

    private resetAssistantOnlyTranscriptIfContextShifted (): void {
        const nextSignature = this.buildContextSignature();
        const previousSignature = this.lastContextSignature;
        this.lastContextSignature = nextSignature;

        if ( !previousSignature || !nextSignature || previousSignature === nextSignature ) return;

        const hasUserAuthoredConversation = this.history.some( msg => msg.role === 'user' );
        if ( hasUserAuthoredConversation ) return;

        if ( this.history.length === 0 && !this.assistantResponse && !this.inlineReply && !this.pendingAction ) return;

        this.resetConversation();
    }

    private buildContextSignature (): string | null {
        const ctx = this.pageContext;
        if ( !ctx || typeof ctx !== 'object' ) return null;

        const summary = ctx.summary && typeof ctx.summary === 'object' ? ctx.summary : {};
        const signature = {
            feature: String( ctx.feature || '' ),
            page: String( ctx.page || '' ),
            route: String( ctx.route || '' ),
            mode: String( ctx.mode || '' ),
            selectedEntityId: String( ctx.selectedEntityId || '' ),
            summary: {
                activeLane: summary['activeLane'] ?? null,
            }
        };

        try {
            return JSON.stringify( signature );
        } catch {
            return `${signature.feature}|${signature.page}|${signature.route}|${signature.mode}`;
        }
    }

    private maybeSeedComposerGreeting (): void {
        if ( !this.isOnComposerPage() ) return;
        if ( this.history.length > 0 || this.assistantResponse || this.pendingAction || this.inlineReply ) return;

        const composerContext = ( this.pageContext?.composerContext || {} ) as Record<string, any>;
        const selectedContactName = String( composerContext['selectedContactName'] || '' ).trim();
        const selectedContactId = String( composerContext['selectedContactId'] || '' ).trim();
        if ( !selectedContactId || !selectedContactName ) return;

        const firstName = selectedContactName.split( /\s+/ ).filter( Boolean )[0] || selectedContactName;
        const message = this.boxHelper.normalizeAssistantHtml(
            this.boxHelper.convertMarkdownToHtml(
                `Do you want help drafting an email to ${firstName}?`
            )
        );
        this.pendingComposerGreetingContext = { firstName, fullName: selectedContactName };
        this.publishChatMessage( 'assistant', message );
    }

    private isAffirmativeReply ( prompt: string ): boolean {
        return /^(yes|yep|yeah|sure|ok|okay|please do|go ahead|absolutely|definitely)\b/i.test( String( prompt || '' ).trim() );
    }

    private isNegativeReply ( prompt: string ): boolean {
        return /^(no|nope|nah|not now|maybe later|cancel)\b/i.test( String( prompt || '' ).trim() );
    }

    private isRetryReply ( prompt: string ): boolean {
        return /^(please try again|try again|retry|again|yes please|please|go again)\b/i.test( String( prompt || '' ).trim() );
    }

    async chooseComposerContactCandidate ( candidate: ComposerContactCandidate ): Promise<void> {
        if ( !candidate?.contact ) return;
        const pending = this.pendingComposerContactChoices;
        if ( !pending?.prompt ) return;

        this.inlineReply = null;
        this.pendingComposerContactChoices = null;
        this.isLoading = true;
        this.pendingAction = null;
        this.showConfirmPrompt = false;

        try {
            const drafted = await this.composerFlow.draftFromChat( {
                prompt: pending.prompt,
                pageContext: this.pageContext,
                userId: this.userId,
                tenantId: this.tenantId,
                selectedContactOverride: candidate.contact,
                skipContactResolution: true
            } );
            this.isLoading = false;
            this.handleComposerDraftResult( drafted );
        } catch ( err: any ) {
            this.isLoading = false;
            const html = this.formatAssistantError( err, 'email drafting' );
            this.publishChatMessage( 'assistant', html );
        }
    }

    private handleComposerDraftResult ( drafted: ComposerAssistantResult ): void {
        this.pendingComposerRetryPrompt = null;
        this.assistantResponse = drafted.messageHtml;
        this.publishChatMessage( 'assistant', drafted.messageHtml );

        const resolution = drafted.contactResolution;
        if ( resolution?.status === 'multiple' && Array.isArray( resolution.candidates ) && resolution.candidates.length ) {
            this.pendingComposerContactChoices = {
                prompt: this.history.filter( msg => msg.role === 'user' ).slice( -1 )[0]?.content || this.assistantPrompt || '',
                candidates: resolution.candidates
            };
            this.inlineReply = { kind: 'composerContactChoices', payload: { candidates: resolution.candidates } };
            this.pendingAction = null;
            this.showConfirmPrompt = false;
            this.assistantPrompt = '';
            return;
        }

        if ( drafted.resolvedContact ) {
            if ( drafted.needsRecipientConfirmation ) {
                this.pendingAction = {
                    action: 'applyAssistantComposerContact',
                    param: { contact: drafted.resolvedContact, source: 'assistant_chat_composer', draftPayload: drafted.payload }
                };
                this.showConfirmPrompt = true;
                this.assistantPrompt = '';
                return;
            }

            this.assistantBus.requestAssistantComposerContactApply( { contact: drafted.resolvedContact, source: 'assistant_chat_composer' } );
        }

        if ( drafted.payload ) {
            this.pendingAction = { action: 'applyAssistantDraftToPreview', param: drafted.payload };
            this.showConfirmPrompt = true;
        } else {
            this.pendingAction = null;
            this.showConfirmPrompt = false;
        }

        this.assistantPrompt = '';
    }

    // Core: delegate to Engine ------------------------------------------------
    async askAssistant (): Promise<void> {
        const raw = ( this.assistantPrompt || '' ).trim();
        if ( !raw ) return;

        if ( this.pendingComposerRetryPrompt && this.isOnComposerPage() && this.isRetryReply( raw ) ) {
            this.pushUserTurn( raw );
            this.isLoading = true;
            this.pendingAction = null;
            this.showConfirmPrompt = false;
            this.inlineReply = null;
            this.pendingComposerContactChoices = null;

            try {
                const drafted = await this.composerFlow.draftFromChat( {
                    prompt: this.pendingComposerRetryPrompt,
                    pageContext: this.pageContext,
                    userId: this.userId,
                    tenantId: this.tenantId
                } );
                this.isLoading = false;
                this.handleComposerDraftResult( drafted );
            } catch ( err: any ) {
                this.isLoading = false;
                const html = this.formatAssistantError( err, 'email drafting' );
                this.publishChatMessage( 'assistant', html );
            }
            this.assistantPrompt = '';
            return;
        }

        if ( this.pendingComposerGreetingContext && this.isOnComposerPage() ) {
            this.pushUserTurn( raw );

            if ( this.isNegativeReply( raw ) ) {
                const declineMessage = this.boxHelper.normalizeAssistantHtml(
                    this.boxHelper.convertMarkdownToHtml(
                        `Okay. If you want, tell me the tone or goal for the email to ${this.pendingComposerGreetingContext.firstName} and I'll help from there.`
                    )
                );
                this.publishChatMessage( 'assistant', declineMessage );
                this.pendingComposerGreetingContext = null;
                this.assistantPrompt = '';
                return;
            }

            if ( this.isAffirmativeReply( raw ) ) {
                this.isLoading = true;
                this.pendingAction = null;
                this.showConfirmPrompt = false;
                this.inlineReply = null;
                this.pendingComposerContactChoices = null;
                const greetingDraftPrompt = `Help me draft a follow-up email to the currently selected contact, ${this.pendingComposerGreetingContext.fullName}. Use the existing composer recipient and subject context.`;

                try {
                    const drafted = await this.composerFlow.draftFromChat( {
                        prompt: greetingDraftPrompt,
                        pageContext: this.pageContext,
                        userId: this.userId,
                        tenantId: this.tenantId
                    } );
                    this.isLoading = false;
                    this.pendingComposerGreetingContext = null;
                    this.handleComposerDraftResult( drafted );
                } catch ( err: any ) {
                    this.isLoading = false;
                    this.pendingComposerGreetingContext = null;
                    this.pendingComposerRetryPrompt = greetingDraftPrompt;
                    const html = this.formatAssistantError( err, 'email drafting' );
                    this.publishChatMessage( 'assistant', html );
                }
                this.assistantPrompt = '';
                return;
            }

            this.pendingComposerGreetingContext = null;
        }

        this.pushUserTurn( raw );

        const earlyIntercept = this.intentRunner.decideEarlyIntercept( raw, {
            isOnComposerPage: this.isOnComposerPage(),
            hasEmailSentContext: this.hasEmailSentContext()
        } );

        if ( earlyIntercept === 'composer-draft' ) {
            this.isLoading = true;
            this.pendingAction = null;
            this.showConfirmPrompt = false;
            this.inlineReply = null;

            try {
                const drafted = await this.composerFlow.draftFromChat( {
                    prompt: raw,
                    pageContext: this.pageContext,
                    userId: this.userId,
                    tenantId: this.tenantId
                } );
                this.isLoading = false;
                this.pendingComposerContactChoices = Array.isArray( drafted.contactResolution?.candidates ) && drafted.contactResolution?.candidates?.length
                    ? { prompt: raw, candidates: drafted.contactResolution.candidates }
                    : null;
                this.handleComposerDraftResult( drafted );
                return;
            } catch ( err: any ) {
                this.isLoading = false;
                this.pendingComposerRetryPrompt = raw;
                const html = this.formatAssistantError( err, 'email drafting' );
                this.publishChatMessage( 'assistant', html );
                this.pendingAction = null;
                this.showConfirmPrompt = false;
                this.assistantPrompt = '';
                return;
            }
        }

        if ( earlyIntercept === 'email-sent' ) {
            const sentCtx = this.buildEmailSentContextFromPageContext();
            const local = this.emailSentAssistant.handleLocalIntent( raw, sentCtx );
            this.assistantPrompt = '';
            if ( local.handled && local.responseHtml ) {
                this.publishChatMessage( 'assistant', local.responseHtml );
                this.scheduleAssistantScroll( 40 );
                return;
            }

            this.isLoading = true;
            const promptForLLM = this.emailSentAssistant.buildContextPrompt( raw, sentCtx );
            const sub = this.openAIService.getAssistance( promptForLLM, 'general', this.userId || 'UI', { history: this.buildHistoryForLLM() } ).subscribe( {
                next: ( res: any ) => {
                    this.isLoading = false;
                    const out = res && typeof res === 'object' && res.response ? String( res.response ) : ( typeof res === 'string' ? res : JSON.stringify( res || '' ) );
                    this.publishChatMessage( 'assistant', out );
                    this.scheduleAssistantScroll( 40 );
                },
                error: ( err: any ) => {
                    this.isLoading = false;
                    this.publishChatMessage( 'assistant', this.formatAssistantError( err, 'email performance' ) );
                }
            } );
            this.openAISubscription = sub;
            return;
        }

        const ctx: AssistantEngineContext = {
            rawPrompt: raw,
            userId: this.userId,
            externalMode: !!this.externalMode,
            parentOwnsHistory: !!this.parentOwnsHistory,
        };

        const patches: AssistantEnginePatches = {
            setLoading: ( v ) => { this.isLoading = v; },
            setAssistantPrompt: ( v ) => { this.assistantPrompt = v; },
            setAssistantResponse: ( v ) => {
                const rendered = this.renderAssistantContent( v || '' );
                this.assistantResponse = rendered;
                if ( !this.parentOwnsHistory && rendered ) {
                    this.history.push( { role: 'assistant', content: rendered } );
                    this.scheduleAssistantScroll( 40 );
                } else if ( rendered ) {
                    this.message.emit( { role: 'assistant', content: rendered } );
                }
            },
            setPendingAction: ( v ) => { this.pendingAction = v; },
            setInlineReply: ( v ) => { this.inlineReply = v; },
            setShowConfirmPrompt: ( v ) => { this.showConfirmPrompt = !!v; },
            patchState: ( p ) => {
                const folded = this.foldPendingActionIntoAssistantResponse(
                    p.assistantResponse,
                    p.pendingAction !== undefined ? p.pendingAction : this.pendingAction,
                    p.showConfirmPrompt !== undefined ? p.showConfirmPrompt : this.showConfirmPrompt
                );

                if ( folded.assistantResponse !== undefined ) patches.setAssistantResponse( folded.assistantResponse || '' );
                if ( p.assistantResponse === undefined && folded.assistantResponse ) {
                    patches.setAssistantResponse( folded.assistantResponse );
                }
                if ( p.pendingAction !== undefined ) this.pendingAction = folded.pendingAction;
                if ( p.inlineReply !== undefined ) this.inlineReply = p.inlineReply;
                if ( p.showConfirmPrompt !== undefined || p.pendingAction !== undefined ) this.showConfirmPrompt = !!folded.showConfirmPrompt;
            },
            enforceExternalModeUiGuards: () => {
                if ( !this.externalMode ) return;
                this.pendingAction = null;
                this.showConfirmPrompt = false;
                this.inlineReply = null;
            },
        };

        const io: AssistantEngineIO = {
            pushLocalHistory: ( role, content ) => {
                if ( !this.parentOwnsHistory ) {
                    this.history.push( { role, content } );
                    this.scheduleAssistantScroll( 40 );
                } else {
                    this.message.emit( { role, content } );
                }
            },
            emitMessage: ( role, content ) => {
                if ( !this.parentOwnsHistory ) {
                    this.history.push( { role, content } );
                    this.scheduleAssistantScroll( 40 );
                } else {
                    this.message.emit( { role, content } );
                }
            },
            scheduleScrollToBottom: () => { this.scheduleAssistantScroll( 40 ); },
            scrollHistoryToBottom: () => { this.scheduleAssistantScroll( 40 ); },
            clearSuggestions: () => { /* suggestions not implemented in this shell */ },
        };

        const helpers: AssistantEngineHelpers = {
            tryDirectNavCommand: ( prompt: string ) => {
                const res = this.capabilities.tryDirectNavCommand( prompt );
                if ( !res.handled ) return false;
                if ( res.kind === 'message' ) {
                    patches.setAssistantResponse( res.message );
                    patches.setPendingAction( null );
                    patches.setShowConfirmPrompt( false );
                    return true;
                }
                if ( res.kind === 'navigate' ) {
                    patches.patchState( { pendingAction: { action: 'navigate', param: res.path }, showConfirmPrompt: true } );
                    return true;
                }
                return false;
            },
            runGlobalPreChecks: ( raw2: string ) => {
                const workflowGuide = this.capabilities.tryWorkflowGuide( raw2 );
                if ( workflowGuide.handled && workflowGuide.kind === 'message' ) {
                    patches.setAssistantResponse( this.boxHelper.normalizeAssistantHtml( workflowGuide.message ) );
                    patches.setPendingAction( null );
                    patches.setShowConfirmPrompt( false );
                    io.scheduleScrollToBottom( true );
                    return true;
                }

                const html = this.boxHelper.tryWhatWorkIntent( raw2 );
                if ( !html ) return false;
                patches.setAssistantResponse( this.boxHelper.normalizeAssistantHtml( html ) );
                patches.setPendingAction( null );
                patches.setShowConfirmPrompt( false );
                io.scheduleScrollToBottom( true );
                return true;
            },
            buildUiHint: () => '',
            withUserContext: ( p ) => `${p}${this.buildPageContextSnippet()}`,
            onSystemTrouble: ( raw2: string ) => {
                if ( !this.systemRecovery.isSystemTrouble( raw2 ) ) return false;
                patches.setAssistantResponse( 'Looks like something’s off. Want to troubleshoot?' );
                return true;
            },
            cancelInFlight: () => { try { this.openAISubscription?.unsubscribe?.(); } catch { } this.openAISubscription = null; },
            replaceOpenAISubscription: ( s: Subscription | null ) => { this.openAISubscription = s; },
            runGeneralLLM: ( { promptForLLM, setLoading, emitAssistant, onError } ) => {
                setLoading( true );
                const data = {
                    history: this.buildHistoryForLLM(),
                    pageContext: this.pageContext || null
                };
                const sub = this.openAIService.getAssistance( promptForLLM, 'general', this.userId || 'UI', data ).subscribe( {
                    next: ( res: any ) => {
                        setLoading( false );
                        let out = '';
                        if ( res && typeof res === 'object' && res.response ) {
                            out = String( res.response );
                        } else {
                            out = typeof res === 'string' ? res : JSON.stringify( res || '' );
                        }
                        emitAssistant( out );
                    },
                    error: ( err: any ) => { onError( { ...err, toddUserMessage: this.formatAssistantError( err, 'general' ) } ); }
                } );
                this.openAISubscription = sub;
                return sub;
            },
            formatAssistantError: ( err, area ) => this.formatAssistantError( err, area ),
        };

        await this.engine.run( ctx, patches, io, helpers );

        this.assistantPrompt = '';
    }

    private pushUserTurn ( raw: string ): void {
        if ( !this.parentOwnsHistory ) {
            this.history.push( { role: 'user', content: raw } );
        } else {
            this.message.emit( { role: 'user', content: raw } );
        }
    }

    private buildHistoryForLLM (): Array<ChatMsg> {
        if ( !this.history?.length ) return [];
        const stripHtml = ( html: string ) => html.replace( /<[^>]*>/g, '' );
        return this.history.slice( -6 ).map( m => ( { role: m.role, content: stripHtml( m.content || '' ).slice( 0, 1000 ) } ) );
    }
}
