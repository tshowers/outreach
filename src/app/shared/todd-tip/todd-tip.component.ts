import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';


@Component( {
  selector: 'app-todd-tip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './todd-tip.component.html',
  styleUrls: ['./todd-tip.component.css']
} )
export class ToddTipComponent {
  /**
   * Font Awesome icon name (without the `fa-` prefix).
   * Example: "lightbulb", "circle-info", "triangle-exclamation".
   */
  @Input() icon: string = 'lightbulb';

  /**
   * Optional label shown above the tip text (e.g. "Tip", "Pro tip", "Heads up").
   */
  @Input() label: string = 'Tip';

  /**
   * Optional subtle variant to slightly reduce visual weight.
   */
  @Input() subtle: boolean = false;

  @Input() context: string = "";

  closed = false;

  close () {
    this.closed = true;
  }

  get iconClass (): string {
    return `fa-solid fa-${this.icon}`;
  }


}
