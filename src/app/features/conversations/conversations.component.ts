import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, combineLatest, firstValueFrom, take } from 'rxjs';

import { EmailConversation, OutreachApiService } from '../../services/outreach-api.service';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { BrowseNoticeComponent } from '../../shared/write-access/browse-notice.component';
import { PreloaderComponent } from '../../shared/preloader/preloader.component';

interface ConversationRow {
  id: string;
  who: string;
  subject: string;
  preview: string;
  when: string;
  count: string;
  isTest: boolean;
  open: boolean;
  loading: boolean;
  error: string;
  messages: Array<{ id: string; mine: boolean; label: string; text: string; when: string; }>;
}

/**
 * Conversations (Ty, 2026-11-01): what each recipient said to the Marketing
 * Assistant after clicking "Talk to me about this email", newest first.
 * Opening a row loads the whole exchange. Read-only.
 */
@Component( {
  selector: 'app-conversations',
  standalone: true,
  imports: [CommonModule, BrowseNoticeComponent, PreloaderComponent],
  templateUrl: './conversations.component.html',
  styleUrl: './conversations.component.css',
} )
export class ConversationsComponent implements OnInit, OnDestroy {
  private readonly api = inject( OutreachApiService );
  private readonly auth = inject( OutreachAuthService );
  private subscription?: Subscription;
  private opts: { tenantId?: string; userId?: string; userEmail?: string; } = {};

  loading = true;
  error = '';
  rows: ConversationRow[] = [];

  ngOnInit (): void {
    this.auth.isLoggedIn().pipe( take( 1 ) ).subscribe( ( signedIn ) => {
      if ( !signedIn ) this.loading = false;
    } );
    this.subscription = combineLatest( [this.auth.getTenantId(), this.auth.getUser()] ).subscribe( ( [tenantId, user] ) => {
      if ( !tenantId || !user || tenantId === this.opts.tenantId ) return;
      this.opts = { tenantId: String( tenantId ), userId: user.uid, userEmail: user.email || undefined };
      void this.load();
    } );
  }

  ngOnDestroy (): void {
    this.subscription?.unsubscribe();
  }

  async load (): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const response = await firstValueFrom( this.api.listEmailConversations( this.opts ) );
      this.rows = ( response.data || [] ).map( ( c ) => this.toRow( c ) );
    } catch ( error: any ) {
      this.error = String( error?.error?.message || error?.message || 'Unable to load conversations.' );
    } finally {
      this.loading = false;
    }
  }

  async toggle ( row: ConversationRow ): Promise<void> {
    row.open = !row.open;
    if ( !row.open || row.messages.length || row.loading ) return;
    row.loading = true;
    row.error = '';
    try {
      const response = await firstValueFrom( this.api.getEmailConversation( row.id, this.opts ) );
      const who = row.who;
      row.messages = ( response.data?.messages || [] ).map( ( m ) => ( {
        id: m.id,
        mine: m.role === 'assistant',
        label: m.role === 'assistant' ? 'Marketing Assistant' : who,
        text: m.text,
        when: this.formatWhen( m.at ),
      } ) );
    } catch ( error: any ) {
      row.error = String( error?.error?.message || error?.message || 'Unable to load this conversation.' );
    } finally {
      row.loading = false;
    }
  }

  trackByRow ( _index: number, row: ConversationRow ): string {
    return row.id;
  }

  private toRow ( c: EmailConversation ): ConversationRow {
    const name = String( c.contactName || '' ).trim();
    const company = String( c.companyName || '' ).trim();
    const who = [name || String( c.to || '' ).trim(), company].filter( Boolean ).join( ', ' ) || ( c.isTest ? 'You (test send)' : 'Recipient' );
    const count = Number( c.messageCount ) || 0;
    return {
      id: c.id,
      who,
      subject: String( c.subject || '' ).trim() || '(no subject)',
      preview: String( c.lastMessage || '' ).trim(),
      when: this.formatWhen( c.lastMessageAt ),
      count: `${count} ${count === 1 ? 'message' : 'messages'}`,
      isTest: c.isTest === true,
      open: false,
      loading: false,
      error: '',
      messages: [],
    };
  }

  private formatWhen ( value?: string ): string {
    const date = value ? new Date( value ) : null;
    if ( !date || Number.isNaN( date.getTime() ) ) return '';
    return date.toLocaleString( undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } );
  }
}
