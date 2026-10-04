import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProductPagesComponent } from '../../shared/product-pages/product-pages.component';

interface AboutCard {
  icon: string;
  title: string;
  copy: string;
}

interface LoopStage {
  label: string;
  where: string;
  copy: string;
}

/**
 * About Outreach: the shared About template, then Outreach's own story below
 * it (who it's for, how the pieces fit, where it runs, who makes it). It's
 * prerendered for search engines, so it says the whole thing in plain text.
 */
@Component( {
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterLink, ProductPagesComponent],
  templateUrl: './about.component.html',
  // The same "Outreach guide" styles as Help.
  styleUrl: '../help/help.component.css',
} )
export class AboutComponent {
  readonly whyCards: AboutCard[] = [
    {
      icon: 'fa-user-group',
      title: 'Who it is for',
      copy: 'Founders, consultants, small teams, and operators whose business runs on relationships and email, but who do not have time to watch every contact and remember every follow-up.',
    },
    {
      icon: 'fa-compass',
      title: 'Why it is different',
      copy: 'Most email tools help you send. Outreach helps you decide who to contact, when, and why. It reads the signals (replies, clicks, silence), drafts the next message for you, and keeps you in charge of what goes out.',
    },
    {
      icon: 'fa-chart-line',
      title: 'What you get',
      copy: 'Fewer relationships that quietly go cold, less time digging through your inbox, and a clear list of who needs you today, with a drafted message ready to review.',
    },
  ];

  readonly loop: LoopStage[] = [
    { label: 'Notice', where: 'Catalyst', copy: 'Finds contacts you have not talked to in a while.' },
    { label: 'Draft', where: 'Maya', copy: 'Writes a follow-up that fits the relationship and the signal.' },
    { label: 'Decide', where: 'Needs you', copy: 'You approve, edit, rewrite, or discard each draft.' },
    { label: 'Send & reply', where: 'Inbox', copy: 'Messages go out from your own mailbox and replies land back here.' },
    { label: 'Learn', where: 'Engagement & Growth', copy: 'Clicks, replies, and silence show who is leaning in, which shapes the next move.' },
  ];
}
