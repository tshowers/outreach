import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, distinctUntilChanged, filter, forkJoin, of, take } from 'rxjs';
import { TopDogComponent } from '../../../shared/top-dog/top-dog.component';
import { OutreachAuthService } from '../../../services/outreach-auth.service';
import {
  AdEngagementApiService,
  AdEngagementRecord,
  TopAdSummary,
} from '../../../services/ad-engagement-api.service';
import { OutreachApiService } from '../../../services/outreach-api.service';
import { LoggerService } from '../../../services/logger.service';
import { OutreachNomenclatureService } from '../../../services/outreach-nomenclature.service';
import { SoundService } from '../../../services/sound.service';
import { FormatDurationPipe } from '../../../pipes/format-duration.pipe';
import { FormsModule } from '@angular/forms';
import { SectionJumpComponent, SectionJumpItem } from '../../../shared/section-jump/section-jump.component';

import { AnonymousBehaviorApiService, AnonymousBehaviorSummary, BehaviorInsight, BehaviorResponseHistoryItem, BehaviorSegment } from '../../../services/anonymous-behavior-api.service';

/** Ported near-verbatim from features/email/pages/ad-engagement/ad-engagement-results/. */
@Component( {
  selector: 'app-ad-engagement-results',
  imports: [CommonModule, FormsModule, FormatDurationPipe, SectionJumpComponent
  ],
  templateUrl: './ad-engagement-results.component.html',
  styleUrl: './ad-engagement-results.component.css'
} )
export class AdEngagementResultsComponent extends TopDogComponent implements OnInit, OnDestroy, AfterViewInit {
  readonly sectionLinks: ReadonlyArray<SectionJumpItem> = [
    { id: 'engagement-behavior-insights', label: 'Insights' },
    { id: 'engagement-segments', label: 'Segments' },
    { id: 'engagement-breakpoints', label: 'Breakpoints' },
    { id: 'engagement-live-records', label: 'Live records' }
  ];

  private readonly behaviorStoragePrefix = 'ad-engagement-behavior';
  private hasRestoredBehaviorPreferences = false;
  engagements: AdEngagementRecord[] = [];
  topAds: TopAdSummary[] = [];
  error: string | null = null;
  behaviorSummary: AnonymousBehaviorSummary | null = null;
  behaviorInsights: BehaviorInsight[] = [];
  behaviorResponseHistory: BehaviorResponseHistoryItem[] = [];
  readonly behaviorPeriodOptions = [7, 30, 90];
  readonly segmentTypeOptions = [
    { value: '', label: 'All traffic' },
    { value: 'source', label: 'Source' },
    { value: 'campaign', label: 'Campaign' },
    { value: 'device', label: 'Device' },
    { value: 'page', label: 'Page' },
  ];

  private static readonly insightVariantLabels: Record<number, string> = {
    0: 'Nobody says that part out loud.',
    1: "That's the scam nobody talks about."
  };
  selectedBehaviorPeriodDays = 30;
  selectedSegmentType = '';
  selectedSegmentValue = '';
  availableSegmentValues: string[] = [];
  refreshingBehaviorContext = false;
  behaviorRefreshMessage = '';
  behaviorRefreshState: 'success' | 'error' | '' = '';

  clickedEmails = new Set<string>();
  pageSizeOptions: number[] = [100, 250, 500, 1000];
  pageSize = 100;
  nextCursor: string | null = null;
  hasMore = false;
  isLoadingMore = false;

  constructor ( private adEngagementApiService: AdEngagementApiService,
    private anonymousBehaviorApiService: AnonymousBehaviorApiService,
    private outreachApi: OutreachApiService,
    protected override nomenclatureService: OutreachNomenclatureService,
    protected override soundService: SoundService,
    protected override authService: OutreachAuthService,
    protected override logger: LoggerService,
    protected override router: Router ) {
    super( authService, soundService, logger, router, nomenclatureService );
  }

  override ngOnInit (): void {
    super.ngOnInit();
    this.readySubscription = this.ready$
      .pipe(
        distinctUntilChanged(),
        filter( Boolean ),
        take( 1 )
      )
      .subscribe( () => this.loadDashboard() );
  }

  override ngOnDestroy (): void {
    super.ngOnDestroy();
  }

  override ngAfterViewInit (): void {
    super.ngAfterViewInit();
  }

  private loadDashboard (): void {
    this.restoreBehaviorPreferences();
    this.isLoading = true;
    this.error = null;

    const behaviorSegmentType = this.selectedSegmentType === 'page' ? '' : this.selectedSegmentType;
    const behaviorSegmentValue = this.selectedSegmentType === 'page' ? '' : this.selectedSegmentValue;

    forkJoin( {
      engagements: this.adEngagementApiService.getAdEngagements( {
        pageSize: this.pageSize
      } ),
      behavior: this.anonymousBehaviorApiService.getSummary(
        String( this.tenantId || '' ),
        this.selectedBehaviorPeriodDays,
        behaviorSegmentType,
        behaviorSegmentValue
      ).pipe(
        catchError( ( error ) => {
          this.logger.warn( 'Anonymous behavior summary unavailable for engagement cockpit.', error );
          return of( { success: false, data: null as AnonymousBehaviorSummary | null } );
        } )
      ),
      responseHistory: this.anonymousBehaviorApiService.getResponseHistory(
        String( this.tenantId || '' ),
        this.selectedBehaviorPeriodDays,
        behaviorSegmentType,
        behaviorSegmentValue
      ).pipe(
        catchError( ( error ) => {
          this.logger.warn( 'Behavior response history unavailable for engagement cockpit.', error );
          return of( { success: false, data: { items: [] as BehaviorResponseHistoryItem[] } } );
        } )
      )
    } ).subscribe( {
      next: ( { engagements, behavior, responseHistory } ) => {
        const result = engagements?.data;
        const records = Array.isArray( result?.records ) ? result.records : [];

        this.engagements = records;
        this.topAds = Array.isArray( result?.summary?.topAds ) ? result.summary.topAds : [];
        this.nextCursor = result?.nextCursor || null;
        this.hasMore = !!result?.hasMore;
        this.behaviorSummary = behavior?.data || null;
        this.behaviorInsights = Array.isArray( behavior?.data?.insights ) ? behavior.data.insights : [];
        this.behaviorResponseHistory = Array.isArray( responseHistory?.data?.items ) ? responseHistory.data.items : [];
        this.refreshAvailableSegmentValues();
      },
      error: ( error ) => {
        this.logger.error( 'Failed to load engagement cockpit data.', error );
        this.error = error?.error?.message || 'Unable to load engagement data right now.';
        this.engagements = [];
        this.topAds = [];
        this.nextCursor = null;
        this.hasMore = false;
        this.behaviorSummary = null;
        this.behaviorInsights = [];
        this.behaviorResponseHistory = [];
        this.availableSegmentValues = [];
      },
      complete: () => {
        this.isLoading = false;
      }
    } );
  }

  private loadEngagements ( append: boolean = false ): void {
    if ( append ) {
      this.isLoadingMore = true;
    } else {
      this.isLoading = true;
      this.error = null;
      this.nextCursor = null;
      this.hasMore = false;
    }

    this.adEngagementApiService.getAdEngagements( {
      pageSize: this.pageSize,
      cursor: append ? this.nextCursor : null,
    } ).subscribe( {
      next: ( response ) => {
        const result = response?.data;
        const records = Array.isArray( result?.records ) ? result.records : [];

        this.engagements = append ? [...this.engagements, ...records] : records;
        this.topAds = Array.isArray( result?.summary?.topAds ) ? result.summary.topAds : [];
        this.nextCursor = result?.nextCursor || null;
        this.hasMore = !!result?.hasMore;
        this.error = null;
      },
      error: ( error ) => {
        this.logger.error( 'Failed to fetch ad engagements from backend.', error );
        this.error = error?.error?.message || 'Unable to load ad engagements right now.';
        if ( !append ) {
          this.engagements = [];
          this.topAds = [];
          this.nextCursor = null;
          this.hasMore = false;
        }
      },
      complete: () => {
        this.isLoading = false;
        this.isLoadingMore = false;
      }
    } );
  }

  onPageSizeChange (): void {
    this.loadDashboard();
  }

  onBehaviorPeriodChange (): void {
    this.persistBehaviorPreferences();
    this.loadDashboard();
  }

  onSegmentTypeChange (): void {
    this.selectedSegmentValue = '';
    this.refreshAvailableSegmentValues();
    this.persistBehaviorPreferences();
    this.loadDashboard();
  }

  onSegmentValueChange (): void {
    this.persistBehaviorPreferences();
    this.loadDashboard();
  }

  refreshBehaviorContext (): void {
    if ( this.refreshingBehaviorContext || !this.tenantId ) {
      return;
    }

    this.refreshingBehaviorContext = true;
    this.behaviorRefreshMessage = '';
    this.behaviorRefreshState = '';

    this.anonymousBehaviorApiService.refreshBehaviorContext(
      String( this.tenantId ),
      Math.max( 14, this.selectedBehaviorPeriodDays )
    ).pipe( take( 1 ) ).subscribe( {
      next: ( response ) => {
        const refreshedCount = Number( response?.data?.contexts?.refreshedCount || 0 );
        this.behaviorRefreshState = 'success';
        this.behaviorRefreshMessage = refreshedCount > 0
          ? `Refreshed behavior context for ${refreshedCount} recent action plan${refreshedCount === 1 ? '' : 's'}.`
          : 'Behavior context was already current for recent action plans.';
        this.loadDashboard();
      },
      error: ( error ) => {
        this.logger.error( 'Failed to refresh behavior context from the cockpit.', error );
        this.refreshingBehaviorContext = false;
        this.behaviorRefreshState = 'error';
        this.behaviorRefreshMessage = error?.error?.message || 'Could not refresh behavior context right now.';
      },
      complete: () => {
        this.refreshingBehaviorContext = false;
      }
    } );
  }

  loadMore (): void {
    if ( this.isLoadingMore || !this.hasMore || !this.nextCursor ) {
      return;
    }

    this.loadEngagements( true );
  }

  public onEmail ( email: string ): void {
    this.lookupContactByEmail( email );
  }

  lookupContactByEmail ( emailAddress: string ) {
    this.outreachApi.getOutreachContactByEmail( emailAddress, {
      tenantId: this.tenantId,
      userId: this.userId
    } ).subscribe( response => {
      const contact = response?.data;
      if ( contact && contact.id ) {
        this.craftEmail( contact );
        this.clickedEmails.add( emailAddress );
      }
    } );
  }

  craftEmail ( contact: any ) {
    const url = this.router.serializeUrl(
      this.router.createUrlTree( ['/compose-email'], {
        queryParams: { id: contact.id }
      } )
    );

    window.open( url, 'compose-email-tab' );
  }

  formatAverageDwellTime (): string {
    const dwellTimeMs = Number( this.behaviorSummary?.overview?.avgDwellTimeMs || 0 );
    return this.formatDurationFromMs( dwellTimeMs );
  }

  formatSegmentDwellTime ( dwellTimeMs: number | null | undefined ): string {
    return this.formatDurationFromMs( Number( dwellTimeMs || 0 ) );
  }

  get topCtaLabel (): string {
    return this.behaviorSummary?.topCtas.length ? this.behaviorSummary.topCtas[0].label : 'No CTA data yet';
  }

  get topCtaCount (): number {
    return this.behaviorSummary?.topCtas.length ? this.behaviorSummary.topCtas[0].count : 0;
  }

  get topEntryPageLabel (): string {
    return this.behaviorSummary?.topEntryPages.length ? this.behaviorSummary.topEntryPages[0].pageUrl : 'No entry page yet';
  }

  get topExitPageLabel (): string {
    return this.behaviorSummary?.topExitPages.length ? this.behaviorSummary.topExitPages[0].pageUrl : 'No exit page yet';
  }

  get topPathLabel (): string {
    return this.behaviorSummary?.topPaths.length ? this.behaviorSummary.topPaths[0].path : 'Need at least two-page journeys';
  }

  get topReferrerLabel (): string {
    return this.behaviorSummary?.topReferrers.length ? this.behaviorSummary.topReferrers[0].label : 'Direct / unknown';
  }

  formatExitRate ( value: number | null | undefined ): string {
    const safeValue = Math.max( 0, Number( value || 0 ) );
    return `${( safeValue * 100 ).toFixed( 0 )}%`;
  }

  get sourceComparison (): { strongest: string; weakest: string; } | null {
    return this.buildSegmentComparison(
      this.behaviorSummary?.topSourceSegments,
      segment => Number( segment.avgPagesPerSession || 0 ),
      segment => `${segment.label} is driving the deepest journeys at ${Number( segment.avgPagesPerSession || 0 ).toFixed( 1 )} pages per session.`,
      segment => `${segment.label} is bringing the shallowest journeys at ${Number( segment.avgPagesPerSession || 0 ).toFixed( 1 )} pages per session.`
    );
  }

  get campaignComparison (): { strongest: string; weakest: string; } | null {
    return this.buildSegmentComparison(
      this.behaviorSummary?.topCampaignSegments,
      segment => this.getSegmentCtaTraction( segment ),
      segment => `${segment.label} has the strongest CTA traction at ${this.formatExitRate( this.getSegmentCtaTraction( segment ) )} clicks per session.`,
      segment => `${segment.label} has the weakest CTA traction at ${this.formatExitRate( this.getSegmentCtaTraction( segment ) )} clicks per session.`
    );
  }

  get deviceComparison (): { strongest: string; weakest: string; } | null {
    return this.buildSegmentComparison(
      this.behaviorSummary?.topDeviceSegments,
      segment => Number( segment.avgDwellTimeMs || 0 ),
      segment => `${segment.label} visitors stay the longest at ${this.formatSegmentDwellTime( segment.avgDwellTimeMs )} average dwell.`,
      segment => `${segment.label} visitors leave fastest at ${this.formatSegmentDwellTime( segment.avgDwellTimeMs )} average dwell.`
    );
  }

  get behaviorChangeAlerts () {
    return this.behaviorSummary?.alerts || [];
  }

  get behaviorEscalationCallout (): { tone: 'positive' | 'attention' | 'info'; title: string; summary: string; } | null {
    if ( this.behaviorSummary?.escalation?.label && this.behaviorSummary?.escalation?.summary ) {
      return {
        tone: this.behaviorSummary.escalation.tone || 'info',
        title: this.behaviorSummary.escalation.label,
        summary: this.behaviorSummary.escalation.summary
      };
    }

    return null;
  }

  get recommendedBehaviorResponse (): BehaviorResponseHistoryItem | null {
    if ( !Array.isArray( this.behaviorResponseHistory ) || this.behaviorResponseHistory.length === 0 ) {
      return null;
    }

    return this.behaviorResponseHistory[0] || null;
  }

  formatTrendValue ( value: number | null | undefined, format: 'number' | 'duration' = 'number' ): string {
    const safeValue = Number( value || 0 );
    const prefix = safeValue > 0 ? '+' : '';

    if ( format === 'duration' ) {
      return `${prefix}${this.formatDurationFromMs( Math.abs( safeValue ) )}`;
    }

    return `${prefix}${safeValue.toFixed( 1 )}`;
  }

  getTrendTone ( value: number | null | undefined, positiveWhenHigher: boolean = true ): 'positive' | 'attention' | 'info' {
    const safeValue = Number( value || 0 );
    if ( safeValue === 0 ) return 'info';
    const isPositive = positiveWhenHigher ? safeValue > 0 : safeValue < 0;
    return isPositive ? 'positive' : 'attention';
  }

  get behaviorFreshnessLabel (): string {
    const freshness = this.behaviorSummary?.freshness;
    if ( !freshness ) {
      return '';
    }

    if ( freshness.dataSource === 'rollup' ) {
      return `Rollup-backed through ${freshness.windowEndDateKey}`;
    }

    return `Live stitched through ${freshness.windowEndDateKey}`;
  }

  private formatDurationFromMs ( dwellTimeMs: number ): string {
    if ( dwellTimeMs <= 0 ) return '0s';

    const totalSeconds = Math.round( dwellTimeMs / 1000 );
    if ( totalSeconds < 60 ) return `${totalSeconds}s`;

    const minutes = Math.floor( totalSeconds / 60 );
    const seconds = totalSeconds % 60;
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  getTransitionIntensity ( count: number | null | undefined ): number {
    const strongestCount = Number( this.behaviorSummary?.topTransitions?.[0]?.count || 0 );
    const safeCount = Number( count || 0 );
    if ( strongestCount <= 0 || safeCount <= 0 ) return 0;
    return Math.max( 0.18, Math.min( 1, safeCount / strongestCount ) );
  }

  get isSegmentFilterActive (): boolean {
    return !!this.selectedSegmentType && !!this.selectedSegmentValue;
  }

  private refreshAvailableSegmentValues (): void {
    const behavior = this.behaviorSummary;
    if ( !behavior || !this.selectedSegmentType ) {
      this.availableSegmentValues = [];
      return;
    }

    switch ( this.selectedSegmentType ) {
      case 'source':
        this.availableSegmentValues = ( behavior.topSourceSegments || [] ).map( ( item ) => item.label );
        break;
      case 'campaign':
        this.availableSegmentValues = ( behavior.topCampaignSegments || [] ).map( ( item ) => item.label );
        break;
      case 'device':
        this.availableSegmentValues = ( behavior.topDeviceSegments || [] ).map( ( item ) => item.label );
        break;
      case 'page':
        this.availableSegmentValues = [
          ...new Set( this.engagements.map( e => e['page'] ).filter( Boolean ) )
        ] as string[];
        break;
      default:
        this.availableSegmentValues = [];
        break;
    }
  }

  private buildSegmentComparison (
    segments: BehaviorSegment[] | null | undefined,
    metric: ( segment: BehaviorSegment ) => number,
    strongestLabel: ( segment: BehaviorSegment ) => string,
    weakestLabel: ( segment: BehaviorSegment ) => string
  ): { strongest: string; weakest: string; } | null {
    const rankedSegments = ( segments || [] )
      .filter( segment => Number( segment.totalSessions || 0 ) > 0 )
      .slice()
      .sort( ( left, right ) => metric( right ) - metric( left ) );

    if ( rankedSegments.length === 0 ) {
      return null;
    }

    const strongest = rankedSegments[0];
    const weakest = rankedSegments[rankedSegments.length - 1];

    return {
      strongest: strongestLabel( strongest ),
      weakest: weakestLabel( weakest )
    };
  }

  private getSegmentCtaTraction ( segment: BehaviorSegment ): number {
    const totalSessions = Number( segment.totalSessions || 0 );
    if ( totalSessions <= 0 ) {
      return 0;
    }

    return Number( segment.totalCtaClicks || 0 ) / totalSessions;
  }

  private restoreBehaviorPreferences (): void {
    if ( this.hasRestoredBehaviorPreferences || !this.tenantId ) {
      return;
    }

    this.hasRestoredBehaviorPreferences = true;

    try {
      const raw = localStorage.getItem( this.buildBehaviorStorageKey( String( this.tenantId ) ) );
      if ( !raw ) {
        return;
      }

      const stored = JSON.parse( raw ) as {
        periodDays?: number;
        segmentType?: string;
        segmentValue?: string;
      };

      const storedPeriod = Number( stored?.periodDays || 0 );
      this.selectedBehaviorPeriodDays = this.behaviorPeriodOptions.includes( storedPeriod ) ? storedPeriod : this.selectedBehaviorPeriodDays;
      this.selectedSegmentType = typeof stored?.segmentType === 'string' ? stored.segmentType : '';
      this.selectedSegmentValue = typeof stored?.segmentValue === 'string' ? stored.segmentValue : '';
    } catch {
      // no-op
    }
  }

  private persistBehaviorPreferences (): void {
    if ( !this.tenantId ) {
      return;
    }

    try {
      localStorage.setItem( this.buildBehaviorStorageKey( String( this.tenantId ) ), JSON.stringify( {
        periodDays: this.selectedBehaviorPeriodDays,
        segmentType: this.selectedSegmentType,
        segmentValue: this.selectedSegmentValue
      } ) );
    } catch {
      // no-op
    }
  }

  private buildBehaviorStorageKey ( tenantId: string ): string {
    return `${this.behaviorStoragePrefix}:${tenantId}`;
  }

  get pageStats (): {
    page: string;
    totalRecords: number;
    views: number;
    clicks: number;
    ctr: string;
    avgDwellFormatted: string;
    engaged: number;
    hardBounces: number;
    hardBounceRate: string;
    insightVariants: Array<{ key: number; label: string; count: number; }>;
  } | null {
    if ( this.selectedSegmentType !== 'page' || !this.selectedSegmentValue ) return null;

    const filtered = this.engagements.filter( e => e['page'] === this.selectedSegmentValue );
    if ( filtered.length === 0 ) return null;

    const views = filtered.filter( e => e.eventType === 'view' ).length;
    const clicks = filtered.filter( e => e.eventType === 'click' ).length;
    const ctr = views > 0 ? `${( ( clicks / views ) * 100 ).toFixed( 1 )}%` : 'N/A';

    const viewsWithDuration = filtered.filter( e => e.eventType === 'view' && e.durationMs != null );
    const avgDwellMs = viewsWithDuration.length > 0
      ? viewsWithDuration.reduce( ( sum, e ) => sum + Number( e.durationMs ), 0 ) / viewsWithDuration.length
      : 0;

    const exitEvents = filtered.filter( e => e.eventType === 'insight_experiment_exit' );
    const engaged = exitEvents.filter( e => e['engaged'] === true ).length;
    const hardBounces = exitEvents.filter( e => e['hardBounce'] === true ).length;
    const hardBounceRate = exitEvents.length > 0
      ? `${( ( hardBounces / exitEvents.length ) * 100 ).toFixed( 1 )}%`
      : 'N/A';

    const variantCounts: Record<string, number> = {};
    filtered.forEach( e => {
      const vk = e['insightVariantKey'];
      if ( vk != null ) {
        const k = String( vk );
        variantCounts[k] = ( variantCounts[k] || 0 ) + 1;
      }
    } );
    const insightVariants = Object.entries( variantCounts )
      .map( ( [k, count] ) => ( {
        key: Number( k ),
        label: this.getInsightVariantLabel( Number( k ) ),
        count
      } ) )
      .sort( ( a, b ) => a.key - b.key );

    return {
      page: this.selectedSegmentValue,
      totalRecords: filtered.length,
      views,
      clicks,
      ctr,
      avgDwellFormatted: this.formatDurationFromMs( avgDwellMs ),
      engaged,
      hardBounces,
      hardBounceRate,
      insightVariants
    };
  }

  getInsightVariantLabel ( key: number ): string {
    return AdEngagementResultsComponent.insightVariantLabels[key] ?? `Variant ${key}`;
  }
}
