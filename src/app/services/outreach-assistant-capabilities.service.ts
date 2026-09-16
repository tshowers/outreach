import { Injectable } from '@angular/core';

export type LocalCapability = {
  id: string;
  label: string;
  hint?: string;
  patterns: string[];
  guard?: () => boolean;
};

export type DirectNavResult =
  | { handled: false; }
  | { handled: true; kind: 'message'; message: string; }
  | { handled: true; kind: 'navigate'; path: string; };

type WorkflowGuide = {
  id: string;
  patterns: RegExp[];
  message: string;
};

export type CapabilityContext = {
  placeholderChoices: string[];
};

/**
 * Outreach's own slice of TODD's AssistantCapabilitiesService - same
 * scoping decision as web-products/network, web-products/pulse,
 * web-products/moves, and web-products/docs' capabilities services.
 * TODD's 'create-campaign' workflow guide is adapted here too, but with
 * its Maya pointer (`/marketing-director/session`) dropped - Maya lives in
 * a separate product (maya-marketing), not this one, so that guide can't
 * point there without reaching outside Outreach's own scope.
 */
@Injectable( { providedIn: 'root' } )
export class OutreachAssistantCapabilitiesService {
  private readonly directRouteAliases: Record<string, string> = {
    'outreach': 'app',
    'my outreach': 'app',
    'outreach home': 'app',
    'growth': 'app',
    'compose email': 'compose-email',
    'compose an email': 'compose-email',
    'create email': 'compose-email',
    'create an email': 'compose-email',
    'email editor': 'compose-email',
    'email composer': 'compose-email',
    'catalyst': 'email-processor',
    'email queue': 'signal-engine',
    'signal engine': 'signal-engine',
    'outbox': 'signal-engine',
    'engagement': 'engagement',
    'inbox access': 'inbox-access',
    'connect inbox': 'inbox-access',
    'my inbox': 'inbox-access',
    'pricing': 'pricing',
    'home': '',
  };

  private readonly directCommandRoutes: { path: string; requiresId?: boolean; idParam?: string; }[] = [
    { path: '' },
    { path: 'app' },
    { path: 'login' },
    { path: 'pricing' },
    { path: 'inbox-access' },
    { path: 'signal-engine' },
    { path: 'engagement' },
    { path: 'email-processor' },
    { path: 'compose-email' },
  ];

  private readonly workflowGuides: WorkflowGuide[] = [
    {
      id: 'create-campaign',
      patterns: [
        /\bhow do i create (an |a )?campaign\b/i,
        /\bhow to create (an |a )?campaign\b/i,
        /\bhelp me create (an |a )?campaign\b/i,
        /\bcan you help me create (an |a )?campaign\b/i,
        /\bcreate (an |a )?campaign\b/i,
      ],
      message: [
        '<p><strong>There is no campaign to create anymore.</strong> TODD handles the email and follow-up workflow for you.</p>',
        '<p>TODD drafts thoughtful, individual messages and keeps each follow-up connected to the previous conversation, so the thread stays relevant instead of feeling like a generic sequence.</p>',
        '<p>Open <strong>/app</strong> to review the outreach workflow, or use <strong>/signal-engine</strong> to review what TODD has prepared. If you want to draft something directly, use <strong>/compose-email</strong>.</p>'
      ].join( '' )
    },
  ];

  private normalizeCommand ( text: string ): string {
    return ( text || '' )
      .toLowerCase()
      .replace( /[\/\-]/g, ' ' )
      .replace( /[^a-z0-9\s]/g, ' ' )
      .replace( /\s+/g, ' ' )
      .trim();
  }

  private stripLeadingVerb ( text: string ): string {
    const verbs = ['show', 'open', 'go', 'goto', 'navigate', 'compose', 'create', 'connect'];
    const fillers = new Set( ['me', 'to', 'the', 'a', 'an', 'page'] );
    const parts = ( text || '' ).trim().toLowerCase().split( /\s+/ );
    if ( !parts.length ) return '';

    let idx = 0;
    if ( verbs.includes( parts[0] ) ) {
      idx = 1;
      while ( idx < parts.length && fillers.has( parts[idx] ) ) idx++;
    }
    return parts.slice( idx ).join( ' ' );
  }

  public tryDirectNavCommand ( prompt: string ): DirectNavResult {
    const raw = ( prompt || '' ).trim();
    if ( !raw ) return { handled: false };

    const withoutVerb = this.stripLeadingVerb( raw );
    if ( !withoutVerb ) return { handled: false };

    const normalizedInput = this.normalizeCommand( withoutVerb );
    const rawLower = raw.toLowerCase();
    const aliasedPath = this.directRouteAliases[normalizedInput];

    if ( aliasedPath !== undefined ) {
      return { handled: true, kind: 'navigate', path: '/' + aliasedPath };
    }

    for ( const route of this.directCommandRoutes ) {
      const normalizedRoute = this.normalizeCommand( route.path );

      if ( normalizedInput === normalizedRoute || rawLower === route.path.toLowerCase() ) {
        return { handled: true, kind: 'navigate', path: '/' + route.path };
      }
    }

    return { handled: false };
  }

  public tryWorkflowGuide ( prompt: string ): DirectNavResult {
    const raw = String( prompt || '' ).trim();
    if ( !raw ) return { handled: false };

    const guide = this.workflowGuides.find( item => item.patterns.some( pattern => pattern.test( raw ) ) );
    if ( !guide ) return { handled: false };

    return { handled: true, kind: 'message', message: guide.message };
  }

  private getNavCommandCapabilities (): LocalCapability[] {
    return this.directCommandRoutes
      .filter( c => !c.requiresId && c.path )
      .map( c => {
        const label = this.normalizeCommand( c.path );
        return {
          id: `nav-${c.path}`,
          label,
          hint: `Go to ${label}`,
          patterns: [label, c.path.toLowerCase()],
          guard: () => true
        };
      } );
  }

  public getLocalCapabilities ( ctx: CapabilityContext ): LocalCapability[] {
    const base: LocalCapability[] = [
      {
        id: 'draft-email',
        label: 'Write an email',
        hint: 'Cold outreach, follow-up, or reply',
        patterns: ['write email', 'draft email', 'compose email', 'reply', 'send email'],
        guard: () => true
      },
      {
        id: 'review-outbox',
        label: 'Review the outbox',
        hint: 'Approve or reject drafts waiting on you',
        patterns: ['signal engine', 'outbox', 'review drafts'],
        guard: () => true
      },
      {
        id: 'help',
        label: 'How this works',
        hint: 'Open Assistant Box help',
        patterns: ['help', 'how it works', 'what can you do'],
        guard: () => true
      }
    ];

    return [...base, ...this.getNavCommandCapabilities()];
  }

  public scoreLocalSuggestions ( query: string, ctx: CapabilityContext ): string[] {
    const caps = this.getLocalCapabilities( ctx );
    const q = ( query || '' ).trim().toLowerCase();
    if ( !q ) return [];

    const terms = q.split( /\s+/ );
    const termScore = ( text: string, weight = 1 ) => terms.reduce( ( s, t ) => ( text.includes( t ) ? s + weight : s ), 0 );

    const ranked = caps
      .map( c => {
        const label = c.label.toLowerCase();
        const hint = ( c.hint || '' ).toLowerCase();
        const patterns = c.patterns.join( ' ' ).toLowerCase();
        const score = termScore( label, 3 ) + termScore( patterns, 2 ) + termScore( hint, 1 );
        return { c, score };
      } )
      .filter( x => x.score > 0 )
      .sort( ( a, b ) => b.score - a.score )
      .map( x => x.c.label );

    if ( !ranked.length ) {
      return ( ctx.placeholderChoices || [] ).filter( p => p.toLowerCase().includes( q ) ).slice( 0, 8 );
    }

    return Array.from( new Set( ranked ) ).slice( 0, 8 );
  }
}
