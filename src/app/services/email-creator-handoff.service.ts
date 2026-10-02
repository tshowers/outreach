import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/** Query parameter Email Creator opens Outreach with. */
export const EMAIL_CREATOR_HANDOFF_PARAM = 'emailCreatorHandoff';

/** A finished design from Email Creator (todd-backend emailCreatorHandoff.service.js). */
export interface EmailCreatorHandoff {
  kind: 'email-template' | 'email-design';
  subject: string;
  preheader: string;
  html: string;
  /** Recipient tokens still in it, e.g. ['firstName'] - Catalyst fills them per contact. */
  tokens: string[];
}

/**
 * Opens an email handed over from Email Creator: Catalyst as a bulk template,
 * the Email Composer for one recipient. Each handoff opens once and expires
 * after 24 hours. The ID-token interceptor signs the request.
 */
@Injectable( { providedIn: 'root' } )
export class EmailCreatorHandoffService {
  private readonly http = inject( HttpClient );

  async open ( id: string, kind: EmailCreatorHandoff['kind'] ): Promise<EmailCreatorHandoff> {
    const url = `${ environment.backendURL }/email-creator/handoff/${ encodeURIComponent( id ) }`;
    const response = await firstValueFrom( this.http.get<{ success: boolean; data: EmailCreatorHandoff }>( url, { params: { kind } } ) );
    return response.data;
  }
}
