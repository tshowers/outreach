import { AsyncPipe, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';

import { WriteAccessService } from '../../services/write-access.service';
import { CockpitBrowseModeBannerComponent } from '../cockpit-browse-mode-banner/cockpit-browse-mode-banner.component';
import { GetTheAppBannerComponent } from '../get-the-app-banner/get-the-app-banner.component';

/**
 * The top-of-page note for anyone who can only browse: signed out, the
 * browse-mode banner (sign in); signed in without the app, "get the app".
 * Nothing for someone who can create and send.
 */
@Component( {
  selector: 'app-browse-notice',
  standalone: true,
  imports: [AsyncPipe, NgIf, CockpitBrowseModeBannerComponent, GetTheAppBannerComponent],
  template: `
    <ng-container>
      <app-cockpit-browse-mode-banner *ngIf="(state$ | async) === 'signedOut'" [surfaceLabel]="surfaceLabel"></app-cockpit-browse-mode-banner>
      <app-get-the-app-banner *ngIf="(state$ | async) === 'browsing'"></app-get-the-app-banner>
    </ng-container>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
} )
export class BrowseNoticeComponent {
  @Input() surfaceLabel = 'Outreach';
  readonly state$ = inject( WriteAccessService ).state( 'outreach' );
}
