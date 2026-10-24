import {
  Drip, countdown, dayNumber, daysLeft, dripWindow, emailLinks, expiryTitle, findConflict, heatColor, percent,
  projectedReach, rateLabel, sendsPerWeekday, shortDate, statusSentence,
} from './drips.model';

function drip ( overrides: Partial<Drip> = {} ): Drip {
  return {
    id: 'd1', title: 'October newsletter', kind: 'newsletter', subject: 'Hi', preheader: '', status: 'ready',
    audience: { id: 'a1', name: 'Gov contractors', source: 'leadVault', count: 1240 }, rateMinutes: 15,
    startMode: 'now', startDate: null, endDate: null, timezone: 'America/New_York', startedAt: null, archivedAt: null,
    archivedReason: null, sourceDripId: null,
    counters: { total: 0, queued: 0, sent: 0, bounced: 0, unsubscribed: 0, skipped: 0, failed: 0 },
    stats: null, nextSendAt: null, lastSentAt: null, blocker: null, fromName: 'Ty', fromEmail: 'ty@taliferro.tech',
    ...overrides,
  };
}

describe( 'drips.model', () => {
  it( 'names the eight rates and their weekday volume', () => {
    expect( [1, 5, 15, 30, 60, 120, 240, 1440].map( rateLabel ) ).toEqual( [
      '1 a minute', '1 every 5 minutes', '1 every 15 minutes', '1 every 30 minutes', '1 an hour', '1 every 2 hours', '1 every 4 hours', '1 a day',
    ] );
    expect( sendsPerWeekday( 15 ) ).toBe( 32 );
    expect( sendsPerWeekday( 1440 ) ).toBe( 1 );
  } );

  it( 'formats dates, percents and the countdown like the design', () => {
    expect( shortDate( '2026-11-13' ) ).toBe( 'Nov 13' );
    expect( percent( 42, 612 ) ).toBe( '6.9%' );
    expect( percent( 251, 612 ) ).toBe( '41%' );
    expect( percent( 0, 0 ) ).toBe( '0%' );
    expect( countdown( 664000 ) ).toBe( '11:04' );
  } );

  it( 'a ready drip gets 30 days from today, or from its picked start day', () => {
    expect( dripWindow( drip(), '2026-10-24' ) ).toEqual( { start: '2026-10-24', end: '2026-11-23' } );
    expect( dripWindow( drip( { startMode: 'date', startDate: '2026-11-01' } ), '2026-10-24' ) ).toEqual( { start: '2026-11-01', end: '2026-12-01' } );
    expect( dripWindow( drip( { endDate: '2026-11-07' } ), '2026-10-24' ) ).toEqual( { start: '2026-10-24', end: '2026-11-07' } );
  } );

  it( 'warns when two other drips already hold a day', () => {
    const others = [
      { id: 'x', title: 'A', status: 'running' as const, startDate: '2026-10-14', endDate: '2026-11-13' },
      { id: 'y', title: 'B', status: 'paused' as const, startDate: '2026-10-01', endDate: '2026-10-31' },
    ];
    expect( findConflict( 'd1', { start: '2026-10-24', end: '2026-11-23' }, others )?.date ).toBe( '2026-10-24' );
    expect( findConflict( 'd1', { start: '2026-10-31', end: '2026-11-20' }, others ) ).toBeNull();
  } );

  it( 'speaks for each state', () => {
    const running = drip( { status: 'running', startDate: '2026-10-14', endDate: '2026-11-13', counters: { total: 1240, queued: 628, sent: 612, bounced: 0, unsubscribed: 0, skipped: 0, failed: 0 } } );
    expect( statusSentence( running, '2026-10-23' ) ).toBe( 'On. Sending 1 every 15 minutes.' );
    expect( statusSentence( { ...running, status: 'paused' }, '2026-10-23' ) ).toBe( 'Off. The clock keeps running; it still archives Nov 13.' );
    expect( statusSentence( drip(), '2026-10-23' ) ).toBe( 'Off. Turning it on starts sending today.' );
    expect( statusSentence( drip( { startMode: 'date', startDate: '2026-10-24' } ), '2026-10-23' ) ).toBe( 'Off. Turn on to schedule it for Oct 24.' );
    expect( dayNumber( running, '2026-10-22' ) ).toBe( 9 );
    expect( daysLeft( running, '2026-10-23' ) ).toBe( 21 );
    expect( expiryTitle( running, '2026-10-23' ) ).toBe( '21 days left · archives Nov 13' );
    expect( expiryTitle( drip(), '2026-10-23' ) ).toBe( '30 days once it starts' );
  } );

  it( 'projects reach from sends per weekday and the weekdays left', () => {
    const running = drip( { status: 'running', startDate: '2026-10-14', endDate: '2026-11-13', counters: { total: 1240, queued: 628, sent: 612, bounced: 0, unsubscribed: 0, skipped: 0, failed: 0 } } );
    // 32 a weekday × round(21 × 5/7) = 480 more, short of the 628 left.
    expect( projectedReach( running, '2026-10-23' ) ).toBe( 'Reaches about 1,092 of 1,240 people before it archives. Speed it up to reach everyone.' );
    expect( projectedReach( { ...running, rateMinutes: 5 }, '2026-10-23' ) ).toMatch( /^Reaches all 1,240 people by about \w{3} \d+, then stops on its own\.$/ );
  } );

  it( 'reads each link label from the email, skipping unsubscribe', () => {
    const links = emailLinks( '<a href="https://x.com/a">Read the newsletter</a><a href="https://x.com/b"><img alt="Logo"></a><a href="taliferro-tech-unsubscribe">Unsubscribe</a><a href="https://x.com/a">again</a>' );
    expect( links ).toEqual( [{ url: 'https://x.com/a', label: 'Read the newsletter' }, { url: 'https://x.com/b', label: 'Logo' }] );
  } );

  it( 'colours the heatmap by share of clicks', () => {
    expect( heatColor( 0.53 ).ring ).toBe( '#ff4fa8' );
    expect( heatColor( 0.24 ) ).toEqual( { ring: '#f2b600', text: '#2b2200' } );
    expect( heatColor( 0.07 ).ring ).toBe( '#2f6bff' );
  } );
} );
