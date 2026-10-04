import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  COMPANY_DESCRIPTION_CHOICES,
  computeProfileCompletion,
  ProfileCompletion,
  fillProfileChoice,
  MISSION_CHOICES,
  PROFILE_ROLES,
  ProfileChoice,
  ToddProfile,
  VALUE_PROPOSITION_CHOICES,
} from '@taliferro/ui/platform/profile-choices.model';
import { getProfileUrl } from '@taliferro/ui/platform/account-menu.model';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { OutreachSignupDraftService } from '../../services/outreach-signup-draft.service';
import { ProfileApiService } from '../../services/profile-api.service';

interface ChoiceField {
  key: 'companyDescription' | 'valueProp' | 'companyGoal';
  title: string;
  choices: ProfileChoice[];
}

/**
 * In-app profile management - the web twin of the iOS apps'
 * TODDProfileKit ProfileView, replacing the menu's old link out to
 * todd.taliferro.tech/update-profile. Same fields and one-tap choices
 * (@taliferro/ui/platform/profile-choices.model), same API
 * (ProfileApiService). Advanced settings (products, signature, billing)
 * stay on TODD's own profile page, linked at the bottom.
 */
@Component( {
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
} )
export class ProfileComponent implements OnInit, OnDestroy {
  readonly roles = PROFILE_ROLES;
  readonly choiceFields: ChoiceField[] = [
    { key: 'companyDescription', title: 'What does your company do?', choices: COMPANY_DESCRIPTION_CHOICES },
    { key: 'valueProp', title: 'Value proposition', choices: VALUE_PROPOSITION_CHOICES },
    { key: 'companyGoal', title: 'Mission', choices: MISSION_CHOICES },
  ];
  readonly timezones = this.supportedTimezones();
  readonly toddProfileUrl = getProfileUrl();

  profile: ToddProfile | null = null;
  private savedJson = '';
  isCustomRole = false;
  isSaving = false;
  justSaved = false;
  errorMessage = '';
  isEditing = false;
  isConfirmingDelete = false;
  isDeleting = false;

  constructor (
    private readonly api: ProfileApiService,
    private readonly authService: OutreachAuthService,
    private readonly signupDraft: OutreachSignupDraftService,
    private readonly router: Router,
    private readonly title: Title,
  ) { }

  /** null until Firebase reports auth state; false shows the sign-in panel. */
  isSignedIn: boolean | null = null;
  private authSubscription?: Subscription;
  private loadedForUser = false;

  ngOnInit (): void {
    this.title.setTitle( 'Profile — Outreach | Taliferro Tech' );
    // React to auth state rather than checking once: a session that finishes
    // signing in after the page loads should still load the profile.
    this.authSubscription = this.authService.isLoggedIn().subscribe( ( signedIn ) => {
      this.isSignedIn = signedIn;
      if ( signedIn && !this.loadedForUser ) {
        this.loadedForUser = true;
        void this.loadProfile();
      }
    } );
  }

  ngOnDestroy (): void {
    this.authSubscription?.unsubscribe();
  }

  signIn (): void {
    // Sign in goes through the get-started wizard, like every other Sign in.
    void this.router.navigateByUrl( '/get-started' );
  }

  private async loadProfile (): Promise<void> {
    try {
      const loaded = await this.api.load();
      if ( !loaded.timezone ) loaded.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      this.setProfile( loaded );
    } catch ( error: any ) {
      this.errorMessage = error?.error?.message || error?.message || 'We could not load your profile.';
    }
  }

  /** Completion of the saved profile (not unsaved edits), same items as iOS. */
  get completion (): ProfileCompletion | null {
    return this.savedJson ? computeProfileCompletion( JSON.parse( this.savedJson ) ) : null;
  }

  get missingSummary (): string {
    return ( this.completion?.missing || [] ).map( ( item ) => item.label.toLowerCase() ).join( ', ' );
  }

  get isDirty (): boolean {
    return !!this.profile && JSON.stringify( this.profile ) !== this.savedJson;
  }

  selectRole ( role: string ): void {
    if ( !this.profile ) return;
    this.isCustomRole = false;
    this.profile.profession = role;
  }

  selectOtherRole (): void {
    if ( !this.profile ) return;
    if ( !this.isCustomRole ) this.profile.profession = '';
    this.isCustomRole = true;
  }

  isChoiceSelected ( field: ChoiceField, choice: ProfileChoice ): boolean {
    return !!this.profile && this.profile[field.key] === fillProfileChoice( choice, this.profile.companyName );
  }

  selectChoice ( field: ChoiceField, choice: ProfileChoice ): void {
    if ( !this.profile ) return;
    this.profile[field.key] = fillProfileChoice( choice, this.profile.companyName );
  }

  timezoneLabel ( zone: string ): string {
    return zone.replace( /_/g, ' ' );
  }

  startEditing (): void {
    if ( !this.profile ) return;
    this.isCustomRole = !!this.profile.profession && !this.roles.includes( this.profile.profession );
    this.isEditing = true;
  }

  cancelEditing (): void {
    if ( this.savedJson ) this.setProfile( JSON.parse( this.savedJson ) );
    this.isEditing = false;
  }

  /** Read-mode display of the timezone, e.g. "America/Los Angeles". */
  get timezoneDisplay (): string {
    return this.profile?.timezone ? this.timezoneLabel( this.profile.timezone ) : '';
  }

  async save (): Promise<void> {
    if ( !this.profile || this.isSaving ) return;
    this.isSaving = true;
    this.errorMessage = '';
    try {
      this.setProfile( await this.api.save( this.profile ) );
      this.isEditing = false;
      this.justSaved = true;
      setTimeout( () => ( this.justSaved = false ), 2000 );
    } catch ( error: any ) {
      this.errorMessage = error?.error?.message || error?.message || 'We could not save your profile.';
    } finally {
      this.isSaving = false;
    }
  }

  async deleteAccount (): Promise<void> {
    this.isDeleting = true;
    this.errorMessage = '';
    try {
      await this.api.deleteAccount();
      this.signupDraft.clear();
      await this.authService.signOut();
      await this.router.navigateByUrl( '/' );
    } catch ( error: any ) {
      this.errorMessage = error?.error?.message || error?.message || 'We could not delete your account.';
      this.isDeleting = false;
    }
  }

  private setProfile ( profile: ToddProfile ): void {
    this.profile = { ...profile };
    this.savedJson = JSON.stringify( this.profile );
    this.isCustomRole = !!profile.profession && !this.roles.includes( profile.profession );
    if ( profile.timezone && !this.timezones.includes( profile.timezone ) ) {
      this.timezones.unshift( profile.timezone );
    }
  }

  private supportedTimezones (): string[] {
    try {
      const intl = Intl as unknown as { supportedValuesOf?: ( key: string ) => string[] };
      return intl.supportedValuesOf ? [...intl.supportedValuesOf( 'timeZone' )] : [];
    } catch {
      return [];
    }
  }
}
