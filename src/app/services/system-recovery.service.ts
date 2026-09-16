import { Injectable } from '@angular/core';

/**
 * Trimmed port of TODD's SystemRecoveryService - just the "is the user
 * telling me something's broken" detector. Same trim as web-products/network's
 * port: the original also builds a recovery-actions list, but assistant-box
 * never renders that list anyway.
 */
@Injectable( { providedIn: 'root' } )
export class SystemRecoveryService {
  private troubleKeywords = [
    "what's wrong",
    "why isn't this working",
    "why am i not getting a response",
    "you're paused",
    "you're not responding",
    "system is not working",
    "reload",
    "problem",
    "cache"
  ];

  isSystemTrouble ( message: string ): boolean {
    const lower = message.toLowerCase();
    return this.troubleKeywords.some( kw => lower.includes( kw ) );
  }
}
