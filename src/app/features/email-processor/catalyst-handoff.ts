export const CATALYST_HANDOFF_SOURCE = 'blocked_handoff';
export const CATALYST_HANDOFF_QUERY_PARAM = 'handoff';
export const CATALYST_HANDOFF_SOURCE_PARAM = 'source';
const CATALYST_HANDOFF_STORAGE_PREFIX = 'catalystHandoff:';

export type CatalystHandoffSourceContext =
  | 'overview_blocker'
  | 'needs_you_reason'
  | 'needs_you_thread';

export interface CatalystHandoffPayload {
  source: typeof CATALYST_HANDOFF_SOURCE;
  handoffKey: string;
  launchedAt: string;
  contactIds: string[];
  threadIds?: string[];
  launchLabel?: string;
  reasonLabel?: string;
  reasonDetail?: string;
  sourceContext?: CatalystHandoffSourceContext;
  selectedCount?: number;
  eligibleCount?: number;
  excludedCount?: number;
}

export interface CatalystHandoffRouteState {
  catalystHandoff?: CatalystHandoffPayload | null;
}

export function createCatalystHandoffKey (): string {
  return `handoff-${Date.now()}-${Math.random().toString( 36 ).slice( 2, 10 )}`;
}

export function getCatalystHandoffStorageKey ( handoffKey: string ): string {
  return `${CATALYST_HANDOFF_STORAGE_PREFIX}${String( handoffKey || '' ).trim()}`;
}
