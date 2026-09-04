

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AdEngagementRecord {
    id: string;
    adKey?: string;
    eventType?: string;
    durationMs?: number;
    userId?: string;
    ip?: string;
    variant?: string;
    timestamp?: number;
    recordedAt?: string | null;
    [key: string]: any;
}

export interface TopAdSummary {
    adKey: string;
    count: number;
}

export interface AdEngagementSummary {
    topAds: TopAdSummary[];
    totalRecords: number;
    excludedIpCount: number;
}

export interface AdEngagementListResult {
    records: AdEngagementRecord[];
    pageSize: number;
    hasMore: boolean;
    nextCursor: string | null;
    summary: AdEngagementSummary;
}

export interface AdEngagementApiResponse {
    success: boolean;
    message?: string;
    data: AdEngagementListResult;
}

export interface AdEngagementListRequest {
    pageSize?: number;
    cursor?: string | null;
}

@Injectable( {
    providedIn: 'root'
} )
export class AdEngagementApiService {
    private readonly baseUrl = `${environment.backendURL}/ad-engagements`;

    constructor ( private http: HttpClient ) { }

    getAdEngagements ( request?: AdEngagementListRequest ): Observable<AdEngagementApiResponse> {
        let params = new HttpParams();

        if ( request?.pageSize ) {
            params = params.set( 'pageSize', String( request.pageSize ) );
        }

        if ( request?.cursor ) {
            params = params.set( 'cursor', request.cursor );
        }

        return this.http.get<AdEngagementApiResponse>( this.baseUrl, { params } );
    }
}
