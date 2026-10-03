import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { WriteAccessState } from '../../services/write-access.service';

/** What the prompt says: sign in first, or get the app to create and send. */
export interface WriteAccessPrompt {
  state: Exclude<WriteAccessState, 'canWrite'>;
  action: string;
}

/** Opens the one "you need to sign in / get the app" prompt for the app. */
@Injectable( { providedIn: 'root' } )
export class WriteAccessPromptService {
  private readonly promptSubject = new BehaviorSubject<WriteAccessPrompt | null>( null );
  readonly prompt$ = this.promptSubject.asObservable();

  open ( prompt: WriteAccessPrompt ): void {
    this.promptSubject.next( prompt );
  }

  close (): void {
    this.promptSubject.next( null );
  }
}
