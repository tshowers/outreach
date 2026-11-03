import { MomentumThread } from '../../models/momentum-thread.model';
import { isNeedsYou, needsAnswer, needsYouKind, needsYouWhy, primaryAction } from './needs-you.util';

describe( 'needs-you.util', () => {
  const notSent = {
    id: 't1', contactName: 'Aaron Mounsey', mode: 'handoff',
    needsYouReason: { key: 'send_blocked', label: 'Follow-up not sent', reason: 'Your company profile is missing a name or mailing address.', nextMove: '' },
  } as unknown as MomentumThread;

  it( 'a follow-up that did not send is not a reply and can be cleared', () => {
    expect( needsYouKind( notSent ) ).toBe( 'not_sent' );
    expect( needsAnswer( notSent ) ).toBeFalse();
    expect( primaryAction( notSent ) ).toBe( 'mark_done' );
  } );

  it( 'says the real reason it did not send', () => {
    expect( needsYouWhy( notSent ).detail ).toContain( 'mailing address' );
  } );

  it( 'never says someone replied when they did not (Ty, 2026-11-03)', () => {
    const silent = { id: 't2', contactName: 'Vincent', mode: 'handoff', signalState: 'clicked', lastSentAt: '2026-03-27T18:00:00Z',
      needsYouReason: { key: 'needs_human', label: 'Needs human', reason: '', nextMove: '' } } as unknown as MomentumThread;
    expect( needsYouKind( silent ) ).toBe( 'no_reply' );
    expect( needsYouWhy( silent ).title ).toBe( "Vincent hasn't replied" );
    expect( needsYouWhy( silent ).detail ).toContain( 'Mar 27, 2026' );
    expect( primaryAction( silent ) ).toBe( 'mark_done' );
  } );

  it( 'a conversation handed back with no reply is a reset, not Needs you (Ty, 2026-11-03)', () => {
    const pavle = { id: 't4', contactName: 'Pavle Biotech', mode: 'handoff', userLane: 'plan', bucket: 'needs_you', signalState: 'opened', replyCount: 0, operatorTakeoverBlocker: 'missing_sender_all_sources' } as unknown as MomentumThread;
    const awaitingOk = { id: 't5', contactName: 'Ok', mode: 'handoff', userLane: 'plan', bucket: 'needs_you', signalState: 'opened', replyCount: 0, replyDraftSubject: 'Hi', replyDraftBody: 'For your OK.' } as unknown as MomentumThread;
    const lester = { id: 't6', contactName: 'Lester Blair', mode: 'handoff', userLane: 'plan', bucket: 'needs_you', signalState: 'replied', replyCount: 8, latestReplyText: 'Here is the link.' } as unknown as MomentumThread;
    expect( isNeedsYou( pavle ) ).toBeFalse();
    expect( isNeedsYou( awaitingOk ) ).toBeTrue();
    expect( isNeedsYou( lester ) ).toBeTrue();
  } );

  it( 'a real reply is still a reply', () => {
    const replied = { id: 't3', contactName: 'Lester Blair', mode: 'handoff', signalState: 'replied', latestReplyText: 'Here is the link.' } as unknown as MomentumThread;
    expect( needsYouKind( replied ) ).toBe( 'reply' );
    expect( needsYouWhy( replied ).title ).toBe( 'Lester replied' );
  } );
} );
