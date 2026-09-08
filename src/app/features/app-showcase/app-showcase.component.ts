import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SiteFooterComponent } from '../../shared/site-footer/site-footer.component';

@Component( {
  selector: 'app-outreach-ios-showcase',
  standalone: true,
  imports: [CommonModule, RouterModule, SiteFooterComponent],
  templateUrl: './app-showcase.component.html',
  styleUrl: './app-showcase.component.css'
} )
export class AppShowcaseComponent {
  readonly highlights = [
    { heading: 'Start the right follow-up from anywhere', copy: 'Capture a campaign idea or next touch while the reason to reach out is still fresh.' },
    { heading: 'Keep every contact in the sequence', copy: 'See who opened, clicked, replied, or went quiet so the next step is based on what actually happened.' },
    { heading: 'Move a conversation forward from your phone', copy: 'Outreach keeps campaign context and decision paths close, even when you are away from your desk.' }
  ];
}
