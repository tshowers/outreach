import { Injectable } from '@angular/core';

@Injectable( { providedIn: 'root' } )
export class AssistantUiService {
    scheduleScrollToBottom ( element: HTMLElement | null, delay = 0 ): void {
        setTimeout( () => this.scrollToBottom( element ), delay );
    }

    scrollToBottom ( element: HTMLElement | null ): void {
        try {
            if ( !element ) {
                const doc = document.documentElement || ( document.body as any );
                window.scrollTo( { top: doc.scrollHeight, behavior: 'smooth' } );
                return;
            }
            const assistantMessages = element.querySelectorAll( '.assistant-message-assistant' );
            const lastAssistant = assistantMessages.length ? assistantMessages[assistantMessages.length - 1] as HTMLElement : null;
            if ( lastAssistant ) {
                lastAssistant.scrollIntoView( { behavior: 'smooth', block: 'start' } );
            } else {
                const lastBubble = element.querySelector( '.assistant-message:last-child' ) as HTMLElement | null;
                if ( lastBubble ) {
                    lastBubble.scrollIntoView( { behavior: 'smooth', block: 'start' } );
                } else {
                    element.scrollTop = element.scrollHeight;
                }
            }
        } catch {
            // ignore
        }
    }
}
