import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterModule } from '@angular/router';
import { SiteFooterComponent } from '../../shared/site-footer/site-footer.component';

@Component( {
  selector: 'app-outreach-ios-showcase',
  standalone: true,
  imports: [CommonModule, RouterModule, SiteFooterComponent],
  templateUrl: './app-showcase.component.html',
  styleUrl: './app-showcase.component.css'
} )
export class AppShowcaseComponent implements OnInit {
  private readonly title = inject( Title );
  private readonly meta = inject( Meta );

  readonly highlights = [
    { heading: 'Start the right follow-up from anywhere', copy: 'Capture a campaign idea or next touch while the reason to reach out is still fresh.' },
    { heading: 'Keep every contact in the sequence', copy: 'See who opened, clicked, replied, or went quiet so the next step is based on what actually happened.' },
    { heading: 'Move a conversation forward from your phone', copy: 'Outreach keeps campaign context and decision paths close, even when you are away from your desk.' }
  ];

  /** Search engines read these from the prerendered HTML. */
  ngOnInit (): void {
    const title = 'Outreach for iOS: follow up from your iPhone';
    const description = 'Outreach for iPhone and iPad: capture the next touch while it is fresh, see who opened, clicked or went quiet, and move each conversation forward from anywhere.';
    this.title.setTitle( title );
    this.meta.updateTag( { name: 'description', content: description } );
    this.meta.updateTag( { property: 'og:title', content: title } );
    this.meta.updateTag( { property: 'og:description', content: description } );
  }
}
