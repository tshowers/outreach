import { Injectable } from '@angular/core';
import { EmailSentAssistantService } from './email-sent-assistant.service';

/**
 * Trimmed port of TODD's AssistantIntentRunnerService. Unlike every other
 * product's port, this one keeps decideEarlyIntercept() - that's the real
 * dispatch mechanism here, not a domain-routing enum, since Outreach has no
 * domain LLM service the way Contact/Task/Survey/Document did (email
 * drafting goes through AssistantComposerFlowService -> EmailService, a
 * different endpoint entirely). 'catalyst-draft' (the Catalyst/bulk email
 * review page) is dropped - see the assistant-box scoping decision notes on
 * this rollout's Outreach pass for why that surface is deferred. The
 * 'next-move'/AssistantHeuristicsService branch is dropped too - TODD's own
 * assistant-box.component.ts never actually handles that return value
 * (only 'composer-draft' is branched on there), so it was dead code
 * upstream as well; same finding as Network's port.
 */
@Injectable( { providedIn: 'root' } )
export class AssistantIntentRunnerService {
    constructor (
        private emailSentAssistant: EmailSentAssistantService,
    ) { }

    /**
     * Decide whether to short-circuit with an early intercept action.
     * Returns one of:
     * - 'composer-draft' (compose/update email on Email Composer page)
     * - 'email-sent' (analyze email-sent page)
     * - null (no early intercept)
     */
    decideEarlyIntercept ( prompt: string, opts: { isOnComposerPage?: boolean; hasEmailSentContext: boolean; } ): 'composer-draft' | 'email-sent' | null {
        const raw = ( prompt || '' ).trim();
        if ( !raw ) return null;

        if ( opts?.isOnComposerPage && this.isEmailDraftIntent( raw ) ) {
            return 'composer-draft';
        }

        if ( opts?.hasEmailSentContext && this.emailSentAssistant.isAnalysisIntent( raw ) ) {
            return 'email-sent';
        }

        return null;
    }

    /** Intent detection for email draft/edit requests while on the composer page. */
    private isEmailDraftIntent ( prompt: string ): boolean {
        const p = String( prompt || '' ).toLowerCase().trim();
        if ( !p ) return false;

        const hasEmailNoun = /(\bemail|outreach|follow-up|follow up|message|reply)\b/.test( p );
        const hasDraftVerb = /(\bwrite|draft|rewrite|redo|improve|tighten|shorten|soften|strengthen|fix|change|edit|compose|create|help)\b/.test( p );
        const hasEmailAdviceIntent = /(\bwhat should i say\b|\bwhat to say\b|\bany ideas\b|\bnot sure what to say\b|\bdon'?t know what to say\b|\bbased on (the )?currently selected contact\b|\bcurrently selected contact\b)/.test( p );
        const directEmailTarget = /\bemail to\b|\boutreach to\b|\breply to\b|\bfollow up with\b/.test( p );
        const templateIntent = /\bapply\b.*\btemplate\b|\buse this\b|\bmake this email\b/.test( p );
        const fieldEditIntent = /\bsubject\b|\bbody\b/.test( p );

        return (
            ( hasEmailNoun && ( hasDraftVerb || hasEmailAdviceIntent ) ) ||
            directEmailTarget ||
            templateIntent ||
            fieldEditIntent
        );
    }
}
