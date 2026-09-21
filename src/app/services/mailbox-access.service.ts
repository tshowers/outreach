import { Injectable } from '@angular/core';
import { take } from 'rxjs';
import { LoggerService } from './logger.service';
import { OutreachNotificationService } from './outreach-notification.service';
import {
  MailboxConfigSummary,
  MailboxMessageDetail,
  MailboxMessageListItem,
  MailboxProviderId,
  OutreachApiService,
} from './outreach-api.service';

export interface MailboxAccessContext {
  tenantId: string;
  userId: string;
  userEmail?: string;
  displayName?: string;
  companyName?: string;
}

export interface MailboxFormState {
  id?: string;
  displayName: string;
  emailAddress: string;
  provider: MailboxProviderId;
  secret: string;
  authUsername: string;
  showAdvanced: boolean;
  imap: {
    host: string;
    port: number;
    secure: boolean;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
  };
}

export type MailboxReplyMode = 'text' | 'rich';

export interface MailboxReplyDraftState {
  subject: string;
  textBody: string;
  htmlBody: string;
  replyMode: MailboxReplyMode;
}

@Injectable()
export class MailboxAccessService {
  readonly mailboxProviders: Array<{ id: MailboxProviderId; label: string; }> = [
    { id: 'gmail', label: 'Gmail/Google Workspace' },
    { id: 'outlook', label: 'Outlook/Microsoft 365' },
    { id: 'icloud', label: 'iCloud' },
    { id: 'yahoo', label: 'Yahoo' },
    { id: 'dreamhost', label: 'DreamHost' },
    { id: 'other_imap', label: 'Other IMAP' },
  ];

  mailboxForm = this.createMailboxForm();
  mailboxConfigs: MailboxConfigSummary[] = [];
  connectedMailbox: MailboxConfigSummary | null = null;
  mailboxMessages: MailboxMessageListItem[] = [];
  selectedMailboxMessage: MailboxMessageDetail | null = null;
  mailboxReplyDraft = this.createMailboxReplyDraft();
  mailboxConnectionStatus = '';
  mailboxSyncStatus = '';
  mailboxReplyStatus = '';
  loadingMailboxes = false;
  loadingMailboxMessages = false;
  loadingMailboxDetail = false;
  isTestingMailbox = false;
  isSavingMailbox = false;
  isSyncingMailbox = false;
  isReplyingMailbox = false;
  isDeletingMailboxMessage = false;

  private context: MailboxAccessContext | null = null;
  private lastContextKey = '';

  constructor(
    private outreachApi: OutreachApiService,
    private notificationService: OutreachNotificationService,
    private logger: LoggerService
  ) {}

  initialize(context: MailboxAccessContext): void {
    const nextContextKey = `${context.tenantId}:${context.userId}:${context.userEmail || ''}`;
    const contextChanged = nextContextKey !== this.lastContextKey;

    this.context = { ...context };
    this.lastContextKey = nextContextKey;

    if (!this.connectedMailbox && !this.mailboxConfigs.length) {
      this.hydrateMailboxForm(null);
    }

    if (contextChanged) {
      this.loadMailboxConfigs();
    }
  }

  get mailboxNeedsAdvancedSettings(): boolean {
    return this.mailboxForm.showAdvanced || this.mailboxForm.provider === 'other_imap' || !!this.connectedMailbox?.advancedRequired;
  }

  get hasMailboxConnection(): boolean {
    return !!this.connectedMailbox;
  }

  onMailboxProviderChange(): void {
    const defaults = this.getMailboxProviderDefaults(this.mailboxForm.provider);
    this.mailboxForm.imap = { ...defaults.imap };
    this.mailboxForm.smtp = { ...defaults.smtp };
    if (this.mailboxForm.provider === 'other_imap') {
      this.mailboxForm.showAdvanced = true;
    }
  }

  startAddingMailbox(): void {
    this.connectedMailbox = null;
    this.selectedMailboxMessage = null;
    this.mailboxMessages = [];
    this.mailboxConnectionStatus = '';
    this.mailboxSyncStatus = '';
    this.hydrateMailboxForm(null);
  }

  selectMailbox(mailbox: MailboxConfigSummary): void {
    if (!mailbox?.id || mailbox.id === this.connectedMailbox?.id) return;
    this.connectedMailbox = mailbox;
    this.hydrateMailboxForm(mailbox);
    this.selectedMailboxMessage = null;
    this.mailboxReplyDraft = this.createMailboxReplyDraft();
    this.loadMailboxMessages(mailbox.id);
  }

  setPrimaryMailbox(mailbox: MailboxConfigSummary): void {
    if (!mailbox?.id || mailbox.isPrimary) return;
    this.outreachApi.setPrimaryMailbox(mailbox.id, this.getMailboxRequestOptions())
      .pipe(take(1))
      .subscribe({
        next: () => this.loadMailboxConfigs(),
        error: (error) => {
          this.mailboxConnectionStatus = error?.error?.message || 'Unable to update the primary mailbox.';
          this.notificationService.show('Error', this.mailboxConnectionStatus, 'error');
        }
      });
  }

  loadMailboxConfigs(): void {
    if (!this.context?.tenantId || !this.context?.userId) return;

    this.loadingMailboxes = true;
    this.outreachApi.listMailboxes(this.getMailboxRequestOptions())
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          this.loadingMailboxes = false;
          this.mailboxConfigs = Array.isArray(response?.data) ? response.data : [];
          const selectedId = this.connectedMailbox?.id;
          this.connectedMailbox = this.mailboxConfigs.find((mailbox) => mailbox.id === selectedId)
            || this.selectPreferredMailbox(this.mailboxConfigs);
          this.hydrateMailboxForm(this.connectedMailbox);

          if (this.connectedMailbox?.id) {
            this.loadMailboxMessages(this.connectedMailbox.id);
          } else {
            this.mailboxMessages = [];
            this.selectedMailboxMessage = null;
            this.mailboxReplyDraft = this.createMailboxReplyDraft();
          }
        },
        error: (error) => {
          this.loadingMailboxes = false;
          this.logger.error('Unable to load mailbox configs:', error);
          this.mailboxConnectionStatus = 'Unable to load mailbox connection settings right now.';
        }
      });
  }

  testMailboxConnection(): void {
    if (!this.context?.tenantId || !this.context?.userId) return;

    this.isTestingMailbox = true;
    this.mailboxConnectionStatus = 'Testing mailbox connection...';
    this.outreachApi.testMailboxConnection(this.buildMailboxPayload(), this.getMailboxRequestOptions())
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          this.isTestingMailbox = false;
          const checks = response?.data?.checks;
          this.mailboxConnectionStatus = response?.message || 'Mailbox connection verified.';
          if (response?.data?.mailbox) {
            this.mailboxForm.showAdvanced = response.data.mailbox.advancedRequired === true;
          }
          this.notificationService.show(
            'Success',
            checks?.smtpVerified && checks?.imapVerified ? 'Mailbox connection verified.' : (response?.message || 'Mailbox check completed.'),
            'success'
          );
        },
        error: (error) => {
          this.isTestingMailbox = false;
          this.mailboxForm.showAdvanced = true;
          this.mailboxConnectionStatus = error?.error?.message || 'Mailbox connection failed.';
          this.notificationService.show(
            'Error',
            this.mailboxConnectionStatus,
            'error'
          );
        }
      });
  }

  saveMailboxConnection(): void {
    if (!this.context?.tenantId || !this.context?.userId) return;

    this.isSavingMailbox = true;
    this.mailboxConnectionStatus = 'Saving mailbox connection...';
    this.outreachApi.saveMailbox(this.buildMailboxPayload(), this.getMailboxRequestOptions())
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          this.isSavingMailbox = false;
          this.mailboxConnectionStatus = response?.message || 'Mailbox saved.';
          this.notificationService.show(
            'Success',
            'Mailbox connection saved.',
            'success'
          );
          this.mailboxForm.secret = '';
          this.loadMailboxConfigs();
        },
        error: (error) => {
          this.isSavingMailbox = false;
          this.mailboxConnectionStatus = error?.error?.message || 'Unable to save mailbox connection.';
          this.notificationService.show(
            'Error',
            this.mailboxConnectionStatus,
            'error'
          );
        }
      });
  }

  syncMailboxNow(): void {
    if (!this.connectedMailbox?.id) return;

    this.isSyncingMailbox = true;
    this.mailboxSyncStatus = 'Syncing inbox...';
    this.outreachApi.syncMailbox(this.connectedMailbox.id, this.getMailboxRequestOptions())
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          this.isSyncingMailbox = false;
          this.mailboxSyncStatus = response?.message || 'Mailbox sync complete.';
          this.notificationService.show(
            'Success',
            `Mailbox sync complete. ${response?.data?.syncedCount || 0} message${response?.data?.syncedCount === 1 ? '' : 's'} processed.`,
            'success'
          );
          this.loadMailboxConfigs();
        },
        error: (error) => {
          this.isSyncingMailbox = false;
          this.mailboxSyncStatus = error?.error?.message || 'Mailbox sync failed.';
          this.notificationService.show(
            'Error',
            this.mailboxSyncStatus,
            'error'
          );
        }
      });
  }

  loadMailboxMessages(mailboxId: string): void {
    if (!mailboxId || !this.context?.tenantId || !this.context?.userId) return;

    this.loadingMailboxMessages = true;
    this.outreachApi.listMailboxMessages(mailboxId, {
      ...this.getMailboxRequestOptions(),
      limit: 20
    })
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          this.loadingMailboxMessages = false;
          this.mailboxMessages = Array.isArray(response?.data) ? response.data : [];
          if (this.mailboxMessages.length === 0) {
            this.selectedMailboxMessage = null;
          } else if (!this.selectedMailboxMessage) {
            this.openMailboxMessage(this.mailboxMessages[0]);
          }
        },
        error: (error) => {
          this.loadingMailboxMessages = false;
          this.logger.error('Unable to load mailbox messages:', error);
          this.mailboxSyncStatus = error?.error?.message || 'Unable to load recent inbox messages.';
        }
      });
  }

  openMailboxMessage(message: MailboxMessageListItem): void {
    if (!this.connectedMailbox?.id || !message?.id) return;

    this.loadingMailboxDetail = true;
    this.outreachApi.getMailboxMessage(this.connectedMailbox.id, message.id, this.getMailboxRequestOptions())
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          this.loadingMailboxDetail = false;
          this.selectedMailboxMessage = response?.data || null;
          this.mailboxReplyDraft = this.createReplyDraftFromMessage( this.selectedMailboxMessage );
        },
        error: (error) => {
          this.loadingMailboxDetail = false;
          this.mailboxReplyStatus = error?.error?.message || 'Unable to open this message.';
        }
      });
  }

  deleteSelectedMailboxMessage(): void {
    if (!this.connectedMailbox?.id || !this.selectedMailboxMessage?.id || this.isDeletingMailboxMessage) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete this inbox message from the connected mailbox?')) return;

    const deletedMessageId = this.selectedMailboxMessage.id;
    this.isDeletingMailboxMessage = true;
    this.mailboxReplyStatus = 'Deleting message...';
    this.outreachApi.deleteMailboxMessage(
      this.connectedMailbox.id,
      deletedMessageId,
      this.getMailboxRequestOptions()
    )
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.isDeletingMailboxMessage = false;
          this.mailboxReplyStatus = 'Message deleted.';
          this.notificationService.show(
            'Success',
            'Inbox message deleted.',
            'success'
          );

          this.mailboxMessages = this.mailboxMessages.filter((message) => message.id !== deletedMessageId);
          if (this.selectedMailboxMessage?.id === deletedMessageId) {
            this.selectedMailboxMessage = null;
            this.mailboxReplyDraft = this.createMailboxReplyDraft();
          }

          if (this.connectedMailbox?.id) {
            this.loadMailboxMessages(this.connectedMailbox.id);
          }
        },
        error: (error) => {
          this.isDeletingMailboxMessage = false;
          this.mailboxReplyStatus = error?.error?.message || 'Unable to delete this message.';
          this.notificationService.show(
            'Error',
            this.mailboxReplyStatus,
            'error'
          );
        }
      });
  }

  sendMailboxReply(): void {
    if (!this.connectedMailbox?.id || !this.selectedMailboxMessage?.id || !this.canSendMailboxReply) return;

    const textBody = this.getReplyTextBody();
    const htmlBody = this.mailboxReplyDraft.replyMode === 'rich'
      ? this.normalizeRichReplyHtml(this.mailboxReplyDraft.htmlBody)
      : '';

    this.isReplyingMailbox = true;
    this.mailboxReplyStatus = 'Sending reply...';
    this.outreachApi.replyToMailboxMessage(
      this.connectedMailbox.id,
      this.selectedMailboxMessage.id,
      {
        subject: this.mailboxReplyDraft.subject,
        body: textBody,
        text: textBody,
        html: htmlBody || undefined,
      },
      this.getMailboxRequestOptions()
    )
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.isReplyingMailbox = false;
          this.mailboxReplyStatus = 'Reply sent.';
          this.clearReplyBodies();
          this.notificationService.show(
            'Success',
            'Reply sent.',
            'success'
          );
          if (this.connectedMailbox?.id) {
            this.loadMailboxMessages(this.connectedMailbox.id);
          }
        },
        error: (error) => {
          this.isReplyingMailbox = false;
          this.mailboxReplyStatus = error?.error?.message || 'Unable to send reply.';
          this.notificationService.show(
            'Error',
            this.mailboxReplyStatus,
            'error'
          );
        }
      });
  }

  disconnectMailboxConnection(): void {
    if (!this.connectedMailbox?.id) return;

    this.outreachApi.disconnectMailbox(this.connectedMailbox.id, this.getMailboxRequestOptions())
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.notificationService.show(
            'Success',
            'Mailbox disconnected.',
            'success'
          );
          this.mailboxConnectionStatus = 'Mailbox disconnected.';
          this.connectedMailbox = null;
          this.mailboxMessages = [];
          this.selectedMailboxMessage = null;
          this.mailboxReplyDraft = this.createMailboxReplyDraft();
          this.hydrateMailboxForm(null);
          this.loadMailboxConfigs();
        },
        error: (error) => {
          this.mailboxConnectionStatus = error?.error?.message || 'Unable to disconnect mailbox.';
          this.notificationService.show(
            'Error',
            this.mailboxConnectionStatus,
            'error'
          );
        }
      });
  }

  private createMailboxForm(): MailboxFormState {
    return {
      id: undefined,
      displayName: '',
      emailAddress: '',
      provider: 'gmail' as MailboxProviderId,
      secret: '',
      authUsername: '',
      showAdvanced: false,
      imap: {
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
      },
      smtp: {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
      },
    };
  }

  get canSendMailboxReply(): boolean {
    return !!this.getReplyTextBody();
  }

  setReplyMode(mode: MailboxReplyMode): void {
    if (this.mailboxReplyDraft.replyMode === mode) return;

    if (mode === 'rich' && !this.normalizeRichReplyHtml(this.mailboxReplyDraft.htmlBody) && this.mailboxReplyDraft.textBody.trim()) {
      this.mailboxReplyDraft.htmlBody = this.convertTextToReplyHtml(this.mailboxReplyDraft.textBody);
    }

    this.mailboxReplyDraft.replyMode = mode;
  }

  updateReplyHtml(html: string): void {
    this.mailboxReplyDraft.htmlBody = html || '';
  }

  updateReplyTextFromHtml(text: string): void {
    if (this.mailboxReplyDraft.replyMode !== 'rich') return;
    this.mailboxReplyDraft.textBody = String(text || '').trim();
  }

  private getMailboxProviderDefaults(provider: MailboxProviderId) {
    const presets: Record<string, { imap: { host: string; port: number; secure: boolean; }; smtp: { host: string; port: number; secure: boolean; }; }> = {
      gmail: {
        imap: { host: 'imap.gmail.com', port: 993, secure: true },
        smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
      },
      outlook: {
        imap: { host: 'outlook.office365.com', port: 993, secure: true },
        smtp: { host: 'smtp.office365.com', port: 587, secure: false },
      },
      icloud: {
        imap: { host: 'imap.mail.me.com', port: 993, secure: true },
        smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
      },
      yahoo: {
        imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
        smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
      },
      dreamhost: {
        imap: { host: 'imap.dreamhost.com', port: 993, secure: true },
        smtp: { host: 'smtp.dreamhost.com', port: 465, secure: true },
      },
      other_imap: {
        imap: { host: '', port: 993, secure: true },
        smtp: { host: '', port: 465, secure: true },
      },
    };

    return presets[provider] || presets['other_imap'];
  }

  private buildMailboxPayload() {
    return {
      ...(this.mailboxForm.id ? { id: this.mailboxForm.id } : {}),
      displayName: (this.mailboxForm.displayName || this.context?.companyName || this.context?.displayName || '').toString().trim(),
      emailAddress: (this.mailboxForm.emailAddress || '').toString().trim().toLowerCase(),
      provider: this.mailboxForm.provider,
      secret: (this.mailboxForm.secret || '').toString(),
      auth: {
        username: (this.mailboxForm.authUsername || this.mailboxForm.emailAddress || '').toString().trim().toLowerCase()
      },
      imap: {
        host: (this.mailboxForm.imap.host || '').toString().trim(),
        port: Number(this.mailboxForm.imap.port) || 993,
        secure: !!this.mailboxForm.imap.secure
      },
      smtp: {
        host: (this.mailboxForm.smtp.host || '').toString().trim(),
        port: Number(this.mailboxForm.smtp.port) || 465,
        secure: !!this.mailboxForm.smtp.secure
      }
    };
  }

  private createMailboxReplyDraft(subject = ''): MailboxReplyDraftState {
    return {
      subject,
      textBody: '',
      htmlBody: '',
      replyMode: 'text',
    };
  }

  private createReplyDraftFromMessage(message: MailboxMessageDetail | null): MailboxReplyDraftState {
    const fallbackSubject = message?.subject && /^re:/i.test(message.subject)
      ? message.subject
      : `Re: ${message?.subject || 'Quick note'}`;
    const suggestedBody = String(message?.replyDraftBody || '').trim();
    const suggestedSubject = String(message?.replyDraftSubject || '').trim() || fallbackSubject;

    if (!suggestedBody) {
      return this.createMailboxReplyDraft(fallbackSubject);
    }

    return {
      subject: suggestedSubject,
      textBody: suggestedBody,
      htmlBody: this.convertTextToReplyHtml(suggestedBody),
      replyMode: 'text',
    };
  }

  private clearReplyBodies(): void {
    this.mailboxReplyDraft.textBody = '';
    this.mailboxReplyDraft.htmlBody = '';
    this.mailboxReplyDraft.replyMode = 'text';
  }

  private getReplyTextBody(): string {
    if (this.mailboxReplyDraft.replyMode === 'rich') {
      const richText = String(this.mailboxReplyDraft.textBody || '').trim();
      if (richText) return richText;
      return this.convertReplyHtmlToText(this.mailboxReplyDraft.htmlBody);
    }

    return String(this.mailboxReplyDraft.textBody || '').trim();
  }

  private normalizeRichReplyHtml(html: string): string {
    return String(html || '').trim();
  }

  private convertTextToReplyHtml(text: string): string {
    const normalized = String(text || '').trim();
    if (!normalized) return '';

    return normalized
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${this.escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  private convertReplyHtmlToText(html: string): string {
    return String(html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<li>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;/gi, '\'')
      .replace(/&quot;/gi, '"')
      .replace(/\r/g, '')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private escapeHtml(text: string): string {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private getMailboxRequestOptions() {
    return {
      tenantId: this.context?.tenantId,
      userId: this.context?.userId,
      userEmail: this.context?.userEmail || undefined
    };
  }

  private hydrateMailboxForm(mailbox: MailboxConfigSummary | null): void {
    if (!mailbox) {
      this.mailboxForm = {
        ...this.createMailboxForm(),
        displayName: this.context?.companyName || this.context?.displayName || '',
        emailAddress: this.context?.userEmail || '',
      };
      return;
    }

    this.mailboxForm = {
      id: mailbox.id || undefined,
      displayName: mailbox.displayName || '',
      emailAddress: mailbox.emailAddress || '',
      provider: mailbox.provider || 'gmail',
      secret: '',
      authUsername: mailbox.auth?.username || mailbox.emailAddress || '',
      showAdvanced: mailbox.advancedRequired === true,
      imap: {
        host: mailbox.imap?.host || '',
        port: mailbox.imap?.port || 993,
        secure: mailbox.imap?.secure !== false,
      },
      smtp: {
        host: mailbox.smtp?.host || '',
        port: mailbox.smtp?.port || 465,
        secure: mailbox.smtp?.secure !== false,
      },
    };
  }

  private selectPreferredMailbox(mailboxes: MailboxConfigSummary[]): MailboxConfigSummary | null {
    if (!Array.isArray(mailboxes) || mailboxes.length === 0) return null;
    return mailboxes.find((mailbox) => mailbox?.isPrimary || mailbox?.id === 'primary') || mailboxes[0] || null;
  }
}
