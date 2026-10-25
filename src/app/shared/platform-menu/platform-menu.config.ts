import { MenuAppConfig } from '@taliferro/ui/platform/universal-menu.model';

/** Outreach's part of the universal menu: what you can do in Outreach. */
export const PLATFORM_MENU_CONFIG: MenuAppConfig = {
  app: 'outreach',
  name: 'Outreach',
  items: [
    { label: 'Home', icon: 'home', route: '/' },
    { label: 'Growth', icon: 'growth', route: '/app' },
    { label: 'Needs you', icon: 'users', route: '/needs-you', keywords: 'replies waiting' },
    { label: 'Inbox', icon: 'inbox', route: '/inbox', keywords: 'mail replies' },
    { label: 'Drafts', icon: 'file', route: '/drafts', keywords: 'drafts approve signal engine' },
    { label: 'Outbox', icon: 'calendar', route: '/outbox', keywords: 'outbox queued scheduled' },
    { label: 'Sent', icon: 'send', route: '/sent', keywords: 'sent opens clicks' },
    { label: 'Catalyst', icon: 'bolt', route: '/email-processor', keywords: 'stale contacts batch' },
    { label: 'Drips', icon: 'mail', route: '/drips', keywords: 'newsletter blog announcement drip campaign schedule' },
    { label: 'Email Composer', icon: 'pen', route: '/compose-email', keywords: 'write new email' },
    { label: 'Activity', icon: 'activity', route: '/maya-day', keywords: 'maya day' },
  ],
  secondaryItems: [
    { label: 'Profile', icon: 'user', route: '/profile' },
    { label: 'Help', icon: 'help', route: '/help' },
    { label: 'About', icon: 'info', route: '/about' },
    { label: 'iOS App', icon: 'phone', route: '/ios', keywords: 'iphone ipad app store' },
  ],
  signInRoute: '/get-started',
  profileRoute: '/profile',
};
