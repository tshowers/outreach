import { NgFor, NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { PlatformMenuComponent } from '../platform-menu/platform-menu.component';

interface SidebarItem {
  label: string;
  link: string;
  queryParams?: Record<string, string>;
  /** The area's tint, for its count badge. */
  tint: 'pink' | 'violet' | 'blue' | 'cyan' | 'yellow' | 'neutral';
  icon: SafeHtml;
  /** Highlights only on an exact URL match (two items share /signal-engine). */
  exact?: boolean;
}

/**
 * The laptop shell's sidebar (design_handoff_outreach "Laptop shell"): the
 * logo and wordmark, then Growth, Needs you, Signal Engine, Inbox, Composer,
 * Catalyst and Activity - 40px rows, radius 12, the active row raised on
 * --bg - with the account menu at the bottom. Hidden below 900px, where the
 * floating Menu takes over.
 */
@Component( {
  selector: 'app-sidebar',
  standalone: true,
  imports: [NgFor, NgIf, RouterLink, RouterLinkActive, PlatformMenuComponent],
  templateUrl: './app-sidebar.component.html',
  styleUrl: './app-sidebar.component.css'
} )
export class AppSidebarComponent {
  @Input() isAdmin = false;
  @Input() isLoggedIn = false;
  /** Count badges by link, e.g. { '/signal-engine': 191 }. */
  @Input() counts: Record<string, number> = {};
  @Output() signOut = new EventEmitter<void>();

  readonly items: SidebarItem[];

  constructor ( sanitizer: DomSanitizer ) {
    // Lucide icons (2.5 stroke), inline so the shell needs no icon package.
    const icon = ( paths: string ) => sanitizer.bypassSecurityTrustHtml(
      `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ paths }</svg>`
    );
    this.items = [
      { label: 'Growth', link: '/app', tint: 'neutral', icon: icon( '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>' ) },
      { label: 'Needs you', link: '/needs-you', tint: 'pink', icon: icon( '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' ) },
      { label: 'Signal Engine', link: '/signal-engine', tint: 'violet', icon: icon( '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>' ) },
      { label: 'Inbox', link: '/inbox-access', tint: 'blue', icon: icon( '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>' ) },
      { label: 'Composer', link: '/compose-email', tint: 'neutral', icon: icon( '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>' ) },
      { label: 'Catalyst', link: '/email-processor', tint: 'cyan', icon: icon( '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>' ) },
      { label: 'Activity', link: '/maya-day', tint: 'yellow', icon: icon( '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>' ) }
    ];
  }

  countFor ( item: SidebarItem ): number {
    const key = item.queryParams?.['tab'] ? `${ item.link }?tab=${ item.queryParams['tab'] }` : item.link;
    return Number( this.counts[key] || 0 );
  }
}
