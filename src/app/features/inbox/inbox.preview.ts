import { InboxCategory, MailboxMessageDetail } from '../../services/outreach-api.service';

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


/** Signature logo: navy on transparent, as banks send them. */
const LOGO = `data:image/svg+xml;base64,${ btoa( '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="48"><text x="0" y="38" font-family="Georgia" font-size="40" fill="#1b2a4a">Northwind</text></svg>' ) }`;
const PHOTO_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAASCAIAAADOjonJAAADA0lEQVR42hXToaqAMACF4fs4N5lMJpPJZJIFLSsahiDIgisrM4ggiMGVv8wgguATXu95gK8c/p9fQSSIBYkgFWSCXFAISkElkIJW0AkGwSiwgkmwCDbBIUBwCm7BK/j5rYlq4pqkJq3JavKaoqasqWpkTVvT1Qw1Y42tmWqWmq3mqKHmrLlr3vqDJJEkliSSVJJJckkhKSWVREpaSScZJKPESibJItkkhwTJKbklr/yghqghbkga0oasIW8oGsqGqkE2tA1dw9AwNtiGqWFp2BqOBhrOhrvhbT5IESliRaJIFZkiVxSKUlEppKJVdIpBMSqsYlIsik1xKFCcilvxqg/qiXrinqQn7cl68p6ip+ypemRP29P1DD1jj+2ZepaerefooefsuXve/oM0kSbWJJpUk2lyTaEpNZVGalpNpxk0o8ZqJs2i2TSHBs2puTWv/iBDZIgNiSE1ZIbcUBhKQ2WQhtbQGQbDaLCGybAYNsNhwHAabsNrPsgSWWJLYkktmSW3FJbSUlmkpbV0lsEyWqxlsiyWzXJYsJyW2/LaD3JEjtiROFJH5sgdhaN0VA7paB2dY3CMDuuYHItjcxwOHKfjdrzug2aimXgmmUlnspl8ppgpZ6oZOdPOdDPDzDhjZ6aZZWabOWaYOWfumXf+oJVoJV5JVtKVbCVfKVbKlWpFrrQr3cqwMq7YlWllWdlWjhVWzpV75V0/aCfaiXeSnXQn28l3ip1yp9qRO+1OtzPsjDt2Z9pZdradY4edc+feefcP8kSe2JN4Uk/myT2Fp/RUHulpPZ1n8Iwe65k8i2fzHB48p+f2vP6DIIIYEkghgxwKKKH6j4kWOhhg/H+JCRbY4OB/J9zw8kGBKBAHkkAayAJ5oAiUgSogA22gCwyBMWADU2AJbIEjQOAM3IE3fNBFdBFfJBfpRXaRXxQX5UV1IS/ai+5iuBgv7MV0sVxsF8cFF+fFffFeH/QQPcQPyUP6kD3kD8VD+VA9yIf2oXsYHsYH+zA9LA/bw/HAw/lwP7wPf3BipacMSoWCAAAAAElFTkSuQmCC';
const PHOTO_B = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAASCAIAAADOjonJAAAC/ElEQVR42g3MQceHMADA4feDddppp0477dSp006dRowYMWLEiBEjIiIiovvvY73/5wM8f9iKvsJVDBW+YqwIFVNFrJgrUsVSkSvWilKxVewVR8VZcVXcFU/FW/FVf1hBL3CCQeAFoyAIJkEUzIIkWARZsAqKYBPsgkNwCi7BLXgEr+ATv0jSS5xkkHjJKAmSSRIlsyRJFkmWrJIi2SS75JCckktySx7JK/nkL6rpa1zNUONrxppQM9XEmrkm1Sw1uWatKTVbzV5z1Jw1V81d89S8NV/9ixS9wikGhVeMiqCYFFExK5JiUWTFqiiKTbErDsWpuBS34lG8ik/9Ik2vcZpB4zWjJmgmTdTMmqRZNFmzaopm0+yaQ3NqLs2teTSv5tO/qKFvcA1Dg28YG0LD1BAb5obUsDTkhrWhNGwNe8PRcDZcDXfD0/A2fM0vaulbXMvQ4lvGltAytcSWuSW1LC25ZW0pLVvL3nK0nC1Xy93ytLwtX/uLDL3BGQaDN4yGYJgM0TAbkmExZMNqKIbNsBsOw2m4DLfhMbyGz/yijr7DdQwdvmPsCB1TR+yYO1LH0pE71o7SsXXsHUfH2XF13B1Px9vxdb/I0lucZbB4y2gJlskSLbMlWRZLtqyWYtksu+WwnJbLclsey2v57C9y9A7nGBzeMTqCY3JEx+xIjsWRHaujODbH7jgcp+Ny3I7H8To+94s8vcd5Bo/3jJ7gmTzRM3uSZ/Fkz+opns2zew7P6bk8t+fxvJ7P/6JAH3CBIeADYyAEpkAMzIEUWAI5sAZKYAvsgSNwBq7AHXgCb+ALvyjSR1xkiPjIGAmRKRIjcyRFlkiOrJES2SJ75IickStyR57IG/niL0r0CZcYEj4xJkJiSsTEnEiJJZETa6IktsSeOBJn4krciSfxJr70izJ9xmWGjM+MmZCZMjEzZ1JmyeTMmimZLbNnjsyZuTJ35sm8mS//okJfcIWh4AtjIRSmQizMhVRYCrmwFkphK+yFo3AWrsJdeApv4Sv/fEYRtgKB5QkAAAAASUVORK5CYII=';

/** An Outlook reply: signature with a logo, then the quoted thread under a rule. */
const OUTLOOK_HTML = `<html><head><style>p.MsoNormal{margin:0;font-size:11pt;font-family:Calibri}</style></head><body lang="EN-US">
<div class="WordSection1">
<p class="MsoNormal">Hello Ty,</p><p class="MsoNormal">&nbsp;</p>
<p class="MsoNormal">Thanks for sending these over. I've attached the term sheet and two photos of the site walk so we're looking at the same thing.</p><p class="MsoNormal">&nbsp;</p>
<p class="MsoNormal">Please let me know if this is something you are able to provide and if not, let me know how we can be of assistance.</p><p class="MsoNormal">&nbsp;</p>
<p class="MsoNormal">Best Regards,</p><p class="MsoNormal">&nbsp;</p><p class="MsoNormal">Dana</p><p class="MsoNormal">&nbsp;</p>
<p class="MsoNormal"><b><span style="color:#1F3864">Dana Whitfield</span></b></p>
<p class="MsoNormal"><span style="color:#1F3864">VP, Commercial Relationship Manager</span></p><p class="MsoNormal">&nbsp;</p>
<p class="MsoNormal">Northwind Bank<br>100 Main St, Suite 200<br>Springfield, WA 98000<br>555-010-0199 (Mobile)<br>
<a href="mailto:dana@northwind.example">dana@northwind.example</a><br><a href="https://northwind.example">www.northwind.example</a></p><p class="MsoNormal">&nbsp;</p>
<p class="MsoNormal"><img width="220" height="48" src="${ LOGO }" alt="Northwind Bank"></p>
<p class="MsoNormal">&nbsp;</p>
<div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0in 0in 0in">
<p class="MsoNormal"><b>From:</b> Ty Showers &lt;ty.showers@taliferro.tech&gt;<br><b>Sent:</b> Wednesday, October 7, 2026 1:40 PM<br><b>To:</b> Dana Whitfield &lt;dana@northwind.example&gt;<br><b>Subject:</b> Re: Financial/Document Uploads</p>
</div><p class="MsoNormal">&nbsp;</p><p class="MsoNormal">Dana, I thought we were opening a checking account first.</p>
</div></body></html>`;

/** A designed mail on its own dark canvas, like a verification code. */
const DESIGNED_HTML = `<html><body style="margin:0;background:#45484d"><table width="600" align="center" bgcolor="#333333" style="margin:24px auto;color:#fff;font-family:Arial">
<tr><td style="padding:40px 56px"><h1 style="font-size:40px;margin:0 0 24px">Partner Hub</h1>
<p>Please add this device as a trusted device by entering the following <b>verification code</b>.</p>
<p style="font-size:34px;font-weight:bold;background:#6d5a45;display:inline-block;padding:0 4px">000000</p>
<p>This code is time-sensitive and will expire shortly.</p></td></tr></table></body></html>`;

/** Apple Mail from an iPad: the forward is the message. */
const FORWARD_HTML = `<html class="apple-mail-supports-explicit-dark-mode"><head><meta http-equiv="content-type" content="text/html; charset=utf-8"></head><body dir="auto">
<br id="lineBreakAtBeginningOfSignature"><div dir="ltr">Sent from my iPad</div><div dir="ltr"><br>Begin forwarded message:<br><br></div>
<blockquote type="cite"><div dir="ltr"><b>From:</b> Sam &amp; Jo &lt;hello@weddings.example&gt;<br><b>Date:</b> October 13, 2026<br><b>Subject:</b> Reception Reminder<br></div>
<div dir="ltr"><p>We can't wait to celebrate with you! The reception starts at 6:00 PM at the Garden Pavilion.</p><p>Parking is in the north lot.</p></div></blockquote></body></html>`;

export const INBOX_PREVIEW_LETTERS: MailboxMessageDetail[] = [
  letter( 0, 10, 4, {
    id: 'dw', fromName: 'Dana Whitfield', fromEmail: 'dana@northwind.example', subject: 'Re: Financial/Document Uploads', kind: 'reply', needsAnswer: true,
    ask: 'Sent the term sheet and site photos', toddSummary: 'Dana sent the term sheet and two photos from the site walk, and wants to know if you can provide prior financials.',
    to: [{ email: 'ty.showers@taliferro.tech' }], html: OUTLOOK_HTML,
    text: 'Hello Ty,\n\nThanks for sending these over.\n\nDana',
    attachments: [
      { id: 'a1', name: 'Site walk 1.png', contentType: 'image/png', size: 1840000, preview: PHOTO_A },
      { id: 'a2', name: 'Site walk 2.png', contentType: 'image/png', size: 1630000, preview: PHOTO_B },
      { id: 'a3', name: 'Term sheet - Taliferro.pdf', contentType: 'application/pdf', size: 248000 },
      { id: 'a4', name: 'Forwarded message.eml', contentType: 'message/rfc822', size: 12000 },
    ], hasAttachments: true,
  } ),
  letter( 0, 9, 58, {
    id: 'ph', fromName: 'Partner Hub', fromEmail: 'noreply@partnerhub.example', subject: 'Verification code', kind: 'automated', filed: true,
    ask: 'A sign-in code', toddDid: 'Filed', toddSummary: 'A sign-in verification code. Nothing to answer.', to: [{ email: 'info@taliferro.com' }],
    html: DESIGNED_HTML, text: 'Please add this device as a trusted device.',
  } ),
  letter( 0, 9, 50, {
    id: 'vo', fromName: 'Vee Owens', fromEmail: 'vee@icloud.example', subject: 'Fwd: Reception Reminder', kind: 'forward', needsAnswer: true,
    preview: FORWARD_HTML.slice( 0, 220 ), html: FORWARD_HTML, to: [{ email: 'ty.showers@taliferro.tech' }],
  } ),
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

/** The prototype's seed categories and who's filed where. */
export const INBOX_PREVIEW_CATEGORIES: { categories: InboxCategory[]; assignments: Record<string, string>; } = {
  categories: [
    { id: 'c1', name: 'Prospects', color: 'blue' },
    { id: 'c2', name: 'Partners', color: 'violet' },
    { id: 'c3', name: 'Clients', color: 'green' },
    { id: 'c4', name: 'Admin', color: 'yellow' },
  ],
  assignments: { gd: 'c1', cm: 'c1', gt: 'c1', tr: 'c2', bp: 'c3', md: 'c4', li: 'c4', ts: 'c4' },
};
