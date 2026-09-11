import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { map } from 'rxjs';

import { environment } from '../environments/environment';
import { OutreachAuthService } from './services/outreach-auth.service';
import { CommandPaletteComponent } from './shared/page/command-palette/command-palette.component';
import { ToastComponent } from './shared/toast/toast.component';
import { ThemeToggleComponent } from './shared/theme-toggle/theme-toggle.component';
import { PlatformMenuComponent } from './shared/platform-menu/platform-menu.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent, CommandPaletteComponent, ThemeToggleComponent, PlatformMenuComponent, AsyncPipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private readonly authService = inject( OutreachAuthService );
  readonly isAdmin$ = this.authService.getUser().pipe( map( user => user?.uid === environment.taliferroTenantId ) );

  title = 'outreach';
}
