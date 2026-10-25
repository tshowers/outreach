import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { getAuth } from 'firebase/auth';
import { firstValueFrom } from 'rxjs';
import { ProfileCompletion } from '@taliferro/ui/platform/profile-choices.model';
import { environment } from '../../environments/environment';

export type OutreachStepId = 'connectInbox' | 'profile' | 'firstSend' | 'bulkSending';

export interface OutreachStep {
  id: OutreachStepId;
  title: string;
  detail: string;
  done: boolean;
  required: boolean;
  /** False until it can be started (the first email waits for the inbox). */
  available: boolean;
}

export interface OutreachOnboarding {
  steps: OutreachStep[];
  completedSteps: number;
  totalSteps: number;
  requiredDone: boolean;
  allDone: boolean;
  /** False once the required steps are done and bulk sending is on or set aside. */
  showChecklist: boolean;
  firstName: string;
  mailboxAddress: string;
  profileCompletion: ProfileCompletion;
  aiProfile: { missing: number; total: number };
  bulkStatus: 'off' | 'pending' | 'on';
  counts: { mailboxes: number; sent: number };
  state: { bulkDismissedAt: string | null };
}

/** Contacts Network sent over (design_handoff_outreach_onboarding 1). */
export interface NetworkHandoff {
  contactIds: string[];
  at: string;
}

const HANDOFF_KEY = 'outreach_network_handoff';
const HANDOFF_DAYS = 30;

/**
 * Outreach's setup checklist (`GET/PATCH /api/outreach/onboarding`,
 * todd-backend gettingStarted.service.js computeOutreachOnboarding;
 * design_handoff_outreach_onboarding): connect the inbox, check the
 * profile, send a first email (required), bulk sending (optional). One copy
 * for the Setup pill, the Arrive screen on Home and Help.
 *
 * The contacts Network handed over are kept in this browser
 * (rememberHandoff), so Arrive and the first email can use them.
 */
@Injectable( { providedIn: 'root' } )
export class OutreachOnboardingService {
  private readonly http = inject( HttpClient );
  private readonly isBrowser = isPlatformBrowser( inject( PLATFORM_ID ) );
  private inFlight: Promise<OutreachOnboarding | null> | null = null;

  /** null until loaded, or when signed out. */
  readonly onboarding = signal<OutreachOnboarding | null>( null );
  readonly handoff = signal<NetworkHandoff | null>( this.readHandoff() );

  /** The first required step not done yet - never an optional one. */
  readonly currentStepId = computed<OutreachStepId | null>( () =>
    this.onboarding()?.steps.find( ( step ) => step.required && !step.done )?.id ?? null );

  /** Reloads from the server. Never throws - a failed load keeps the last state. */
  refresh (): Promise<OutreachOnboarding | null> {
    if ( !this.isBrowser ) return Promise.resolve( null );
    if ( this.inFlight ) return this.inFlight;
    this.inFlight = ( async () => {
      try {
        // A fresh page load (a link from Network, back from Google) runs
        // before Firebase restores the signed-in user.
        await getAuth().authStateReady();
        const user = getAuth().currentUser;
        if ( !user ) {
          this.onboarding.set( null );
          return null;
        }
        const response = await firstValueFrom( this.http.get<{ data: OutreachOnboarding }>(
          `${environment.backendURL}/outreach/onboarding`, { headers: await this.headers() } ) );
        this.onboarding.set( response.data );
        return response.data;
      } catch {
        return this.onboarding();
      } finally {
        this.inFlight = null;
      }
    } )();
    return this.inFlight;
  }

  /** "Not now" to bulk sending. Needs Outreach (the server checks). */
  async dismissBulk (): Promise<void> {
    try {
      const response = await firstValueFrom( this.http.patch<{ data: OutreachOnboarding }>(
        `${environment.backendURL}/outreach/onboarding`, { dismissBulk: true }, { headers: await this.headers() } ) );
      this.onboarding.set( response.data );
    } catch ( error ) {
      console.warn( '[OutreachOnboardingService] dismiss failed', error );
    }
  }

  clear (): void {
    this.onboarding.set( null );
  }

  rememberHandoff ( contactIds: string[] ): void {
    const ids = contactIds.map( ( id ) => id.trim() ).filter( Boolean ).slice( 0, 50 );
    if ( !ids.length ) return;
    const handoff: NetworkHandoff = { contactIds: ids, at: new Date().toISOString() };
    this.handoff.set( handoff );
    try { localStorage.setItem( HANDOFF_KEY, JSON.stringify( handoff ) ); } catch { }
  }

  routeFor ( step: OutreachStep ): string {
    switch ( step.id ) {
      case 'connectInbox': return '/inbox-access';
      case 'profile': return '/setup/profile';
      case 'firstSend': return '/compose-email';
      default: return '/app';
    }
  }

  /** The first email opens the composer with Network's contacts selected and a draft from the profile. */
  queryParamsFor ( step: OutreachStep ): Record<string, string> | null {
    if ( step.id !== 'firstSend' ) return null;
    const ids = this.handoff()?.contactIds || [];
    return ids.length ? { contactIds: ids.join( ',' ), source: 'network', draft: 'profile' } : { draft: 'profile' };
  }

  actionFor ( step: OutreachStep ): string {
    switch ( step.id ) {
      case 'connectInbox': return 'Connect';
      case 'profile': return step.done ? 'Review' : 'Finish';
      case 'firstSend': return 'Review';
      default: return 'Not now';
    }
  }

  private readHandoff (): NetworkHandoff | null {
    if ( !this.isBrowser ) return null;
    try {
      const handoff = JSON.parse( localStorage.getItem( HANDOFF_KEY ) || 'null' ) as NetworkHandoff | null;
      if ( !handoff?.contactIds?.length ) return null;
      if ( Date.now() - Date.parse( handoff.at ) > HANDOFF_DAYS * 24 * 60 * 60 * 1000 ) return null;
      return handoff;
    } catch {
      return null;
    }
  }

  private async headers (): Promise<Record<string, string>> {
    const user = getAuth().currentUser;
    if ( !user ) throw new Error( 'Please sign in again.' );
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  }
}
