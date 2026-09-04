import { Injectable } from '@angular/core';

/**
 * Trimmed copy of services/communication-dashboard.service.ts (142 lines,
 * covering several unrelated in-memory caches - contact/email/campaign
 * data snapshots with staleness checks). Only the "selected contact
 * queue" slice LastContactChartComponent uses (setSelectedContacts /
 * shiftContact / getNextContact) is ported; the cache/staleness methods
 * have no caller anywhere in this extraction.
 */
@Injectable( { providedIn: 'root' } )
export class OutreachCommunicationQueueService {
  private selectedContacts: string[] = [];

  getSelectedContacts (): string[] {
    return this.selectedContacts;
  }

  hasContacts (): boolean {
    return this.selectedContacts.length > 0;
  }

  setSelectedContacts ( contacts: string[] ): void {
    this.selectedContacts = contacts;
  }

  shiftContact (): string | undefined {
    return this.selectedContacts.shift();
  }

  getNextContact (): string | null {
    return this.selectedContacts.length > 0 ? this.selectedContacts[0] : null;
  }
}
