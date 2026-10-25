import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';

// Browse free, create with the app: no route needs sign-in. Writes are
// gated per action (WriteActionDirective) and enforced by the server.
import { landingRedirectGuard } from './services/landing-redirect.guard';
import { networkArrivalGuard } from './services/network-arrival.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [landingRedirectGuard],
    loadComponent: () =>
      import( './features/landing/landing.component' ).then( ( m ) => m.LandingComponent ),
  },
  {
    path: 'ios',
    loadComponent: () =>
      import( './features/app-showcase/app-showcase.component' ).then( ( m ) => m.AppShowcaseComponent ),
  },
  {
    path: 'help',
    loadComponent: () =>
      import( './features/help/help.component' ).then( ( m ) => m.HelpComponent ),
  },
  {
    path: 'about',
    loadComponent: () =>
      import( './features/about/about.component' ).then( ( m ) => m.AboutComponent ),
  },
  {
    // Pre-sign-in wizard: which email they send from, then name, then sign
    // in (ONBOARDING-PROFILE-BILLING-PLAYBOOK.md). /login stays the direct
    // handoff for returning users and deep links.
    path: 'get-started',
    loadComponent: () =>
      import( './features/get-started/get-started.component' ).then( ( m ) => m.GetStartedComponent ),
  },
  {
    // In-app profile (shared fields/API with the iOS apps' TODDProfileKit),
    // replacing the menu's link out to TODD's /update-profile.
    path: 'profile',
    loadComponent: () =>
      import( './features/profile/profile.component' ).then( ( m ) => m.ProfileComponent ),
  },
  {
    path: 'login',
    loadComponent: () =>
      import( './features/sign-in/sign-in.component' ).then( ( m ) => m.SignInComponent ),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import( './features/auth-callback/auth-callback.component' ).then( ( m ) => m.AuthCallbackComponent ),
  },
  {
    path: 'mobile-handoff',
    loadComponent: () =>
      import( './features/mobile-handoff/mobile-handoff.component' ).then( ( m ) => m.MobileHandoffComponent ),
  },
  {
    path: 'unsubscribe-success',
    loadComponent: () =>
      import( './features/unsubscribe-success/unsubscribe-success.component' ).then( ( m ) => m.UnsubscribeSuccessComponent ),
  },
  {
    path: 'unsubscribe-failure',
    loadComponent: () =>
      import( './features/unsubscribe-failure/unsubscribe-failure.component' ).then( ( m ) => m.UnsubscribeFailureComponent ),
  },
  {
    // The old Stripe checkout return page - Outreach is sold through the
    // App Store now (Ty, 2026-09-28), so old links land on the app.
    path: 'success',
    redirectTo: 'app',
  },
  {
    // "Browse free, create with the app" (Ty, 2026-09-28) - shared wording
    // in @taliferro/ui/platform/get-the-app.model.ts; replaces the old
    // Stripe plan page.
    path: 'pricing',
    data: { product: 'outreach' },
    loadComponent: () =>
      import( './features/get-the-app/get-the-app.component' ).then( ( m ) => m.GetTheAppComponent ),
  },
  {
    // Outreach Inbox 2026: the day-by-day inbox. /inbox/:id is the letter,
    // full screen; the list stays mounted under it so Back keeps the day
    // and scroll position. Mailbox settings stay at /inbox-access.
    path: 'inbox',
    loadComponent: () =>
      import( './features/inbox/inbox.component' ).then( ( m ) => m.InboxComponent ),
    children: [
      { path: '', children: [] },
      { path: ':id', children: [] },
    ],
  },
  {
    path: 'inbox-access',
    loadComponent: () =>
      import( './features/inbox-access/inbox-access.component' ).then( ( m ) => m.InboxAccessComponent ),
  },
  {
    path: 'drips',
    loadComponent: () =>
      import( './features/drips/drips.component' ).then( ( m ) => m.DripsComponent ),
  },
  {
    path: 'drips/:id',
    loadComponent: () =>
      import( './features/drips/drip-detail.component' ).then( ( m ) => m.DripDetailComponent ),
  },
  {
    path: 'maya-day',
    loadComponent: () =>
      import( './features/maya-day/maya-day.component' ).then( ( m ) => m.MayaDayComponent ),
  },
  {
    path: 'needs-you',
    loadComponent: () =>
      import( './features/needs-you/needs-you.component' ).then( ( m ) => m.NeedsYouComponent ),
  },
  {
    // Signal Engine split into Drafts, Outbox, Sent and Activity's Maya's
    // plan (design_handoff_outreach_mail); old links land on the new pages.
    path: 'signal-engine',
    pathMatch: 'full',
    redirectTo: ( { queryParams } ) => {
      const router = inject( Router );
      switch ( queryParams['tab'] ) {
        case 'outbox': return router.createUrlTree( ['/outbox'] );
        case 'sent': return router.createUrlTree( ['/sent'] );
        case 'plan': return router.createUrlTree( ['/maya-day'], { queryParams: { tab: 'plan', ...( queryParams['filter'] ? { filter: queryParams['filter'] } : {} ) } } );
        default: return router.createUrlTree( ['/drafts'] );
      }
    },
  },
  {
    path: 'drafts',
    loadComponent: () =>
      import( './features/drafts/drafts.component' ).then( ( m ) => m.DraftsComponent ),
  },
  {
    path: 'outbox',
    loadComponent: () =>
      import( './features/outbox/outbox.component' ).then( ( m ) => m.OutboxComponent ),
  },
  {
    path: 'sent',
    loadComponent: () =>
      import( './features/sent/sent.component' ).then( ( m ) => m.SentComponent ),
  },
  {
    path: 'engagement',
    loadComponent: () =>
      import( './features/ad-engagement/ad-engagement.component' ).then( ( m ) => m.AdEngagementComponent ),
  },
  {
    path: 'app',
    loadComponent: () =>
      import( './features/outreach-home/outreach-home.component' ).then( ( m ) => m.OutreachHomeComponent ),
  },
  {
    path: 'email-processor',
    loadComponent: () =>
      import( './features/email-processor/email-processor.component' ).then( ( m ) => m.EmailProcessorComponent ),
  },
  {
    // First email: a draft per contact, then sent spaced out (design_handoff_outreach_onboarding 4).
    path: 'setup/first-email',
    loadComponent: () =>
      import( './features/first-email/first-email.component' ).then( ( m ) => m.FirstEmailComponent ),
  },
  {
    // First-session profile check (design_handoff_outreach_onboarding 3).
    path: 'setup/profile',
    loadComponent: () =>
      import( './features/setup-profile/setup-profile.component' ).then( ( m ) => m.SetupProfileComponent ),
  },
  {
    path: 'compose-email',
    canActivate: [networkArrivalGuard],
    loadComponent: () =>
      import( './features/email-composer-parent/email-composer-parent.component' ).then( ( m ) => m.EmailComposerParentComponent ),
  },
  {
    path: '**',
    loadComponent: () =>
      import( './features/not-found/not-found.component' ).then( ( m ) => m.NotFoundComponent ),
  },
];
