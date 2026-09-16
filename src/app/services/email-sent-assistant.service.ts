import { Injectable } from '@angular/core';
import { AssistantBoxHelperService } from './assistant-box-helper.service';
import { EmailSentAssistantContext, EmailSentFollowUpCandidate } from '../features/signal-engine/email-sent/email-sent.component';

export interface LocalEmailSentResult {
    handled: boolean;
    responseHtml?: string;
}

/**
 * Port of TODD's EmailSentAssistantService. Field-name adaptation only:
 * Outreach's own EmailSentAssistantContext (already defined in
 * email-sent.component.ts) uses `to` for the recipient address and has no
 * `name` field, unlike TODD's original candidate shape - the `names()`
 * helper below falls back to `to` instead of `email`.
 */
@Injectable( { providedIn: 'root' } )
export class EmailSentAssistantService {
    constructor ( private helper: AssistantBoxHelperService ) { }

    isAnalysisIntent ( prompt: string ): boolean {
        const p = String( prompt || '' ).toLowerCase().trim();
        if ( !p ) return false;
        return (
            /\b(analy[sz]e|analysis|review|summarize|summary|brief|what'?s working|what is working|what'?s not working|what is not working)\b/.test( p ) ||
            /\b(open|opened|opens|unopened|not opened|click|clicked|clicks|ctr)\b/.test( p ) ||
            /\b(follow\s*up|follow-up|who should i follow up with|who do i follow up with|follow up now)\b/.test( p ) ||
            /\b(warm recipients|warm leads|interested|engaged|who engaged|who clicked)\b/.test( p ) ||
            /\b(sent emails|email performance|email results|email analytics|campaign performance)\b/.test( p )
        );
    }

    handleLocalIntent ( prompt: string, ctx: EmailSentAssistantContext | null ): LocalEmailSentResult {
        if ( !ctx ) return { handled: false };
        const p = String( prompt || '' ).toLowerCase().trim();
        if ( !p ) return { handled: false };

        const followUpNow = Array.isArray( ctx.followUpNow ) ? ctx.followUpNow : [];
        const warmRecipients = Array.isArray( ctx.warmRecipients ) ? ctx.warmRecipients : [];
        const coldRecipients = Array.isArray( ctx.coldRecipients ) ? ctx.coldRecipients : [];
        const topSubjects = Array.isArray( ctx.topSubjects ) ? ctx.topSubjects : [];

        const names = ( arr: EmailSentFollowUpCandidate[] ) =>
            arr.slice( 0, 5 ).map( ( x ) => x?.to || 'recipient' ).join( ', ' );

        if ( /\b(initial brief|brief me|analy[sz]e sent emails|analy[sz]e my sent emails|review sent emails|summarize sent emails|summarize my sent emails)\b/.test( p ) ) {
            return {
                handled: true,
                responseHtml: this.helper.buildEmailSentBriefingHtml( ctx )
            };
        }

        if ( /\bwho should i follow up with|who do i follow up with|follow up now|follow-up now\b/.test( p ) ) {
            const html = followUpNow.length
                ? this.helper.normalizeAssistantHtml( `<p><strong>Follow up now:</strong> ${names( followUpNow )}</p>` )
                : this.helper.normalizeAssistantHtml( `<p>I do not see any immediate follow-up candidates yet.</p>` );
            return { handled: true, responseHtml: html };
        }

        if ( /\bwho clicked|who engaged|warm recipients|interested\b/.test( p ) ) {
            const html = warmRecipients.length
                ? this.helper.normalizeAssistantHtml( `<p><strong>Most engaged:</strong> ${names( warmRecipients )}</p>` )
                : this.helper.normalizeAssistantHtml( `<p>No strong click-based interest yet.</p>` );
            return { handled: true, responseHtml: html };
        }

        if ( /\bnot working|ignored|not opened|unopened|cold\b/.test( p ) ) {
            const html = coldRecipients.length
                ? this.helper.normalizeAssistantHtml( `<p><strong>Not engaging yet:</strong> ${names( coldRecipients )}</p>` )
                : this.helper.normalizeAssistantHtml( `<p>I do not see a clear cold segment yet.</p>` );
            return { handled: true, responseHtml: html };
        }

        if ( /\bwhat'?s working|what is working|best subject|top subject|top subjects\b/.test( p ) ) {
            const html = topSubjects.length
                ? this.helper.normalizeAssistantHtml(
                    `<p><strong>Top subject lines:</strong> ${topSubjects
                        .slice( 0, 3 )
                        .map( ( x ) => x?.subject || 'n/a' )
                        .join( ' | ' )}</p>`
                )
                : this.helper.normalizeAssistantHtml( `<p>I do not have enough subject-level signal yet.</p>` );
            return { handled: true, responseHtml: html };
        }

        return { handled: false };
    }

    buildContextPrompt ( userPrompt: string, ctx: EmailSentAssistantContext | null ): string {
        if ( !ctx ) return userPrompt;

        const safeList = ( arr: EmailSentFollowUpCandidate[] | undefined | null ) =>
            Array.isArray( arr )
                ? arr.slice( 0, 8 ).map( ( x ) => x?.to || '' ).filter( Boolean ).join( ', ' )
                : '';

        return [
            userPrompt,
            '',
            '[sent-email-context]',
            `rangeDays: ${ctx.rangeDays || 0}`,
            `totalEmails: ${ctx.totalEmails || 0}`,
            `openedEmails: ${ctx.openedEmails || 0}`,
            `unopenedEmails: ${ctx.unopenedEmails || 0}`,
            `clickedEmails: ${ctx.clickedEmails || 0}`,
            `totalClicks: ${ctx.totalClicks || 0}`,
            `openRate: ${ctx.openRate || 0}`,
            `clickThroughRate: ${ctx.clickThroughRate || 0}`,
            `followUpNow: ${safeList( ctx.followUpNow )}`,
            `warmRecipients: ${safeList( ctx.warmRecipients )}`,
            `coldRecipients: ${safeList( ctx.coldRecipients )}`,
            `topSubjects: ${Array.isArray( ctx.topSubjects )
                ? ctx.topSubjects.slice( 0, 5 ).map( ( x ) => x?.subject || '' ).filter( Boolean ).join( ' | ' )
                : ''}`,
            '[direction]',
            'Answer as an email performance strategist. Explain what is working, what is not, and who deserves follow-up now. Keep it concrete.'
        ].join( '\n' );
    }
}
