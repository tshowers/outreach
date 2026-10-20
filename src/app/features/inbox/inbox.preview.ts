import { MailboxMessageDetail } from '../../services/outreach-api.service';

/**
 * `?designPreview=1` letters: the Outreach Inbox 2026 prototype's mail,
 * shaped as the server will send it (README "Data the backend must
 * provide"), dated relative to today. Local development only.
 */
const at = ( daysAgo: number, hour: number, minute: number ) => {
  const date = new Date();
  date.setDate( date.getDate() - daysAgo );
  date.setHours( hour, minute, 0, 0 );
  return date.toISOString();
};

type Letter = Partial<MailboxMessageDetail> & Pick<MailboxMessageDetail, 'id' | 'fromName' | 'fromEmail' | 'subject' | 'kind'>;

const letter = ( daysAgo: number, hour: number, minute: number, fields: Letter ): MailboxMessageDetail => ( {
  mailboxId: 'preview',
  uid: null,
  unread: false,
  replied: false,
  receivedAt: at( daysAgo, hour, minute ),
  preview: ( fields.text || '' ).slice( 0, 200 ),
  needsAnswer: false,
  draft: null,
  nextAction: null,
  ...fields,
} as MailboxMessageDetail );

export const INBOX_PREVIEW_LETTERS: MailboxMessageDetail[] = [
  letter( 0, 9, 42, {
    id: 'gd', fromName: 'George Dimov', fromEmail: 'george@dimovtax.com', subject: 'Re: Planning ahead for year-end', kind: 'reply', needsAnswer: true,
    ask: 'Wants a 20-minute call: Thu 2:00 or Fri morning',
    toddSummary: 'George wants a 20-minute call and offered two times. Your calendar is open Thursday at 2:00.',
    text: "Hi Ty,\n\nThanks for reaching out. Year-end is when most of our clients wish they'd started sooner, so the timing is good.\n\nI'd be glad to walk through what we do for small firms. Would Thursday at 2:00 or Friday morning work for a 20-minute call?\n\nBest,\nGeorge",
    draft: "Hi George,\n\nThursday at 2:00 works. I'll send an invite with a call link.\n\nThanks,\nTy",
    nextAction: { type: 'calendar', label: 'Hold Thursday 2:00' }, quotedFrom: { date: at( 6, 10, 0 ) },
  } ),
  letter( 0, 7, 15, {
    id: 'rl', fromName: 'Robert Leung', fromEmail: 'rleung@rosendin.com', subject: 'Automatic reply: Which do you think is better, Finding or Searching?', kind: 'out_of_office',
    ask: 'Out of office until Mon, Oct 26', toddDid: 'Paused his sequence until Oct 26',
    toddSummary: 'Robert is out until Oct 26. Maya paused his sequence and will pick it back up when he returns.',
    text: 'I am currently out of the office and will return on Monday, October 26. For immediate needs, please contact Matt Zika at mzika@rosendin.com.',
    nextAction: { type: 'email', label: 'Email Matt Zika', value: 'mzika@rosendin.com' },
  } ),
  letter( 0, 6, 2, {
    id: 'li', fromName: 'LinkedIn', fromEmail: 'messages-noreply@linkedin.com', subject: 'Get ready for your LinkedIn Ads Consultation', kind: 'newsletter', filed: true,
    ask: 'Marketing email', toddDid: 'Filed', toddSummary: 'Marketing email. Nothing to answer.',
    text: 'Your consultation is coming up. Here is what to prepare before the call.',
  } ),
  letter( 1, 16, 8, {
    id: 'tr', fromName: 'Theodore Ricks-Freeman', fromEmail: 'theodore@thedcvoice.org', subject: "Fw: Meeting assets for The DC Voice's Zoom meeting", kind: 'forward', needsAnswer: true,
    ask: 'Sent the recording. Can you use it in the newsletter?',
    toddSummary: 'Theodore shared the recording and transcript and asked whether you want to use them in the newsletter.',
    text: "Ty,\n\nHere are the recording and transcript from Thursday's session. The part on follow-up timing starts around minute 22.\n\nLet me know if you want to use any of it for the newsletter.\n\nTheodore",
    draft: "Theodore,\n\nThank you for sending these. Yes, I'd like to quote the follow-up timing section in the next issue. I'll send you the excerpt before it goes out.\n\nTy",
    attachments: [{ name: 'Recording.mp4' }, { name: 'Transcript.pdf' }], hasAttachments: true,
    nextAction: { type: 'attach', label: 'Save to Docs' },
  } ),
  letter( 1, 11, 20, {
    id: 'md', fromName: 'Mail Delivery Subsystem', fromEmail: 'mailer-daemon@googlemail.com', subject: 'Delivery Status Notification (Failure)', kind: 'bounce',
    ask: 'jake@harborlinecoop.com bounced', toddDid: 'Removed from the Harborline sequence',
    toddSummary: 'jake@harborlinecoop.com bounced. Maya removed it from the Harborline sequence.',
    text: "Your message to jake@harborlinecoop.com couldn't be delivered. The address may not exist or is unable to receive mail.",
  } ),
  letter( 4, 14, 51, {
    id: 'gt', fromName: 'Glenn Torrez', fromEmail: 'gtorrez@palomarbuild.com', subject: 'Re: We have been brainwashed into searching', kind: 'reply', needsAnswer: true,
    ask: 'Email no longer monitored. Call the office.',
    toddSummary: "Glenn's email is no longer monitored. He asked you to call the office instead.",
    text: 'This address is no longer monitored.\n\nPlease reach me at the office: 760.929.9787.',
    nextAction: { type: 'call', label: 'Call 760.929.9787', value: '760.929.9787' }, quotedFrom: { date: at( 7, 10, 0 ) },
  } ),
  letter( 4, 9, 3, {
    id: 'wp', fromName: 'William Pierce', fromEmail: 'wpierce@piercegroup.com', subject: 'Automatic reply: We have been brainwashed into searching', kind: 'out_of_office',
    ask: 'Back Monday, Oct 19', toddDid: 'Follow-up set for Tue morning',
    toddSummary: 'William is back Monday, Oct 19. Maya will follow up Tuesday morning.',
    text: "I'm out of the office through Friday, October 16, and will be back Monday.",
  } ),
  letter( 4, 8, 30, {
    id: 'ts', fromName: 'Ty Showers', fromEmail: 'ty.showers@taliferro.tech', subject: '[TEST] Which do you think is better, Finding or Searching?', kind: 'test', filed: true,
    ask: 'Your test send of the Find campaign', toddDid: 'Filed', toddSummary: 'Your own test send. Nothing to answer.',
    text: 'Test send of the Find campaign.',
  } ),
  letter( 5, 15, 12, {
    id: 'cm', fromName: 'Charlotte Marshall', fromEmail: 'cmarshall@tkgassoc.com', subject: 'Re: How do you manage project momentum?', kind: 'reply', needsAnswer: true,
    ask: 'Asked for pricing for a team of 12',
    toddSummary: 'Charlotte asked for pricing for a team of 12. The Team plan covers up to 15 seats.',
    text: 'Hi Ty,\n\nThis is timely. We have three projects that stalled this quarter for exactly that reason.\n\nWhat does pricing look like for a team of 12?\n\nCharlotte',
    draft: "Hi Charlotte,\n\nFor 12 people the Team plan is the right fit. I've attached the pricing sheet, and I'm happy to walk through it on a short call.\n\nTy",
    nextAction: { type: 'attach', label: 'Attach the pricing sheet' }, quotedFrom: { date: at( 7, 10, 0 ) },
  } ),
  letter( 6, 10, 47, {
    id: 'db', fromName: 'Doug Bryan', fromEmail: 'doug@idahotower.com', subject: 'Automatic reply: Finding value in connections', kind: 'out_of_office',
    ask: 'On a job site through Oct 16', toddDid: 'Follow-up moved to Monday',
    toddSummary: 'Doug is on a job site through Oct 16. Maya moved his follow-up to Monday.',
    text: 'I am on a job site through Friday, October 16, with limited email. I will reply when I am back.',
  } ),
  letter( 7, 13, 5, {
    id: 'bp', fromName: 'Bob Polmatier', fromEmail: 'bob@polmatier.com', subject: 'Re: The challenge of staying organized', kind: 'reply', needsAnswer: true, replied: true, answeredAt: at( 7, 15, 0 ),
    ask: 'Said yes to a demo next Wednesday',
    toddSummary: 'Bob agreed to a demo next Wednesday. You replied on Oct 13.',
    text: "Ty,\n\nSure, let's do a demo. Next Wednesday works.\n\nBob",
    nextAction: { type: 'calendar', label: 'Open the invite' }, quotedFrom: { date: at( 8, 10, 0 ) },
  } ),
];
