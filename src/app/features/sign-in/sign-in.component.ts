import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { firstValueFrom } from 'rxjs';

/**
 * Sign-in for Network no longer happens natively in this app - it
 * redirects to TODD's hosted login (todd.taliferro.tech/login, the same
 * page network-ios/pulse-ios open via TODDAuthKit's HostedLogin) instead
 * of rendering its own Google/Apple/email-link buttons. See
 * OutreachAuthService.signIn() for the handoff.
 */
@Component( {
  selector: 'app-sign-in',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.css',
} )
export class SignInComponent implements OnInit {
  isSigningIn = false;

  private returnUrl = '/app';

  constructor (
    private route: ActivatedRoute,
    private router: Router,
    private authService: OutreachAuthService,
  ) { }

  async ngOnInit (): Promise<void> {
    this.returnUrl = this.route.snapshot.queryParamMap.get( 'returnUrl' ) || '/app';
    const user = await firstValueFrom( this.authService.getUser() );
    if ( user ) {
      await this.router.navigateByUrl( this.returnUrl );
      return;
    }
    this.signIn();
  }

  signIn (): void {
    this.isSigningIn = true;
    this.authService.signIn( this.returnUrl );
  }
}
