import { Routes } from '@angular/router';

import { authGuard } from './services/auth.guard';

export const routes: Routes = [
  {
    // No standalone marketing landing was in scope for this extraction
    // (outreach-landing.component.ts in the monorepo is dead code, not
    // reachable from any real route there either) - '/app' is the real
    // signed-in home.
    path: '',
    pathMatch: 'full',
    redirectTo: 'app',
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
    path: 'success',
    loadComponent: () =>
      import( './features/outreach-paid-success/outreach-paid-success.component' ).then( ( m ) => m.OutreachPaidSuccessComponent ),
  },
  {
    path: 'pricing',
    loadComponent: () =>
      import( './features/outreach-pricing/outreach-pricing.component' ).then( ( m ) => m.OutreachPricingComponent ),
  },
  {
    path: 'inbox-access',
    canActivate: [authGuard],
    loadComponent: () =>
      import( './features/inbox-access/inbox-access.component' ).then( ( m ) => m.InboxAccessComponent ),
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
    path: '**',
    redirectTo: 'app',
  },
];
