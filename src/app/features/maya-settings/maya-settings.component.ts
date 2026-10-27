import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription, combineLatest, firstValueFrom, take } from 'rxjs';

import { MayaAutoSendMode, MayaSettings, OutreachApiService } from '../../services/outreach-api.service';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { BrowseNoticeComponent } from '../../shared/write-access/browse-notice.component';
import { WriteActionDirective } from '../../shared/write-access/write-action.directive';
import { PreloaderComponent } from '../../shared/preloader/preloader.component';
import { MOVES_TASKS_URL } from '../../shared/utils/activity-action.util';

/**
 * Maya settings (Ty, 2026-10-27): control Maya from Outreach - whether her
 * drafts wait for you or send on their own, whether she works at all, when
 * she starts - and see what's about to stop her (open tasks, drafts waiting).
 * Auto-send only ever covers drafts she writes after it's turned on, and the
 * contact cap still holds anyone emailed in the last few days.
 */
@Component( {
  selector: 'app-maya-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, BrowseNoticeComponent, WriteActionDirective, PreloaderComponent],
  templateUrl: './maya-settings.component.html',
  styleUrls: ['../../shared/mail/mail-page.css', './maya-settings.component.css'],
} )
export class MayaSettingsComponent implements OnInit, OnDestroy {
  private readonly api = inject( OutreachApiService );
  private readonly auth = inject( OutreachAuthService );
  private subscription?: Subscription;
  private opts: { tenantId?: string; userId?: string; userEmail?: string; } = {};

  readonly movesUrl = MOVES_TASKS_URL;
  readonly hours = Array.from( { length: 24 }, ( _, hour ) => hour );
  readonly modes: Array<{ id: MayaAutoSendMode; title: string; detail: string; }> = [
    { id: 'off', title: 'Review every draft', detail: 'Nothing Maya writes sends until you approve it in Drafts.' },
    { id: 'noon', title: "Send at noon if I haven't reviewed it", detail: "You get the morning to read, edit or discard. Anything you haven't touched by noon sends." },
    { id: 'immediate', title: 'Send right away', detail: "Maya's emails go out as soon as she writes them, during each person's business hours." },
  ];

  loading = true;
  saving = '';
  error = '';
  saved = '';
  settings: MayaSettings | null = null;

  ngOnInit (): void {
    this.auth.isLoggedIn().pipe( take( 1 ) ).subscribe( ( signedIn ) => {
      if ( !signedIn ) this.loading = false;
    } );
    this.subscription = combineLatest( [this.auth.getTenantId(), this.auth.getUser()] ).subscribe( ( [tenantId, user] ) => {
      if ( !tenantId || !user ) return;
      this.opts = { tenantId: String( tenantId ), userId: user.uid, userEmail: user.email || undefined };
      void this.load();
    } );
  }

  ngOnDestroy (): void {
    this.subscription?.unsubscribe();
  }

  private async load (): Promise<void> {
    try {
      this.settings = ( await firstValueFrom( this.api.getMayaSettings( this.opts ) ) ).data;
      this.error = '';
    } catch ( error: any ) {
      this.error = String( error?.error?.message || error?.message || "Couldn't load Maya's settings." );
    } finally {
      this.loading = false;
    }
  }

  async save ( key: string, patch: Parameters<OutreachApiService['updateMayaSettings']>[0], done: string ): Promise<void> {
    if ( this.saving ) return;
    this.saving = key;
    this.error = '';
    this.saved = '';
    try {
      this.settings = ( await firstValueFrom( this.api.updateMayaSettings( patch, this.opts ) ) ).data;
      this.saved = done;
    } catch ( error: any ) {
      this.error = String( error?.error?.message || error?.message || "Couldn't save that." );
      await this.load();
    } finally {
      this.saving = '';
    }
  }

  setMode ( mode: MayaAutoSendMode ): void {
    if ( !this.settings || mode === this.settings.autoSendMode ) return;
    const label = this.modes.find( ( item ) => item.id === mode )?.title || mode;
    void this.save( 'mode', { autoSendMode: mode }, mode === 'off' ? 'Auto-send is off. Every draft waits for you.' : `Saved: ${ label }. It applies to drafts Maya writes from now on.` );
  }

  hourLabel ( hour: number ): string {
    return new Date( 2000, 0, 1, hour ).toLocaleTimeString( 'en-US', { hour: 'numeric' } );
  }

  /** "Since Oct 27" for the auto-send line. */
  get sinceLabel (): string {
    const since = Date.parse( this.settings?.autoSendSince || '' );
    return since ? new Date( since ).toLocaleDateString( 'en-US', { month: 'short', day: 'numeric' } ) : '';
  }

  get tasksFull (): boolean {
    const tasks = this.settings?.openTasks;
    return !!tasks && tasks.limit > 0 && tasks.count >= tasks.limit;
  }

  get draftsFull (): boolean {
    const drafts = this.settings?.draftsWaiting;
    return !!drafts && drafts.limit > 0 && drafts.count >= drafts.limit;
  }
}
