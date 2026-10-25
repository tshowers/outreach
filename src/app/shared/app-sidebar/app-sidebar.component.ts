import { NgFor, NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';


interface SidebarItem {
  label: string;
  link: string;
  queryParams?: Record<string, string>;
  /** The area's tint, for its count badge. */
  tint: 'pink' | 'violet' | 'blue' | 'cyan' | 'yellow' | 'neutral';
  icon: SafeHtml;
}

/**
 * The laptop shell's sidebar (design_handoff_outreach "Laptop shell", regrouped
 * by design_handoff_outreach_mail 1b): the logo and wordmark, New email, then
 * Growth and Needs you, MAIL (Inbox, Drafts, Outbox, Sent) and MAYA
 * (Activity, Drips, Catalyst) - 40px rows, radius 12, the active row raised
 * on --bg - with the account menu at the bottom. Scrolls when the window is
 * short. Hidden below 900px, where the floating Menu takes over.
 */
@Component( {
  selector: 'app-sidebar',
  standalone: true,
  imports: [NgFor, NgIf, RouterLink, RouterLinkActive],
  templateUrl: './app-sidebar.component.html',
  styleUrl: './app-sidebar.component.css'
} )
export class AppSidebarComponent {
  @Input() isAdmin = false;
  @Input() isLoggedIn = false;
  /** Count badges by link, e.g. { '/drafts': 27 }. */
  @Input() counts: Record<string, number> = {};
  /** Opens the universal menu, which lives once in the app shell. */
  @Output() openMenu = new EventEmitter<void>();

  readonly groups: Array<{ label?: string; items: SidebarItem[]; }>;
  readonly plusIcon: SafeHtml;

  constructor ( sanitizer: DomSanitizer ) {
    // Lucide icons (2.5 stroke), inline so the shell needs no icon package.
    const icon = ( paths: string ) => sanitizer.bypassSecurityTrustHtml(
      `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ paths }</svg>`
    );
    const item = ( label: string, link: string, tint: SidebarItem['tint'], paths: string ): SidebarItem => ( { label, link, tint, icon: icon( paths ) } );
    // Mail and Maya grouped (design_handoff_outreach_mail 1b); Signal Engine
    // split into Drafts, Outbox and Sent, and Composer became "New email".
    this.groups = [
      {
        items: [
          item( 'Growth', '/app', 'neutral', '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>' ),
          item( 'Needs you', '/needs-you', 'pink', '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' ),
        ]
      },
      {
        label: 'Mail',
        items: [
          item( 'Inbox', '/inbox', 'blue', '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>' ),
          item( 'Drafts', '/drafts', 'violet', '<path d="M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z"/>' ),
          item( 'Outbox', '/outbox', 'neutral', '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' ),
          item( 'Sent', '/sent', 'neutral', '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>' ),
        ]
      },
      {
        label: 'Maya',
        items: [
          item( 'Activity', '/maya-day', 'yellow', '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>' ),
          item( 'Drips', '/drips', 'violet', '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>' ),
          item( 'Catalyst', '/email-processor', 'cyan', '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>' ),
        ]
      },
    ];
    this.plusIcon = icon( '<path d="M5 12h14"/><path d="M12 5v14"/>' );
  }

  countFor ( item: SidebarItem ): number {
    const key = item.queryParams?.['tab'] ? `${ item.link }?tab=${ item.queryParams['tab'] }` : item.link;
    return Number( this.counts[key] || 0 );
  }
}
