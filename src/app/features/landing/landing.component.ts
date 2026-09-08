import { CommonModule } from '@angular/common';
import { AfterViewInit, Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SiteFooterComponent } from '../../shared/site-footer/site-footer.component';

@Component( {
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule, SiteFooterComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.css'
} )
export class LandingComponent implements AfterViewInit {
  readonly metrics = [
    { value: '3×', label: 'more follow-up clarity', detail: 'One view for the message, the signal, and the next step.' },
    { value: '24/7', label: 'signal awareness', detail: 'Know what changed while you were away from your desk.' },
    { value: '1', label: 'focused workspace', detail: 'Campaign context stays connected from first send to reply.' },
    { value: '0', label: 'guesswork moments', detail: 'Let real engagement shape what happens next.' }
  ];
  readonly outcomes = [
    [ 'Before the send', 'Know if the angle will land before it lands wrong.', 'TODD evaluates audience fit, clarity, offer strength, urgency, friction, and campaign usefulness before launch.' ],
    [ 'During the build', 'Plan the full follow-up path before step one goes out.', 'Multi-step sequences, delays, and conditional routing are ready before the first email.' ],
    [ 'After the send', 'Silence, opens, and clicks trigger different next moves.', 'Signal Engine watches what each contact actually did and routes the next follow-up.' ],
    [ 'Across the campaign', 'One cockpit for momentum, telemetry, and attention.', 'See campaign health, contact progress, and the next draft in one focused view.' ]
  ];

  readonly faqs = [
    { question: 'What does Outreach evaluate before a campaign starts?', answer: 'TODD evaluates audience fit, clarity, offer strength, urgency, friction, and overall campaign usefulness before you launch.' },
    { question: 'Can sequences respond to what contacts do?', answer: 'Yes. Opens, clicks, replies, and silence can route different next steps so follow-up matches the signal.' },
    { question: 'Does Outreach replace my email provider?', answer: 'Outreach is the campaign and follow-up layer. It helps you plan, route, and monitor the conversation while connecting campaign context to the rest of TODD.' },
    { question: 'Who is Outreach for?', answer: 'Outreach is for teams and operators who need consistent, thoughtful follow-up without manually watching every contact and campaign.' }
  ];

  ngAfterViewInit (): void { window.scrollTo( 0, 0 ); }
}
