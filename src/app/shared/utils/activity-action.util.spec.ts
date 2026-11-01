import { activityAction } from './activity-action.util';

describe( 'activityAction: where a "couldn\'t start" notice leads (Ty, 2026-10-31)', () => {
  const maya = ( body: string ) => activityAction( { category: 'maya', title: "The Marketing Assistant couldn't start today", body } );

  it( 'a full Drafts leads to Drafts', () => {
    expect( maya( "100 email drafts are waiting for you. Approve or dismiss some in Drafts and she'll keep going." ) ).toEqual( { label: 'Open Drafts', route: '/drafts' } );
  } );

  it( 'the open-task limit still leads to Moves', () => {
    expect( maya( "She's at her limit of open review tasks (12 of 10). Close out a few Moves and she'll plan again tomorrow." )?.label ).toBe( 'Open Moves' );
  } );

  it( 'anything else has no action', () => {
    expect( maya( "Something went wrong while she was planning." ) ).toBeNull();
  } );
} );
