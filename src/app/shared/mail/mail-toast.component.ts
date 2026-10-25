import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';

export interface MailToast {
  text: string;
  /** An optional pill: a link ("View in Outbox") or, without a link, a button ("Undo"). */
  action?: { label: string; link?: string; queryParams?: Record<string, string>; };
}

/**
 * The mail pages' toast (design_handoff_outreach_mail): bottom-centre, dark,
 * one optional white action pill, gone after 5 seconds. The page owns the
 * toast; set it to show one, and listen for (action) when it's a button.
 */
@Component( {
  selector: 'app-mail-toast',
  standalone: true,
  imports: [NgIf, RouterLink],
  template: `
    <div class="mail-toast" *ngIf="toast" role="status" aria-live="polite">
      <span>{{ toast.text }}</span>
      <ng-container *ngIf="toast.action as action">
        <a *ngIf="action.link; else actionButton" class="mail-toast__action" [routerLink]="action.link" [queryParams]="action.queryParams || null" (click)="close()">{{ action.label }}</a>
        <ng-template #actionButton>
          <button type="button" class="mail-toast__action" (click)="act()">{{ action.label }}</button>
        </ng-template>
      </ng-container>
    </div>
  `,
  styles: [`
    .mail-toast {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 14px;
      max-width: calc(100vw - 32px);
      padding: 12px 14px 12px 20px;
      border-radius: 999px;
      background: var(--text);
      color: var(--bg);
      font-size: 14px;
      box-shadow: 0 12px 30px rgba(15, 17, 21, .25);
    }
    .mail-toast__action {
      display: inline-flex;
      align-items: center;
      flex: none;
      height: 32px;
      padding: 0 14px;
      border: 0;
      border-radius: 999px;
      background: var(--bg);
      color: var(--text) !important;
      font: inherit;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }
  `],
} )
export class MailToastComponent implements OnDestroy {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private current: MailToast | null = null;

  @Input() set toast ( value: MailToast | null ) {
    this.current = value;
    clearTimeout( this.timer );
    if ( value ) this.timer = setTimeout( () => this.close(), 5000 );
  }
  get toast (): MailToast | null {
    return this.current;
  }

  /** The toast closed (timed out, or its link was followed). */
  @Output() closed = new EventEmitter<void>();
  /** The action button (one with no link) was pressed. */
  @Output() action = new EventEmitter<void>();

  act (): void {
    this.action.emit();
    this.close();
  }

  close (): void {
    clearTimeout( this.timer );
    this.current = null;
    this.closed.emit();
  }

  ngOnDestroy (): void {
    clearTimeout( this.timer );
  }
}
