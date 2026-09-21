import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { AssistantBoxComponent } from './assistant-box.component';
import { OutreachAuthService } from '../../../services/outreach-auth.service';
import { OutreachAssistantPageContext, OutreachAssistantSignalService } from '../../../services/outreach-assistant-signal.service';

type GuidanceTone = 'neutral' | 'progress' | 'attention' | 'ready';

interface OutreachGuidanceCard {
  eyebrow: string;
  title: string;
  message: string;
  whyItMatters: string;
  bullets: string[];
  stageLabel: string;
  tone: GuidanceTone;
  icon: string;
  nextStage?: string;
}

/** What the template actually binds to - the tone class is precomputed here
 *  so [ngClass] can read a plain field instead of calling a method. */
type RenderedGuidanceCard = OutreachGuidanceCard & { toneClass: string };

/**
 * Outreach's launcher shell - same from-scratch equivalent of TODD's
 * todd-assistant.component.ts as web-products/network, web-products/pulse,
 * web-products/moves, and web-products/docs' launcher components. Covers
 * three pages: outreach-home, email-composer (the composer itself), and
 * signal-engine (with a sent-tab-aware card once emailSentContext is
 * embedded). The Catalyst/bulk-processor page doesn't have a card here -
 * see the assistant-box scoping decision notes for this rollout's Outreach
 * pass.
 */
@Component( {
  selector: 'app-outreach-assistant-launcher',
  standalone: true,
  imports: [CommonModule, AssistantBoxComponent],
  templateUrl: './outreach-assistant-launcher.component.html',
  styleUrls: ['./outreach-assistant-launcher.component.css'],
} )
export class OutreachAssistantLauncherComponent implements OnInit, OnDestroy {
  private readonly authService = inject( OutreachAuthService );
  private readonly assistantBus = inject( OutreachAssistantSignalService );
  private readonly router = inject( Router );
  private readonly zone = inject( NgZone );

  private readonly launcherHotzoneSize = 180;
  private readonly launcherRevealDurationMs = 2400;
  private launcherHideTimer: ReturnType<typeof setTimeout> | null = null;

  showAssistant = false;
  launcherVisible = false;
  hasUnread = false;
  pageContext: OutreachAssistantPageContext | null = null;
  isLoggedIn = false;

  userId: string | null = null;
  tenantId: string | null = null;

  private readonly subscriptions: Subscription[] = [];

  private readonly onDocumentMouseMove = ( event: MouseEvent ): void => {
    if ( this.isInBottomRightHotzone( event.clientX, event.clientY ) && !this.isOverOtherInteractiveElement( event.target ) ) {
      this.revealLauncherTemporarily();
    }
  };

  private readonly onDocumentTouchStart = ( event: TouchEvent ): void => {
    const touch = event.touches?.[0];
    if ( touch && this.isInBottomRightHotzone( touch.clientX, touch.clientY ) && !this.isOverOtherInteractiveElement( event.target ) ) {
      this.revealLauncherTemporarily();
    }
  };

  ngOnInit (): void {
    this.subscriptions.push(
      this.authService.isLoggedIn().subscribe( ( loggedIn ) => { this.isLoggedIn = loggedIn; this.refreshGuidanceCard(); } ),
      this.authService.getUserId().subscribe( ( id ) => ( this.userId = id || null ) ),
      this.authService.getTenantId().subscribe( ( id ) => ( this.tenantId = id || null ) ),
      this.assistantBus.pageContext$.subscribe( ( ctx ) => { this.pageContext = ctx; this.refreshGuidanceCard(); } ),
      this.assistantBus.unread$.subscribe( ( unread ) => ( this.hasUnread = unread ) ),
    );

    // Bound manually (rather than @HostListener) and outside Angular's zone:
    // @HostListener always runs its callback inside the zone, which means
    // zone.js schedules a full app-wide change detection pass after every
    // single mousemove/touchstart anywhere on the page, whether or not the
    // pointer is anywhere near the hotzone. Only re-enter the zone
    // (`this.zone.run`) on the rare occasion the pointer is actually in the
    // hotzone and launcherVisible needs to update.
    this.zone.runOutsideAngular( () => {
      document.addEventListener( 'mousemove', this.onDocumentMouseMove, { passive: true } );
      document.addEventListener( 'touchstart', this.onDocumentTouchStart, { passive: true } );
    } );
  }

  ngOnDestroy (): void {
    if ( this.launcherHideTimer ) clearTimeout( this.launcherHideTimer );
    this.subscriptions.forEach( ( s ) => s.unsubscribe() );
    document.removeEventListener( 'mousemove', this.onDocumentMouseMove );
    document.removeEventListener( 'touchstart', this.onDocumentTouchStart );
  }

  private isInBottomRightHotzone ( clientX: number, clientY: number ): boolean {
    return clientX >= ( window.innerWidth - this.launcherHotzoneSize )
      && clientY >= ( window.innerHeight - this.launcherHotzoneSize );
  }

  /**
   * The hotzone is a broad 180x180 proximity area, not just the pill's own
   * footprint - on narrower viewports a page's own bottom-right-anchored
   * button can fall inside it. Revealing the pill there put it, at a higher
   * z-index, physically on top of that button for the rest of the same
   * synthetic event sequence, so a click meant for the page's button could
   * land on the pill instead. Skip the reveal whenever the pointer/touch is
   * already on top of some other clickable element.
   */
  private isOverOtherInteractiveElement ( target: EventTarget | null ): boolean {
    if ( !( target instanceof Element ) ) return false;
    if ( target.closest( '.todd-assistant-root' ) ) return false;
    return !!target.closest( 'button, a, input, select, textarea, [role="button"]' );
  }

  private revealLauncherTemporarily (): void {
    this.zone.run( () => {
      this.launcherVisible = true;
      if ( this.launcherHideTimer ) clearTimeout( this.launcherHideTimer );

      if ( this.showAssistant ) return;

      this.launcherHideTimer = setTimeout( () => {
        if ( !this.showAssistant ) this.launcherVisible = false;
      }, this.launcherRevealDurationMs );
    } );
  }

  toggleAssistant (): void {
    this.showAssistant = !this.showAssistant;
    if ( this.showAssistant ) {
      this.launcherVisible = true;
      if ( this.launcherHideTimer ) clearTimeout( this.launcherHideTimer );
      this.assistantBus.clearAssistantUnread();
    }
  }

  dismissAssistant (): void {
    this.showAssistant = false;
    this.launcherVisible = false;
  }

  onAssistantNavigate ( target: { path: string; queryParams?: any; fragment?: string; } ): void {
    if ( !target?.path ) return;
    void this.router.navigate( [target.path], { queryParams: target.queryParams, fragment: target.fragment } );
  }

  guidanceCard: RenderedGuidanceCard | null = null;

  private refreshGuidanceCard (): void {
    const card = this.isLoggedIn ? this.computeGuidanceCard( this.pageContext ) : this.guestOrientationCard;
    this.guidanceCard = card ? { ...card, toneClass: `todd-activation-card--${card.tone}` } : null;
  }

  private get guestOrientationCard (): OutreachGuidanceCard {
    return {
      eyebrow: 'WHAT IS THIS PAGE',
      stageLabel: 'Overview',
      tone: 'neutral',
      icon: 'fa-solid fa-compass',
      title: 'Outreach drafts the next email for you',
      message: 'TODD writes thoughtful, individual messages and keeps every follow-up connected to the last conversation, instead of running a generic sequence. Sign in to see it work with your own data.',
      whyItMatters: "A mail-merge blast gets ignored - Outreach is what keeps every message actually relevant to the person receiving it.",
      bullets: [
        'Compose an email directly, or let TODD draft one from a description.',
        'TODD flags which sent emails deserve a follow-up right now.',
        'Ask this chat how Outreach works, or what TODD actually does.',
      ],
    };
  }

  private computeGuidanceCard ( ctx: OutreachAssistantPageContext | null ): OutreachGuidanceCard | null {
    if ( !ctx || String( ctx.feature || '' ).toLowerCase() !== 'outreach' ) return null;

    switch ( String( ctx.page || '' ).toLowerCase() ) {
      case 'outreach-home': return this.outreachHomeCard( ctx );
      case 'email-composer': return this.composerCard( ctx );
      case 'signal-engine': return this.signalEngineCard( ctx );
      default: return null;
    }
  }

  private outreachHomeCard ( ctx: OutreachAssistantPageContext ): OutreachGuidanceCard {
    const summary = ctx.summary || {};
    const momentumNeedsHumanCount = Number( summary['momentumNeedsHumanCount'] || 0 );
    const hotLeadsCount = Number( summary['hotLeadsCount'] || 0 );
    const warmLeadsCount = Number( summary['warmLeadsCount'] || 0 );
    const engagementRate = Number( summary['engagementRate'] || 0 );
    const draftedTodayCount = Number( summary['draftedTodayCount'] || 0 );

    if ( momentumNeedsHumanCount > 0 ) {
      return {
        eyebrow: 'OUTREACH',
        stageLabel: 'Needs you',
        tone: 'attention',
        icon: 'fa-solid fa-triangle-exclamation',
        title: `${momentumNeedsHumanCount} thread${momentumNeedsHumanCount === 1 ? ' needs' : 's need'} a human reply`,
        message: 'These are conversations TODD can’t safely continue alone. Open Signal Engine to review and respond.',
        whyItMatters: 'A thread waiting on a human reply is the highest-value thing to clear - the other person is actively engaged.',
        bullets: [],
        nextStage: 'Signal Engine',
      };
    }

    if ( hotLeadsCount > 0 || warmLeadsCount > 0 ) {
      return {
        eyebrow: 'OUTREACH',
        stageLabel: 'Engagement building',
        tone: 'progress',
        icon: 'fa-solid fa-hourglass-half',
        title: `${hotLeadsCount} hot, ${warmLeadsCount} warm lead${( hotLeadsCount + warmLeadsCount ) === 1 ? '' : 's'}`,
        message: 'These contacts are showing real engagement. Review Signal Engine to see who’s ready for the next message.',
        whyItMatters: 'Warm and hot leads convert fastest right after they engage - momentum fades if you wait.',
        bullets: [],
      };
    }

    return {
      eyebrow: 'OUTREACH',
      stageLabel: engagementRate >= 20 ? 'Healthy' : 'Building',
      tone: engagementRate >= 20 ? 'ready' : 'progress',
      icon: engagementRate >= 20 ? 'fa-solid fa-circle-check' : 'fa-solid fa-hourglass-half',
      title: draftedTodayCount > 0 ? `${draftedTodayCount} draft${draftedTodayCount === 1 ? '' : 's'} ready today` : 'Ready for the next email',
      message: 'Compose directly, or ask TODD to draft an email to someone specific.',
      whyItMatters: 'Consistent, individual outreach is what builds engagement over time - one well-timed email beats a batch send.',
      bullets: [],
    };
  }

  private composerCard ( ctx: OutreachAssistantPageContext ): OutreachGuidanceCard {
    const summary = ctx.summary || {};
    const hasSelectedContact = summary['hasSelectedContact'] === true;
    const hasRecipient = summary['hasRecipient'] === true;
    const hasSubject = summary['hasSubject'] === true;
    const hasHtmlBody = summary['hasHtmlBody'] === true;

    if ( !hasSelectedContact && !hasRecipient ) {
      return {
        eyebrow: 'COMPOSE EMAIL',
        stageLabel: 'Getting started',
        tone: 'attention',
        icon: 'fa-solid fa-triangle-exclamation',
        title: 'Who is this email going to?',
        message: 'Select a recipient, or tell TODD their name and it will look them up.',
        whyItMatters: 'TODD drafts around the specific recipient - their role, company, and history - not a generic template.',
        bullets: [],
      };
    }

    if ( !hasSubject || !hasHtmlBody ) {
      return {
        eyebrow: 'COMPOSE EMAIL',
        stageLabel: 'Needs a draft',
        tone: 'progress',
        icon: 'fa-solid fa-hourglass-half',
        title: 'Ready to draft',
        message: 'Tell TODD what this email should say, or ask it to write a first draft from scratch.',
        whyItMatters: 'A recipient without a message isn’t an email yet - this is the actual work of the page.',
        bullets: [],
      };
    }

    return {
      eyebrow: 'COMPOSE EMAIL',
      stageLabel: 'Ready',
      tone: 'ready',
      icon: 'fa-solid fa-circle-check',
      title: 'This draft is ready to send',
      message: 'Ask TODD to tighten, soften, or rewrite any part of it before you send.',
      whyItMatters: 'A second pass on tone and length is often what separates a reply from a delete.',
      bullets: [],
    };
  }

  private signalEngineCard ( ctx: OutreachAssistantPageContext ): OutreachGuidanceCard {
    const summary = ctx.summary || {};
    const activeLane = String( summary['activeLane'] || '' ).trim().toLowerCase();
    const draftReady = Number( summary['draftReady'] || 0 );
    const needsHuman = Number( summary['needsHuman'] || 0 );

    if ( activeLane === 'sent' ) {
      const followUpNowCount = Number( summary['followUpNowCount'] || 0 );
      const openRate = Number( summary['emailOpenRate'] || 0 );

      if ( followUpNowCount > 0 ) {
        return {
          eyebrow: 'SIGNAL ENGINE · SENT',
          stageLabel: 'Follow-ups ready',
          tone: 'attention',
          icon: 'fa-solid fa-triangle-exclamation',
          title: `${followUpNowCount} recipient${followUpNowCount === 1 ? '' : 's'} ready for follow-up`,
          message: 'Ask TODD "who should I follow up with" for the list, or "what’s working" for the top subject lines.',
          whyItMatters: 'A timely follow-up on an opened email converts far better than a cold second touch.',
          bullets: [],
        };
      }

      return {
        eyebrow: 'SIGNAL ENGINE · SENT',
        stageLabel: openRate >= 30 ? 'Healthy' : 'Building',
        tone: openRate >= 30 ? 'ready' : 'progress',
        icon: 'fa-solid fa-chart-line',
        title: `${openRate}% open rate`,
        message: 'Ask TODD "what’s working" or "who’s engaged" to dig into performance.',
        whyItMatters: 'Open rate is the earliest signal of whether subject lines and sender reputation are working.',
        bullets: [],
      };
    }

    if ( needsHuman > 0 ) {
      return {
        eyebrow: 'SIGNAL ENGINE',
        stageLabel: 'Needs you',
        tone: 'attention',
        icon: 'fa-solid fa-triangle-exclamation',
        title: `${needsHuman} thread${needsHuman === 1 ? ' needs' : 's need'} a human reply`,
        message: 'These conversations need your judgment before TODD can continue them.',
        whyItMatters: 'A stalled thread waiting on a human reply is usually the highest-value thing to clear.',
        bullets: [],
      };
    }

    if ( draftReady > 0 ) {
      return {
        eyebrow: 'SIGNAL ENGINE',
        stageLabel: 'Drafts ready',
        tone: 'progress',
        icon: 'fa-solid fa-hourglass-half',
        title: `${draftReady} draft${draftReady === 1 ? '' : 's'} waiting for review`,
        message: 'Review, edit, and approve drafts TODD has already prepared.',
        whyItMatters: 'Nothing sends until you approve it - this is the human-in-the-loop checkpoint.',
        bullets: [],
      };
    }

    return {
      eyebrow: 'SIGNAL ENGINE',
      stageLabel: 'Caught up',
      tone: 'ready',
      icon: 'fa-solid fa-circle-check',
      title: 'Nothing waiting on you right now',
      message: 'Check the Outbox, Sent, or Plan tabs, or ask TODD to compose something new.',
      whyItMatters: 'A clear queue means TODD’s doing its job - new work will land here as it comes in.',
      bullets: [],
    };
  }
}
