import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, combineLatest, filter, firstValueFrom, take } from 'rxjs';

import { MomentumThread } from '../models/momentum-thread.model';
import { isDraftToApprove, isNeedsYou } from '../shared/utils/needs-you.util';
import { OutreachApiService } from './outreach-api.service';
import { OutreachAuthService } from './outreach-auth.service';

/**
 * One Needs You count for the whole app - the sidebar badge, Growth's hero
 * and the Needs You page all show this number - plus the Drafts and Outbox
 * counts for the sidebar.
 */
@Injectable( { providedIn: 'root' } )
export class NeedsYouCountService {
  private readonly api = inject( OutreachApiService );
  private readonly auth = inject( OutreachAuthService );
  private readonly countSubject = new BehaviorSubject<number>( 0 );
  readonly count$ = this.countSubject.asObservable();
  /** The sidebar's Drafts and Outbox badges (design_handoff_outreach_mail). */
  private readonly mailSubject = new BehaviorSubject<{ drafts: number; outbox: number; }>( { drafts: 0, outbox: 0 } );
  readonly mail$ = this.mailSubject.asObservable();

  /** Pages that already loaded the threads report the count here. */
  set ( count: number ): void {
    this.countSubject.next( Math.max( 0, count ) );
  }

  setFromThreads ( threads: MomentumThread[] ): void {
    this.set( threads.filter( thread => isNeedsYou( thread ) || isDraftToApprove( thread ) ).length );
    this.mailSubject.next( {
      drafts: threads.filter( thread => thread.userLane === 'drafts' && !thread.rewriteQueueState ).length,
      outbox: threads.filter( thread => thread.userLane === 'outbox' ).length,
    } );
  }

  /** Once at sign-in, so the badge is right before any page loads it. */
  async refresh (): Promise<void> {
    const [tenantId, user] = await firstValueFrom( combineLatest( [this.auth.getTenantId(), this.auth.getUser()] ).pipe(
      filter( ( [tenantId, user] ) => !!tenantId && !!user ),
      take( 1 )
    ) );
    try {
      const response = await firstValueFrom( this.api.getSignalEngineBootstrap( { tenantId: String( tenantId ), userId: user?.uid, userEmail: user?.email || undefined } ) );
      this.setFromThreads( Array.isArray( response?.data?.threads ) ? response.data.threads : [] );
    } catch {
      // The badge just stays as it was.
    }
  }
}
