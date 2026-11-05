import { autoSendLine, draftsSubtitle } from './drafts.component';

describe( 'Drafts with automatic sending (2026-11-05)', () => {
  it( 'says the drafts are waiting on you when automatic sending is off', () => {
    expect( draftsSubtitle( 67, false, 0 ) ).toContain( 'Nothing sends until you approve it.' );
  } );

  it( 'explains why drafts written before automatic sending was turned on still wait', () => {
    const line = draftsSubtitle( 67, true, 4 );
    expect( line ).toContain( 'Automatic sending is on: 4 send by themselves' );
    expect( line ).toContain( 'The other 63 wait for you to approve' );
    expect( draftsSubtitle( 67, true, 0 ) ).toContain( 'none of these send by themselves' );
  } );

  it( 'tells each draft whether it goes without you, and when', () => {
    expect( autoSendLine( false, 'Deepak', '', 'noon', '' ) ).toContain( 'Written before automatic sending was turned on' );
    expect( autoSendLine( true, 'Deepak', 'Sat, Nov 7', 'noon', '' ) ).toContain( 'Sends by itself after Sat, Nov 7' );
    const tomorrowNoon = new Date( Date.now() + 86400000 ).toISOString();
    expect( autoSendLine( true, 'Deepak', '', 'noon', tomorrowNoon ) ).toContain( 'Sends by itself tomorrow at' );
    expect( autoSendLine( true, 'Deepak', '', 'immediate', tomorrowNoon ) ).toContain( "during Deepak's business hours" );
  } );
} );
