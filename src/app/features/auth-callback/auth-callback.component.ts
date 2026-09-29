import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { GettingStartedService } from '../../services/getting-started.service';
import { OutreachSignupDraftService } from '../../services/outreach-signup-draft.service';
import { WriteAccessService } from '../../services/write-access.service';

/**
 * Lands here after TODD's hosted login (todd.taliferro.tech/login) hands
 * a signed-in session back to this app: ?token=<custom token>&state=<...>.
 * Verifies `state` against what signIn() stashed before leaving (a forged
 * or replayed callback won't have a matching sessionStorage entry),
 * redeems the token, then continues to wherever the user was headed.
 */
@Component( {
  selector: 'app-auth-callback',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './auth-callback.component.html',
  styleUrl: './auth-callback.component.css',
} )
export class AuthCallbackComponent implements OnInit {
  errorMessage = '';

  constructor (
    private route: ActivatedRoute,
    private router: Router,
    private authService: OutreachAuthService,
    private signupDraft: OutreachSignupDraftService,
    private gettingStarted: GettingStartedService,
    private writeAccess: WriteAccessService,
  ) { }

  async ngOnInit (): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get( 'token' );
    const state = this.route.snapshot.queryParamMap.get( 'state' );
    const pending = this.authService.consumePendingLogin( state );

    if ( !token || !pending ) {
      this.errorMessage = 'This sign-in link is invalid or expired. Please try signing in again.';
      return;
    }

    try {
      await this.authService.signInWithCustomToken( token );
      this.writeAccess.refresh();

      // Came through /get-started: save the name, then open Inbox Access
      // pre-filled with the address they gave - connecting is the next step.
      const inboxUrl = await this.signupDraft.submitIfPending();
      if ( inboxUrl ) {
        await this.router.navigateByUrl( inboxUrl );
        return;
      }

      const returnUrl = pending.returnUrl || '/app';
      // Heading to the default landing (not a deep link) and steps remain:
      // show the Getting Started checklist first, once per session.
      if ( ( returnUrl === '/app' || returnUrl === '/' ) && await this.gettingStarted.shouldShowAfterSignIn() ) {
        await this.router.navigate( ['/help'], { fragment: 'your-progress' } );
        return;
      }
      await this.router.navigateByUrl( returnUrl );
    } catch ( error: any ) {
      this.errorMessage = error?.message || 'Sign-in failed. Please try again.';
    }
  }
}
