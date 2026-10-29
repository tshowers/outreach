import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Drip, DripAudience, DripConflict, DripDetail } from '../models/drips.model';

/** An error from the Drips API, with the overlap details when slots are full. */
export interface DripCategory {
  name: string;
  /** What to search by: the category itself, or "group:no-company" and the like. */
  value?: string;
  count: number;
  group?: boolean;
}

export class DripsApiError extends Error {
  constructor ( message: string, readonly status: number, readonly code: string | null, readonly conflict: DripConflict | null ) {
    super( message );
  }
}

export interface DripPatch {
  title?: string;
  kind?: Drip['kind'];
  rateMinutes?: number;
  audienceId?: string | null;
  startMode?: Drip['startMode'];
  startDate?: string | null;
  endDate?: string | null;
}

export interface AudienceQuery {
  source: 'contacts' | 'leadVault' | 'both';
  mode: 'search' | 'category';
  query: string;
  name?: string;
}

/** todd-backend /outreach/drips; the interceptors add the ID token and tenant. */
@Injectable( { providedIn: 'root' } )
export class DripsApiService {
  private readonly http = inject( HttpClient );
  private readonly base = `${ environment.backendURL }/outreach/drips`;

  list (): Promise<{ drips: Drip[]; slots: { max: number; inUse: number } }> {
    return this.call( 'GET', '' );
  }

  get ( id: string ): Promise<DripDetail> {
    return this.call( 'GET', `/${ encodeURIComponent( id ) }` );
  }

  update ( id: string, patch: DripPatch ): Promise<Drip> {
    return this.call( 'PATCH', `/${ encodeURIComponent( id ) }`, patch );
  }

  toggle ( id: string, on: boolean ): Promise<Drip> {
    return this.call( 'POST', `/${ encodeURIComponent( id ) }/toggle`, { on } );
  }

  archive ( id: string ): Promise<Drip> {
    return this.call( 'POST', `/${ encodeURIComponent( id ) }/archive`, {} );
  }

  duplicate ( id: string ): Promise<Drip> {
    return this.call( 'POST', `/${ encodeURIComponent( id ) }/duplicate`, {} );
  }

  audiences (): Promise<DripAudience[]> {
    return this.call( 'GET', '/audiences' );
  }

  /** Groups (No company, Subscribers, Affiliates, Resellers - value "group:<id>") first, then Category values. */
  categories (): Promise<DripCategory[]> {
    return this.call( 'GET', '/audiences/categories' );
  }

  /** A saved audience's contact ids, for Catalyst; Lead Vault members are counted, not listed. */
  audienceContacts ( id: string ): Promise<{ contactIds: string[]; leadVaultCount: number }> {
    return this.call( 'GET', `/audiences/${ encodeURIComponent( id ) }/contacts` );
  }

  previewAudience ( query: AudienceQuery ): Promise<{ count: number; sample: string[]; terms: string[] }> {
    return this.call( 'POST', '/audiences/preview', query );
  }

  createAudience ( query: AudienceQuery ): Promise<DripAudience> {
    return this.call( 'POST', '/audiences', query );
  }

  private async call<T> ( method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown ): Promise<T> {
    const url = `${ this.base }${ path }`;
    try {
      const request = method === 'GET' ? this.http.get<{ data: T }>( url ) :
        method === 'PATCH' ? this.http.patch<{ data: T }>( url, body ) : this.http.post<{ data: T }>( url, body );
      return ( await firstValueFrom( request ) ).data;
    } catch ( error ) {
      if ( error instanceof HttpErrorResponse ) {
        const message = error.status === 0 ? 'Could not reach 16Ahead. Check your connection and try again.' : error.error?.message || 'Something went wrong. Please try again.';
        throw new DripsApiError( message, error.status, error.error?.code || null, error.error?.conflict || null );
      }
      throw error;
    }
  }
}
