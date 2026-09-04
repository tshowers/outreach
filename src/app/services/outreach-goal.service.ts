import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export type MayaOutreachBatchContact = {
  contactId?: string;
  emailAddress?: string;
  displayName?: string;
  companyName?: string;
  stage?: string;
  autoSendEligible?: boolean;
  queueMode?: string;
  journeySource?: string;
  signalState?: string;
  touchCount?: number;
  openCount?: number;
  clickCount?: number;
  selectedAt?: string;
  selectedReason?: string;
};

export type MayaOutreachBatch = {
  id?: string;
  path?: string;
  tenantId?: string;
  batchDate?: string;
  timezone?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  source?: string;
  senderEmail?: string;
  mayaConfig?: {
    enabled?: boolean;
    timezone?: string;
    startHour?: number;
    emailDraftingEnabled?: boolean;
  };
  counts?: {
    consideredCount?: number;
    selectedCount?: number;
    autoSendEligibleCount?: number;
    draftOnlyEligibleCount?: number;
    dailyDraftTarget?: number;
    existingDailyBatchCount?: number;
    skippedCount?: number;
  };
  skippedReasons?: Record<string, number>;
  contacts?: MayaOutreachBatchContact[];
  draftingDuty?: {
    draftedContactIds?: string[];
    draftedCount?: number;
    failedContactIds?: string[];
    lastProcessedHourKey?: string;
    lastRunAt?: string;
  };
};

/**
 * Trimmed copy of services/goal.service.ts (6,981 lines in the monorepo,
 * covering daily-momentum planning, goal tracking, and marketing-operator
 * automation across every TODD module). Only OutreachHomeComponent's one
 * call, getLatestMayaOutreachBatch, is ported here - the rest of that file
 * is far outside this extraction's scope.
 */
@Injectable( { providedIn: 'root' } )
export class OutreachGoalService {
  constructor ( private http: HttpClient ) { }

  getLatestMayaOutreachBatch ( tenantId: string ) {
    return this.http.get<{ success: boolean; message: string; data: { tenantId: string; batch: MayaOutreachBatch | null; }; }>(
      `${environment.backendURL}/momentum/maya-batches/latest`,
      {
        params: { tenantId }
      }
    );
  }
}
