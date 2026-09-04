import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * No-op stand-in for the page-context/activity-reporting slice of
 * ToddAssistantBusService. This app deliberately doesn't carry TODD's full
 * assistant bus (see the assistant-box scoping decision - it's a separate,
 * much bigger project than this extraction), so ported components' calls
 * to report page context, transcript nudges, and activity events have
 * nowhere to go. Kept as a same-shaped no-op rather than deleted from each
 * call site, both to minimize the diff against the original component and
 * because a real Outreach-scoped assistant (if/when built) would plug in
 * here.
 *
 * engagementActionRequest$ is a real (never-emitting) Observable rather
 * than a method - OutreachHomeComponent subscribes to it expecting an
 * Observable, since in the original TODD app it's how the assistant chat
 * box hands off a button click ("compose an email", "show me the outbox")
 * to whichever page is open. With no assistant chat box in this app,
 * nothing ever pushes into it, so the subscription is inert rather than
 * missing.
 */
@Injectable( { providedIn: 'root' } )
export class OutreachAssistantSignalService {
  private readonly engagementActionRequestSubject = new Subject<{ action: string;[key: string]: unknown; } | null>();
  readonly engagementActionRequest$: Observable<{ action: string;[key: string]: unknown; } | null> = this.engagementActionRequestSubject.asObservable();

  emitAssistantActivity ( _event: unknown ): void { }
  setPageContext ( _context: unknown ): void { }
  setAssistantPageContext ( _context: unknown ): void { }
  clearPageContext (): void { }
  pushTranscript ( _message: { role: string; content: string } ): void { }
  markAssistantUnread (): void { }
  setSignalReady (): void { }
}
