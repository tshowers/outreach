// Outreach's first session (design_handoff_outreach_onboarding 1–3): arriving
// from Network, the Setup pill, the guided inbox connect and the profile
// check. Every API call is stubbed (the support file blocks the rest).

type Step = { id: string; title: string; detail: string; done: boolean; required: boolean; available: boolean };

const step = ( id: string, title: string, over: Partial<Step> = {} ): Step =>
  ( { id, title, detail: '', done: false, required: id !== 'bulkSending', available: true, ...over } );

function onboarding ( over: Record<string, unknown> = {}, steps?: Step[] ) {
  const list = steps || [
    step( 'connectInbox', 'Connect your inbox', { detail: 'Required. Emails send from your address' } ),
    step( 'profile', 'Check your profile', { detail: '3 answers missing' } ),
    step( 'firstSend', 'Send your first email', { detail: 'Maya drafts it from your profile', available: false } ),
    step( 'bulkSending', 'Set up bulk sending', { detail: 'Optional. Needed for campaigns and drips' } ),
  ];
  const completed = list.filter( ( s ) => s.done ).length;
  return {
    steps: list, completedSteps: completed, totalSteps: list.length, allDone: completed === list.length,
    requiredDone: list.filter( ( s ) => s.required ).every( ( s ) => s.done ), showChecklist: true,
    firstName: 'Ada', mailboxAddress: '', profileCompletion: { percent: 63, completed: 5, total: 8, missing: [] },
    aiProfile: { missing: 3, total: 4 }, bulkStatus: 'off', counts: { mailboxes: 0, sent: 0 }, state: { bulkDismissedAt: null },
    ...over,
  };
}

const profile = {
  email: 'ada@analytical.co', firstName: 'Ada', lastName: 'Lovelace', profession: 'Owner', companyName: 'Analytical Co',
  companyDescription: 'Analytical Co builds software that helps businesses work faster and get more done.',
  valueProp: '', jobDescriptionForTODD: '', companyGoal: '', timezone: 'America/Chicago', phone: '',
};

const stubOnboarding = ( body: unknown ) =>
  cy.intercept( 'GET', '**/api/outreach/onboarding*', { statusCode: 200, body: { success: true, data: body } } ).as( 'onboarding' );

describe( 'Outreach onboarding', () => {
  beforeEach( () => {
    cy.intercept( 'GET', '**/api/account/summary*', { statusCode: 200, body: { success: true, data: { writeAccess: { outreach: true } } } } ).as( 'writeAccess' );
  } );

  it( 'opens Arrive, not the composer, when Network sends a new user over', () => {
    stubOnboarding( onboarding() );
    cy.loginAsTestUser( '/compose-email?contactIds=c1,c2,c3&source=network&draft=profile' );

    cy.location( 'pathname', { timeout: 15000 } ).should( 'eq', '/app' );
    cy.get( '[data-cy="arrive-title"]' ).should( 'have.text', 'Welcome to Outreach, Ada. Your contacts are here.' );
    cy.get( '[data-cy="arrive-handoff"]' ).should( 'contain.text', '3 contacts from Network' );
    cy.get( '[data-cy="arrive-step"]' ).should( 'have.length', 4 ).first().should( 'have.class', 'is-current' )
      .and( 'contain.text', 'Required' ).and( 'contain.text', 'Nothing sends without this.' );
    cy.get( '[data-cy="arrive-step"]' ).eq( 3 ).should( 'contain.text', 'Optional' ).and( 'contain.text', 'Not now' );
    cy.get( '[data-cy="arrive-action-connectInbox"]' ).should( 'have.attr', 'href', '/inbox-access' );
    cy.screenshot( 'onboarding/arrive', { capture: 'viewport' } );

    cy.get( '[data-cy="setup-pill"]' ).should( 'contain.text', 'Setup' ).click();
    cy.get( '[data-cy="setup-checklist"]' ).should( 'contain.text', 'Get Outreach sending' );
    cy.get( '[data-cy="setup-step"]' ).should( 'have.length', 4 ).first().find( '.sc-mark' ).should( 'have.class', 'is-current' );
  } );

  it( 'opens the composer when a set-up user follows a Network link', () => {
    stubOnboarding( onboarding( { requiredDone: true }, [
      step( 'connectInbox', 'Connect your inbox', { done: true } ), step( 'profile', 'Check your profile', { done: true } ),
      step( 'firstSend', 'Send your first email', { done: true } ), step( 'bulkSending', 'Set up bulk sending' ),
    ] ) );
    cy.loginAsTestUser( '/compose-email?contactIds=c1&source=network&draft=profile' );
    cy.location( 'pathname', { timeout: 15000 } ).should( 'eq', '/compose-email' );
  } );

  it( 'shows "You\'re set up" above the dashboard until bulk sending is decided', () => {
    stubOnboarding( onboarding( { requiredDone: true, completedSteps: 3 }, [
      step( 'connectInbox', 'Connect your inbox', { done: true } ), step( 'profile', 'Check your profile', { done: true } ),
      step( 'firstSend', 'Send your first email', { done: true } ), step( 'bulkSending', 'Set up bulk sending' ),
    ] ) );
    cy.intercept( 'PATCH', '**/api/outreach/onboarding*', { statusCode: 200, body: { success: true, data: onboarding( { requiredDone: true, showChecklist: false } ) } } ).as( 'dismiss' );
    cy.loginAsTestUser( '/app' );

    cy.get( '[data-cy="arrive-title"]', { timeout: 15000 } ).should( 'have.text', 'You\'re set up, Ada.' );
    cy.get( '[data-cy="arrive-step"]' ).should( 'have.length', 1 ).and( 'contain.text', 'Set up bulk sending' );
    cy.get( '.needs-you' ).should( 'exist' );
    cy.contains( '[data-cy="arrive-step"] button', 'Not now' ).click();
    cy.wait( '@dismiss' ).its( 'request.body' ).should( 'deep.equal', { dismissBulk: true } );
    cy.get( '[data-cy="arrive"]' ).should( 'not.exist' );
  } );

  it( 'connects an inbox with an app password and ticks off each check', () => {
    stubOnboarding( onboarding() );
    cy.intercept( 'GET', '**/api/outreach/mailboxes*', { statusCode: 200, body: { success: true, data: [] } } ).as( 'mailboxes' );
    cy.intercept( 'GET', '**/api/outreach/provider-hint*', { statusCode: 200, body: { success: true, data: { provider: 'microsoft' } } } ).as( 'hint' );
    cy.intercept( 'POST', '**/api/outreach/mailboxes/test*', { statusCode: 200, body: { success: true, message: 'ok', data: { success: true, checks: { smtpVerified: true, imapVerified: true } } } } ).as( 'testConnection' );
    cy.intercept( 'POST', '**/api/outreach/mailboxes*', { statusCode: 200, body: { success: true, data: {} } } ).as( 'save' );
    cy.loginAsTestUser( '/inbox-access?email=ada@analytical.co' );

    cy.contains( '[data-cy="inbox-guided"] h1', 'Connect the inbox you send from', { timeout: 15000 } );
    cy.get( '[data-cy="guided-email"]' ).should( 'have.value', 'ada@analytical.co' );
    cy.wait( ['@mailboxes', '@hint'] );
    cy.get( '[data-cy="guided-chip-microsoft"]' ).should( 'have.class', 'is-on' );
    cy.contains( 'Microsoft sign-in is coming.' );
    cy.screenshot( 'onboarding/connect-inbox', { capture: 'viewport' } );

    cy.get( '[data-cy="guided-password"]' ).type( 'abcd efgh ijkl mnop' );
    cy.get( '[data-cy="guided-connect"]' ).click();
    cy.wait( '@testConnection' ).its( 'request.body' ).should( 'include', { emailAddress: 'ada@analytical.co', provider: 'outlook' } );
    cy.wait( '@save' );
    cy.get( '[data-cy="guided-connected"]', { timeout: 6000 } ).should( 'contain.text', 'ada@analytical.co is ready' );
    cy.get( '[data-cy="guided-next"]' ).should( 'contain.text', 'Next: your profile' );
  } );

  it( 'names the check that failed', () => {
    stubOnboarding( onboarding() );
    cy.intercept( 'GET', '**/api/outreach/mailboxes*', { statusCode: 200, body: { success: true, data: [] } } );
    cy.intercept( 'GET', '**/api/outreach/mailboxes*', { statusCode: 200, body: { success: true, data: [] } } ).as( 'mailboxes' );
    cy.intercept( 'POST', '**/api/outreach/mailboxes/test*', { statusCode: 200, body: { success: true, data: { checks: { smtpVerified: false, imapVerified: true } } } } );
    cy.loginAsTestUser( '/inbox-access?email=ada@yahoo.com' );

    cy.wait( '@mailboxes', { timeout: 15000 } );
    cy.get( '[data-cy="guided-chip-yahoo"]' ).click();
    cy.get( '[data-cy="guided-password"]' ).type( 'secret' );
    cy.get( '[data-cy="guided-connect"]' ).click();
    cy.get( '[data-cy="guided-failure"]', { timeout: 6000 } ).should( 'contain.text', 'couldn\'t send from ada@yahoo.com' );
  } );

  it( 'shows the inbox as ready when Google sends the user back', () => {
    stubOnboarding( onboarding( {}, [
      step( 'connectInbox', 'Connect your inbox', { done: true } ), step( 'profile', 'Check your profile', { done: true } ),
      step( 'firstSend', 'Send your first email' ), step( 'bulkSending', 'Set up bulk sending' ),
    ] ) );
    cy.intercept( 'GET', '**/api/outreach/mailboxes*', { statusCode: 200, body: { success: true, data: [{ id: 'm1', emailAddress: 'ada@analytical.co', provider: 'gmail', isPrimary: true, auth: { mode: 'oauth' }, imap: {}, smtp: {} }] } } );
    cy.loginAsTestUser( '/inbox-access?mailboxConnect=1&mailboxConnectStatus=success' );

    cy.get( '[data-cy="guided-connected"]', { timeout: 15000 } ).should( 'contain.text', 'ada@analytical.co is ready' );
    cy.get( '[data-cy="guided-next"]' ).should( 'contain.text', 'See your first email' );
  } );

  it( 'checks the profile one field at a time and saves to the shared profile', () => {
    stubOnboarding( onboarding( {}, [
      step( 'connectInbox', 'Connect your inbox', { done: true } ), step( 'profile', 'Check your profile' ),
      step( 'firstSend', 'Send your first email' ), step( 'bulkSending', 'Set up bulk sending' ),
    ] ) );
    cy.intercept( 'GET', '**/api/profile*', { statusCode: 200, body: { success: true, profile } } );
    cy.intercept( 'PATCH', '**/api/profile*', ( req ) => req.reply( { statusCode: 200, body: { success: true, profile: { ...profile, ...req.body.profile } } } ) ).as( 'save' );
    cy.visit( '/help' );
    cy.window().then( ( win ) => win.localStorage.setItem( 'outreach_network_handoff', JSON.stringify( { contactIds: ['c1'], at: new Date().toISOString() } ) ) );
    cy.loginAsTestUser( '/setup/profile' );

    cy.get( '[data-cy="setup-profile-title"]', { timeout: 15000 } ).should( 'have.text', 'Finish your profile' );
    cy.get( '[data-cy="setup-profile-row"]' ).first().should( 'contain.text', 'What your company does' ).and( 'contain.text', 'From Network' );
    cy.get( '[data-cy="setup-profile-row"]' ).eq( 1 ).should( 'have.class', 'is-editing' );
    cy.get( '[data-cy="setup-profile-row"]' ).eq( 2 ).should( 'contain.text', 'What 16Ahead should do for you each week' );
    cy.get( '[data-cy="setup-profile-next"]' ).should( 'be.disabled' );
    cy.contains( '3 left. About a minute.' );
    cy.screenshot( 'onboarding/profile-check', { capture: 'viewport' } );

    cy.contains( '[data-cy="setup-profile-choice"]', 'Personal service' ).click();
    cy.get( '[data-cy="setup-profile-save"]' ).click();
    cy.wait( '@save' ).its( 'request.body.profile.valueProp' ).should( 'contain', 'personal service' );
    cy.contains( 'Saved to your 16Ahead profile' );
    cy.get( '[data-cy="setup-profile-row"]' ).eq( 2 ).should( 'have.class', 'is-editing' );
  } );

  it( 'asks an unpaid user to subscribe instead of saving', () => {
    cy.intercept( 'GET', '**/api/account/summary*', { statusCode: 200, body: { success: true, data: { writeAccess: { outreach: false } } } } );
    stubOnboarding( onboarding() );
    cy.intercept( 'GET', '**/api/profile*', { statusCode: 200, body: { success: true, profile } } );
    cy.intercept( 'PATCH', '**/api/profile*', cy.spy().as( 'save' ) );
    cy.loginAsTestUser( '/setup/profile' );

    cy.contains( '[data-cy="setup-profile-choice"]', 'Save time', { timeout: 15000 } ).click();
    cy.get( '[data-cy="setup-profile-save"]' ).click();
    cy.get( '[data-cy="write-access-prompt"]' ).should( 'be.visible' );
    cy.get( '@save' ).should( 'not.have.been.called' );
  } );
} );
