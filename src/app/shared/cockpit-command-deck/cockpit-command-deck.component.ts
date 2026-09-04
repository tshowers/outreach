import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Params, RouterModule } from '@angular/router';
import { TabBarComponent, TabBarItem } from '../tab-bar/tab-bar.component';

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
  imports: [CommonModule, RouterModule, TabBarComponent],
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

  private _links: CockpitCommandDeckLink[] = [];
  linkTabs: TabBarItem[] = [];

  @Input()
  set links ( value: CockpitCommandDeckLink[] ) {
    this._links = value || [];
    this.linkTabs = this._links.map( ( link, index ) => ( {
      id: `${index}-${link.label}`,
      label: link.label,
      icon: link.icon,
      glow: link.label === 'Home',
      routerLink: link.routerLink,
      queryParams: link.queryParams,
      action: link.action
    } ) );
  }

  get links (): CockpitCommandDeckLink[] {
    return this._links;
  }
}
