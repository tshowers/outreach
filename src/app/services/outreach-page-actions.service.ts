import { Injectable } from '@angular/core';
import { PageActionsConfig } from '../models/page-actions.models';

/**
 * No-op stand-in for TODD's PageActionsService. The real one feeds a
 * shared header/toolbar's contextual action buttons across TODD's whole
 * app shell (and pulls in NavConfigService, TODD-wide nav chrome this app
 * doesn't have). Kept as a same-shaped no-op so ported components' call
 * sites don't need to be hunted down and removed - if Network ever gets
 * its own contextual action bar, this is where to build it.
 */
@Injectable( { providedIn: 'root' } )
export class OutreachPageActionsService {
  setPageActions ( _config: PageActionsConfig ): void { }
  clearPageActions ( _pageId: string ): void { }
}
