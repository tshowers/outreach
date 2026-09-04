import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Email } from '../models/email.model';

import { environment } from '../../environments/environment';

export interface EmailListRequest {
    pageSize?: number;
    cursor?: string;
    emailAddress?: string;
    campaignId?: string;
    planId?: string;
}

export interface EmailListSummary {
    totalReturned: number;
    filteredByEmailAddress: boolean;
    filteredByCampaignId: boolean;
    filteredByPlanId: boolean;
    filteredByDays: boolean;
}

export interface EmailListData {
    records: Email[];
    pageSize: number;
    count: number;
    hasMore: boolean;
    nextCursor: string | null;
    summary?: EmailListSummary;
}

export interface EmailListResponse {
    success: boolean;
    message: string;
    data: EmailListData;
}

export interface EmailDetailResponse {
    success: boolean;
    message: string;
    data: Email;
}

@Injectable( {
    providedIn: 'root'
} )
export class EmailApiService {
    private readonly baseUrl = `${environment.backendURL}/outreach/emails`;

    constructor ( private readonly http: HttpClient ) { }

    /**
     * Get a paged list of emails.
     */
    getEmails ( request?: EmailListRequest ): Observable<EmailListResponse> {
        let params = new HttpParams();

        if ( request?.pageSize ) {
            params = params.set( 'pageSize', String( request.pageSize ) );
        }

        if ( request?.cursor ) {
            params = params.set( 'cursor', request.cursor );
        }

        if ( request?.emailAddress ) {
            params = params.set( 'emailAddress', request.emailAddress );
        }

        if ( request?.campaignId ) {
            params = params.set( 'campaignId', request.campaignId );
        }

        if ( request?.planId ) {
            params = params.set( 'planId', request.planId );
        }


        return this.http.get<EmailListResponse>( this.baseUrl, { params } );
    }

    /**
     * Get emails for a specific email address with paging support.
     */
    getEmailsByAddress (
        emailAddress: string,
        options?: Omit<EmailListRequest, 'emailAddress'>
    ): Observable<EmailListResponse> {
        return this.getEmails( {
            ...( options || {} ),
            emailAddress
        } );
    }

    /**
     * Get a single email by id.
     */
    getEmailById ( emailId: string ): Observable<EmailDetailResponse> {
        return this.http.get<EmailDetailResponse>( `${this.baseUrl}/${emailId}` );
    }
}
