import { MomentumThread } from '../../models/momentum-thread.model';
import { cleanMessageText } from './message-kind.util';

/**
 * Needs You, in plain words - the same rules as the server
 * (outreach/needsYou.service.js, replyText.js) and the iOS app
 * (NeedsYouPresentation.swift).
 */
export type NeedsYouKind = 'out_of_office' | 'automated' | 'interested' | 'question' | 'concern'
  | 'not_interested' | 'unsubscribe' | 'wrong_person' | 'reply';

export const NEEDS_YOU_KIND_LABELS: Record<NeedsYouKind, string> = {
  out_of_office: 'Out of office',
  automated: 'Automated email',
  interested: 'Interested',
  question: 'Asked a question',
  concern: 'Has a concern',
  not_interested: 'Not interested',
  unsubscribe: 'Asked to stop',
  wrong_person: 'Wrong person',
  reply: 'Replied'
};

/** Which tint each kind's pill uses. */
export const NEEDS_YOU_KIND_TINTS: Record<NeedsYouKind, string> = {
  out_of_office: 'yellow', automated: 'neutral', interested: 'green', question: 'blue', concern: 'yellow',
  not_interested: 'pink', unsubscribe: 'pink', wrong_person: 'violet', reply: 'green'
};

const OUT_OF_OFFICE = [
  /out of (the )?office/i,
  /\bOOO\b/,
  /\bon (annual |parental |maternity |paternity )?leave\b/i,
  /\b(away|travel+ing|on vacation|on holiday)\b.{0,80}\b(return|back|until|between|delayed)\b/i,
  /\bwill (be )?(return|back)\b.{0,60}\b(on|by|after|monday|tuesday|wednesday|thursday|friday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
  /\blimited (access to )?(email|e-mail)\b/i,
  /\bautomatic reply\b/i
];
const AUTOMATED = [
  /\b(no-?reply|do-?not-?reply|notifications?|mailer-daemon|postmaster)@/i,
  /\bthis (is an|is a|email was) (automated|automatic|auto-generated)\b/i,
  /\bplease do not reply to this (email|message)\b/i,
  /\bdelivery (status notification|has failed)\b/i,
  /\bautomated (notification|message|email)\b/i
];
const CLASSIFICATION_KINDS: Record<string, NeedsYouKind> = {
  positive: 'interested', question: 'question', timing_objection: 'concern', pricing_objection: 'concern',
  authority_objection: 'concern', fit_objection: 'concern', trust_objection: 'concern', negative: 'not_interested',
  unsubscribe: 'unsubscribe', wrong_person: 'wrong_person'
};

/** The same threads the server's Needs You returns. */
export function isNeedsYou ( thread: MomentumThread ): boolean {
  if ( !thread || ( thread as any ).archived === true ) return false;
  if ( thread.userLane === 'plan' && thread.bucket === 'needs_you' ) return true;
  return thread.signalState === 'replied' && thread.mode === 'handoff' && hasMayaReply( thread );
}

export function hasMayaReply ( thread: MomentumThread ): boolean {
  return !!String( thread.replyDraftSubject || '' ).trim() && !!String( thread.replyDraftBody || '' ).trim();
}

export function needsYouKind ( thread: MomentumThread ): NeedsYouKind {
  const text = `${ thread.latestReplyText || '' }\n${ thread.replySummary || '' }`;
  if ( OUT_OF_OFFICE.some( pattern => pattern.test( text ) ) ) return 'out_of_office';
  if ( AUTOMATED.some( pattern => pattern.test( text ) ) ) return 'automated';
  return CLASSIFICATION_KINDS[String( thread.replyClassification || '' )] || 'reply';
}

/** Nothing to answer - the natural next step is Done. */
export function needsNoAnswer ( kind: NeedsYouKind ): boolean {
  return kind === 'out_of_office' || kind === 'automated' || kind === 'unsubscribe';
}

export function readableReply ( thread: MomentumThread ): string {
  return cleanMessageText( thread.latestReplyText ) || String( thread.latestReplyText || '' ).trim();
}

/** Why this is waiting on you, and what to do - in a sentence or two. */
export function needsYouWhy ( thread: MomentumThread ): { title: string; detail: string; suggestion: string; } {
  const name = String( thread.contactName || 'They' ).trim().split( /\s+/ )[0];
  const kind = needsYouKind( thread );
  if ( kind === 'out_of_office' ) return { title: 'Out-of-office reply', detail: `${ name }'s inbox sent an automatic away message, so there's nothing to answer.`, suggestion: 'Mark it done to clear it.' };
  if ( kind === 'automated' ) return { title: 'Automated email', detail: `This came from a system, not from ${ name }, so there's nothing to answer.`, suggestion: 'Mark it done to clear it.' };
  if ( kind === 'unsubscribe' ) return { title: 'Asked to stop', detail: `${ name } asked not to be emailed again. Maya won't follow up.`, suggestion: "Mark it done once you've seen it." };
  switch ( thread.needsYouReason?.key ) {
    case 'error_blocker': return { title: 'Maya paused this conversation', detail: `Something stopped Maya from following up with ${ name }, so the next step is yours.`, suggestion: 'Read the conversation, then reply or mark it done.' };
    case 'missing_sender': return { title: 'No address to send from', detail: "Maya can't reply because this conversation has no sending email set up.", suggestion: 'Connect your inbox, or reply yourself.' };
    case 'missing_draft_body': return { title: 'The draft is empty', detail: 'Maya started a reply, but it has no message yet.', suggestion: 'Write the reply yourself.' };
    case 'approval_required': return { title: 'Waiting for your OK', detail: "Maya has a message ready and won't send it without you.", suggestion: 'Review it, then send.' };
    case 'no_safe_draft': return { title: `${ name } replied`, detail: "Maya wasn't confident enough to answer this one for you.", suggestion: 'Read what they said and write a reply.' };
  }
  return hasMayaReply( thread )
    ? { title: `${ name } replied`, detail: 'Maya drafted an answer for you to review.', suggestion: 'Check it, change anything you like, and send.' }
    : { title: `${ name } replied`, detail: 'Replies always come to you before Maya continues.', suggestion: 'Read what they said and reply.' };
}

/** Needs an answer, or something to clear (design 5a). */
export function needsAnswer ( thread: MomentumThread ): boolean {
  const kind = needsYouKind( thread );
  return !needsNoAnswer( kind ) && kind !== 'not_interested';
}

export type NeedsYouAction = 'review_maya' | 'help_write' | 'mark_done' | 'connect_inbox';

/** The main button for this person (design 5e rules). */
export function primaryAction ( thread: MomentumThread ): NeedsYouAction {
  if ( !needsAnswer( thread ) ) return 'mark_done';
  if ( thread.needsYouReason?.key === 'missing_sender' ) return 'connect_inbox';
  return hasMayaReply( thread ) ? 'review_maya' : 'help_write';
}

/** "Why it's here." in one sentence - never the internal reason labels. */
export function whyItsHere ( thread: MomentumThread ): string {
  const why = needsYouWhy( thread );
  return `${ why.title }. ${ why.detail }`;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * From an away message: when they're back and who covers meanwhile -
 * "return on Monday, October 5" and "please contact Matt Zika at ...".
 */
export function outOfOfficeDetails ( text: string, now = new Date() ): { returnDate: Date | null; alternate: string; alternateEmail: string; } {
  const value = String( text || '' );
  let returnDate: Date | null = null;
  const match = value.match( /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i );
  if ( match ) {
    const month = MONTHS.indexOf( match[1].slice( 0, 3 ).toLowerCase() );
    const year = match[3] ? Number( match[3] ) : now.getFullYear();
    returnDate = new Date( year, month, Number( match[2] ) );
    // "Oct 5" with no year, already past - next year's.
    if ( !match[3] && returnDate.getTime() < now.getTime() - 30 * 86400000 ) returnDate.setFullYear( year + 1 );
  }
  const contact = value.match( /(?:contact|reach out to|email|call)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:\s+(?:at|on|via)\s+([\w.+-]+@[\w-]+\.[\w.]+))?/ );
  return { returnDate, alternate: contact?.[1] || '', alternateEmail: contact?.[2] || '' };
}
