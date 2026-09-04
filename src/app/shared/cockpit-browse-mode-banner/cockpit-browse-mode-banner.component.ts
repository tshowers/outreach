import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterModule } from '@angular/router';

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
}
