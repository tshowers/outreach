import { MenuAppConfig } from '@taliferro/ui/platform/universal-menu.model';

/** Outreach's part of the universal menu: what you can do in Outreach. */
export const PLATFORM_MENU_CONFIG: MenuAppConfig = {
  app: 'outreach',
  name: 'Outreach',
  logo: 'assets/outreach/logo.png',
  items: [
    { label: 'Home', icon: 'home', route: '/' },
    { label: 'Growth', icon: 'growth', route: '/app' },
    { label: 'Needs you', icon: 'users', route: '/needs-you', keywords: 'replies waiting' },
    { label: 'Inbox', icon: 'inbox', route: '/inbox-access', keywords: 'mail replies' },
    { label: 'Signal Engine', icon: 'send', route: '/signal-engine', keywords: 'outbox sent plan' },
    { label: 'Catalyst', icon: 'bolt', route: '/email-processor', keywords: 'stale contacts batch' },
    { label: 'Email Composer', icon: 'pen', route: '/compose-email', keywords: 'write new email' },
    { label: 'Activity', icon: 'activity', route: '/maya-day', keywords: 'maya day' },
  ],
  secondaryItems: [
    { label: 'Profile', icon: 'user', route: '/profile' },
    { label: 'Help', icon: 'help', route: '/help' },
    { label: 'iOS App', icon: 'phone', route: '/ios', keywords: 'iphone ipad app store' },
  ],
  signInRoute: '/get-started',
  profileRoute: '/profile',
};
