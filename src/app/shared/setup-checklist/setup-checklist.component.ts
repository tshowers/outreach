import { Component, ElementRef, HostListener, Input, OnChanges, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';

import { OutreachOnboardingService, OutreachStep } from '../../services/outreach-onboarding.service';
import { WriteActionDirective } from '../write-access/write-action.directive';

/** How long a loaded checklist counts as fresh when the user moves between pages. */
const REFRESH_AFTER_MS = 20_000;

/**
 * The "Setup · N of 4" pill and its "Get Outreach sending" popover
 * (design_handoff_outreach_onboarding 13). Hidden when signed out, and once
 * the required steps are done and bulk sending is on or set aside.
 */
@Component( {
  selector: 'app-setup-checklist',
  standalone: true,
  imports: [RouterLink, WriteActionDirective],
  templateUrl: './setup-checklist.component.html',
  styleUrl: './setup-checklist.component.css',
} )
export class SetupChecklistComponent implements OnChanges {
  @Input() isLoggedIn = false;

  readonly service = inject( OutreachOnboardingService );
  private readonly router = inject( Router );
  private readonly host = inject( ElementRef<HTMLElement> );

  readonly isOpen = signal( false );
  private loadedAt = 0;

  constructor () {
    this.router.events.pipe( filter( ( e ) => e instanceof NavigationEnd ) ).subscribe( () => {
      this.isOpen.set( false );
      if ( this.isLoggedIn && Date.now() - this.loadedAt > REFRESH_AFTER_MS ) void this.load();
    } );
  }

  ngOnChanges (): void {
    if ( this.isLoggedIn ) void this.load();
    else this.service.clear();
  }

  get visible (): boolean {
    return this.isLoggedIn && !!this.service.onboarding()?.showChecklist;
  }

  toggle (): void {
    const opening = !this.isOpen();
    this.isOpen.set( opening );
    if ( opening ) void this.load();
  }

  isCurrent ( step: OutreachStep ): boolean {
    return this.service.currentStepId() === step.id;
  }

  showAction ( step: OutreachStep ): boolean {
    if ( !step.available ) return false;
    if ( step.id === 'bulkSending' ) return !step.done && this.service.onboarding()?.bulkStatus === 'off';
    return !step.done || step.id === 'profile';
  }

  dismissBulk (): void {
    void this.service.dismissBulk();
  }

  @HostListener( 'document:click', ['$event'] )
  onDocumentClick ( event: MouseEvent ): void {
    if ( this.isOpen() && !this.host.nativeElement.contains( event.target as Node ) ) this.isOpen.set( false );
  }

  @HostListener( 'document:keydown.escape' )
  onEscape (): void {
    this.isOpen.set( false );
  }

  private async load (): Promise<void> {
    this.loadedAt = Date.now();
    await this.service.refresh();
  }
}
