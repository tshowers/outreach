import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

import { InboxCategory } from '../../services/outreach-api.service';
import { WriteActionDirective } from '../../shared/write-access/write-action.directive';
import { InboxIconComponent } from './inbox-icon.component';
import { InboxLetter, LetterPrep, QuickAction, initials, kindTint, prepOf, quickActionOf } from './inbox.model';

/**
 * One letter in a day sheet, a category view or the Ask TODD results.
 * Wide: checkbox | avatar | name and company | ask, category tag and
 * subject | prep pill | time | quick action. Below 820px of page (a
 * container query): avatar (tap to select) | name, tag and time, the ask,
 * then the prep pill and the quick action.
 */
@Component( {
  selector: 'app-inbox-row',
  standalone: true,
  imports: [InboxIconComponent, WriteActionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './inbox-row.component.css',
  template: `
    <div class="row" role="button" tabindex="0" [class.row--answered]="letter.needsAnswer && letter.answered" [class.row--search]="search"
         [class.is-selected]="selected" (click)="open.emit(letter)" (keydown.enter)="open.emit(letter)" (keydown.space)="$event.preventDefault(); open.emit(letter)">
      @if (selectable) {
        <span #box class="box" role="checkbox" [attr.aria-checked]="selected" aria-label="Select" title="Select" (click)="toggle($event)">
          @if (selected) { <app-inbox-icon name="check" [size]="14"></app-inbox-icon> }
        </span>
      }
      <span class="avatar" [attr.data-tint]="tint" [class.is-selected]="selected" (click)="avatarTap($event)">
        <span class="avatar__ini">{{ ini }}</span>
        @if (selected) { <app-inbox-icon class="avatar__check" name="check" [size]="16"></app-inbox-icon> }
      </span>
      <span class="who">
        <span class="who__line">
          <span class="who__name">{{ letter.name }}</span>
          @if (category) { <span class="tag tag--narrow" [attr.data-color]="category.color">{{ category.name }}</span> }
        </span>
        <span class="who__co">{{ letter.company || letter.email }}</span>
      </span>
      <span class="ask">
        <span class="ask__line">{{ letter.ask }}</span>
        <span class="ask__sub">
          @if (category) { <span class="tag tag--wide" [attr.data-color]="category.color">{{ category.name }}</span> }
          <span class="ask__subject">{{ letter.subject }}</span>
        </span>
      </span>
      <span class="act">
      <span class="prep" [attr.data-tone]="prep.tone"><app-inbox-icon [name]="prep.icon" [size]="14"></app-inbox-icon><span class="prep__text">{{ prep.text }}</span></span>
      <span class="quick">
        @if (quick?.label === 'Send') {
          <button type="button" class="quick__btn" appWriteAction="send this reply" (click)="$event.stopPropagation(); quickAction.emit(letter)">
            <app-inbox-icon name="send" [size]="14"></app-inbox-icon>Send
          </button>
        } @else if (quick) {
          <button type="button" class="quick__btn" (click)="$event.stopPropagation(); quickAction.emit(letter)">
            <app-inbox-icon name="phone" [size]="14"></app-inbox-icon>Call
          </button>
        }
      </span>
      </span>
      <span class="when">{{ when }}</span>
    </div>
  `,
} )
export class InboxRowComponent {
  @ViewChild( 'box' ) box?: ElementRef<HTMLElement>;

  letter!: InboxLetter;
  prep!: LetterPrep;
  quick: QuickAction | null = null;
  ini = '';
  tint = '';

  @Input( { required: true, alias: 'letter' } ) set setLetter ( letter: InboxLetter ) {
    this.letter = letter;
    this.prep = prepOf( letter );
    this.quick = quickActionOf( letter );
    this.ini = initials( letter.name );
    this.tint = kindTint( letter.kind );
  }

  /** "9:42 AM"; "Fri 2:51 PM" in a category; "Yesterday · 9:42 AM" in search results. */
  @Input() when = '';
  /** Ask TODD results: no checkbox or quick column on wide pages, a wider time. */
  @Input() search = false;
  @Input() selectable = true;
  @Input() selected = false;
  @Input() category: InboxCategory | null = null;
  @Output() open = new EventEmitter<InboxLetter>();
  @Output() quickAction = new EventEmitter<InboxLetter>();
  /** range: Shift was held, so everything between this and the last tick. */
  @Output() select = new EventEmitter<{ letter: InboxLetter; range: boolean; }>();

  toggle ( event: MouseEvent ): void {
    event.stopPropagation();
    event.preventDefault();
    if ( event.shiftKey ) window.getSelection()?.removeAllRanges();
    this.select.emit( { letter: this.letter, range: event.shiftKey } );
  }

  /** On narrow rows there's no checkbox: the avatar is the toggle. */
  avatarTap ( event: MouseEvent ): void {
    const box = this.box?.nativeElement;
    if ( !this.selectable || ( box && box.offsetParent !== null ) ) return;
    this.toggle( event );
  }
}
