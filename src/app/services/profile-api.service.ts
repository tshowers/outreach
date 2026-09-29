import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { getAuth } from 'firebase/auth';
import { firstValueFrom } from 'rxjs';
import { ToddProfile } from '@taliferro/ui/platform/profile-choices.model';
import { environment } from '../../environments/environment';

/**
 * The shared in-app profile API (todd-backend/functions/profileRoutes.js):
 * the same `GET/PATCH /api/profile` and `DELETE /api/account` network-ios's
 * TODDProfileKit uses, authenticated with the signed-in user's Firebase ID
 * token rather than any client-side Firestore write.
 */
@Injectable( { providedIn: 'root' } )
export class ProfileApiService {
  constructor ( private readonly http: HttpClient ) { }

  async load (): Promise<ToddProfile> {
    const response = await firstValueFrom( this.http.get<{ profile: ToddProfile }>(
      `${environment.backendURL}/profile`, { headers: await this.headers() } ) );
    return response.profile;
  }

  async save ( profile: ToddProfile ): Promise<ToddProfile> {
    const { email: _email, ...editable } = profile;
    const response = await firstValueFrom( this.http.patch<{ profile: ToddProfile }>(
      `${environment.backendURL}/profile`, { profile: editable }, { headers: await this.headers() } ) );
    return response.profile;
  }

  /** Permanently deletes the account server-side; the caller then signs out. */
  async deleteAccount (): Promise<void> {
    await firstValueFrom( this.http.delete( `${environment.backendURL}/account`, { headers: await this.headers() } ) );
  }

  private async headers (): Promise<Record<string, string>> {
    const user = getAuth().currentUser;
    if ( !user ) throw new Error( 'Please sign in again.' );
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  }
}
