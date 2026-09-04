import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdEngagementResultsComponent } from './ad-engagement-results/ad-engagement-results.component';

import { ClickStreamComponent } from './click-stream/click-stream.component';

import { OutreachAuthService } from '../../services/outreach-auth.service';
import { LoggerService } from '../../services/logger.service';
import { OutreachNomenclatureService } from '../../services/outreach-nomenclature.service';

import { TopDogComponent } from '../../shared/top-dog/top-dog.component';
import { AlertService } from '../../services/alert.service';
import { SoundService } from '../../services/sound.service';

import { PreloaderComponent } from '../../shared/preloader/preloader.component';
import { BackToTopComponent } from '../../shared/back-to-top/back-to-top.component';
import { OutreachPageActionsService } from '../../services/outreach-page-actions.service';
import { buildOutreachPageActions } from '../../shared/utils/page-action-presets';

/**
 * Ported from features/email/pages/ad-engagement/. The original's
 * contacts/communication/suggestedContact/healthScore/suggestions/
 * userQuery/dashboardCounts fields (and the ContactService dependency
 * that fed them via the commented-out updateContactsWithCampaigns() call)
 * are dropped - none of them are read anywhere in the template, they were
 * dead state even in the original file.
 */
@Component( {
  selector: 'app-ad-engagement',
  imports: [CommonModule, FormsModule,
    AdEngagementResultsComponent,
    ClickStreamComponent,
    BackToTopComponent,
    PreloaderComponent,
  ],
  templateUrl: './ad-engagement.component.html',
  styleUrl: './ad-engagement.component.css'
} )
export class AdEngagementComponent extends TopDogComponent implements OnInit, OnDestroy {
  private readonly pageActionsService = inject( OutreachPageActionsService );

  activeTab: string = 'clicks';

  constructor ( protected override authService: OutreachAuthService,
    protected override soundService: SoundService,
    protected override logger: LoggerService,
    protected override router: Router,
    protected override nomenclatureService: OutreachNomenclatureService,
    private alertService: AlertService ) {
    super( authService, soundService, logger, router, nomenclatureService );
  }

  override ngOnInit (): void {
    super.ngOnInit();

    this.readySubscription = this.ready$.subscribe( ( isReady ) => {
      this.logger.info( "AD ENGAGEMENT COMPONENT READY?", isReady );
      if ( isReady ) this.setupPage();
    } );
  }

  override ngOnDestroy () {
    super.ngOnDestroy();
    this.pageActionsService.clearPageActions( 'ad-engagement' );
  }

  setupPage () {
    this.alertService.closeAlertAfterTimeout( 'autoCloseAlert', 10000 );
    this.publishPageActions();
  }

  private publishPageActions (): void {
    this.pageActionsService.setPageActions( {
      pageId: 'ad-engagement',
      context: {
        pageId: 'ad-engagement',
        feature: 'outreach'
      },
      actions: buildOutreachPageActions()
    } );
  }
}
