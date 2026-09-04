import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Contact } from '../models/contact.model';

/**
 * Just the two OpenAIService methods this extraction's ported components
 * actually call - contactInsight() (EmailerComponent's per-contact
 * relationship tip before drafting) and getTemplateTokenAssistance()
 * (EmailerComponent's template stop-gap mode) - out of that service's
 * 700+ line surface covering everything from campaign copy to survey
 * generation. Same pattern as Network's NetworkInsightService: a single
 * POST with the same static Bearer key every TODD frontend ships.
 */
@Injectable( { providedIn: 'root' } )
export class OutreachInsightService {
  constructor ( private http: HttpClient ) { }

  contactInsight ( contact: Contact ): Observable<any> {
    const headers = new HttpHeaders().set( 'Authorization', `Bearer ${environment.apiKey}` );
    return this.http.post<any>( `${environment.backendURL}/contact-insight`, { profile: contact }, { headers } );
  }

  getTemplateTokenAssistance ( prompt: string, _user: string, contact?: Contact ): Observable<any> {
    const headers = new HttpHeaders().set( 'Authorization', `Bearer ${environment.apiKey}` );
    const body: any = { prompt };
    if ( contact ) {
      body.contact = contact;
    }
    return this.http.post<any>( `${environment.backendURL}/template-tokens`, body, { headers } );
  }
}
