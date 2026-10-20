import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { InboxCategory } from '../../services/outreach-api.service';
import { InboxIconComponent } from './inbox-icon.component';

export type CategoryMenuMode = 'bulk' | 'letter' | 'filter';

export interface CategoryOption {
  category: InboxCategory;
  count: number;
  /** Every letter the menu acts on already has it. */
  checked: boolean;
}

/**
 * The category menu (design_handoff_outreach_inbox_2026-b): assign, remove
 * or create a category. Opens below its trigger, or above it when the
 * trigger sits in the lower half of the window; full width on phones. A
 * click outside or Esc closes it.
 */
@Component( {
  selector: 'app-inbox-category-menu',
  standalone: true,
  imports: [FormsModule, InboxIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" (click)="close.emit()"></div>
    <div class="menu" role="dialog" [attr.aria-label]="title" [style.left.px]="left" [style.top.px]="top" [style.bottom.px]="bottom">
      <span class="menu__title">{{ title }}</span>
      @if (mode !== 'filter') {
        @for (option of options; track option.category.id) {
          <button type="button" class="option" (click)="pick.emit(option.category)">
            <span class="dot" [attr.data-color]="option.category.color"></span>
            <span class="option__name">{{ option.category.name }}</span>
            <span class="option__count">{{ option.count }}</span>
            <app-inbox-icon class="option__check" [class.is-on]="option.checked" name="check"></app-inbox-icon>
          </button>
        }
        @if (canRemove) {
          <button type="button" class="option option--remove" (click)="remove.emit()"><app-inbox-icon name="x"></app-inbox-icon>Remove category</button>
        }
      }
      <div class="add">
        <input #nameField type="text" [(ngModel)]="name" placeholder="New category" aria-label="New category" maxlength="40" (keydown.enter)="$event.preventDefault(); submit()">
        <button type="button" class="add__btn" (click)="submit()">Add</button>
      </div>
    </div>
  `,
  styleUrl: './inbox-category-menu.component.css',
} )
export class InboxCategoryMenuComponent implements AfterViewInit {
  @ViewChild( 'nameField' ) nameField?: ElementRef<HTMLInputElement>;

  @Input() mode: CategoryMenuMode = 'letter';
  /** How many letters a bulk menu acts on. */
  @Input() count = 0;
  @Input() options: CategoryOption[] = [];
  @Input() canRemove = false;
  /** The trigger's box, so the menu opens next to it. */
  @Input() anchor: { left: number; top: number; bottom: number; } = { left: 0, top: 0, bottom: 0 };
  @Output() pick = new EventEmitter<InboxCategory>();
  @Output() remove = new EventEmitter<void>();
  @Output() add = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();

  name = '';

  get title (): string {
    if ( this.mode === 'bulk' ) return `Category for ${ this.count === 1 ? '1 letter' : `${ this.count } letters` }`;
    return this.mode === 'letter' ? 'Category' : 'New category';
  }

  private get narrow (): boolean {
    return typeof window !== 'undefined' && window.innerWidth < 820;
  }

  /** Phones: CSS pins it across the width. Otherwise beside the trigger, kept on screen. */
  get left (): number | null {
    if ( this.narrow || typeof window === 'undefined' ) return null;
    return Math.max( 12, Math.min( this.anchor.left, window.innerWidth - 312 ) );
  }

  get top (): number | null {
    return this.opensAbove ? null : this.anchor.bottom + 8;
  }

  get bottom (): number | null {
    return this.opensAbove && typeof window !== 'undefined' ? window.innerHeight - this.anchor.top + 8 : null;
  }

  private get opensAbove (): boolean {
    return typeof window !== 'undefined' && this.anchor.top > window.innerHeight / 2;
  }

  ngAfterViewInit (): void {
    // + New is only the field, so it's ready to type in.
    if ( this.mode === 'filter' ) this.nameField?.nativeElement.focus();
  }

  submit (): void {
    const name = this.name.trim();
    if ( name ) this.add.emit( name );
  }

  @HostListener( 'document:keydown.escape', ['$event'] )
  onEscape ( event: Event ): void {
    event.stopImmediatePropagation();
    this.close.emit();
  }
}
