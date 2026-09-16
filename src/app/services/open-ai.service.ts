import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, tap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { LoggerService } from './logger.service';

/**
 * Trimmed port of TODD's open-ai.service.ts, scoped to the shared
 * `/app-assistant` endpoint's 'general' domain only. Unlike Network/Pulse/
 * Moves/Docs, Outreach doesn't need a product-specific domain here -
 * its "domain work" is the email composer flow, which calls this app's
 * own EmailService.generateEmailDraftFromEditor (a different, existing
 * endpoint), not `/app-assistant`. This service only covers the general
 * chat fallback.
 */
@Injectable( { providedIn: 'root' } )
export class OpenAIService {
  constructor ( private http: HttpClient, private logger: LoggerService ) { }

  getAssistance ( prompt: string, domain: 'general', user?: string, data?: any ): Observable<any> {
    this.logger.log( 'Calling', `${environment.backendURL}/app-assistant`, 'With this message', prompt );
    const headers = new HttpHeaders().set( 'Authorization', `Bearer ${environment.apiKey}` );
    const payload = { prompt, domain, data: data || null };

    return this.http
      .post<any>( `${environment.backendURL}/app-assistant`, payload, { headers } )
      .pipe(
        tap( ( res ) => {
          try {
            this.logger.info( 'APP_ASSISTANT_RAW_RESPONSE', { domain, type: typeof res } );
          } catch { /* ignore */ }
        } ),
        catchError( ( err: any ) => {
          this.logger.error( 'APP_ASSISTANT_ERROR', { domain, err } );
          return throwError( () => err );
        } )
      );
  }
}
