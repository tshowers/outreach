import { Component, inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { BackToTopComponent } from '../../shared/back-to-top/back-to-top.component';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { OutreachApiService } from '../../services/outreach-api.service';
import { OutreachGoalService } from '../../services/outreach-goal.service';
import { OutreachAssistantSignalService } from '../../services/outreach-assistant-signal.service';
import { LoggerService } from '../../services/logger.service';
import { OutreachEntitlementService } from '../../services/outreach-entitlement.service';
import { OutreachPageActionsService } from '../../services/outreach-page-actions.service';
import { getModuleInstallConfig } from '../../shared/utils/module-install-config.util';
import { ArcGaugeComponent, ArcGaugeTone } from '../../shared/arc-gauge/arc-gauge.component';
import { BusinessSymptom, ReliefStatus, SeverityLevel } from '../../models/business-symptom.model';
import { CockpitCommandDeckComponent, CockpitCommandDeckLink } from '../../shared/cockpit-command-deck/cockpit-command-deck.component';
import { CockpitBrowseModeBannerComponent } from '../../shared/cockpit-browse-mode-banner/cockpit-browse-mode-banner.component';
import { PageAction } from '../../models/page-actions.models';
import { StatusLedComponent } from '../../shared/status-led/status-led.component';
import { buildCockpitDiagnosisRows, CockpitDiagnosisRowVm } from '../../shared/utils/cockpit-diagnosis-board.util';
import { MomentumThread } from '../../models/momentum-thread.model';

/**
 * Ported from features/email/pages/outreach-home/. Two real trims beyond
 * a straight port:
 *
 * 1. MomentumThreadService (1,181 lines - a localStorage-backed client
 *    cache of MomentumThread records, populated by upsertThread() calls
 *    scattered across the monorepo's momentum-touching pages) is dropped
 *    entirely. Nothing else in this extraction calls upsertThread, so
 *    that cache would simply stay empty here. This component already
 *    fetches the live thread list via
 *    outreachApi.getSignalEngineBootstrap() (for hotLeads/warmLeads/
 *    queuedActions) in loadGrowthPageExtras() - refreshTemplateState()
 *    now reads from that same response's `threads` array instead of a
 *    separate cache, so every derived stat (momentumNeedsHumanCount,
 *    subjectRewritePressure, engagementRate, etc.) keeps its original
 *    logic unchanged, just fed from one real data source instead of two.
 *
 * 2. entitlements$ - present in the original file (`inject(EntitlementService)
 *    .getEntitlements()`) but never actually read anywhere in its own
 *    template or class body (confirmed by grep - same dead-declaration
 *    pattern found in OutreachPricingComponent). Rather than port that
 *    dead code verbatim, or silently drop the paywall gate this module's
 *    monetization actually depends on, a small real banner was added
 *    (see the template) that shows when the tenant lacks `outreach`/
 *    `suite` access and links to /pricing - the same paywall shape
 *    Network's own entitlement gate uses.
 */
@Component( {
  selector: 'app-outreach-home',
  standalone: true,
  imports: [CommonModule, RouterModule, BackToTopComponent, ArcGaugeComponent, CockpitCommandDeckComponent, CockpitBrowseModeBannerComponent, StatusLedComponent],
  templateUrl: './outreach-home.component.html',
  styleUrl: './outreach-home.component.css'
} )
export class OutreachHomeComponent implements OnInit, OnDestroy {
  readonly installConfig = getModuleInstallConfig( 'outreach' );
  readonly growthCommandDeckLinks: CockpitCommandDeckLink[] = [
    { label: 'Home', icon: 'house', routerLink: '/' },
    { label: 'Catalyst', icon: 'bolt', routerLink: '/email-processor' },
    { label: 'Inbox Access', icon: 'inbox', routerLink: '/inbox-access' },
    { label: 'Compose Email', icon: 'pen-to-square', routerLink: '/compose-email' },
    { label: 'Signal Engine', icon: 'tower-broadcast', routerLink: '/signal-engine' }
  ];
  readonly entitlements$ = inject( OutreachEntitlementService ).getEntitlements();
  private readonly platformId = inject( PLATFORM_ID );
  tenantId: string | null = null;
  userId: string | null = null;
  userEmail: string | null = null;
  hasAuthenticatedOutreachContext = false;
  private readonly subscriptions = new Subscription();
  private readonly isBrowser = isPlatformBrowser( this.platformId );

  private latestThreads: MomentumThread[] = [];

  momentumNeedsHumanCount = 0;
  outboxThreadCount = 0;
  outboxHeroCount = 0;
  outboxHeroLabel = 'ready to start';
  outboxHeroSubtext = 'Send the first email, then let Signal Engine pick the next move from opens, clicks, and silence.';
  subjectRewritePressure = 0;
  bodyRefactorPressure = 0;
  clickedInterestReadiness = 0;
  sentTodayCount = 0;
  engagedTodayCount = 0;
  engagementRate: number | null = null;
  draftedTodayCount = 0;
  selectedTodayCount = 0;
  hotLeadsCount = 0;
  warmLeadsCount = 0;
  queuedActionsCount = 0;
  private mayaBatchTimezone = '';
  growthHealthMeters: Array<{ id: string; label: string; value: number; max?: number; displayValue: string; tone: ArcGaugeTone; detail: string; }> = [];
  growthMomentumScore = 0;
  growthAppStatusVm = 'TODD is standing by. Connect Outreach to light up diagnosis, treatment, relief, and proof.';
  visibleGrowthSymptoms: BusinessSymptom[] = [];
  diagnosisRowsVm: CockpitDiagnosisRowVm[] = [];

  private readonly guestGrowthSymptoms: BusinessSymptom[] = [
    {
      id: 'growth-pipeline-preview',
      title: 'Pipeline is slowing',
      description: 'Growth work loses momentum when there is no signal showing who needs the next message now.',
      severity: 'medium',
      reliefStatus: 'insufficient-information',
      evidence: [
        { label: 'At-risk threads', value: '0', detail: 'Live outreach evidence appears after sign-in.' }
      ],
      toddActions: [
        { label: 'Prioritize follow-ups', detail: 'TODD ranks threads by signal strength and relationship urgency.' }
      ],
      progress: { summary: 'Live progress appears once TODD can monitor real outreach threads.' },
      outcome: {
        label: 'Replies received',
        value: '0',
        detail: 'Business proof only appears when the underlying outreach data supports it.',
        observed: false
      },
      trend: 'unknown',
      module: 'outreach'
    },
    {
      id: 'growth-engagement-preview',
      title: 'Email engagement is weak',
      description: 'Growth stalls when subject lines and message bodies do not earn a response from the right people.',
      severity: 'medium',
      reliefStatus: 'insufficient-information',
      evidence: [
        { label: 'Open pressure', value: '0%', detail: 'Signal quality appears after sign-in.' }
      ],
      toddActions: [
        { label: 'Refactor the message', detail: 'TODD rewrites subject lines and body copy when the signal says the angle missed.' }
      ],
      progress: { summary: 'Live progress appears once TODD can compare opens, clicks, and silence.' },
      outcome: {
        label: 'Response rate',
        value: '0%',
        detail: 'Proof stays dark in preview mode.',
        observed: false
      },
      trend: 'unknown',
      module: 'outreach'
    },
    {
      id: 'growth-high-intent-preview',
      title: 'Interested prospects are not advancing',
      description: 'Growth suffers when high-intent signals appear but no one turns them into the next move quickly.',
      severity: 'medium',
      reliefStatus: 'insufficient-information',
      evidence: [
        { label: 'High-intent contacts', value: '0', detail: 'Engagement intent appears after sign-in.' }
      ],
      toddActions: [
        { label: 'Prepare the next move', detail: 'TODD stages the next follow-up once a thread shows strong interest.' }
      ],
      progress: { summary: 'Live progress appears once TODD is tracking active engagement.' },
      outcome: {
        label: 'Meetings booked',
        value: '0',
        detail: 'Business proof only appears when the underlying data supports it.',
        observed: false
      },
      trend: 'unknown',
      module: 'outreach'
    }
  ];

  constructor (
    private authService: OutreachAuthService,
    private assistantBus: OutreachAssistantSignalService,
    private outreachApi: OutreachApiService,
    private goalService: OutreachGoalService,
    private router: Router,
    private logger: LoggerService,
    private pageActionsService: OutreachPageActionsService
  ) { }

  ngOnInit (): void {
    this.setOutreachPageClass( true );
    this.refreshTemplateState();
    this.subscriptions.add(
      this.authService.getTenantId().subscribe( tenantId => {
        this.tenantId = tenantId;
        this.refreshTemplateState();
        this.publishPageContext();
        void this.loadGrowthPageExtras();
      } )
    );
    this.subscriptions.add(
      this.authService.getUserId().subscribe( userId => {
        this.userId = userId && userId !== 'user not logged in' ? userId : null;
        this.refreshTemplateState();
        this.publishPageContext();
      } )
    );
    this.subscriptions.add(
      this.authService.getUser().subscribe( user => {
        this.userEmail = user?.email || null;
        this.refreshTemplateState();
        this.publishPageContext();
      } )
    );
    this.publishPageContext();
    this.publishPageActions();
    this.bindEngagementActions();
    this.assistantBus.emitAssistantActivity( {
      feature: 'outreach',
      page: 'outreach-home',
      route: '/outreach/app',
      mode: 'dashboard',
      action: 'outreach_home_opened',
      summary: {
        outboxThreadCount: this.outboxThreadCount,
        momentumNeedsHumanCount: this.momentumNeedsHumanCount
      }
    } );
  }

  ngOnDestroy (): void {
    this.setOutreachPageClass( false );

    this.subscriptions.unsubscribe();
    this.pageActionsService.clearPageActions( 'outreach-home-cockpit' );
    this.assistantBus.clearPageContext();
  }

  private publishPageActions (): void {
    this.pageActionsService.setPageActions( {
      pageId: 'outreach-home-cockpit',
      context: {
        pageId: 'outreach-home-cockpit',
        feature: 'outreach',
        entityType: 'outreach',
        mode: 'dashboard'
      },
      actions: this.buildPageActions()
    } );
  }

  private buildPageActions (): PageAction[] {
    return [
      {
        id: 'outreach-cockpit-inbox-access',
        label: 'Inbox Access',
        icon: 'fa-solid fa-inbox',
        kind: 'route',
        route: '/inbox-access',
        order: 10,
        group: 'context'
      },
      {
        id: 'outreach-cockpit-compose',
        label: 'Compose Email',
        icon: 'fa-solid fa-pen-to-square',
        kind: 'route',
        route: '/compose-email',
        order: 30,
        group: 'context'
      },
      {
        id: 'outreach-cockpit-signal-engine',
        label: 'Signal Engine',
        icon: 'fa-solid fa-wave-square',
        kind: 'route',
        route: '/signal-engine',
        order: 50,
        group: 'context'
      }
    ];
  }
  private buildVisibleGrowthSymptoms (
    noOpenCount: number,
    openedNoClickCount: number,
    clickedCount: number
  ): BusinessSymptom[] {
    if ( !this.hasAuthenticatedOutreachContext ) {
      return this.guestGrowthSymptoms;
    }

    const repliesNeedingHuman = this.momentumNeedsHumanCount;
    const activeThreads = this.outboxThreadCount;
    const draftedToday = this.draftedTodayCount;
    const sentToday = this.sentTodayCount;
    const backlogged = draftedToday > 0 && sentToday === 0;

    return [
      {
        id: 'growth-pipeline-slowing',
        title: 'Pipeline is slowing',
        description: 'Threads are active, but too many are not earning the first open quickly enough.',
        severity: this.severityFromPercent( this.subjectRewritePressure ),
        reliefStatus: this.reliefStatusFromCounts( noOpenCount, activeThreads - noOpenCount ),
        evidence: [
          {
            label: 'No-open threads',
            value: String( noOpenCount ),
            detail: `${this.subjectRewritePressure}% of live outreach is still missing the first open.`
          }
        ],
        toddActions: [
          {
            label: 'Rewrite the first touch',
            detail: 'TODD is watching subject misses and preparing stronger subject and hook angles for the next send.'
          }
        ],
        progress: {
          summary: noOpenCount > 0
            ? `${activeThreads - noOpenCount} thread${activeThreads - noOpenCount === 1 ? '' : 's'} are already past the first-open problem.`
            : 'No no-open threads are blocking pipeline motion right now.'
        },
        outcome: {
          label: 'Active outreach threads',
          value: String( activeThreads ),
          detail: activeThreads > 0
            ? 'TODD is using those active threads as the live signal base for growth decisions.'
            : 'Outcome tracking begins after the first outreach thread goes live.',
          observed: activeThreads > 0
        },
        trend: noOpenCount > 0 ? 'declining' : 'stable',
        module: 'outreach'
      },
      {
        id: 'growth-engagement-weak',
        title: 'Email engagement is weak',
        description: 'People are opening, but the message body is not consistently moving them to act.',
        severity: this.engagementRate === null ? 'informational' : this.severityFromPercent( 100 - this.engagementRate ),
        reliefStatus: this.reliefStatusFromCounts( openedNoClickCount, clickedCount ),
        evidence: [
          {
            label: 'Engagement rate today',
            value: this.engagementRate === null ? 'No sends yet' : `${this.engagementRate}%`,
            detail: this.engagementRate === null
              ? 'No emails have been sent yet today - engagement rate appears once sends start generating opens or clicks.'
              : `${this.engagedTodayCount} of ${this.sentTodayCount} email${this.sentTodayCount === 1 ? '' : 's'} sent today earned an open or a click.`
          }
        ],
        toddActions: [
          {
            label: 'Refactor the message body',
            detail: 'TODD is identifying opened-no-click threads so the next version can tighten the offer, proof, or call to action.'
          }
        ],
        progress: {
          summary: clickedCount > 0
            ? `${clickedCount} thread${clickedCount === 1 ? '' : 's'} have already moved past passive opens into stronger interest.`
            : 'TODD is still looking for the first strong click signal to confirm the angle.'
        },
        outcome: {
          label: 'Clicked-interest threads',
          value: String( clickedCount ),
          detail: clickedCount > 0
            ? 'Those clicked threads are the strongest current proof that the growth message is landing.'
            : 'Outcome tracking is in progress while TODD waits for stronger engagement proof.',
          observed: clickedCount > 0
        },
        trend: clickedCount > 0 ? 'improving' : 'stable',
        module: 'outreach'
      },
      {
        id: 'growth-high-intent-needs-action',
        title: 'Interested prospects are not advancing fast enough',
        description: 'Strong engagement matters only if the next move happens while the thread is still warm.',
        severity: this.severityFromCount( repliesNeedingHuman ),
        reliefStatus: this.reliefStatusFromCounts( repliesNeedingHuman, clickedCount ),
        evidence: [
          {
            label: 'Needs your decision',
            value: String( repliesNeedingHuman ),
            detail: `${repliesNeedingHuman} thread${repliesNeedingHuman === 1 ? '' : 's'} have reply or handoff signals waiting for a human decision.`
          }
        ],
        toddActions: [
          {
            label: 'Escalate the warmest threads',
            detail: 'TODD is handing back replied, negative, and decision-needed threads so the next move does not get missed.'
          }
        ],
        progress: {
          summary: clickedCount > 0
            ? `${clickedCount} high-intent thread${clickedCount === 1 ? '' : 's'} are already staged as stronger follow-up opportunities.`
            : 'TODD is watching for clicked-interest and reply signals before it escalates more follow-up work.'
        },
        outcome: {
          label: 'Human-ready threads',
          value: String( repliesNeedingHuman ),
          detail: repliesNeedingHuman > 0
            ? 'Those threads are the current handoff proof that growth requires a human decision right now.'
            : 'No human handoff pressure is active right now.',
          observed: repliesNeedingHuman > 0
        },
        trend: repliesNeedingHuman > 0 ? 'stable' : 'improving',
        module: 'outreach'
      },
      {
        id: 'catalyst-backlog',
        title: backlogged ? 'Drafts are piling up unsent' : 'Catalyst is keeping pace',
        description: 'Maya drafting emails only helps growth once those drafts actually go out.',
        severity: backlogged ? 'high' : draftedToday > 0 ? this.severityFromPercent( 100 - Math.round( ( sentToday / draftedToday ) * 100 ) ) : 'informational',
        reliefStatus: backlogged ? 'needs-user-decision' : this.reliefStatusFromCounts( draftedToday - sentToday, sentToday ),
        evidence: [
          {
            label: 'Drafted vs sent today',
            value: String( draftedToday ),
            detail: draftedToday > 0
              ? `${sentToday} of ${draftedToday} drafted email${draftedToday === 1 ? '' : 's'} have been sent today.`
              : 'Maya has not drafted anything yet today.'
          }
        ],
        toddActions: [
          {
            label: backlogged ? 'Waiting on approval' : 'Keep drafting and sending',
            detail: backlogged
              ? 'TODD has drafts ready and is waiting for approval before sending - check Catalyst to review and release them.'
              : 'TODD is drafting and releasing outreach as fast as the approval queue allows.'
          }
        ],
        progress: {
          summary: sentToday > 0
            ? `${sentToday} draft${sentToday === 1 ? '' : 's'} already went out today.`
            : 'No drafts have gone out yet today.'
        },
        outcome: {
          label: 'Drafted vs sent',
          value: String( sentToday ),
          maxValue: draftedToday || 1,
          detail: draftedToday > 0
            ? `${sentToday} of ${draftedToday} drafted email${draftedToday === 1 ? '' : 's'} sent today.`
            : 'Outcome tracking begins once Maya drafts the first email today.',
          observed: sentToday > 0
        },
        trend: backlogged ? 'declining' : sentToday > 0 ? 'improving' : 'unknown',
        module: 'outreach'
      }
    ];
  }

  trackByGrowthMeter ( _index: number, meter: { id: string; } ): string {
    return meter.id;
  }

  trackBySymptomId ( _index: number, symptom: BusinessSymptom ): string {
    return symptom.id;
  }

  trackByDiagnosisRowId ( _index: number, row: CockpitDiagnosisRowVm ): string {
    return row.id;
  }

  private publishPageContext (): void {
    this.assistantBus.setPageContext( {
      feature: 'outreach',
      page: 'outreach-home',
      route: '/outreach/app',
      mode: 'dashboard',
      title: 'Outreach Home',
      description: 'Draft email, open the outbox, review engagement, and decide where TODD should push next.',
      allowedActions: [
        'compose_email',
        'open_outbox',
        'open_catalyst',
        'review_engagement'
      ],
      summary: {
        isAuthenticated: !!this.userId && this.userId !== 'user not logged in',
        interactionMode: !!this.userId && this.userId !== 'user not logged in' ? 'member' : 'guest',
        outboxThreadCount: this.outboxThreadCount,
        momentumNeedsHumanCount: this.momentumNeedsHumanCount,
        subjectRewritePressure: this.subjectRewritePressure,
        engagementRate: this.engagementRate,
        draftedTodayCount: this.draftedTodayCount,
        selectedTodayCount: this.selectedTodayCount,
        hotLeadsCount: this.hotLeadsCount,
        warmLeadsCount: this.warmLeadsCount,
        queuedActionsCount: this.queuedActionsCount,
        growthMomentumScore: this.growthMomentumScore,
        senderEmail: this.userEmail || ''
      },
      dataPreview: {
        outboxRoute: '/signal-engine',
        composeRoute: '/compose-email',
        catalystRoute: '/email-processor',
        engagementRoute: '/engagement',
        importRoute: '/contact-import',
        senderEmail: this.userEmail || ''
      }
    } );
  }

  private bindEngagementActions (): void {
    this.subscriptions.add(
      this.assistantBus.engagementActionRequest$.subscribe( request => {
        if ( !request || this.router.url.split( '?' )[0] !== '/outreach/app' ) {
          return;
        }

        switch ( request.action ) {
          case 'compose_email':
            void this.router.navigate( ['/compose-email'] );
            break;
          case 'open_outbox':
            void this.router.navigate( ['/signal-engine'] );
            break;
          case 'open_catalyst':
            void this.router.navigate( ['/email-processor'] );
            break;
          case 'review_engagement':
            void this.router.navigate( ['/engagement'] );
            break;
          default:
            break;
        }
      } )
    );
  }

  private setOutreachPageClass ( isActive: boolean ): void {
    if ( !this.isBrowser || typeof document === 'undefined' ) {
      return;
    }

    document.body.classList.toggle( 'outreach-page-active', isActive );
  }

  // Fetches data that can't come from the already-loaded client-side thread
  // store: Maya's daily batch progress (selected vs. drafted) and hot/warm
  // lead counts (hotLeadStatus isn't present on the client MomentumThread
  // model). Runs once when tenantId resolves, not on every reactive
  // refreshTemplateState() call. Also captures the bootstrap response's
  // own `threads` array as this component's one source of live thread
  // data (see the class-level comment on why MomentumThreadService's
  // separate cache was dropped).
  private async loadGrowthPageExtras (): Promise<void> {
    const tenantId = this.tenantId;
    if ( !tenantId ) {
      return;
    }

    try {
      const [batchResponse, bootstrapResponse] = await Promise.all( [
        firstValueFrom( this.goalService.getLatestMayaOutreachBatch( tenantId ) ),
        firstValueFrom( this.outreachApi.getSignalEngineBootstrap( {
          tenantId,
          userId: this.userId || undefined,
          userEmail: this.userEmail || undefined
        } ) )
      ] );

      const batch = batchResponse?.data?.batch || null;
      this.selectedTodayCount = batch?.counts?.selectedCount || 0;
      this.draftedTodayCount = batch?.draftingDuty?.draftedCount || 0;
      this.mayaBatchTimezone = batch?.timezone || batch?.mayaConfig?.timezone || this.mayaBatchTimezone;

      this.latestThreads = Array.isArray( bootstrapResponse?.data?.threads ) ? bootstrapResponse.data.threads : [];
      const summary = bootstrapResponse?.data?.summary;
      this.hotLeadsCount = summary?.hotLeads || 0;
      this.warmLeadsCount = summary?.warmLeads || 0;
      this.queuedActionsCount = summary?.queuedActions || 0;
    } catch ( error ) {
      this.logger.warn( '[OutreachHome] loadGrowthPageExtras:failed', error );
    } finally {
      this.refreshTemplateState();
    }
  }

  private isSameLocalDay ( iso: string | undefined, timezone: string ): boolean {
    if ( !iso ) {
      return false;
    }

    const target = new Date( iso );
    if ( Number.isNaN( target.getTime() ) ) {
      return false;
    }

    const now = new Date();
    try {
      const formatter = new Intl.DateTimeFormat( 'en-CA', {
        timeZone: timezone || undefined,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      } );
      return formatter.format( target ) === formatter.format( now );
    } catch {
      return target.toDateString() === now.toDateString();
    }
  }

  private refreshTemplateState (): void {
    const threads = this.latestThreads;
    const signalThreads = threads.filter( thread => thread.mode !== 'completed' && thread.mode !== 'unsubscribed' );
    const signalThreadBaseCount = signalThreads.length || 1;
    const noOpenCount = signalThreads.filter( thread => thread.signalState === 'no_open' ).length;
    const openedNoClickCount = signalThreads.filter(
      thread => thread.signalState === 'opened' || thread.signalState === 'multi_open'
    ).length;
    const clickedCount = signalThreads.filter( thread => thread.signalState === 'clicked' ).length;

    this.hasAuthenticatedOutreachContext = !!( this.tenantId && ( this.userId || this.userEmail ) );
    this.momentumNeedsHumanCount = threads.filter( thread =>
      thread.mode === 'handoff'
      || thread.queueState === 'handoff'
      || thread.signalState === 'replied'
      || thread.signalState === 'negative'
    ).length;
    this.outboxThreadCount = threads.length;
    this.outboxHeroCount = this.momentumNeedsHumanCount > 0 ? this.momentumNeedsHumanCount : this.outboxThreadCount;
    this.outboxHeroLabel = this.momentumNeedsHumanCount > 0
      ? 'needs human'
      : this.outboxThreadCount > 0
        ? 'threads in motion'
        : 'ready to start';
    this.outboxHeroSubtext = this.momentumNeedsHumanCount > 0
      ? 'TODD has seen a reply signal and handed the conversation back to you.'
      : this.outboxThreadCount > 0
        ? 'Top focus: subject misses, opened-no-click refactors, and clicked-interest follow-ups.'
        : 'Send the first email, then let Signal Engine pick the next move from opens, clicks, and silence.';
    this.subjectRewritePressure = Math.round( ( noOpenCount / signalThreadBaseCount ) * 100 );
    this.bodyRefactorPressure = Math.round( ( openedNoClickCount / signalThreadBaseCount ) * 100 );
    this.clickedInterestReadiness = Math.round( ( clickedCount / signalThreadBaseCount ) * 100 );

    const sentTodayThreads = threads.filter( thread => this.isSameLocalDay( thread.lastSentAt, this.mayaBatchTimezone ) );
    this.sentTodayCount = sentTodayThreads.length;
    this.engagedTodayCount = sentTodayThreads.filter( thread =>
      thread.signalState === 'opened' || thread.signalState === 'multi_open' || thread.signalState === 'clicked'
    ).length;
    this.engagementRate = this.sentTodayCount > 0
      ? Math.round( ( this.engagedTodayCount / this.sentTodayCount ) * 100 )
      : null;

    const draftedToday = this.draftedTodayCount;
    const selectedToday = this.selectedTodayCount;

    this.growthHealthMeters = [
      {
        id: 'pipeline-health',
        label: 'Pipeline health',
        value: this.hasAuthenticatedOutreachContext ? Math.max( 0, 100 - this.subjectRewritePressure ) : 0,
        max: 100,
        displayValue: this.hasAuthenticatedOutreachContext ? `${Math.max( 0, 100 - this.subjectRewritePressure )}%` : '0%',
        tone: this.hasAuthenticatedOutreachContext ? this.toneFromPercent( this.subjectRewritePressure, true ) : 'info',
        detail: this.hasAuthenticatedOutreachContext
          ? `${this.outboxThreadCount} outreach thread${this.outboxThreadCount === 1 ? '' : 's'} are in motion right now.`
          : 'Pipeline pressure appears after sign-in.'
      },
      {
        id: 'engagement-health',
        label: 'Engagement health',
        value: this.hasAuthenticatedOutreachContext && this.engagementRate !== null ? this.engagementRate : 0,
        max: 100,
        displayValue: !this.hasAuthenticatedOutreachContext
          ? '0%'
          : this.engagementRate === null ? 'No sends yet' : `${this.engagementRate}%`,
        tone: this.hasAuthenticatedOutreachContext && this.engagementRate !== null
          ? this.toneFromPercent( this.engagementRate, false )
          : 'info',
        detail: !this.hasAuthenticatedOutreachContext
          ? 'Engagement quality appears after sign-in.'
          : this.engagementRate === null
            ? 'No emails sent yet today - engagement rate appears once today\'s sends start generating opens or clicks.'
            : `${this.engagedTodayCount} of ${this.sentTodayCount} email${this.sentTodayCount === 1 ? '' : 's'} sent today earned an open or a click.`
      },
      {
        id: 'maya-drafting-progress',
        label: 'Maya drafting progress',
        value: this.hasAuthenticatedOutreachContext ? draftedToday : 0,
        max: this.hasAuthenticatedOutreachContext ? Math.max( selectedToday, 1 ) : 100,
        displayValue: this.hasAuthenticatedOutreachContext ? `${draftedToday}` : '0',
        tone: this.hasAuthenticatedOutreachContext
          ? ( selectedToday > 0 && draftedToday >= selectedToday ? 'positive' : selectedToday > 0 ? 'attention' : 'info' )
          : 'info',
        detail: this.hasAuthenticatedOutreachContext
          ? ( selectedToday > 0
            ? `${draftedToday} of ${selectedToday} drafted today.`
            : 'No contacts selected for drafting yet today.' )
          : 'Maya\'s drafting progress appears after sign-in.'
      },
      {
        id: 'outbox',
        label: 'Outbox',
        value: this.hasAuthenticatedOutreachContext ? this.queuedActionsCount : 0,
        max: this.hasAuthenticatedOutreachContext ? Math.max( this.queuedActionsCount, 5 ) : 100,
        displayValue: this.hasAuthenticatedOutreachContext ? `${this.queuedActionsCount}` : '0',
        tone: 'info',
        detail: this.hasAuthenticatedOutreachContext
          ? `${this.queuedActionsCount} approved draft${this.queuedActionsCount === 1 ? '' : 's'} queued to send. Sending runs weekdays only, 7am–11pm Pacific.`
          : 'Outbox count appears after sign-in.'
      },
      {
        id: 'hot-leads',
        label: 'Hot leads',
        value: this.hasAuthenticatedOutreachContext ? this.hotLeadsCount : 0,
        max: this.hasAuthenticatedOutreachContext ? Math.max( this.hotLeadsCount, 5 ) : 100,
        displayValue: this.hasAuthenticatedOutreachContext ? `${this.hotLeadsCount}` : '0',
        tone: 'positive',
        detail: this.hasAuthenticatedOutreachContext
          ? `${this.hotLeadsCount} thread${this.hotLeadsCount === 1 ? '' : 's'} showing hot-lead signals right now.`
          : 'Hot-lead signals appear after sign-in.'
      },
      {
        id: 'warm-leads',
        label: 'Warm leads',
        value: this.hasAuthenticatedOutreachContext ? this.warmLeadsCount : 0,
        max: this.hasAuthenticatedOutreachContext ? Math.max( this.warmLeadsCount, 5 ) : 100,
        displayValue: this.hasAuthenticatedOutreachContext ? `${this.warmLeadsCount}` : '0',
        tone: 'positive',
        detail: this.hasAuthenticatedOutreachContext
          ? `${this.warmLeadsCount} thread${this.warmLeadsCount === 1 ? '' : 's'} showing warm-lead signals right now.`
          : 'Warm-lead signals appear after sign-in.'
      }
    ];
    this.growthMomentumScore = this.growthHealthMeters.length
      ? Math.round(
        this.growthHealthMeters.reduce( ( sum, meter ) => sum + ( meter.value / ( meter.max || 100 ) ) * 100, 0 )
        / this.growthHealthMeters.length
      )
      : 0;
    this.visibleGrowthSymptoms = this.buildVisibleGrowthSymptoms( noOpenCount, openedNoClickCount, clickedCount );
    this.growthAppStatusVm = this.buildGrowthAppStatus();
    this.diagnosisRowsVm = buildCockpitDiagnosisRows( this.visibleGrowthSymptoms );
  }

  private buildGrowthAppStatus (): string {
    if ( !this.hasAuthenticatedOutreachContext ) {
      return 'TODD is standing by. Connect Outreach to light up diagnosis, treatment, relief, and proof.';
    }

    if ( this.momentumNeedsHumanCount > 0 ) {
      return `TODD is watching ${this.momentumNeedsHumanCount} thread${this.momentumNeedsHumanCount === 1 ? '' : 's'} that need a human decision right now.`;
    }

    if ( this.outboxThreadCount > 0 ) {
      return `TODD is monitoring ${this.outboxThreadCount} live outreach thread${this.outboxThreadCount === 1 ? '' : 's'} and has drafted ${this.draftedTodayCount} of ${this.selectedTodayCount} planned email${this.selectedTodayCount === 1 ? '' : 's'} today.`;
    }

    return 'TODD is ready to draft the next outreach email and start reading signal as soon as the first thread is active.';
  }

  private toneFromPercent ( percent: number, inverse = false ): ArcGaugeTone {
    const normalized = Math.max( 0, Math.min( 100, Math.round( percent || 0 ) ) );
    const score = inverse ? 100 - normalized : normalized;

    if ( score >= 70 ) return 'positive';
    if ( score >= 40 ) return 'attention';
    return 'warn';
  }

  private severityFromPercent ( percent: number ): SeverityLevel {
    const normalized = Math.max( 0, Math.min( 100, Math.round( percent || 0 ) ) );
    if ( normalized >= 75 ) return 'critical';
    if ( normalized >= 45 ) return 'high';
    if ( normalized >= 20 ) return 'medium';
    if ( normalized > 0 ) return 'low';
    return 'informational';
  }

  private severityFromCount ( count: number ): SeverityLevel {
    const normalized = Math.max( 0, Math.round( count || 0 ) );
    if ( normalized >= 8 ) return 'critical';
    if ( normalized >= 4 ) return 'high';
    if ( normalized >= 2 ) return 'medium';
    if ( normalized >= 1 ) return 'low';
    return 'informational';
  }

  private reliefStatusFromCounts ( activeProblemCount: number, treatedCount: number ): ReliefStatus {
    const problemCount = Math.max( 0, Math.round( activeProblemCount || 0 ) );
    const treated = Math.max( 0, Math.round( treatedCount || 0 ) );

    if ( problemCount <= 0 && treated <= 0 ) return 'watching';
    if ( problemCount <= 0 ) return 'relief-delivered';
    if ( treated <= 0 ) return 'needs-relief';
    if ( treated >= problemCount ) return 'improving';
    return 'todd-working';
  }
}
