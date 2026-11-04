import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Person, Who, initialsOf, nameOf } from './missions.model';

/**
 * Who holds a step (design 0a, OwnerToken). Shape carries identity so it
 * reads in grayscale and for colorblind people: the assistants are their 16Ahead dials,
 * you a solid circle, teammates an outlined circle, someone
 * who left a dashed one. Synced from taliferro-ui/missions.
 */
@Component( {
  selector: 'tm-owner-token',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="token" [class]="kind()" [style.width.px]="size()" [style.height.px]="size()" [attr.title]="name()" [attr.aria-label]="name()" role="img">
      @switch (kind()) {
        <!-- The 16Ahead dials for the two assistants, light and dark (Ty, 2026-11-03: the old TODD and Maya pictures were wrong). -->
        @case ('todd') { <img class="brand-mark--light" src="/assets/brand/products/svg/light/02-general-assistant.svg" alt=""><img class="brand-mark--dark" src="/assets/brand/products/svg/dark/02-general-assistant.svg" alt=""> }
        @case ('maya') { <img class="brand-mark--light" src="/assets/brand/products/svg/light/03-marketing-assistant.svg" alt=""><img class="brand-mark--dark" src="/assets/brand/products/svg/dark/03-marketing-assistant.svg" alt=""> }
        @case ('you') { <span class="txt" [style.font-size.px]="size() * 0.34">You</span> }
        @case ('branch') { <span class="txt" [style.font-size.px]="size() * 0.38">if</span> }
        @default { <span class="txt" [style.font-size.px]="size() * 0.38">{{ initials() }}</span> }
      }
    </span>
    @if (label()) { <span class="label" [class.left]="kind() === 'left'">{{ name() }}</span> }
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 8px; flex: none; }
    .token { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; flex: none; overflow: hidden; border-radius: 50%; }
    .token img { width: 100%; height: 100%; display: block; }
    .todd, .maya { background: transparent; }
    .todd img, .maya img { object-fit: contain; }
    .you { background: var(--text); color: var(--bg); }
    .team { background: var(--bg); color: var(--text); border: 2px solid var(--c-team); }
    .left { background: var(--surface2); color: var(--muted); border: 2px dashed var(--muted); }
    .branch { background: var(--surface2); color: var(--muted); }
    .txt { font-weight: 700; line-height: 1; letter-spacing: -0.02em; }
    .label { font-size: 14px; font-weight: 700; }
    .label.left { text-decoration: line-through; color: var(--muted); }
  `],
  host: { '[style.--sz]': 'size() + "px"' },
} )
export class OwnerTokenComponent {
  readonly who = input.required<Who | 'branch'>();
  readonly size = input( 28 );
  readonly label = input( false );
  readonly people = input<Record<string, Person>>( {} );

  readonly kind = computed( () => {
    const who = this.who();
    if ( who === 'todd' || who === 'maya' || who === 'you' || who === 'branch' ) return who;
    return this.people()[who] && this.people()[who].left ? 'left' : 'team';
  } );
  readonly name = computed( () => ( this.who() === 'branch' ? 'Depends' : nameOf( this.who(), this.people() ) ) );
  readonly initials = computed( () => initialsOf( this.who(), this.people() ) );
}
