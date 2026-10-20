import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { WriteActionDirective } from '../../shared/write-access/write-action.directive';
import { InboxIconComponent } from './inbox-icon.component';
import { InboxLetter, LetterPrep, QuickAction, initials, kindTint, prepOf, quickActionOf } from './inbox.model';

/**
 * One letter in a day sheet or the Ask TODD results. Wide: avatar | name
 * and company | ask and subject | prep pill | time | quick action. Below
 * 820px of page (a container query in the page's CSS): avatar | name and
 * time, the ask, then the prep pill and the quick action.
 */
@Component( {
  selector: 'app-inbox-row',
  standalone: true,
  imports: [InboxIconComponent, WriteActionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './inbox-row.component.css',
  template: `
    <div class="row" role="button" tabindex="0" [class.row--answered]="letter.needsAnswer && letter.answered" [class.row--search]="search"
         [class.is-selected]="selected" [attr.aria-pressed]="selecting ? selected : null"
         (click)="onClick($event)" (keydown.enter)="onClick($event)" (keydown.space)="$event.preventDefault(); onClick($event)">
      @if (selecting) {
        <span class="check" aria-hidden="true">@if (selected) {<app-inbox-icon name="check" [size]="16"></app-inbox-icon>}</span>
      } @else {
        <span class="avatar" [attr.data-tint]="tint">{{ ini }}</span>
      }
      <span class="who">
        <span class="who__name">{{ letter.name }}</span>
        <span class="who__co">{{ letter.company || letter.email }}</span>
      </span>
      <span class="ask">
        <span class="ask__line">{{ letter.ask }}</span>
        <span class="ask__subject">{{ letter.subject }}</span>
      </span>
      <span class="act">
      <span class="prep" [attr.data-tone]="prep.tone"><app-inbox-icon [name]="prep.icon" [size]="14"></app-inbox-icon><span class="prep__text">{{ prep.text }}</span></span>
      <span class="quick">
        @if (selecting) {
        } @else if (quick?.label === 'Send') {
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

  /** "9:42 AM", or "Yesterday · 9:42 AM" in search results. */
  @Input() when = '';
  /** Ask TODD results: no quick column on wide pages, a wider time. */
  @Input() search = false;
  /** Select mode: a click ticks the row instead of opening it. */
  @Input() selecting = false;
  @Input() selected = false;
  @Output() open = new EventEmitter<InboxLetter>();
  /** A tick: in select mode, or ⌘/Ctrl-click and Shift-click (a range) any time. */
  @Output() select = new EventEmitter<{ letter: InboxLetter; range: boolean; }>();
  @Output() quickAction = new EventEmitter<InboxLetter>();

  onClick ( event: Event ): void {
    const mouse = event as MouseEvent;
    if ( this.selecting || mouse.metaKey || mouse.ctrlKey || mouse.shiftKey ) {
      // A shift-click would otherwise also select the text in between.
      if ( mouse.shiftKey ) window.getSelection()?.removeAllRanges();
      this.select.emit( { letter: this.letter, range: !!mouse.shiftKey } );
      return;
    }
    this.open.emit( this.letter );
  }
}
