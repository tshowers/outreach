import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { WriteAccessService } from '../../services/write-access.service';

/**
 * "Browse free, create with the app" (Ty, 2026-09-28): shown to signed-in
 * visitors who don't have the Outreach app yet - they can look at
 * everything, and this says why creating and sending are off and where to
 * get the app. Hidden when signed out (the browse-mode banner covers that)
 * and for anyone who can write. Same as Moves' banner.
 */
@Component( {
  selector: 'app-get-the-app-banner',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './get-the-app-banner.component.html',
  styleUrl: './get-the-app-banner.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
} )
export class GetTheAppBannerComponent {
  readonly state$ = inject( WriteAccessService ).state( 'outreach' );
}
