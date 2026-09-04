import { PageAction } from '../../models/page-actions.models';

/**
 * Trimmed stand-in for shared/utils/page-action-presets.ts's
 * buildOutreachPageActions(), which normally assembles a curated list of
 * PageAction entries (Compose, Signal Engine, Contacts, etc.) for TODD's
 * shared header/toolbar. That toolbar doesn't exist in this standalone
 * app - OutreachPageActionsService.setPageActions() is a no-op stub, same
 * as Network's precedent - so the actual PageAction contents this
 * function used to build are never rendered. Kept as a same-shaped
 * function (rather than deleting every call site) so a real contextual
 * action bar can plug in here later without hunting down callers again.
 */
export function buildOutreachPageActions ( _options: { includeCatalyst?: boolean; extraActions?: PageAction[]; } = {} ): PageAction[] {
  return [];
}
