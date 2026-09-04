import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Params, RouterModule } from '@angular/router';

export interface TabBarItem {
  id: string;
  label: string;
  /** Font Awesome icon name, without the `fa-` prefix. Example: "users", "paper-plane". Omit to render a label-only tab. */
  icon?: string;
  dataCy?: string;
  /** Adds the app-wide `btn-glow` pulsing-attention treatment (see styles.css). */
  glow?: boolean;
  /** Hover text (native title attribute). Falls back to `label` when omitted. */
  tooltip?: string;
  /** Optional count badge rendered after the label (and near the icon on mobile). Omit/null to show no badge. */
  count?: number | null;
  /** Optional small status dot before the label (e.g. section-completion state). Omit for no dot. */
  statusDot?: 'complete' | 'incomplete' | null;
  /** When set, the tab navigates instead of emitting `tabChange`; active state is derived from the current route. */
  routerLink?: string | string[];
  queryParams?: Params | null;
  /** When set (and `routerLink` is not), the tab runs this instead of emitting `tabChange`. */
  action?: () => void;
}

@Component( {
  selector: 'app-tab-bar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './tab-bar.component.html',
  styleUrls: ['./tab-bar.component.css']
} )
export class TabBarComponent {
  @Input() tabs: TabBarItem[] = [];
  @Input() activeId: string = '';
  @Input() ariaLabel: string = 'Tabs';
  @Input() dataCy: string = '';

  @Output() tabChange = new EventEmitter<string>();

  select ( id: string ) {
    if ( id !== this.activeId ) {
      this.tabChange.emit( id );
    }
  }

  iconClass ( icon: string ): string {
    return `fa-solid fa-${icon}`;
  }

  trackById ( _index: number, tab: TabBarItem ): string {
    return tab.id;
  }
}
