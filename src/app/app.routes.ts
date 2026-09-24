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
