import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-site-footer',
  standalone: true,
  templateUrl: './site-footer.component.html',
  styleUrl: './site-footer.component.css'
})
export class SiteFooterComponent implements OnInit {
  version = '0.0.1';

  async ngOnInit(): Promise<void> {
    try {
      const response = await fetch('assets/version.json', { cache: 'no-store' });
      if (response.ok) {
        const payload = await response.json() as { version?: string };
        if (payload.version) this.version = payload.version;
      }
    } catch {
      // Keep the package-version fallback visible if the build asset is unavailable.
    }
  }
}
