import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { MayaDaySummary, OutreachApiService } from '../../services/outreach-api.service';
import { PreloaderComponent } from '../../shared/preloader/preloader.component';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { BrowseNoticeComponent } from '../../shared/write-access/browse-notice.component';
import { ActivityAction, MOVES_TASKS_URL, activityAction, isMovesLimitReason } from '../../shared/utils/activity-action.util';
import { MayaPlanComponent, PlanFilter } from './maya-plan.component';

/** ?filter= values, including the old Signal Engine Plan ones (active, warm - now All). */
const PLAN_FILTERS: Record<string, PlanFilter> = { all: 'all', 'needs-you': 'needs-you', hot: 'hot', stalled: 'stalled', active: 'all', warm: 'all', plan: 'all' };

/**
 * Maya's day: what she planned at 6am, what she did, and what's waiting on
 * you. The "Maya's done for today" push opens this page (Outreach 1.1);
 * Maya's own app gets a native version later.
 */
@Component( {
  selector: 'app-maya-day',
  standalone: true,
  imports: [BrowseNoticeComponent, CommonModule, RouterModule, PreloaderComponent, RelativeTimePipe, MayaPlanComponent],
  templateUrl: './maya-day.component.html',
  styleUrls: ['./maya-day.component.css'],
} )
export class MayaDayComponent implements OnInit, OnDestroy {
  private readonly authService = inject( OutreachAuthService );
  private readonly outreachApi = inject( OutreachApiService );
  private tenantSubscription?: Subscription;

  tenantId: string | null = null;
  summary: MayaDaySummary | null = null;
  loading = false;
  errorMessage = '';

  private readonly route = inject( ActivatedRoute );
  private readonly router = inject( Router );

  /** What Maya did (the day's feed) or Maya's plan (design_handoff_outreach_mail 1k). */
  tab: 'did' | 'plan' = 'did';
  planFilter: PlanFilter = 'all';

  setTab ( tab: 'did' | 'plan' ): void {
    this.tab = tab;
    this.syncUrl();
  }

  setPlanFilter ( filter: PlanFilter ): void {
    this.planFilter = filter;
    this.syncUrl();
  }

  /** Keeps the tab and filter in the URL, so Back and shared links land on them. */
  private syncUrl (): void {
    const queryParams = this.tab === 'plan' ? { tab: 'plan', filter: this.planFilter === 'all' ? null : this.planFilter } : { tab: null, filter: null };
    void this.router.navigate( [], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true } );
  }

  ngOnInit (): void {
    const params = this.route.snapshot.queryParamMap;
    const filter = PLAN_FILTERS[String( params.get( 'filter' ) || '' )];
    if ( params.get( 'tab' ) === 'plan' || filter ) this.tab = 'plan';
    if ( filter ) this.planFilter = filter;
    this.tenantSubscription = this.authService.getTenantId().subscribe( ( tenantId ) => {
      if ( !tenantId || tenantId === this.tenantId ) return;
      this.tenantId = tenantId;
      void this.load();
    } );
  }

  ngOnDestroy (): void {
    this.tenantSubscription?.unsubscribe();
  }

  async load (): Promise<void> {
    if ( !this.tenantId ) return;
    this.loading = true;
    this.errorMessage = '';
    try {
      const response = await firstValueFrom( this.outreachApi.getMayaDay( { tenantId: this.tenantId } ) );
      this.summary = response.data;
    } catch ( error: any ) {
      this.errorMessage = String( error?.error?.message || error?.message || "Unable to load Maya's day." );
    } finally {
      this.loading = false;
    }
  }

  get headline (): string {
    const s = this.summary;
    if ( !s ) return '';
    if ( s.startStatus === 'failed' ) return "Maya couldn't start today";
    if ( s.finishedAt ) return "Maya's done for today";
    return s.startStatus === 'started' ? 'Maya is working' : "Maya's day";
  }

  readonly movesUrl = MOVES_TASKS_URL;

  /** Her start failed on the open-task limit: closing Moves is the fix. */
  get blockedByMoves (): boolean {
    return isMovesLimitReason( this.summary?.startReason );
  }

  actionFor ( item: { category: string; title: string; body: string; } ): ActivityAction | null {
    return activityAction( item );
  }

  get dateLabel (): string {
    if ( !this.summary?.dateKey ) return '';
    const [year, month, day] = this.summary.dateKey.split( '-' ).map( Number );
    return new Date( year, month - 1, day ).toLocaleDateString( undefined, { weekday: 'long', month: 'long', day: 'numeric' } );
  }

  categoryIcon ( category: string ): string {
    switch ( category ) {
      case 'replies': return '↩';
      case 'mailbox': return '!';
      case 'catalyst': return '➤';
      case 'sending_approved': return '✓';
      case 'maya': return '✦';
      default: return '•';
    }
  }
}
