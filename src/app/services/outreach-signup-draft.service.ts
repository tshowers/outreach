import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { getAuth } from 'firebase/auth';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { MailboxProviderId } from './outreach-api.service';

export interface MailProviderOption {
  key: MailboxProviderId;
  label: string;
  /** What connecting will ask for - shown before sign-in so nothing is a surprise. */
  howItConnects: string;
}

/** Same providers and wording as outreach-ios's MailProvider (mirrors the
 * backend's MAILBOX_PROVIDER_PRESETS). */
export const MAIL_PROVIDERS: MailProviderOption[] = [
  { key: 'gmail', label: 'Gmail / Google Workspace', howItConnects: 'Google will ask you once to let Outreach read replies and send from this inbox - that\'s separate from signing in. TODD never sees your password.' },
  { key: 'outlook', label: 'Outlook / Microsoft 365', howItConnects: 'You\'ll create an app password with Outlook / Microsoft 365 and paste it in once. It\'s not your regular password, and you can revoke it any time.' },
  { key: 'icloud', label: 'iCloud', howItConnects: 'You\'ll create an app password with iCloud and paste it in once. It\'s not your regular password, and you can revoke it any time.' },
  { key: 'yahoo', label: 'Yahoo', howItConnects: 'You\'ll create an app password with Yahoo and paste it in once. It\'s not your regular password, and you can revoke it any time.' },
  { key: 'other_imap', label: 'Other', howItConnects: 'You\'ll enter your mail server settings and an app password once, on a secure signed-in page.' },
];

export interface OutreachSignupDraft {
  emailAddress: string;
  provider: MailboxProviderId;
  /** The visitor picked the provider themselves - retyping the address won't change it. */
  providerChosen: boolean;
  firstName: string;
  lastName: string;
  /** Set once the visitor reached the sign-in step; an abandoned draft is never submitted. */
  readyToSubmit: boolean;
}

/**
 * The pre-sign-in /get-started wizard's draft - the web twin of
 * outreach-ios's InboxDraft: which email they send from and its provider,
 * then name. Security (ONBOARDING-PROFILE-BILLING-PLAYBOOK.md): only the
 * address is kept here - never a password. Kept in localStorage because
 * sign-in leaves the site for todd.taliferro.tech and comes back to
 * /auth/callback, which calls submitIfPending(): the name goes to the TODD
 * profile (POST /api/onboarding/profile, blank fields only) and the visitor
 * lands on /inbox-access pre-filled with the address, where Gmail connects
 * with Google and others enter an app password, signed in.
 */
@Injectable( { providedIn: 'root' } )
export class OutreachSignupDraftService {
  private readonly storageKey = 'outreach_signup_draft';

  constructor ( private readonly http: HttpClient ) { }

  fresh (): OutreachSignupDraft {
    return { emailAddress: '', provider: 'gmail', providerChosen: false, firstName: '', lastName: '', readyToSubmit: false };
  }

  load (): OutreachSignupDraft {
    const fresh = this.fresh();
    try {
      const raw = localStorage.getItem( this.storageKey );
      return raw ? { ...fresh, ...JSON.parse( raw ) } : fresh;
    } catch {
      return fresh;
    }
  }

  save ( draft: OutreachSignupDraft ): void {
    try { localStorage.setItem( this.storageKey, JSON.stringify( draft ) ); } catch { }
  }

  clear (): void {
    try { localStorage.removeItem( this.storageKey ); } catch { }
  }

  isValidEmail ( email: string ): boolean {
    const parts = email.trim().split( '@' );
    return parts.length === 2 && !!parts[0] && parts[1].includes( '.' );
  }

  /** A work domain is most often Google Workspace; the chips let them change it. */
  detectProvider ( email: string ): MailboxProviderId {
    const domain = email.trim().toLowerCase().split( '@' )[1] || '';
    if ( ['outlook.com', 'hotmail.com', 'live.com', 'office365.com', 'msn.com'].includes( domain ) ) return 'outlook';
    if ( ['icloud.com', 'me.com', 'mac.com'].includes( domain ) ) return 'icloud';
    if ( ['yahoo.com', 'ymail.com', 'rocketmail.com'].includes( domain ) ) return 'yahoo';
    return 'gmail';
  }

  providerFor ( key: MailboxProviderId ): MailProviderOption {
    return MAIL_PROVIDERS.find( ( option ) => option.key === key ) || MAIL_PROVIDERS[MAIL_PROVIDERS.length - 1];
  }

  inboxAccessUrl ( draft: OutreachSignupDraft ): string {
    const params = new URLSearchParams( { email: draft.emailAddress.trim().toLowerCase(), provider: draft.provider } );
    return `/inbox-access?${params.toString()}`;
  }

  /** Never throws. Returns where to send the visitor (their pre-filled
   * inbox page) when they came through the wizard, else null. */
  async submitIfPending (): Promise<string | null> {
    const draft = this.load();
    const user = getAuth().currentUser;
    if ( !draft.readyToSubmit || !user || !this.isValidEmail( draft.emailAddress ) ) return null;

    try {
      const headers = { Authorization: `Bearer ${await user.getIdToken()}` };
      await firstValueFrom( this.http.post( `${environment.backendURL}/onboarding/profile`, {
        source: 'outreach-web',
        profile: {
          firstName: draft.firstName,
          lastName: draft.lastName,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        },
      }, { headers } ) );
    } catch ( error ) {
      console.warn( '[OutreachSignupDraftService] saving the sign-up name failed', error );
    }
    const url = this.inboxAccessUrl( draft );
    this.clear();
    return url;
  }
}
