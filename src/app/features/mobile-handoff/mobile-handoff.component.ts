import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OutreachAuthService } from '../../services/outreach-auth.service';

/**
 * Lands here when a native TODD app (via TODDAuthKit's WebHandoff) hands
 * off to a page on this app, already signed in - the "Real Token Handoff"
 * feature. Unlike AuthCallbackComponent (which completes this app's own
 * hosted-login redirect to todd.taliferro.tech/login and checks a
 * pre-stashed `state` value as a CSRF guard against a forged callback), a
 * native app opens this URL directly with no prior visit to this origin,
 * so there's no pending sessionStorage entry to check the token against -
 * the short-lived, single-exchange custom token itself is the credential,
 * minted server-side (`POST /api/mobile/auth/web-handoff-token`,
 * `mobileAuthRoutes.js` in the main taliferrotech repo) only for an
 * already-authenticated native-app caller. Mirrors
 * taliferrotech/frontend's own `mobile-handoff.component.ts` - same
 * pattern, ported here since this app is deployed and routed separately.
 */
@Component( {
  selector: 'app-mobile-handoff',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mobile-handoff.component.html',
  styleUrl: './mobile-handoff.component.css',
} )
export class MobileHandoffComponent implements OnInit {
  errorMessage = '';

  constructor (
    private route: ActivatedRoute,
    private router: Router,
    private authService: OutreachAuthService,
  ) { }

  async ngOnInit (): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get( 'token' );
    const returnUrl = this.route.snapshot.queryParamMap.get( 'returnUrl' ) || '/app';

    if ( !token ) {
      this.errorMessage = 'This sign-in link is missing a token.';
      return;
    }

    try {
      await this.authService.signInWithCustomToken( token );
      await this.router.navigateByUrl( returnUrl );
    } catch ( error: any ) {
      this.errorMessage = 'This sign-in link has expired. Please open the app again.';
    }
  }
}
