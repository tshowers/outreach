import { environment } from '../../../environments/environment';

/**
 * Local development only: `?designPreview=1` opens a signed-in page signed
 * out (see auth.guard.ts), and the pages that support it fill themselves
 * with these samples so their layout can be checked without an account.
 * Always false in production builds.
 */
export function isDesignPreview (): boolean {
  return !environment.production
    && typeof window !== 'undefined'
    && new URLSearchParams( window.location.search ).get( 'designPreview' ) === '1';
}

const daysAgo = ( days: number ) => new Date( Date.now() - days * 86400000 ).toISOString();

export const DESIGN_PREVIEW_CONTACTS = [
  ['Bob', 'Polmatier', 'Polmatier Consulting', 9],
  ['Bruce', 'Cheatham III', 'Cheatham & Co.', 9],
  ['Charlotte', 'Marshall', 'TKG & Associates LLC', 9],
  ['Doug', 'Bryan', 'Idaho Tower Construction', 8],
  ['Elizabeth', 'Miller', 'Minto Island Growers', 8],
  ['Jamie', 'Halimi', 'Desco Tools Co', 34],
  ['Michael', 'Barron', 'Sentri Roofing', 41]
].flatMap( ( [first, last, company, days], index ) => Array.from( { length: 72 }, ( _, copy ) => ( {
  id: `preview-${ index }-${ copy }`,
  firstName: first,
  lastName: last,
  company: { name: company },
  emailAddresses: [{ emailAddress: `${ String( first ).toLowerCase() }${ copy }@example.com`, blocked: false }],
  lastContacted: daysAgo( Number( days ) )
} ) ) );

export const DESIGN_PREVIEW_RUNS = [
  { id: 'r1', name: 'Stale Contacts · Sep 28', status: 'completed', sentCount: 985, openRate: 0.49, clickRate: 0.24, startedAt: '2026-09-28T20:01:09Z', completedAt: '2026-09-28T20:08:27Z' },
  { id: 'r2', name: 'Stale Contacts · Sep 28', status: 'completed', sentCount: 25, openRate: 0.56, clickRate: 0.16, startedAt: '2026-09-28T19:59:48Z', completedAt: '2026-09-28T20:00:10Z' },
  { id: 'r3', name: 'Stale Contacts · Sep 28', status: 'active', sentCount: 0, openRate: 0, clickRate: 0, startedAt: '2026-09-28T19:55:52Z' },
  { id: 'r4', name: 'Stale Contacts · Sep 25', status: 'completed', sentCount: 312, openRate: 0.41, clickRate: 0.12, startedAt: '2026-09-25T21:22:00Z', completedAt: '2026-09-25T21:31:00Z' }
];

const draft = ( contactId: string, contactName: string, companyName: string, subject: string, body: string, kind: 'reply' | 'outbound', hoursAgo: number, rationale = '' ) => ( {
  id: contactId,
  contactId,
  contactName,
  companyName,
  emailAddress: `${ contactName.split( ' ' )[0].toLowerCase() }@example.com`,
  userLane: 'drafts',
  bucket: 'drafting',
  ...( kind === 'reply'
    ? { replyDraftSubject: subject, replyDraftBody: body, replyDraftRationale: rationale, signalState: 'replied' }
    : { draftSubject: subject, draftBody: body, draftRationale: rationale } ),
  lastUpdated: new Date( Date.now() - hoursAgo * 3600000 ).toISOString()
} );

export const DESIGN_PREVIEW_DRAFT_THREADS = [
  draft( 'cm', 'Charlotte Marshall', 'TKG & Associates LLC', 'How do you manage project momentum?', '<p>It\'s interesting how many projects stall because the right follow-up isn\'t in place.</p>', 'outbound', 8 ),
  draft( 'uc', 'Utilio Candelara', 'Labor Local 332', 'How construction workers stay engaged', '<p>When construction workers feel disconnected, it can lead to delays and inefficiencies on projects. This is especially crucial in a labor union environment where advocacy and service are key to maintaining morale and productivity.</p><p>It might be worth exploring how effective communication and engagement strategies can enhance worker involvement and project outcomes. Would you be open to a brief conversation to discuss this further?</p><p>Ty Showers<br>Taliferro Tech</p>', 'reply', 8, 'Addresses worker engagement in construction and suggests a conversation about communication strategies that could benefit the recipient\'s labor union.' ),
  draft( 'df', 'David Fouche', 'J2 Solutions', 'The challenge of project momentum', '<p>Project management often reveals a hidden struggle: while teams plan and execute tasks, momentum slips.</p>', 'outbound', 9 ),
  draft( 'em', 'Elizabeth Miller', 'Minto Island Growers', 'Finding clarity in outreach', '<p>It\'s interesting how many outreach efforts stall due to unclear next steps.</p>', 'outbound', 9 ),
  draft( 'tw', 'Terry Wharton', 'Transformacon, Inc.', 'The challenge of tech transformation', '<p>Transforming technology can often lead to unexpected complexities that slow progress.</p>', 'outbound', 10 )
];

export const DESIGN_PREVIEW_MAILBOX = {
  id: 'preview', emailAddress: 'ty.showers@taliferro.tech', providerLabel: 'Other IMAP', isPrimary: true,
  lastSyncAt: new Date( Date.now() - 8 * 60000 ).toISOString(), lastSyncStatus: 'completed', status: 'connected'
};

const inboxMessage = ( id: string, fromName: string, fromEmail: string, subject: string, preview: string, signalSummary: string, hoursAgo: number, unread = true, recommendedAction = '' ) => ( {
  id, mailboxId: 'preview', fromName, fromEmail, subject, preview, text: preview, signalSummary, recommendedAction, unread,
  receivedAt: new Date( Date.now() - hoursAgo * 3600000 ).toISOString()
} );

export const DESIGN_PREVIEW_MESSAGES = [
  inboxMessage( '1', 'Robert Leung', 'rleung@rosendin.com', 'Automatic reply: Which do you think is better Finding or Searching?', 'I am currently out of the office and will return on Monday, October 5, 2026. If any immediate needs, please contact Matt Zika at mzika@rosendin.com.', 'Robert Leung is out of the office until October 5, 2026, and has provided an alternate contact for immediate needs.', 13, true, 'pause' ),
  inboxMessage( '2', 'LinkedIn', 'news@linkedin.com', 'Get ready for your LinkedIn Ads Consultation', 'Your consultation is coming up.', 'Marketing email', 26 ),
  inboxMessage( '3', 'Theodore Freeman', 'tgfreeman@thedcvoice.com', "Fw: Meeting assets for The DC Voice's Zoom Meeting are ready!", '________________________________ From: Zoom <no-reply@zoom.us> Sent: Thursday', 'Forwarded Zoom recording and transcript', 30 ),
  inboxMessage( '4', 'Mail Delivery Subsystem', 'mailer-daemon@googlemail.com', 'Delivery Status Notification (Failure)', 'Address not found', 'jake@ may not exist', 72, false ),
  inboxMessage( '5', 'Dana Lee', 'dana@leeco.com', 'Re: Which do you think is better, Finding or Searching?', 'Thursday works for me.', 'Wants to meet Thursday', 96 ),
  inboxMessage( '6', 'Glenn Torrez', 'gtorrez@example.com', 'Automatic reply: We have been brainwashed into searching', 'This email address is no longer active. Please call the office at 760.929.9700.', 'Address no longer active, office 760.929.9700', 98 )
];

const needsYou = ( contactId: string, contactName: string, companyName: string, latestReplyText: string, replySummary: string, key: string, hoursAgo: number, extra: Record<string, unknown> = {} ) => ( {
  id: contactId, contactId, contactName, companyName, emailAddress: `${ contactName.split( ' ' )[0].toLowerCase() }@example.com`,
  userLane: 'plan', bucket: 'needs_you', signalState: 'replied', mode: 'handoff', lastSubject: 'Which do you think is better, Finding or Searching?',
  latestReplyText, replySummary, needsYouReason: { key, label: '', reason: '', nextMove: '' },
  latestReplyAt: new Date( Date.now() - hoursAgo * 3600000 ).toISOString(), ...extra
} );

export const DESIGN_PREVIEW_NEEDS_YOU = [
  needsYou( 'gd', 'George Dimov', 'Dimov Tax', 'Happy to talk. Could we schedule a call about tax planning next week?', 'Offered to schedule a call about tax planning.', 'reply_came_in', 30, { replyClassification: 'positive', replyDraftSubject: 'Re: Quick question', replyDraftBody: '<p>Great - how does Tuesday at 10 work?</p>' } ),
  needsYou( 'tr', 'Theodore Ricks-Freeman', 'The DC Voice', '________________________________\nFrom: Zoom <no-reply@zoom.us>\nSent: Thursday, October 1, 2026 4:22 PM\n\nMeeting assets for Theodore Freeman - The DC Voice\'s Zoom Meeting are ready!', 'The email is an automated notification from Zoom about meeting assets being ready, not a direct reply from Theodore Ricks-Freeman.', 'no_safe_draft', 31 ),
  needsYou( 'wp', 'William Pierce', 'A.T. Chadwick', 'I will be out of the office Sept 28, 29, and 30th, with limited availability to email.', '', 'no_safe_draft', 96 ),
  needsYou( 'rl', 'Robert Leung', 'Rosendin', 'I am currently out of the office and will return on Monday, October 5, 2026.', 'Out until Oct 5.', 'no_safe_draft', 13 )
];
