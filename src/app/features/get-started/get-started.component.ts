import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { MailboxProviderId } from '../../services/outreach-api.service';
import {
  MAIL_PROVIDERS, MailProviderOption, OutreachSignupDraft, OutreachSignupDraftService,
} from '../../services/outreach-signup-draft.service';

type StepKey = 'email' | 'provider' | 'preview' | 'firstName' | 'lastName' | 'signUp';

interface Step { key: StepKey; section: number; }

/**
 * Pre-sign-in wizard - the web twin of outreach-ios's OnboardingWizardView
 * (see ONBOARDING-PROFILE-BILLING-PLAYBOOK.md). One thing per screen under
 * a 4-segment progress bar whose first segment ("Start") is already done:
 * which email they send from and who hosts it (detected, one tap to
 * change), what connecting means, then name, then sign in. Only the
 * address is asked - never a password. After sign-in AuthCallbackComponent
 * saves the name and opens /inbox-access pre-filled
 * (OutreachSignupDraftService.submitIfPending). Returning users skip to /login.
 */
@Component( {
  selector: 'app-get-started',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './get-started.component.html',
  styleUrl: './get-started.component.css',
} )
export class GetStartedComponent implements OnInit {
  private readonly route = inject( ActivatedRoute );
  @ViewChild( 'textInput' ) textInput?: ElementRef<HTMLInputElement>;

  readonly sections = ['Start', 'Your inbox', 'About you', 'Sign up'];
  readonly providers = MAIL_PROVIDERS;
  readonly steps: Step[] = [
    { key: 'email', section: 1 },
    { key: 'provider', section: 1 },
    { key: 'preview', section: 1 },
    { key: 'firstName', section: 2 },
    { key: 'lastName', section: 2 },
    { key: 'signUp', section: 3 },
  ];

  draft!: OutreachSignupDraft;
  stepIndex = 0;
  isSigningIn = false;

  constructor (
    private readonly title: Title,
    private readonly authService: OutreachAuthService,
    readonly drafts: OutreachSignupDraftService,
  ) { }

  ngOnInit (): void {
    this.title.setTitle( 'Get started — Outreach | 16Ahead' );
    this.draft = this.drafts.load();
  }

  get step (): Step {
    return this.steps[Math.min( this.stepIndex, this.steps.length - 1 )];
  }

  get provider (): MailProviderOption {
    return this.drafts.providerFor( this.draft.provider );
  }

  sectionFill ( index: number ): number {
    if ( index < this.step.section ) return 1;
    if ( index > this.step.section ) return 0;
    const siblings = this.steps.filter( ( s ) => s.section === index );
    return ( siblings.indexOf( this.step ) + 1 ) / ( siblings.length + 1 );
  }

  get canAdvance (): boolean {
    switch ( this.step.key ) {
      case 'email': return this.drafts.isValidEmail( this.draft.emailAddress );
      case 'firstName': return !!this.draft.firstName.trim();
      case 'lastName': return !!this.draft.lastName.trim();
      default: return true;
    }
  }

  onEmailChange (): void {
    if ( !this.draft.providerChosen ) this.draft.provider = this.drafts.detectProvider( this.draft.emailAddress );
    this.persist();
  }

  chooseProvider ( key: MailboxProviderId ): void {
    this.draft.provider = key;
    this.draft.providerChosen = true;
    this.persist();
  }

  next (): void {
    if ( !this.canAdvance || this.stepIndex >= this.steps.length - 1 ) return;
    this.stepIndex++;
    if ( this.step.key === 'signUp' ) this.draft.readyToSubmit = true;
    this.persist();
    this.focus();
  }

  back (): void {
    if ( this.stepIndex > 0 ) this.stepIndex--;
    this.focus();
  }

  persist (): void {
    this.drafts.save( this.draft );
  }

  signIn (): void {
    this.isSigningIn = true;
    this.persist();
    // Back to the page you were on when you chose Sign in (?returnUrl=), else the app.
    const returnUrl = String( this.route.snapshot.queryParamMap.get( 'returnUrl' ) || '' ).trim();
    this.authService.signIn( returnUrl.startsWith( '/' ) && !returnUrl.startsWith( '//' ) ? returnUrl : '/app' );
  }

  private focus (): void {
    setTimeout( () => this.textInput?.nativeElement.focus(), 0 );
  }
}
