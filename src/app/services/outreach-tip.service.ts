import { Injectable } from '@angular/core';

export type ToddTipCategory = 'general' | 'email';

export interface ToddTip {
  id: string;
  text: string;
  category: ToddTipCategory;
  page?: string;
}

/**
 * Trimmed copy of services/tip.service.ts (422 lines, covering tip
 * rotation for every TODD module - tasks, projects, contacts, documents,
 * surveys, etc.). Only EmailProcessorComponent's one call,
 * getRandomTipText('email', 'compose-email'), is exercised in this
 * extraction, so this keeps just the 'email' category tips (none of
 * which are page-scoped to 'compose-email' in the original either - the
 * page argument falls through to the full email pool there too) plus a
 * 'general' fallback pool, dropping every other module's tips.
 */
@Injectable( { providedIn: 'root' } )
export class OutreachTipService {
  private readonly tips: ToddTip[] = [
    {
      id: 'general-1',
      text: 'Small, consistent moves beat big, random pushes. Add one move you can finish today.',
      category: 'general',
    },
    {
      id: 'general-2',
      text: 'Use notes on contacts to capture context you will forget in 48 hours.',
      category: 'general',
    },
    {
      id: 'general-3',
      text: 'If everything is important, nothing is. Tag the top three moves that really matter.',
      category: 'general',
    },
    {
      id: 'email-1',
      text: 'Draft inside TODD first so you keep the thread, then send via your preferred client.',
      category: 'email',
    },
    {
      id: 'email-2',
      text: 'Short, specific asks get more replies. TODD can help you rewrite long emails down.',
      category: 'email',
    },
    {
      id: 'email-3',
      text: 'Before you send anything, check TODD for the last thing they responded to. Match that tone and length.',
      category: 'email',
    },
    {
      id: 'email-4',
      text: 'One clear ask per email. If TODD can’t summarize your ask in one line, it’s probably too complicated.',
      category: 'email',
    },
    {
      id: 'email-5',
      text: 'Use TODD to batch follow-ups for one segment at a time. Same role, tuned message, better hit rate.',
      category: 'email',
    },
    {
      id: 'email-6',
      text: 'When someone clicks but doesn’t reply, log a move instead of resending the same email. Change the channel or angle.',
      category: 'email',
    },
  ];

  private lastTipId: string | null = null;

  getRandomTipText ( category?: ToddTipCategory, page?: string ): string {
    const tip = this.getRandomTip( category, page );
    return tip?.text ?? '';
  }

  getRandomTip ( category?: ToddTipCategory, page?: string ): ToddTip {
    const pool = this.getTipPool( category, page );
    if ( pool.length === 0 ) {
      const generalPool = this.getTipPool( 'general' );
      if ( generalPool.length === 0 ) {
        return {
          id: 'fallback',
          text: 'No tips yet. Add some to OutreachTipService to start rotating guidance.',
          category: 'general',
        };
      }
      return this.pickRandom( generalPool );
    }

    return this.pickRandom( pool );
  }

  private getTipPool ( category?: ToddTipCategory | 'general', page?: string ): ToddTip[] {
    let pool = this.tips;

    if ( category ) {
      pool = pool.filter( t => t.category === category );
    }

    if ( page ) {
      const pageMatches = pool.filter( t => t.page === page );
      if ( pageMatches.length > 0 ) {
        pool = pageMatches;
      }
    }

    return pool;
  }

  private pickRandom ( pool: ToddTip[] ): ToddTip {
    if ( pool.length === 1 ) {
      this.lastTipId = pool[0].id;
      return pool[0];
    }

    let tip: ToddTip;
    let safety = 0;

    do {
      const index = Math.floor( Math.random() * pool.length );
      tip = pool[index];
      safety++;
    } while ( tip.id === this.lastTipId && safety < 5 );

    this.lastTipId = tip.id;
    return tip;
  }
}
