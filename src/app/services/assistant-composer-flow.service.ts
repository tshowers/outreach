import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EmailService } from './email.service';
import { AssistantBoxHelperService } from './assistant-box-helper.service';
import { OutreachDataService } from './outreach-data.service';
import { OutreachApiService } from './outreach-api.service';
import { Contact } from '../models/contact.model';
import { OutreachAssistantPageContext, AssistantDraftPayload } from './outreach-assistant-signal.service';

export interface ComposerContactCandidate {
    id: string;
    name: string;
    companyName: string;
    email: string;
    contact: Contact;
}

export interface ComposerContactResolution {
    status: 'matched' | 'multiple' | 'none';
    resolvedContact?: Contact | null;
    candidates?: ComposerContactCandidate[];
    query?: string;
}

export interface ComposerAssistantResult {
    payload: AssistantDraftPayload | null;
    messageHtml: string;
    resolvedContact?: Contact | null;
    contactResolution?: ComposerContactResolution | null;
    needsRecipientConfirmation?: boolean;
}

/**
 * Port of TODD's AssistantComposerFlowService - this IS the piece of
 * Outreach that's actually product-owned, not suite-wide (unlike the
 * cross-sell/counseling machinery every other product's port dropped).
 * Rewired to services this app already has, with matching method shapes:
 * - EmailService.generateEmailDraftFromEditor - already exists here with
 *   the same signature TODD's original calls (subject/htmlContext/
 *   selectedContact/sender/reason/campaignName/handoffSource/thread*).
 * - OutreachApiService.listOutreachContacts/getOutreachContactById/
 *   getOutreachContactByEmail - already exist here under the same names.
 * - UserService.getLoggedInContactInfo() (TODD's giant UserService)
 *   becomes OutreachDataService.getContact(tenantId, tenantId) - the
 *   tenant's own contact record is the sender profile, same convention
 *   Moves/Network use elsewhere.
 * - AssistantContextService.buildUserContextSnippet is folded in directly
 *   below rather than porting a whole separate service for one method.
 */
@Injectable( { providedIn: 'root' } )
export class AssistantComposerFlowService {
    constructor (
        private emailService: EmailService,
        private helper: AssistantBoxHelperService,
        private dataService: OutreachDataService,
        private outreachApi: OutreachApiService,
    ) { }

    private buildUserContextSnippet ( user: Contact | null | undefined ): string {
        if ( !user ) return '';

        const u: any = user as any;
        const lines: string[] = [];

        if ( u.firstName ) lines.push( `User first name: ${u.firstName}` );

        const roleParts = [u.profession, u.status].filter( Boolean ) as string[];
        if ( roleParts.length ) lines.push( `User role: ${roleParts.join( ' - ' )}` );

        const company: any = u.company || {};
        if ( company.name ) lines.push( `Company name: ${company.name}` );
        if ( company.publicInfo ) lines.push( `Company description: ${company.publicInfo}` );

        if ( !lines.length ) return '';
        return `\n\n[user-context]\n${lines.join( '\n' )}`;
    }

    async draftFromChat ( args: {
        prompt: string;
        pageContext: OutreachAssistantPageContext | null;
        userId: string | null | undefined;
        tenantId: string | null | undefined;
        selectedContactOverride?: Contact | null;
        skipContactResolution?: boolean;
    } ): Promise<ComposerAssistantResult> {
        const prompt = String( args.prompt || '' ).trim();
        const pageContext = args.pageContext;
        const composerContext = ( pageContext?.composerContext || {} ) as Record<string, any>;
        const tenantId = args.tenantId || '';
        const userId = args.userId || '';
        const sender = tenantId ? await this.dataService.getContact( tenantId, tenantId ) : null;
        const currentSelectedContact = await this.hydrateComposerContact( composerContext, tenantId, userId );
        const resolution = args.skipContactResolution
            ? {
                status: 'matched',
                resolvedContact: await this.hydrateContact( args.selectedContactOverride || null, tenantId, userId )
            } as ComposerContactResolution
            : await this.resolveContactForPrompt( prompt, composerContext, currentSelectedContact, tenantId, userId );
        const selectedContact = resolution.resolvedContact || currentSelectedContact || null;
        const revisionMode = this.resolveRevisionMode( composerContext );
        const currentSubject = String( composerContext['currentSubject'] || '' ).trim();
        const currentHtml = String( composerContext['currentHtml'] || '' ).trim();
        const currentText = String( composerContext['currentText'] || '' ).trim();
        const userContext = this.buildUserContextSnippet( sender );

        if ( resolution.status === 'multiple' ) {
            return {
                payload: null,
                messageHtml: this.helper.normalizeAssistantHtml(
                    this.helper.convertMarkdownToHtml(
                        `I found a few possible matches for ${resolution.query || 'that contact'}. Choose the right person below and I’ll draft the email for them.`
                    )
                ),
                contactResolution: resolution
            };
        }

        if ( resolution.status === 'none' && !selectedContact ) {
            return {
                payload: null,
                messageHtml: this.helper.normalizeAssistantHtml(
                    this.helper.convertMarkdownToHtml(
                        `I couldn't find that contact in your outreach list yet. Tell me their company or email address and I'll try again.`
                    )
                ),
                contactResolution: resolution
            };
        }

        const draftInstruction = this.buildDraftInstruction( {
            prompt,
            pageContext,
            composerContext,
            currentSubject,
            currentHtml,
            currentText,
            revisionMode,
            userContext,
            selectedContact
        } );

        const parsed = await firstValueFrom(
            this.emailService.generateEmailDraftFromEditor(
                {
                    userId: userId || 'UI',
                    tenantId,
                    subject: currentSubject,
                    htmlContext: draftInstruction,
                    selectedContact,
                    sender: sender || undefined,
                    reason: prompt,
                    campaignName: String( composerContext['campaignName'] || '' ).trim() || null,
                    handoffSource: 'assistant_chat_composer',
                    threadContactId: String( composerContext['threadContactId'] || '' ).trim() || null,
                    threadId: String( composerContext['threadId'] || '' ).trim() || null,
                    threadCampaignId: String( composerContext['threadCampaignId'] || '' ).trim() || null,
                    threadCampaignName: String( composerContext['threadCampaignName'] || '' ).trim() || null,
                    threadDraftKind: String( composerContext['threadDraftKind'] || '' ).trim() || null,
                },
                null
            )
        );

        const payload: AssistantDraftPayload = {
            subject: String( parsed?.subject || currentSubject || '' ).trim(),
            html: this.toHtml( parsed?.body ),
            body: String( parsed?.body || '' ).trim()
        };

        if ( !payload.subject && !payload.html && !payload.body ) {
            return {
                payload: null,
                messageHtml: this.helper.normalizeAssistantHtml(
                    this.helper.convertMarkdownToHtml( "I couldn't turn that into a usable email draft yet." )
                )
            };
        }

        const message = revisionMode === 'revise'
            ? 'I drafted a revised version of your current email. Apply it to the composer?'
            : 'I drafted a new email for the composer. Apply it?';

        const selectedContactId = String( composerContext['selectedContactId'] || '' ).trim();
        const needsRecipientConfirmation = !!selectedContact?.id
            && !!selectedContactId
            && selectedContact.id !== selectedContactId
            && !!composerContext['hasDraftContent'];

        return {
            payload,
            messageHtml: this.helper.normalizeAssistantHtml( this.helper.convertMarkdownToHtml( message ) ),
            resolvedContact: selectedContact,
            contactResolution: resolution,
            needsRecipientConfirmation
        };
    }

    private resolveRevisionMode ( composerContext: Record<string, any> ): 'create' | 'revise' {
        return composerContext['hasDraftContent'] ? 'revise' : 'create';
    }

    private buildSelectedContact ( composerContext: Record<string, any> ): Contact | null {
        const recipientEmail = String(
            composerContext['recipientEmail']
            || composerContext['selectedContactEmail']
            || ''
        ).trim();
        const selectedContactId = String( composerContext['selectedContactId'] || '' ).trim();
        const selectedContactName = String( composerContext['selectedContactName'] || '' ).trim();
        const companyName = String( composerContext['selectedCompanyName'] || '' ).trim();

        if ( !recipientEmail && !selectedContactId && !selectedContactName && !companyName ) {
            return null;
        }

        const [firstName, ...restName] = selectedContactName.split( /\s+/ ).filter( Boolean );
        return {
            id: selectedContactId,
            firstName: firstName || '',
            lastName: restName.join( ' ' ),
            emailAddresses: recipientEmail
                ? [{ emailAddress: recipientEmail, emailAddressType: 'primary' }]
                : [],
            company: companyName ? { name: companyName } : undefined,
        } as Contact;
    }

    private async hydrateComposerContact ( composerContext: Record<string, any>, tenantId: string, userId: string ): Promise<Contact | null> {
        const thin = this.buildSelectedContact( composerContext );
        return this.hydrateContact( thin, tenantId, userId );
    }

    private async hydrateContact ( contact: Contact | null, tenantId: string, userId: string ): Promise<Contact | null> {
        if ( !contact ) return null;

        const contactId = String( ( contact as any )?.id || '' ).trim();
        const email = this.getPrimaryEmail( contact );

        try {
            if ( contactId ) {
                const byId = await firstValueFrom( this.outreachApi.getOutreachContactById( contactId, { tenantId, userId } ) );
                if ( byId?.data ) return byId.data as Contact;
            }
        } catch { }

        try {
            if ( email ) {
                const byEmail = await firstValueFrom( this.outreachApi.getOutreachContactByEmail( email, { tenantId, userId } ) );
                if ( byEmail?.data ) return byEmail.data as Contact;
            }
        } catch { }

        return contact;
    }

    private async resolveContactForPrompt (
        prompt: string,
        composerContext: Record<string, any>,
        currentSelectedContact: Contact | null,
        tenantId: string,
        userId: string
    ): Promise<ComposerContactResolution> {
        const extracted = this.extractContactHint( prompt );
        if ( !extracted.query && currentSelectedContact ) {
            return { status: 'matched', resolvedContact: currentSelectedContact };
        }

        if ( !extracted.query ) {
            return { status: 'none', resolvedContact: null };
        }

        if ( currentSelectedContact && this.matchesCurrentComposerContact( currentSelectedContact, extracted.query, extracted.emailHint ) ) {
            return { status: 'matched', resolvedContact: currentSelectedContact, query: extracted.query };
        }

        const contacts = await this.loadOutreachContacts( tenantId, userId );
        const matches = this.scoreContactMatches( contacts, extracted.query, extracted.companyHint, extracted.emailHint );

        if ( !matches.length ) {
            return { status: 'none', resolvedContact: null, query: extracted.query };
        }

        const top = matches[0];
        const second = matches[1];
        const topGap = second ? top.score - second.score : top.score;
        const exactEmailMatch = !!extracted.emailHint && top.email === extracted.emailHint;
        const strongMatch = top.score >= 320 || exactEmailMatch;
        const clearlyAhead = topGap >= 80;

        if ( strongMatch && ( clearlyAhead || !second ) ) {
            return {
                status: 'matched',
                resolvedContact: await this.hydrateContact( top.contact, tenantId, userId ),
                query: extracted.query
            };
        }

        const candidates = matches
            .slice( 0, 3 )
            .map( match => ( {
                id: String( match.contact?.id || '' ).trim(),
                name: this.getContactDisplayName( match.contact ),
                companyName: this.getCompanyName( match.contact ),
                email: this.getPrimaryEmail( match.contact ),
                contact: match.contact
            } ) );

        if ( candidates.length === 1 ) {
            return {
                status: 'matched',
                resolvedContact: await this.hydrateContact( candidates[0].contact, tenantId, userId ),
                query: extracted.query
            };
        }

        return { status: 'multiple', candidates, query: extracted.query };
    }

    private async loadOutreachContacts ( tenantId: string, userId: string ): Promise<Contact[]> {
        try {
            const response = await firstValueFrom( this.outreachApi.listOutreachContacts( { tenantId, userId } ) );
            return Array.isArray( response?.data ) ? response.data as Contact[] : [];
        } catch {
            return [];
        }
    }

    private extractContactHint ( prompt: string ): { query: string; companyHint: string; emailHint: string; } {
        const normalizedPrompt = String( prompt || '' ).trim();
        const emailHint = ( normalizedPrompt.match( /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i )?.[1] || '' ).trim().toLowerCase();
        const companyHint = this.cleanHint(
            normalizedPrompt.match( /\b(?:at|from)\s+([a-z0-9&.' -]+?)(?=\s+(?:about|regarding|for|on|with|who|that|because|so)\b|[,.!?]|$)/i )?.[1] || ''
        );
        const nameCandidates = [
            normalizedPrompt.match( /\b(?:email|message|contact)\s+([a-z][a-z.'-]*(?:\s+[a-z][a-z.'-]*){1,2})(?=\s+(?:about|regarding|for|on|with|who|that|because|so)\b|[,.!?]|$)/i )?.[1] || '',
            normalizedPrompt.match( /\b(?:send|write|draft|create|help me write|help write|email|follow up|reach out)(?:\s+(?:an?|the))?(?:\s+email)?\s+to\s+([a-z][a-z.'-]*(?:\s+[a-z][a-z.'-]*){0,2})(?=\s+(?:about|regarding|for|on|with|who|that|because|so)\b|[,.!?]|$)/i )?.[1] || '',
            normalizedPrompt.match( /\bto\s+([a-z][a-z.'-]*(?:\s+[a-z][a-z.'-]*){1,2})(?=\s+(?:about|regarding|for|on|with|who|that|because|so)\b|[,.!?]|$)/i )?.[1] || ''
        ].map( candidate => this.cleanHint( candidate ) ).filter( Boolean );

        return { query: nameCandidates[0] || '', companyHint, emailHint };
    }

    private cleanHint ( value: string ): string {
        return String( value || '' )
            .replace( /\b(about|regarding|for|on|with|who|that|because|so)\b.*$/i, '' )
            .replace( /\s+/g, ' ' )
            .replace( /^(the|a|an)\s+/i, '' )
            .trim();
    }

    private scoreContactMatches ( contacts: Contact[], query: string, companyHint: string, emailHint: string ): Array<{ contact: Contact; score: number; email: string; }> {
        const queryTokens = this.tokenize( query );
        const companyTokens = this.tokenize( companyHint );
        const normalizedQuery = queryTokens.join( ' ' );
        const normalizedEmail = emailHint.toLowerCase();

        return ( contacts || [] )
            .map( contact => {
                const name = this.getContactDisplayName( contact ).toLowerCase();
                const nameTokens = this.tokenize( name );
                const companyName = this.getCompanyName( contact ).toLowerCase();
                const companyNameTokens = this.tokenize( companyName );
                const email = this.getPrimaryEmail( contact ).toLowerCase();
                let score = 0;

                if ( normalizedEmail && email && email === normalizedEmail ) score += 1000;
                if ( normalizedQuery && name === normalizedQuery ) score += 320;
                if ( queryTokens.length >= 2 && queryTokens.every( token => nameTokens.includes( token ) ) ) score += 260;
                if ( queryTokens.length >= 1 && queryTokens.every( token => name.includes( token ) ) ) score += 170;
                if ( queryTokens[0] && nameTokens[0] === queryTokens[0] ) score += 80;
                if ( queryTokens.length >= 2 && nameTokens[nameTokens.length - 1] === queryTokens[queryTokens.length - 1] ) score += 80;
                if ( companyTokens.length && companyTokens.every( token => companyNameTokens.includes( token ) ) ) score += 90;
                if ( companyHint && companyName.includes( companyHint.toLowerCase() ) ) score += 50;

                return { contact, score, email };
            } )
            .filter( candidate => candidate.score > 0 && !!String( candidate.contact?.id || candidate.email || '' ).trim() )
            .sort( ( left, right ) => right.score - left.score );
    }

    private tokenize ( value: string ): string[] {
        return String( value || '' )
            .toLowerCase()
            .replace( /[^a-z0-9\s]/g, ' ' )
            .split( /\s+/ )
            .map( token => token.trim() )
            .filter( token => token.length > 1 );
    }

    private getContactDisplayName ( contact: Contact | null | undefined ): string {
        const first = String( contact?.firstName || '' ).trim();
        const last = String( contact?.lastName || '' ).trim();
        return `${first} ${last}`.replace( /\s+/g, ' ' ).trim();
    }

    private getCompanyName ( contact: Contact | null | undefined ): string {
        return String( ( contact as any )?.company?.name || '' ).trim();
    }

    private getPrimaryEmail ( contact: Contact | null | undefined ): string {
        return String(
            ( contact as any )?.email
            || ( Array.isArray( ( contact as any )?.emailAddresses ) ? ( contact as any )?.emailAddresses?.[0]?.emailAddress : '' )
            || ''
        ).trim();
    }

    private matchesCurrentComposerContact ( contact: Contact | null | undefined, query: string, emailHint: string ): boolean {
        if ( !contact ) return false;

        const normalizedQuery = this.cleanHint( query ).toLowerCase();
        const selectedName = this.getContactDisplayName( contact ).toLowerCase();
        const selectedEmail = this.getPrimaryEmail( contact ).toLowerCase();

        if ( emailHint && selectedEmail && selectedEmail === emailHint.toLowerCase() ) return true;
        if ( !normalizedQuery || !selectedName ) return false;
        if ( selectedName === normalizedQuery ) return true;

        const queryTokens = this.tokenize( normalizedQuery );
        const nameTokens = this.tokenize( selectedName );
        return queryTokens.length >= 2 && queryTokens.every( token => nameTokens.includes( token ) );
    }

    private buildDraftInstruction ( args: {
        prompt: string;
        pageContext: OutreachAssistantPageContext | null;
        composerContext: Record<string, any>;
        currentSubject: string;
        currentHtml: string;
        currentText: string;
        revisionMode: 'create' | 'revise';
        userContext: string;
        selectedContact: Contact | null;
    } ): string {
        const lines: string[] = [
            `Composer mode: ${args.revisionMode}`,
            `User request: ${args.prompt}`,
            'Instruction: Draft an email response for the current composer page. If there is existing draft content, treat it as the source material to revise. If not, create a fresh draft that matches the request.'
        ];

        if ( args.currentSubject ) lines.push( `Current subject: ${args.currentSubject}` );
        if ( args.currentText ) lines.push( `Current text draft:\n${args.currentText}` );
        else if ( args.currentHtml ) lines.push( `Current HTML draft:\n${args.currentHtml}` );
        if ( args.composerContext['recipientEmail'] ) lines.push( `Recipient email: ${args.composerContext['recipientEmail']}` );
        if ( args.composerContext['selectedContactName'] ) lines.push( `Recipient name: ${args.composerContext['selectedContactName']}` );
        if ( args.composerContext['selectedCompanyName'] ) lines.push( `Recipient company: ${args.composerContext['selectedCompanyName']}` );
        if ( args.composerContext['senderName'] ) lines.push( `Sender name: ${args.composerContext['senderName']}` );
        if ( args.pageContext?.description ) lines.push( `Composer context: ${args.pageContext.description}` );

        const combined = lines.join( '\n' );
        return args.userContext ? `${combined}${args.userContext}` : combined;
    }

    private toHtml ( body: any ): string {
        const text = String( body || '' ).trim();
        if ( !text ) return '';
        if ( /<\w+[^>]*>/i.test( text ) ) return text;

        return `<p>${text
            .replace( /\n\n+/g, '</p><p>' )
            .replace( /\n/g, '<br>' )}</p>`;
    }
}
