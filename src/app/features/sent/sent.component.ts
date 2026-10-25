import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subscription, combineLatest, take } from 'rxjs';

import { OutreachAuthService } from '../../services/outreach-auth.service';
import { BrowseNoticeComponent } from '../../shared/write-access/browse-notice.component';
import { WriteActionDirective } from '../../shared/write-access/write-action.directive';
import { PreloaderComponent } from '../../shared/preloader/preloader.component';
import { MailToast, MailToastComponent } from '../../shared/mail/mail-toast.component';
import { SENT_BY_LABELS, SentBy, SentGroup, SentRow, SentService } from './sent.service';

type FollowUpState = 'drafting' | 'ready';

interface GroupView {
  id: SentGroup;
  title: string;
  hint: string;
  rows: SentRow[];
}

const GROUPS: Array<{ id: SentGroup; title: string; hint: string; }> = [
  { id: 'engaged', title: 'Engaged', hint: "clicked a link. Follow up while it's fresh." },
  { id: 'opened', title: 'Opened', hint: 'Maya has a follow-up planned for each' },
  { id: 'none', title: 'No response yet', hint: 'Maya will try a new angle' },
];

/**
 * Sent (design_handoff_outreach_mail 1j): what went out in the last 30 days,
 * people who clicked at the top so they get a follow-up while it's fresh.
 * Replaces the Signal Engine's Sent tab (stat tiles, TODD snapshot and the
 * Sent-by chips are gone; "Sent by" is one select).
 */
@Component( {
  selector: 'app-sent',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, BrowseNoticeComponent, WriteActionDirective, PreloaderComponent, MailToastComponent],
  templateUrl: './sent.component.html',
  styleUrl: './sent.component.css',
} )
export class SentComponent implements OnInit, OnDestroy {
  private readonly auth = inject( OutreachAuthService );
  private readonly sent = inject( SentService );
  private readonly router = inject( Router );
  private subscription?: Subscription;

  private tenantId = '';
  private userId = '';
  private userEmail = '';

  loading = true;
  error = '';
  rows: SentRow[] = [];
  groups: GroupView[] = [];
  subtitle = '';
  byOptions: Array<{ id: SentBy | 'all'; label: string; }> = [{ id: 'all', label: 'Anyone' }];
  by: SentBy | 'all' = 'all';
  /** "No response yet" starts collapsed. */
  collapsed = new Set<SentGroup>( ['none'] );
  followUps = new Map<string, FollowUpState>();
  toast: MailToast | null = null;

  ngOnInit (): void {
    // Browsing signed out: nothing to load, so don't sit on the loader.
    this.auth.isLoggedIn().pipe( take( 1 ) ).subscribe( ( signedIn ) => {
      if ( !signedIn ) this.loading = false;
    } );
    this.subscription = combineLatest( [this.auth.getTenantId(), this.auth.getUser()] ).subscribe( ( [tenantId, user] ) => {
      const next = String( tenantId || '' );
      this.userId = String( user?.uid || '' );
      this.userEmail = String( user?.email || '' );
      if ( !next || next === this.tenantId ) return;
      this.tenantId = next;
      void this.load();
    } );
  }

  ngOnDestroy (): void {
    this.subscription?.unsubscribe();
  }

  private get opts () {
    return { tenantId: this.tenantId, userId: this.userId || undefined, userEmail: this.userEmail || undefined };
  }

  async load (): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.rows = await this.sent.load( this.opts );
      const present = new Set( this.rows.map( ( row ) => row.by ) );
      // The design's three first, then anything else that actually sent.
      const order: SentBy[] = ['catalyst', 'manual', 'reviewed_reply', 'maya', 'campaign', 'hot_lead'];
      this.byOptions = [{ id: 'all', label: 'Anyone' }, ...order.filter( ( id ) => present.has( id ) || ['catalyst', 'manual', 'reviewed_reply'].includes( id ) ).map( ( id ) => ( { id, label: SENT_BY_LABELS[id] } ) )];
      for ( const row of this.rows ) if ( row.hasDraft && row.contactId ) this.followUps.set( row.contactId, 'ready' );
      this.rebuild();
    } catch ( error: any ) {
      this.error = String( error?.error?.message || error?.message || 'Unable to load sent emails.' );
    } finally {
      this.loading = false;
    }
  }

  setBy ( value: SentBy | 'all' ): void {
    this.by = value;
    this.rebuild();
  }

  private rebuild (): void {
    const rows = this.by === 'all' ? this.rows : this.rows.filter( ( row ) => row.by === this.by );
    // Most clicks first, then newest.
    const sorted = [...rows].sort( ( a, b ) => b.clicks - a.clicks || ( b.sentAt?.getTime() || 0 ) - ( a.sentAt?.getTime() || 0 ) );
    this.groups = GROUPS
      .map( ( group ) => ( { ...group, rows: sorted.filter( ( row ) => row.group === group.id ) } ) )
      .filter( ( group ) => group.rows.length );
    const engaged = rows.filter( ( row ) => row.group !== 'none' ).length;
    this.subtitle = `${ rows.length } sent in the last 30 days. ${ engaged } opened or clicked.${ rows.some( ( row ) => row.clicks ) ? ' The people who clicked are at the top.' : '' }`;
  }

  toggle ( group: SentGroup ): void {
    if ( this.collapsed.has( group ) ) this.collapsed.delete( group );
    else this.collapsed.add( group );
  }

  followUpState ( row: SentRow ): FollowUpState | null {
    return row.contactId ? this.followUps.get( row.contactId ) || null : null;
  }

  async draftFollowUp ( row: SentRow ): Promise<void> {
    if ( !this.tenantId || this.followUps.has( row.contactId ) ) return;
    if ( !row.contactId ) {
      void this.router.navigate( ['/compose-email'] );
      return;
    }
    this.followUps.set( row.contactId, 'drafting' );
    try {
      await this.sent.draftFollowUp( row.contactId, this.opts );
      this.followUps.set( row.contactId, 'ready' );
      this.toast = { text: `Maya drafted a follow-up to ${ row.name }.`, action: { label: 'Review in Drafts', link: '/drafts' } };
    } catch ( error: any ) {
      this.followUps.delete( row.contactId );
      // No thread to draft from (an email sent outside Outreach's flows): write it yourself.
      if ( error?.status === 404 ) {
        void this.router.navigate( ['/compose-email'], { queryParams: { id: row.contactId } } );
        return;
      }
      this.toast = { text: String( error?.error?.message || `Maya couldn't draft a follow-up to ${ row.name }.` ) };
    }
  }

  trackByRow ( _index: number, row: SentRow ): string {
    return row.id;
  }

  trackByGroup ( _index: number, group: GroupView ): string {
    return group.id;
  }
}
