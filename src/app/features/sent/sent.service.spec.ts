import { personClicks, personOpened } from './sent.service';

describe( 'Sent: scanner clicks and opens', () => {
  const sent = new Date( '2026-10-27T18:48:37.231Z' );
  const at = ( seconds: number ) => ( { url: 'https://example.com', timestamp: new Date( sent.getTime() + seconds * 1000 ).toISOString() } );

  it( 'drops the scanner burst seconds after the send (Laurie Klein, 2026-10-27)', () => {
    expect( personClicks( [at( 10 ), at( 10.1 ), at( 10.2 ), at( 10.3 ), at( 10.4 )], sent ) ).toBe( 0 );
  } );

  it( 'counts a person clicking later, but not a burst right after it', () => {
    expect( personClicks( [at( 10 ), at( 200 ), at( 3600 ), at( 3601 ), at( 7200 )], sent ) ).toBe( 2 );
  } );

  it( 'counts clicks with no time, as before', () => {
    expect( personClicks( [{ url: 'x' }, { url: 'y', timestamp: null }], sent ) ).toBe( 2 );
    expect( personClicks( undefined, sent ) ).toBe( 0 );
  } );

  it( 'an open within five minutes of the send is the scanner', () => {
    expect( personOpened( { opened: true, openedAt: at( 30 ).timestamp }, sent ) ).toBeFalse();
    expect( personOpened( { opened: true, openedAt: at( 600 ).timestamp }, sent ) ).toBeTrue();
    expect( personOpened( { opened: true }, sent ) ).toBeTrue();
    expect( personOpened( {}, sent ) ).toBeFalse();
  } );
} );
