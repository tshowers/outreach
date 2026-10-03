import { AsyncPipe, NgIf } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { filter } from 'rxjs/operators';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';

import { environment } from '../environments/environment';
import { OutreachAuthService } from './services/outreach-auth.service';
import { NeedsYouCountService } from './services/needs-you-count.service';
import { CommandPaletteComponent } from './shared/page/command-palette/command-palette.component';
import { ToastComponent } from './shared/toast/toast.component';
import { AppSidebarComponent } from './shared/app-sidebar/app-sidebar.component';
import { PlatformMenuComponent } from './shared/platform-menu/platform-menu.component';
import { OutreachAssistantLauncherComponent } from './shared/page/assistant-box/outreach-assistant-launcher.component';
import packageJson from '../../package.json';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent, CommandPaletteComponent, AppSidebarComponent, PlatformMenuComponent, OutreachAssistantLauncherComponent, AsyncPipe, NgIf],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private readonly authService = inject( OutreachAuthService );
  private readonly router = inject( Router );
  private readonly updates = inject( SwUpdate );
  private isReloadingForUpdate = false;
  private isRecoveringFromChunkError = false;
  private pendingUpdateVersion = '';
  readonly updateNoticeStorageKey = 'outreach-updated-version';
  readonly chunkRecoveryStorageKey = 'outreach-chunk-recovery-attempted';
  updateNotice = '';
  chunkRecoveryNeedsManualRefresh = false;
  readonly isAdmin$ = this.authService.getUser().pipe( map( user => user?.uid === environment.taliferroTenantId ) );
  readonly isLoggedIn$ = this.authService.isLoggedIn();
  private readonly needsYouCount = inject( NeedsYouCountService );
  readonly sidebarCounts$ = this.needsYouCount.count$.pipe( map( count => ( { '/needs-you': count } ) ) );

  title = 'outreach';

  /** The signed-in workspace pages get the laptop shell's sidebar. */
  private static readonly shellRoutes = ['/app', '/needs-you', '/signal-engine', '/inbox-access', '/compose-email', '/email-processor', '/maya-day', '/engagement', '/profile', '/get-started'];
  showShell = false;

  async signOut (): Promise<void> {
    await this.authService.signOut();
    await this.router.navigateByUrl( '/' );
  }

  ngOnInit (): void {
    this.followSystemTheme();
    void this.needsYouCount.refresh();
    this.updateShell( this.router.url );
    this.router.events.pipe( filter( event => event instanceof NavigationEnd ) ).subscribe( ( event ) => {
      this.updateShell( ( event as NavigationEnd ).urlAfterRedirects );
    } );
    this.showUpdateNoticeAfterReload();
    if ( !environment.production ) return;

    window.addEventListener( 'error', this.handleWindowError, true );
    window.addEventListener( 'unhandledrejection', this.handleUnhandledRejection );

    this.updates.versionUpdates.subscribe( event => {
      if ( event.type === 'VERSION_READY' ) {
        this.handleReadyUpdate( this.versionFromEvent( event ) || 'the latest version' );
      }
    } );

    this.router.events.pipe( filter( event => event instanceof NavigationEnd ) ).subscribe( () => {
      if ( this.pendingUpdateVersion && !this.isEditingOutreach() ) {
        const version = this.pendingUpdateVersion;
        this.pendingUpdateVersion = '';
        void this.activateAndReload( version );
      }
    } );

    void this.checkDeployedVersion();
    window.setInterval( () => void this.checkDeployedVersion(), 60_000 );
  }

  private readonly handleWindowError = ( event: ErrorEvent ): void => {
    const details = `${event.message || ''} ${event.filename || ''}`.toLowerCase();
    if ( this.isChunkLoadFailure( details ) ) void this.recoverFromChunkFailure();
  };

  private readonly handleUnhandledRejection = ( event: PromiseRejectionEvent ): void => {
    const reason = event.reason as { message?: string } | string | undefined;
    const details = typeof reason === 'string' ? reason : String( reason?.message || reason || '' );
    if ( this.isChunkLoadFailure( details.toLowerCase() ) ) void this.recoverFromChunkFailure();
  };

  private isChunkLoadFailure ( details: string ): boolean {
    return details.includes( 'failed to fetch dynamically imported module' ) ||
      details.includes( 'loading chunk' ) ||
      details.includes( 'expected a javascript module script' ) ||
      details.includes( 'mime type of "text/html"' );
  }

  private async recoverFromChunkFailure (): Promise<void> {
    if ( this.isRecoveringFromChunkError ) return;
    this.isRecoveringFromChunkError = true;

    let alreadyAttempted = false;
    try {
      alreadyAttempted = sessionStorage.getItem( this.chunkRecoveryStorageKey ) === '1';
      if ( !alreadyAttempted ) sessionStorage.setItem( this.chunkRecoveryStorageKey, '1' );
    } catch { }

    if ( alreadyAttempted ) {
      this.updateNotice = 'Outreach needs a refresh to finish loading.';
      this.chunkRecoveryNeedsManualRefresh = true;
      this.isRecoveringFromChunkError = false;
      return;
    }

    this.updateNotice = 'Outreach was updated. Refreshing now…';
    try {
      if ( this.updates.isEnabled ) {
        await this.updates.checkForUpdate();
        await this.updates.activateUpdate();
      }
    } catch ( error ) {
      console.warn( '[OutreachChunkRecovery] service worker refresh failed; reloading anyway', error );
    }
    window.location.reload();
  }

  refreshAfterChunkError (): void {
    try { sessionStorage.removeItem( this.chunkRecoveryStorageKey ); } catch { }
    window.location.reload();
  }

  dismissUpdateNotice (): void {
    this.updateNotice = '';
  }

  private showUpdateNoticeAfterReload (): void {
    try {
      const updatedVersion = localStorage.getItem( this.updateNoticeStorageKey );
      if ( !updatedVersion ) return;
      localStorage.removeItem( this.updateNoticeStorageKey );
      this.updateNotice = `Outreach has been updated to ${updatedVersion}.`;
    } catch { }
  }

  private async checkDeployedVersion (): Promise<void> {
    try {
      const response = await fetch( `/assets/version.json?t=${Date.now()}`, { cache: 'no-store' } );
      if ( !response.ok ) return;
      const payload = await response.json() as { version?: string };
      const deployedVersion = String( payload.version || '' ).trim();
      const currentVersion = String( packageJson.version || '' ).trim();
      if ( deployedVersion && currentVersion && deployedVersion !== currentVersion ) {
        if ( this.isEditingOutreach() ) {
          this.pendingUpdateVersion = deployedVersion;
          this.updateNotice = `Outreach has been updated to ${deployedVersion}. It will refresh when you leave this screen.`;
          return;
        }
        await this.activateAndReload( deployedVersion );
      }
    } catch ( error ) {
      console.warn( '[OutreachVersionCheck] unable to check deployed version', error );
    }
  }

  private handleReadyUpdate ( version: string ): void {
    if ( this.isEditingOutreach() ) {
      this.pendingUpdateVersion = version;
      this.updateNotice = `Outreach has been updated to ${version}. It will refresh when you leave this screen.`;
      return;
    }
    void this.activateAndReload( version );
  }

  private isEditingOutreach (): boolean {
    const route = this.router.url.split( '?' )[0];
    return ['/compose-email', '/email-processor', '/signal-engine', '/inbox-access'].includes( route );
  }

  private async activateAndReload ( version: string ): Promise<void> {
    if ( this.isReloadingForUpdate ) return;
    this.isReloadingForUpdate = true;
    try {
      localStorage.setItem( this.updateNoticeStorageKey, version );
    } catch { }

    if ( this.updates.isEnabled ) {
      try {
        await this.updates.checkForUpdate();
        await this.updates.activateUpdate();
      } catch ( error ) {
        console.warn( '[OutreachVersionCheck] service worker activation failed; reloading anyway', error );
      }
    }

    window.location.reload();
  }

  private versionFromEvent ( event: VersionReadyEvent ): string {
    const appData = event.latestVersion.appData as { version?: string } | undefined;
    return String( appData?.version || '' ).trim();
  }

  private updateShell ( url: string ): void {
    const path = url.split( /[?#]/ )[0];
    this.showShell = AppComponent.shellRoutes.some( route => path === route || path.startsWith( `${ route }/` ) );
  }

  /**
   * The theme follows the system (design_handoff_outreach drops the
   * Light/Dark toggle). Components style dark mode off html.dark, so the
   * class tracks prefers-color-scheme, live.
   */
  private followSystemTheme (): void {
    const query = window.matchMedia( '(prefers-color-scheme: dark)' );
    const apply = () => document.documentElement.classList.toggle( 'dark', query.matches );
    apply();
    query.addEventListener( 'change', apply );
    localStorage.removeItem( 'outreach-theme' );
  }
}
