import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ClickStreamRecord {
    email: string;
    url: string;
    campaign: string;
    timestamp: number;
}

export interface TopCampaignSummary {
    campaign: string;
    count: number;
}

export interface ClickStreamSummary {
    topCampaigns: TopCampaignSummary[];
    totalRecords: number;
}

export interface ClickStreamListResult {
    records: ClickStreamRecord[];
    pageSize: number;
    hasMore: boolean;
    nextCursor: string | null;
    summary: ClickStreamSummary;
}

export interface ClickStreamApiResponse {
    success: boolean;
    message?: string;
    data: ClickStreamListResult;
}

export interface ClickStreamListRequest {
    pageSize?: number;
    cursor?: string | null;
}

@Injectable( {
    providedIn: 'root'
} )
export class ClickStreamApiService {
    private readonly baseUrl = `${environment.backendURL}/click-stream`;

    constructor ( private http: HttpClient ) { }

    getClickStream ( request?: ClickStreamListRequest ): Observable<ClickStreamApiResponse> {
        let params = new HttpParams();

        if ( request?.pageSize ) {
            params = params.set( 'pageSize', String( request.pageSize ) );
        }

        if ( request?.cursor ) {
            params = params.set( 'cursor', request.cursor );
        }

        return this.http.get<ClickStreamApiResponse>( this.baseUrl, { params } );
    }
}
