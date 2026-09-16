import { Injectable } from '@angular/core';

@Injectable( { providedIn: 'root' } )
export class ConversationService {

  private history: Array<{ role: 'user' | 'assistant'; content: string; }> = [];

  setHistory ( passedHistory: Array<{ role: 'user' | 'assistant'; content: string; }> ) {
    this.history = Array.isArray( passedHistory ) ? [...passedHistory] : [];
  }

  getTranscript (): string {
    return this.history
      .map( m => `${m.role === 'user' ? 'Visitor' : 'TODD'}: ${m.content}` )
      .join( '\n' );
  }

  clear () {
    this.history = [];
  }
}
