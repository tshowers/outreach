import { Directive, ElementRef, Input, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';

import { WriteAccessService, WriteAccessState } from '../../services/write-access.service';
import { WriteAccessPromptService } from './write-access-prompt.service';

/**
 * "Browse free, create with the app": marks a button that creates, sends,
 * edits or deletes. Signed out, or signed in without Outreach for iOS, the
 * click is stopped before the button's own handler runs and the prompt
 * explains what's needed. The server enforces the same rule; this is so
 * nobody fills in a form only to have it refused.
 *
 *   <button appWriteAction="send this reply" (click)="send()">Send</button>
 */
@Directive( {
  selector: '[appWriteAction]',
  standalone: true,
} )
export class WriteActionDirective implements OnDestroy {
  /** What the button does, for the prompt: "send this reply". */
  @Input( 'appWriteAction' ) action = '';

  private state: WriteAccessState = 'signedOut';
  private readonly prompts = inject( WriteAccessPromptService );
  private readonly subscription: Subscription = inject( WriteAccessService ).state( 'outreach' )
    .subscribe( ( state ) => this.state = state );

  private readonly element: HTMLElement = inject( ElementRef ).nativeElement;
  // Capture phase, so this runs before the element's own (click) handler.
  private readonly onClick = ( event: MouseEvent ): void => {
    if ( this.state === 'canWrite' ) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.prompts.open( { state: this.state, action: this.action || 'do this' } );
  };

  constructor () {
    this.element.addEventListener( 'click', this.onClick, true );
  }

  ngOnDestroy (): void {
    this.element.removeEventListener( 'click', this.onClick, true );
    this.subscription.unsubscribe();
  }
}
