/** Where an Activity item (a push Maya sent) leads, so each row can be acted on. */
export interface ActivityAction {
  label: string;
  route?: string;
  queryParams?: Record<string, string>;
  /** External link, opened in a new tab. */
  href?: string;
}

/** Moves holds Maya's open tasks; the planner stops at 10 (mayaCreationGuard.service.js). */
export const MOVES_TASKS_URL = 'https://moves.16ahead.com/app';

/** True when Maya's start failed on her open-task limit - closing Moves clears it. */
export function isMovesLimitReason ( text: string | undefined ): boolean {
  return /\bMoves\b/.test( String( text || '' ) );
}

export function activityAction ( item: { category: string; title: string; body: string; } ): ActivityAction | null {
  switch ( item.category ) {
    case 'maya':
      return isMovesLimitReason( item.body ) ? { label: 'Open Moves', href: MOVES_TASKS_URL } : null;
    case 'replies':
      return { label: 'Open Needs you', route: '/needs-you' };
    case 'mailbox':
      return { label: 'Check your inbox connection', route: '/inbox-access' };
    case 'catalyst':
      return { label: 'Open Catalyst', route: '/email-processor' };
    case 'sending_approved':
      return { label: 'Open Outbox', route: '/outbox' };
    default:
      return null;
  }
}
