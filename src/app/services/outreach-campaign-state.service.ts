import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Campaign } from '../models/email.model';

interface EmailData {
  campaignName: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  html: string;
  contactName: string;
  actionId?: string | null;
  from?: any;
  signalOrigin?: string;
  sourceSystem?: string;
  planId?: string | null;
  strategyId?: string | null;
  segmentId?: string | null;
  angleId?: string | null;
}

/**
 * Trimmed copy of services/campaign-state.service.ts - only the
 * setEmailData/campaign$/clearCampaign slice EmailCreateComponent uses.
 * Dropped getEmailOpenedStatus/getOpenedStatus (a DataService-backed
 * lookup with no caller anywhere in this extraction).
 */
@Injectable( { providedIn: 'root' } )
export class OutreachCampaignStateService {
  private emailDataSubject = new BehaviorSubject<EmailData | null>( null );
  private campaignSubject = new BehaviorSubject<Campaign | null>( null );

  emailData$ = this.emailDataSubject.asObservable();
  campaign$ = this.campaignSubject.asObservable();

  setEmailData ( data: EmailData ): void {
    this.emailDataSubject.next( data );
  }

  clearEmailData (): void {
    this.emailDataSubject.next( null );
  }

  setCampaign ( data: Campaign ): void {
    this.campaignSubject.next( data );
  }

  clearCampaign (): void {
    this.campaignSubject.next( null );
  }

  public clearAll (): void {
    this.emailDataSubject.next( null );
    this.campaignSubject.next( null );
  }
}
