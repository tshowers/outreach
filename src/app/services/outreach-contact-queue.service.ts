import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Contact } from '../models/contact.model';

/**
 * Trimmed copy of services/contact.service.ts (1,013 lines - the
 * monorepo's full contact data/state/suggestion/engagement-cache
 * service). EmailCreateComponent (and, in the dead call this extraction
 * already dropped, AdEngagementComponent) only ever touch the plain
 * client-side "currently drafting to" queue/contact/reason state -
 * three BehaviorSubjects with no backend calls of their own - not any of
 * ContactService's actual data-fetching or suggestion-engine surface.
 * This is that slice, renamed to make clear it's local UI state, not a
 * data-access service (see OutreachDataService for that).
 */
@Injectable( { providedIn: 'root' } )
export class OutreachContactQueueService {
  private contactSource = new BehaviorSubject<Contact | null>( null );
  currentContact = this.contactSource.asObservable();

  private queueSource = new BehaviorSubject<Contact[]>( [] );
  currentQueue = this.queueSource.asObservable();

  private contactReason = new BehaviorSubject<string | null>( null );
  currentReason = this.contactReason.asObservable();

  changeContact ( contact: Contact ) {
    this.contactSource.next( contact );
  }

  resetContact () {
    this.contactSource.next( null );
  }

  changeReason ( reason: string ) {
    this.contactReason.next( reason );
  }

  resetReason () {
    this.contactReason.next( null );
  }

  setQueue ( queue: Contact[] ): void {
    this.queueSource.next( queue );
  }

  clearQueue (): void {
    this.queueSource.next( [] );
  }
}
