import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Params } from '@angular/router';

export interface CockpitCommandDeckLink {
  label: string;
  /** Font Awesome icon name, without the `fa-` prefix. Optional — omit for a label-only tab. */
  icon?: string;
  routerLink?: string | string[];
  queryParams?: Params;
  action?: () => void;
}

@Component( {
  selector: 'app-cockpit-command-deck',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cockpit-command-deck.component.html',
  styleUrl: './cockpit-command-deck.component.css'
} )
export class CockpitCommandDeckComponent {
  @Input() demoId = '';
  @Input() eyebrow = 'TODD Command Deck';
  @Input() context = '';
  @Input() title = '';
  @Input() subtitle = '';
  @Input() iconSrc = '';
  @Input() iconAlt = '';
  @Input() scoreLabel = '';
  @Input() scoreValue = '';

  /** Retained for callers while route navigation lives in the shared menu. */
  @Input() links: CockpitCommandDeckLink[] = [];
}
