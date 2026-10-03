import { Routes } from '@angular/router';

import { authGuard } from './services/auth.guard';
import { landingRedirectGuard } from './services/landing-redirect.guard';

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
    path: 'inbox-access',
    canActivate: [authGuard],
    loadComponent: () =>
      import( './features/inbox-access/inbox-access.component' ).then( ( m ) => m.InboxAccessComponent ),
  },
  {
    path: 'maya-day',
    canActivate: [authGuard],
    loadComponent: () =>
      import( './features/maya-day/maya-day.component' ).then( ( m ) => m.MayaDayComponent ),
  },
  {
    path: 'needs-you',
    canActivate: [authGuard],
    loadComponent: () =>
      import( './features/needs-you/needs-you.component' ).then( ( m ) => m.NeedsYouComponent ),
  },
  {
    path: 'signal-engine',
    canActivate: [authGuard],
    loadComponent: () =>
      import( './features/signal-engine/signal-engine.component' ).then( ( m ) => m.SignalEngineComponent ),
  },
  {
    path: 'engagement',
    canActivate: [authGuard],
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
    canActivate: [authGuard],
    loadComponent: () =>
      import( './features/email-processor/email-processor.component' ).then( ( m ) => m.EmailProcessorComponent ),
  },
  {
    path: 'compose-email',
    canActivate: [authGuard],
    loadComponent: () =>
      import( './features/email-composer-parent/email-composer-parent.component' ).then( ( m ) => m.EmailComposerParentComponent ),
  },
  {
    path: '**',
    redirectTo: 'app',
  },
];
