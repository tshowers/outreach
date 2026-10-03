import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

@Component( {
  selector: 'app-cockpit-browse-mode-banner',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './cockpit-browse-mode-banner.component.html',
  styleUrl: './cockpit-browse-mode-banner.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
} )
export class CockpitBrowseModeBannerComponent {
  @Input() surfaceLabel = 'this cockpit';
  @Input() statusLabel = 'Browse Mode';
  @Input() signInLabel = 'Sign in';
  @Input() customTitle: string | null = null;
  @Input() customCopy: string | null = null;

  private readonly router = inject( Router );

  /** The same way in as the Menu's Sign In: the Get Started wizard, which
   * sends people with an account on to the TODD login. */
  signIn (): void {
    void this.router.navigate( ['/get-started'] );
  }
}
