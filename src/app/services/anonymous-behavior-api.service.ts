import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type AnonymousBehaviorEventType = 'page_view' | 'cta_click' | 'page_exit';

export interface AnonymousBehaviorEventPayload {
  tenantId: string;
  sessionId: string;
  anonymousVisitorId: string;
  eventType: AnonymousBehaviorEventType;
  pageUrl: string;
  pageTitle?: string;
  referrer?: string;
  ctaId?: string;
  ctaLabel?: string;
  timestamp: number;
  dwellTimeMs?: number;
  campaignSource?: string;
  campaignMedium?: string;
  campaignName?: string;
  campaignTerm?: string;
  campaignContent?: string;
  deviceType?: string;
  metadata?: Record<string, unknown>;
}

export interface BehaviorRankedPage {
  pageUrl: string;
  count: number;
}

export interface BehaviorRankedLabel {
  label: string;
  count: number;
}

export interface BehaviorRankedPath {
  path: string;
  count: number;
}

export interface BehaviorTransition {
  from: string;
  to: string;
  count: number;
}

export interface BehaviorBreakpoint {
  pageUrl: string;
  exitCount: number;
  totalViews: number;
  exitRate: number;
}

export interface BehaviorInsight {
  id: string;
  tone: 'info' | 'positive' | 'attention';
  title: string;
  summary: string;
  recommendation: string;
  metricLabel?: string;
  metricValue?: string;
}

export interface BehaviorAlert {
  id: string;
  tone: 'info' | 'positive' | 'attention';
  title: string;
  summary: string;
}

export interface BehaviorEscalation {
  tone: 'info' | 'positive' | 'attention';
  urgencyLevel: string;
  label: string;
  summary: string;
}

export interface BehaviorSegment {
  label: string;
  totalSessions: number;
  totalPageViews: number;
  totalCtaClicks: number;
  avgPagesPerSession: number;
  avgDwellTimeMs: number;
}

export interface AnonymousBehaviorSummary {
  overview: {
    totalEvents: number;
    totalSessions: number;
    totalPageViews: number;
    totalCtaClicks: number;
    totalExits: number;
    avgPagesPerSession: number;
    avgDwellTimeMs: number;
    uniqueVisitorCount: number;
    returningVisitorCount: number;
    periodDays: number;
    appliedSegmentType: string;
    appliedSegmentValue: string;
  };
  freshness: {
    dataSource: string;
    windowStartDateKey: string;
    windowEndDateKey: string;
    lastRollupDateKey: string;
    rollupCoverageDays: number;
  };
  trends: {
    previousPeriodDays: number;
    totalSessionsDelta: number;
    totalPageViewsDelta: number;
    totalCtaClicksDelta: number;
    avgPagesPerSessionDelta: number;
    avgDwellTimeMsDelta: number;
  };
  topPages: BehaviorRankedPage[];
  topEntryPages: BehaviorRankedPage[];
  topExitPages: BehaviorRankedPage[];
  topCtas: BehaviorRankedLabel[];
  topCtaIds: BehaviorRankedLabel[];
  topSections: BehaviorRankedLabel[];
  topReferrers: BehaviorRankedLabel[];
  topPaths: BehaviorRankedPath[];
  topTransitions: BehaviorTransition[];
  topBreakpoints: BehaviorBreakpoint[];
  topSourceSegments: BehaviorSegment[];
  topCampaignSegments: BehaviorSegment[];
  topDeviceSegments: BehaviorSegment[];
  alerts: BehaviorAlert[];
  escalation?: BehaviorEscalation;
  insights: BehaviorInsight[];
}

export interface BehaviorResponseHistoryItem {
  actionPlanId: string;
  label: string;
  state: string;
  stateLabel: string;
  outcome: string;
  reason: string;
  tone: 'info' | 'positive' | 'attention';
  createdAt: string;
  contextSource: 'original' | 'backfilled' | string;
  contextUpdatedAt: string;
  behaviorCommandSummary?: string;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

@Injectable( {
  providedIn: 'root'
} )
export class AnonymousBehaviorApiService {
  private readonly baseUrl = environment.backendURL;

  constructor ( private http: HttpClient ) { }

  trackEvent ( payload: AnonymousBehaviorEventPayload ): Observable<ApiResponse<{ id: string; }>> {
    return this.http.post<ApiResponse<{ id: string; }>>( `${this.baseUrl}/anonymous-behavior/events`, payload );
  }

  getSummary ( tenantId: string, periodDays: number = 30, segmentType?: string, segmentValue?: string ): Observable<ApiResponse<AnonymousBehaviorSummary>> {
    let params = new HttpParams()
      .set( 'tenantId', tenantId )
      .set( 'periodDays', String( periodDays ) );

    if ( segmentType && segmentValue ) {
      params = params
        .set( 'segmentType', segmentType )
        .set( 'segmentValue', segmentValue );
    }

    return this.http.get<ApiResponse<AnonymousBehaviorSummary>>( `${this.baseUrl}/anonymous-behavior/summary`, { params } );
  }

  getMomentumInsights ( tenantId: string, periodDays: number = 30, segmentType?: string, segmentValue?: string ): Observable<ApiResponse<{ tenantId: string; periodDays: number; segmentType?: string; segmentValue?: string; insights: BehaviorInsight[]; }>> {
    let params = new HttpParams()
      .set( 'tenantId', tenantId )
      .set( 'periodDays', String( periodDays ) );

    if ( segmentType && segmentValue ) {
      params = params
        .set( 'segmentType', segmentType )
        .set( 'segmentValue', segmentValue );
    }

    return this.http.get<ApiResponse<{ tenantId: string; periodDays: number; segmentType?: string; segmentValue?: string; insights: BehaviorInsight[]; }>>( `${this.baseUrl}/momentum/behavior-insights`, { params } );
  }

  getResponseHistory ( tenantId: string, periodDays: number = 30, segmentType?: string, segmentValue?: string ): Observable<ApiResponse<{ items: BehaviorResponseHistoryItem[]; }>> {
    let params = new HttpParams()
      .set( 'tenantId', tenantId )
      .set( 'periodDays', String( periodDays ) );

    if ( segmentType && segmentValue ) {
      params = params
        .set( 'segmentType', segmentType )
        .set( 'segmentValue', segmentValue );
    }

    return this.http.get<ApiResponse<{ items: BehaviorResponseHistoryItem[]; }>>( `${this.baseUrl}/anonymous-behavior/response-history`, { params } );
  }

  refreshBehaviorContext ( tenantId: string, lookbackDays: number = 14 ): Observable<ApiResponse<{ rollups: { tenantId: string; lookbackDays: number; dateKeys: string[]; }; contexts: { tenantId: string; lookbackDays: number; refreshedCount: number; }; }>> {
    return this.http.post<ApiResponse<{ rollups: { tenantId: string; lookbackDays: number; dateKeys: string[]; }; contexts: { tenantId: string; lookbackDays: number; refreshedCount: number; }; }>>(
      `${this.baseUrl}/anonymous-behavior/refresh-context`,
      {
        tenantId,
        lookbackDays
      }
    );
  }
}
