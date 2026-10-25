import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { getAuth } from 'firebase/auth';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export type FirstSendRowStatus = 'draft' | 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface FirstSendRow {
  contactId: string;
  name: string;
  email: string;
  company: string;
  title: string;
  subject: string;
  /** Plain text; paragraphs separated by blank lines. */
  body: string;
  /** One line: why Maya wrote it this way. */
  why: string;
  status: FirstSendRowStatus;
  sentAt: string | null;
  error: string | null;
}

/** The footer email law requires on every email: company and mailing address. */
export interface ComplianceStatus {
  isComplete: boolean;
  companyName: string;
  mailingAddress: string;
}

export interface MailingAddress {
  companyName?: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface FirstSend {
  id: string;
  status: 'draft' | 'sending' | 'done';
  tone: 'default' | 'softer';
  mailboxAddress: string;
  rows: FirstSendRow[];
  counts: { total: number; sent: number; failed: number };
  /** When the next queued email goes out. */
  nextSendAt: string | null;
}

/**
 * Outreach's first email (design_handoff_outreach_onboarding 4): one
 * personal draft per contact from Network, written by Maya from the shared
 * profile, then sent from the user's own inbox a few minutes apart
 * (`/api/outreach/first-send`, todd-backend outreachFirstSend.service.js).
 */
@Injectable( { providedIn: 'root' } )
export class FirstSendService {
  private readonly http = inject( HttpClient );
  private readonly base = `${environment.backendURL}/outreach/first-send`;

  async latest (): Promise<{ batch: FirstSend | null; compliance: ComplianceStatus | null }> {
    const response = await firstValueFrom( this.http.get<{ data: FirstSend | null; compliance?: ComplianceStatus }>(
      `${this.base}/latest`, { headers: await this.headers() } ) );
    return { batch: response.data || null, compliance: response.compliance || null };
  }

  async saveAddress ( address: MailingAddress ): Promise<ComplianceStatus> {
    const response = await firstValueFrom( this.http.put<{ compliance: ComplianceStatus }>(
      `${environment.backendURL}/outreach/compliance-address`, address, { headers: await this.headers() } ) );
    return response.compliance;
  }

  async create ( contactIds: string[] ): Promise<FirstSend> {
    return this.post( this.base, { contactIds } );
  }

  async redraft ( id: string, tone: FirstSend['tone'] ): Promise<FirstSend> {
    return this.post( `${this.base}/${id}/redraft`, { tone } );
  }

  /** Leave one person out - they're being written in the composer instead. */
  async skip ( id: string, contactId: string ): Promise<FirstSend> {
    return this.post( `${this.base}/${id}/drafts/${contactId}/skip`, {} );
  }

  async send ( id: string ): Promise<FirstSend> {
    return this.post( `${this.base}/${id}/send`, {} );
  }

  private async post ( url: string, body: unknown ): Promise<FirstSend> {
    const response = await firstValueFrom( this.http.post<{ data: FirstSend }>( url, body, { headers: await this.headers() } ) );
    return response.data;
  }

  private async headers (): Promise<Record<string, string>> {
    await getAuth().authStateReady();
    const user = getAuth().currentUser;
    if ( !user ) throw new Error( 'Please sign in again.' );
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  }
}
