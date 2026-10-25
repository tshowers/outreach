import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { getAuth } from 'firebase/auth';
import {
  PROFILE_AI_QUESTIONS,
  ProfileAiField,
  ProfileChoice,
  ProfileQuestion,
  ToddProfile,
  computeProfileCompletion,
  fillProfileChoice,
} from '@taliferro/ui/platform/profile-choices.model';

import { OutreachNotificationService } from '../../services/outreach-notification.service';
import { OutreachOnboardingService } from '../../services/outreach-onboarding.service';
import { ProfileApiService } from '../../services/profile-api.service';
import { WriteActionDirective } from '../../shared/write-access/write-action.directive';

/** The same labels every TODD app uses for these fields. */
const LABELS: Record<ProfileAiField, string> = {
  companyDescription: 'What your company does',
  valueProp: 'Value proposition',
  jobDescriptionForTODD: 'What TODD should do for you each week',
  companyGoal: 'Mission',
};

/**
 * The profile check in Outreach's first session
 * (design_handoff_outreach_onboarding 3): the four fields Maya writes from,
 * each editable in place. Same shared profile and score as Network and
 * TODD's profile page (`/api/profile`, computeProfileCompletion).
 */
@Component( {
  selector: 'app-setup-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, WriteActionDirective],
  templateUrl: './setup-profile.component.html',
  styleUrl: './setup-profile.component.css',
} )
export class SetupProfileComponent implements OnInit {
  private readonly api = inject( ProfileApiService );
  private readonly notifications = inject( OutreachNotificationService );
  private readonly title = inject( Title );
  readonly setup = inject( OutreachOnboardingService );

  readonly questions = PROFILE_AI_QUESTIONS;
  readonly labels = LABELS;
  profile: ToddProfile | null = null;
  /** Fields that already had an answer when the page opened - "From Network" when Network sent the user. */
  private carried = new Set<ProfileAiField>();
  editing: ProfileAiField | null = null;
  draft = '';
  pickedChoice: string | null = null;
  isSaving = false;
  errorMessage = '';

  async ngOnInit (): Promise<void> {
    this.title.setTitle( 'Your profile — Outreach' );
    void this.setup.refresh();
    try {
      await getAuth().authStateReady();
      this.profile = await this.api.load();
      this.carried = new Set( this.questions.filter( ( q ) => this.answered( q ) ).map( ( q ) => q.field ) );
      this.openNextEmpty();
    } catch ( error: any ) {
      this.errorMessage = error?.error?.message || error?.message || 'We could not load your profile.';
    }
  }

  answered ( question: ProfileQuestion ): boolean {
    return !!( this.profile?.[question.field] || '' ).trim();
  }

  get missing (): number {
    return this.questions.filter( ( q ) => !this.answered( q ) ).length;
  }

  get completion () {
    return computeProfileCompletion( this.profile );
  }

  get heading (): string {
    if ( this.missing ) return 'Finish your profile';
    return this.setup.handoff() && this.carried.size === this.questions.length ? 'Your profile came over from Network' : 'Your profile is ready';
  }

  isCarried ( question: ProfileQuestion ): boolean {
    return !!this.setup.handoff() && this.carried.has( question.field ) && this.editing !== question.field;
  }

  get inboxConnected (): boolean {
    return !!this.setup.onboarding()?.steps.find( ( step ) => step.id === 'connectInbox' )?.done;
  }

  get canContinue (): boolean {
    return this.inboxConnected && !this.missing;
  }

  get footNote (): string {
    if ( !this.inboxConnected ) return 'Connect your inbox first.';
    if ( this.missing ) return `${this.missing} left. About a minute.`;
    return 'Changes save to every TODD app.';
  }

  edit ( question: ProfileQuestion ): void {
    this.editing = question.field;
    this.draft = this.profile?.[question.field] || '';
    this.pickedChoice = null;
  }

  cancel (): void {
    this.editing = null;
    this.openNextEmpty();
  }

  pick ( choice: ProfileChoice ): void {
    this.pickedChoice = choice.label;
    this.draft = fillProfileChoice( choice, this.profile?.companyName || '' );
  }

  onType (): void {
    this.pickedChoice = null;
  }

  async save ( question: ProfileQuestion ): Promise<void> {
    const answer = this.draft.trim();
    if ( !this.profile || !answer || this.isSaving ) return;
    this.isSaving = true;
    this.errorMessage = '';
    try {
      this.profile = await this.api.save( { ...this.profile, [question.field]: answer } );
      this.notifications.show( 'Profile', 'Saved to your TODD profile', 'success' );
      this.editing = null;
      this.openNextEmpty();
      void this.setup.refresh();
    } catch ( error: any ) {
      this.errorMessage = error?.error?.message || error?.message || 'We could not save that answer.';
    } finally {
      this.isSaving = false;
    }
  }

  /** The first unanswered field opens by itself. */
  private openNextEmpty (): void {
    const next = this.questions.find( ( q ) => !this.answered( q ) );
    if ( next && !this.editing ) {
      this.editing = next.field;
      this.draft = '';
      this.pickedChoice = null;
    }
  }
}
