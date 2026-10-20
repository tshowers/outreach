import { MailboxMessageListItem } from '../../services/outreach-api.service';
import { askTodd, buildDays, dayKeyOf, dayLabel, groupOf, prepOf, quickActionOf, toLetter } from './inbox.model';

const NOW = new Date( 2026, 9, 20, 12, 0 ); // Tuesday, October 20, 2026, local time

const message = ( fields: Partial<MailboxMessageListItem> ): MailboxMessageListItem => ( {
  id: 'm1',
  mailboxId: 'box',
  uid: null,
  subject: 'Re: Planning ahead',
  fromName: 'George Dimov',
  fromEmail: 'george@dimovtax.com',
  receivedAt: new Date( 2026, 9, 20, 9, 42 ).toISOString(),
  unread: false,
  replied: false,
  ...fields,
} );

describe( 'inbox.model', () => {
  describe( 'day labels', () => {
    it( 'says Today, Yesterday, the weekday, then the short date', () => {
      expect( dayLabel( '2026-10-20', NOW ) ).toBe( 'Today' );
      expect( dayLabel( '2026-10-19', NOW ) ).toBe( 'Yesterday' );
      expect( dayLabel( '2026-10-16', NOW ) ).toBe( 'Friday' );
      expect( dayLabel( '2026-10-13', NOW ) ).toBe( 'Tue, Oct 13' );
    } );

    it( 'keys days in local time', () => {
      expect( dayKeyOf( new Date( 2026, 9, 20, 23, 59 ) ) ).toBe( '2026-10-20' );
      expect( dayKeyOf( new Date( 2026, 9, 21, 0, 1 ) ) ).toBe( '2026-10-21' );
    } );
  } );

  describe( 'toLetter fallbacks (before the server sends TODD fields)', () => {
    it( 'treats a reply as waiting, with signalSummary as the ask and the responder draft as the draft', () => {
      const letter = toLetter( message( {
        signalSummary: 'George wants a 20-minute call. He offered Thursday.',
        replyDraftBody: '<p>Hi George,</p><p>Thursday works.</p>',
      } ) );
      expect( letter.kind ).toBe( 'reply' );
      expect( letter.needsAnswer ).toBeTrue();
      expect( groupOf( letter ) ).toBe( 'waiting' );
      expect( letter.ask ).toBe( 'George wants a 20-minute call.' );
      expect( letter.draft ).toBe( 'Hi George,\n\nThursday works.' );
      expect( letter.company ).toBe( 'dimovtax.com' );
    } );

    it( 'files out-of-office, newsletters and my own test sends as TODD handled', () => {
      const ooo = toLetter( message( { subject: 'Automatic reply: Finding', preview: 'I am out of the office until Monday.' } ) );
      const news = toLetter( message( { fromEmail: 'news@linkedin.com', subject: 'Your week' } ) );
      const test = toLetter( message( { fromEmail: 'ty@taliferro.tech', subject: '[TEST] Finding' } ), { ownEmail: 'ty@taliferro.tech' } );
      expect( [ooo.kind, news.kind, test.kind] ).toEqual( ['out_of_office', 'newsletter', 'test'] );
      expect( [ooo, news, test].map( groupOf ) ).toEqual( ['handled', 'handled', 'handled'] );
      expect( news.toddDid ).toBe( 'Filed' );
    } );

    it( 'counts a replied message, or one marked done here, as answered', () => {
      expect( groupOf( toLetter( message( { replied: true } ) ) ) ).toBe( 'answered' );
      expect( groupOf( toLetter( message( {} ), { done: new Set( ['m1'] ) } ) ) ).toBe( 'answered' );
    } );

    it( 'offers Call when there is no draft but the letter has a phone number', () => {
      const letter = toLetter( message( { preview: 'This address is no longer monitored. Call the office: 760.929.9787.', subject: 'Re: Searching' } ) );
      // "no longer monitored" reads as a bounce to the sender rules, so the server's needsAnswer decides.
      const waiting = toLetter( message( { preview: 'Please call the office: 760.929.9787.' } ) );
      expect( letter.kind ).toBe( 'bounce' );
      expect( quickActionOf( waiting ) ).toEqual( { label: 'Call', icon: 'phone' } );
      expect( waiting.nextAction?.value ).toBe( '760.929.9787' );
    } );

    it( 'prefers the server fields when they are there', () => {
      const letter = toLetter( message( { kind: 'forward', needsAnswer: false, ask: 'Sent the recording', toddDid: 'Saved to Docs', draft: null } ) );
      expect( letter.kind ).toBe( 'forward' );
      expect( groupOf( letter ) ).toBe( 'handled' );
      expect( letter.ask ).toBe( 'Sent the recording' );
      expect( prepOf( letter ).text ).toBe( 'Saved to Docs' );
    } );
  } );

  describe( 'buildDays', () => {
    it( 'groups by local day, newest first, waiting before handled, one row per thread', () => {
      const letters = [
        toLetter( message( { id: 'a', threadId: 't1', receivedAt: new Date( 2026, 9, 20, 8, 0 ).toISOString() } ) ),
        toLetter( message( { id: 'b', threadId: 't1', receivedAt: new Date( 2026, 9, 20, 10, 0 ).toISOString() } ) ),
        toLetter( message( { id: 'c', subject: 'Automatic reply: x', preview: 'out of office', receivedAt: new Date( 2026, 9, 20, 11, 0 ).toISOString() } ) ),
        toLetter( message( { id: 'd', receivedAt: new Date( 2026, 9, 16, 9, 0 ).toISOString() } ) ),
      ];
      const days = buildDays( letters, NOW );
      expect( days.map( day => day.key ) ).toEqual( ['2026-10-20', '2026-10-16'] );
      expect( days[0].letters.map( letter => letter.id ) ).toEqual( ['b', 'c'] );
      expect( days[0].waiting ).toBe( 1 );
      expect( days[1].label ).toBe( 'Friday' );
    } );
  } );

  describe( 'prep pill', () => {
    it( 'quotes the draft line after the greeting', () => {
      const letter = toLetter( message( { draft: 'Hi George,\n\nThursday at 2:00 works.\n\nTy' } ) );
      expect( prepOf( letter ) ).toEqual( { text: '"Thursday at 2:00 works."', tone: 'draft', icon: 'spark' } );
      expect( quickActionOf( letter )?.label ).toBe( 'Send' );
    } );
  } );

  describe( 'Ask TODD', () => {
    it( 'answers from the best match and lists every hit', () => {
      const letters = [
        toLetter( message( { id: 'g', toddSummary: 'George wants a call Thursday.' } ) ),
        toLetter( message( { id: 'c', fromName: 'Charlotte Marshall', fromEmail: 'c@tkg.com', toddSummary: 'Charlotte asked about pricing.' } ) ),
      ];
      const result = askTodd( 'what did Charlotte say about pricing?', letters );
      expect( result.source?.id ).toBe( 'c' );
      expect( result.answer ).toBe( 'Charlotte asked about pricing.' );
      expect( result.hits.map( letter => letter.id ) ).toEqual( ['c'] );
    } );

    it( 'asks for a topic when the question is only stop words', () => {
      expect( askTodd( 'what did you say', [] ).answer ).toBe( 'Ask about a person, a company or a topic.' );
    } );
  } );
} );
