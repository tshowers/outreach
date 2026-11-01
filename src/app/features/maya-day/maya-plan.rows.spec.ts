import { MomentumThread } from '../../models/momentum-thread.model';
import { heldBanners, toRow } from './maya-plan.component';

describe( 'Activity: queued vs stalled, and why it is paused (Ty, 2026-10-31)', () => {
  const now = new Date( '2026-10-31T23:00:00.000Z' );
  const thread = ( extra: Partial<MomentumThread> & Record<string, unknown> = {} ) => ( {
    id: 'c1', contactId: 'c1', contactName: 'Amy Bemis', userLane: 'plan', bucket: 'waiting', mode: 'draft_only', queueState: 'waiting',
    nextActionAt: '2026-10-27T19:00:00.000Z',
    nextActionReason: "User discarded the Marketing Assistant's draft without requesting a rewrite. Back in the normal rotation for the Marketing Assistant's next pass.",
    ...extra,
  } as unknown as MomentumThread );

  it( 'someone waiting for the next pass is Queued, not Stalled, and says what happens next', () => {
    const row = toRow( thread(), now );
    expect( row.queued ).toBeTrue();
    expect( row.stalled ).toBeFalse();
    expect( row.nextWhen ).toBe( 'Next pass:' );
    expect( row.next ).toBe( 'the Marketing Assistant writes the first email on its next morning run.' );
  } );

  it( 'with Drafts full, the row says it is paused until Drafts has room', () => {
    const row = toRow( thread( { touchCount: 1 } ), now, true );
    expect( row.nextWhen ).toBe( 'Paused:' );
    expect( row.next ).toBe( 'the Marketing Assistant writes the follow-up once Drafts has room.' );
  } );

  it( 'only a paused or quiet thread is Stalled', () => {
    expect( toRow( thread( { bucket: 'stalled', mode: 'paused' } ), now ).stalled ).toBeTrue();
    expect( toRow( thread( { bucket: 'stalled', mode: 'paused' } ), now ).queued ).toBeFalse();
  } );

  it( 'a full review queue gets a banner with a way to clear it', () => {
    const counts = { openTaskCount: 0, openDraftCount: 100, openSocialPostCount: 106, taskLimit: 10, draftLimit: 100, socialPostLimit: 100 };
    const banners = heldBanners( { blocked: true, taskBlocked: false, draftBlocked: true, socialPostBlocked: true, counts } );
    expect( banners.map( ( banner ) => banner.label ) ).toEqual( ['Clear drafts', 'Review social posts'] );
    expect( banners[0].link ).toBe( '/drafts' );
    expect( banners[0].text ).toContain( '100 email drafts are waiting for you' );
    expect( heldBanners( null ) ).toEqual( [] );
    expect( heldBanners( { blocked: false, taskBlocked: false, draftBlocked: false, socialPostBlocked: false, counts } ) ).toEqual( [] );
  } );
} );
