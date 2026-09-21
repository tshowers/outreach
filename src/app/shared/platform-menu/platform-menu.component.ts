import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import packageJson from '../../../../package.json';
import { RouterModule } from '@angular/router';

import { getPlatformMenuItems, PlatformMenuItem } from '@taliferro/ui/platform/account-menu.model';

interface ProductLink {
  label: string;
  url: string;
  icon: string;
  description: string;
}

interface OutreachLink {
  label: string;
  route: string;
  signOut?: boolean;
}

/**
 * Top-right hamburger that slides a panel down over the page. Products on
 * the left (the other standalone apps), Account on the right (the TODD
 * routes that never got ported per-app - profile, billing, admin, etc.) -
 * see taliferrotech's TODD-routes-migration doc and the Maya app's version,
 * which this mirrors.
 */
@Component( {
  selector: 'app-platform-menu',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './platform-menu.component.html',
  styleUrl: './platform-menu.component.css',
} )
export class PlatformMenuComponent implements OnChanges {
  @Input() isAdmin = false;
  @Input() isLoggedIn = false;
  @Output() readonly signOut = new EventEmitter<void>();

  isOpen = false;
  readonly appVersion = String(packageJson.version || '').trim();

  private readonly baseOutreachLinks: OutreachLink[] = [
    { label: 'Home', route: '/' },
    { label: 'Growth', route: '/app' },
    { label: 'Inbox', route: '/inbox-access' },
    { label: 'Outbox', route: '/signal-engine' },
    { label: 'Catalyst', route: '/email-processor' },
    { label: 'Email Composer', route: '/compose-email' },
  ];

  outreachLinks: OutreachLink[] = [];
  accountItems: PlatformMenuItem[] = [];

  constructor () {
    this.recompute();
  }

  ngOnChanges (): void {
    this.recompute();
  }

  private recompute (): void {
    this.outreachLinks = [
      ...this.baseOutreachLinks,
      this.isLoggedIn
        ? { label: 'Sign Out', route: '/', signOut: true }
        : { label: 'Sign In', route: '/login' },
      { label: 'iOS App', route: '/ios' },
      ...( this.isLoggedIn ? [] : [{ label: 'Pricing', route: '/pricing' }] ),
    ];

    this.accountItems = getPlatformMenuItems().filter( ( item ) => item.label !== 'Document' && ( !item.adminOnly || this.isAdmin ) );
  }

  trackByLabel ( _index: number, item: { label: string } ): string {
    return item.label;
  }

  readonly productLinks: ProductLink[] = [
    { label: 'Ask TODD', url: 'https://ask.taliferro.tech', icon: 'assets/find/entities/todd/logo-bw-icon.png', description: 'Turn uncertainty into the next move.' },
    { label: 'Network', url: 'https://network.taliferro.tech', icon: 'assets/find/entities/network/logo-bw-icon.png', description: 'Know who matters before the moment passes.' },
    { label: 'Docs', url: 'https://docs.taliferro.tech', icon: 'assets/find/entities/docs/logo-bw-icon.png', description: 'Give your best thinking somewhere to live.' },
    { label: 'Moves', url: 'https://moves.taliferro.tech', icon: 'assets/find/entities/moves/logo-bw-icon.png', description: 'Make progress visible and actionable.' },
    { label: 'Pulse', url: 'https://pulse.taliferro.tech', icon: 'assets/find/entities/pulse/logo-bw-icon.png', description: 'Hear what people are really saying.' },
    { label: 'Social', url: 'https://social.taliferro.tech', icon: 'assets/find/entities/social/logo-bw-icon.png', description: 'Stay visible without living online.' },
    { label: 'Lead Vault', url: 'https://lead-vault.taliferro.tech', icon: 'assets/find/entities/lead-vault/logo-bw-icon.png', description: 'Find the people behind the opportunity.' },
    { label: 'Maya', url: 'https://maya.taliferro.tech', icon: 'assets/find/entities/maya/logo-bw.png', description: 'Think like your marketing director.' },
    { label: 'SayIt', url: 'https://sayit.taliferro.tech', icon: 'assets/find/entities/sayit/logo-bw-icon.png', description: 'Make your message worth sharing.' },
    { label: 'Find', url: 'https://find.taliferro.tech', icon: 'assets/find/entities/find/logo-bw-icon.png', description: 'Get to the answer faster.' },
    { label: 'Email Signature', url: 'https://signature.taliferro.tech', icon: 'assets/find/entities/email-signature-builder/logo-bw-icon.png', description: 'Make every email carry your brand.' },
    { label: 'Music', url: 'https://music.taliferro.com', icon: 'assets/find/entities/music/logo-bw-icon.png', description: 'Let the soundtrack keep moving.' },
  ];

  toggle (): void {
    this.isOpen = !this.isOpen;
  }

  close (): void {
    this.isOpen = false;
  }

  handleOutreachLink ( link: OutreachLink ): void {
    this.close();
    if ( link.signOut ) this.signOut.emit();
  }
}
