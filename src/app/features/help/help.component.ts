import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface HelpStep {
  number: string;
  title: string;
  copy: string;
  details: string[];
  route: string;
  action: string;
}

interface HelpCard {
  icon: string;
  title: string;
  copy: string;
}

interface FirstStep {
  title: string;
  copy: string;
  route?: string;
  href?: string;
  action: string;
}

interface LoopStage {
  label: string;
  where: string;
  copy: string;
}

interface GlossaryTerm {
  term: string;
  aka?: string;
  copy: string;
}

interface HelpFaq {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './help.component.html',
  styleUrl: './help.component.css',
})
export class HelpComponent {
  readonly whyCards: HelpCard[] = [
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

  readonly firstSteps: FirstStep[] = [
    {
      title: 'Look around first (optional)',
      copy: 'You can open Growth without an account. You will see a preview with live values turned off, so you can get a feel for the workspace before connecting anything.',
      route: '/app',
      action: 'Preview Growth',
    },
    {
      title: 'Sign in',
      copy: 'Signing in connects Outreach to your own workspace. Nothing uses your real data until you do.',
      route: '/login',
      action: 'Sign in',
    },
    {
      title: 'Connect your mailbox',
      copy: 'In Inbox, connect the email account you use with clients and contacts. For Gmail, use "Connect with Google" so your password stays with Google. Then run a sync.',
      route: '/inbox-access',
      action: 'Connect a mailbox',
    },
    {
      title: 'Make sure your contacts are there',
      copy: 'Outreach needs people to follow up with. If Catalyst looks empty, add or import contacts in Network (in the apps menu).',
      href: 'https://network.taliferro.tech',
      action: 'Open Network',
    },
    {
      title: 'Review your first drafts',
      copy: 'Open Catalyst to see who has gone quiet, then go to Outbox to approve, edit, or reject what Maya drafted. That is the core habit: a few minutes of review each day.',
      route: '/signal-engine',
      action: 'Open Outbox',
    },
  ];

  readonly loop: LoopStage[] = [
    { label: 'Notice', where: 'Catalyst', copy: 'Finds contacts you have not talked to in a while.' },
    { label: 'Draft', where: 'Maya', copy: 'Writes a follow-up that fits the relationship and the signal.' },
    { label: 'Decide', where: 'Outbox', copy: 'You approve, edit, rewrite, or discard each draft.' },
    { label: 'Send & reply', where: 'Inbox', copy: 'Messages go out from your own mailbox and replies land back here.' },
    { label: 'Learn', where: 'Engagement & Growth', copy: 'Clicks, replies, and silence show who is leaning in, which shapes the next move.' },
  ];

  readonly glossary: GlossaryTerm[] = [
    { term: 'TODD', copy: 'Your built-in assistant. Ask it about a contact, an email, or the page you are on.' },
    { term: 'Maya', copy: 'The AI “marketing director” that drafts outreach messages for you to review.' },
    { term: 'Growth', copy: 'Your home screen: overall outreach health and where to act next.' },
    { term: 'Inbox', aka: 'Inbox Access', copy: 'Where you connect mailboxes, sync messages, and reply.' },
    { term: 'Outbox', aka: 'Signal Engine', copy: 'Where drafts wait for your review, plus what is queued and what has been sent.' },
    { term: 'Catalyst', aka: 'Email Processor', copy: 'A queue of contacts that have gone quiet, oldest first.' },
    { term: 'Email Composer', copy: 'A focused editor for writing or polishing a single message.' },
    { term: 'Engagement', aka: 'Ad Engagement', copy: 'Clicks and engagement activity from your outreach.' },
  ];

  readonly steps: HelpStep[] = [
    {
      number: '01',
      title: 'Check Growth for what needs you',
      copy: 'Growth is your Outreach home screen. It brings campaign momentum, follow-ups that need attention, and conversation health into one place so you can see where to act next.',
      details: [
        'Read the health meters for a quick sense of how your outreach is doing overall.',
        'The diagnosis board points out problems (for example, low replies or stalled follow-ups) and suggests what to do about them.',
        'Use the shortcuts to jump into Inbox, Outbox, Catalyst, or Email Composer.',
        'TODD highlights relationships that are quiet, engaged, or ready for a follow-up.',
      ],
      route: '/app',
      action: 'Open Growth',
    },
    {
      number: '02',
      title: 'Connect and use your Inbox',
      copy: 'Inbox keeps your mailbox connection, synced messages, and direct replies in the same Outreach workspace.',
      details: [
        'Open Inbox settings to connect a mailbox, test the connection, and choose a primary inbox.',
        'For Gmail, use Connect with Google so your Google password stays with Google.',
        'Sync the mailbox to pull in the latest messages.',
        'Open a message to read the conversation and prepare a reply.',
        'Reply directly from the connected mailbox, or open a draft in Outbox when it needs more review.',
      ],
      route: '/inbox-access',
      action: 'Open Inbox',
    },
    {
      number: '03',
      title: 'Review drafts in Outbox',
      copy: 'Outbox sits between a drafted message and delivery. It shows what Maya drafted, what needs your decision, and what has already gone out.',
      details: [
        'Open Drafts and select the messages you want to work on.',
        'Approve a draft to queue it for delivery, or open it in Email Composer to edit it first.',
        'Reject it to have Maya try a different angle, or discard it if it should not go out.',
        'Send yourself a test to check how a draft reads before it goes out.',
        'Use Sent to confirm what has gone out and Plan to see what Maya is working on next.',
      ],
      route: '/signal-engine',
      action: 'Open Outbox',
    },
    {
      number: '04',
      title: 'Work the Catalyst queue',
      copy: 'Catalyst finds people you have not contacted recently so you can reconnect before those relationships quietly go cold.',
      details: [
        'Start at the top of the queue, where the follow-up gaps are longest.',
        'Change the batch size to work through a smaller or larger group at a time.',
        'Check each contact and their context before letting processing continue.',
        'When you are ready to reach out, continue to the email step.',
        'If the queue is empty, add or import contacts in Network.',
      ],
      route: '/email-processor',
      action: 'Open Catalyst',
    },
    {
      number: '05',
      title: 'Write and improve an email',
      copy: 'Email Composer gives you a focused place to write, revise, and send one message, with the recipient and their context alongside.',
      details: [
        'Open the composer from a draft or from anywhere in Outreach.',
        'Check the recipient, subject, and message before sending.',
        'Ask TODD to help with tone, clarity, length, or a follow-up angle.',
        'Use the composer when a draft needs your editing before it goes back to Outbox.',
        'Sending needs an approved sending address. If the page asks, request approval.',
      ],
      route: '/compose-email',
      action: 'Open Email Composer',
    },
    {
      number: '06',
      title: 'Read engagement signals',
      copy: 'Engagement turns clicks and other activity into a clearer view of who is leaning in and where your outreach is building momentum.',
      details: [
        'Use the Clicks view to see which messages and links got attention.',
        'Switch to Engagement for the broader picture.',
        'Compare time periods and look for patterns worth following up on.',
        'Treat signals as context for what to say next, not as a replacement for the conversation.',
      ],
      route: '/engagement',
      action: 'Open Engagement',
    },
  ];

  readonly faqs: HelpFaq[] = [
    {
      question: 'Does Outreach replace Gmail or Outlook?',
      answer: 'No. You keep your email provider. Outreach connects to your mailbox and works as the follow-up layer on top: deciding who to contact, drafting the message, and tracking what happens next.',
    },
    {
      question: 'Will it send emails without me?',
      answer: 'Drafts wait in Outbox for your review, and you can approve, edit, rewrite, or discard each one. Automatic sending is limited by a daily cap and a warm-up period, so your mailbox is never flooded.',
    },
    {
      question: 'Can I try it before signing in?',
      answer: 'Yes. Growth and the other workspaces open in preview mode for guests, with live values turned off. Sign in and connect a mailbox to work with your own contacts and messages.',
    },
    {
      question: 'Do I need a paid plan?',
      answer: 'You can look around and connect your workspace first. Ongoing outreach sending needs an active plan and an approved sending address. See Pricing for current plans.',
    },
    {
      question: 'How is this different from a CRM?',
      answer: 'A CRM stores relationships and waits for you to act. Outreach watches those relationships, tells you when one needs attention, and drafts the follow-up, so the next step is already started.',
    },
  ];

  // Plain "#id" hrefs resolve against <base href="/"> and would navigate to the
  // landing page, so scroll in place instead.
  jumpTo ( event: Event, id: string ): void {
    event.preventDefault();
    const reduceMotion = window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
    document.getElementById( id )?.scrollIntoView( { behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' } );
  }
}
