// Outreach's first email (design_handoff_outreach_onboarding 4): Maya's draft
// per contact from Network, reviewed, then sent from the user's inbox a few
// minutes apart. Every API call is stubbed.

const row = ( id: string, name: string, over: Record<string, unknown> = {} ) => ( {
  contactId: id, name, email: `${id}@acme.com`, company: `${name.split( ' ' )[1]} Co`, title: 'Founder',
  subject: `Quick question, ${name.split( ' ' )[0]}`, body: `Hi ${name.split( ' ' )[0]},\n\nI noticed your work.\n\nWould 15 minutes next week help?`,
  why: `${name.split( ' ' )[0]} is Founder at ${name.split( ' ' )[1]} Co (from Network), so Maya wrote to that role.`,
  status: 'draft', sentAt: null, error: null, ...over,
} );

const batch = ( over: Record<string, unknown> = {} ) => ( {
  id: 'fs1', status: 'draft', tone: 'default', mailboxAddress: 'ada@analytical.co',
  rows: [row( 'c1', 'Sarah Chen' ), row( 'c2', 'Marcus Bell' ), row( 'c3', 'Priya Raman' )],
  counts: { total: 3, sent: 0, failed: 0 }, nextSendAt: null, ...over,
} );

const onboarding = ( inbox: boolean ) => ( {
  steps: [
    { id: 'connectInbox', title: 'Connect your inbox', detail: '', done: inbox, required: true, available: true },
    { id: 'profile', title: 'Check your profile', detail: '', done: true, required: true, available: true },
    { id: 'firstSend', title: 'Send your first email', detail: '', done: false, required: true, available: inbox },
    { id: 'bulkSending', title: 'Set up bulk sending', detail: '', done: false, required: false, available: true },
  ],
  completedSteps: inbox ? 2 : 1, totalSteps: 4, requiredDone: false, allDone: false, showChecklist: true, firstName: 'Ada',
  mailboxAddress: inbox ? 'ada@analytical.co' : '', profileCompletion: { percent: 100, completed: 8, total: 8, missing: [] },
  aiProfile: { missing: 0, total: 4 }, bulkStatus: 'off', counts: { mailboxes: inbox ? 1 : 0, sent: 0 }, state: { bulkDismissedAt: null },
} );

const complete = { isComplete: true, companyName: 'Analytical Co', mailingAddress: '1 Main St, Chicago, IL' };

function arrive ( { inbox = true, latest = null as unknown, compliance = complete as unknown, handoff = true } = {} ) {
  cy.intercept( 'GET', '**/api/account/summary*', { statusCode: 200, body: { success: true, data: { writeAccess: { outreach: true } } } } );
  cy.intercept( 'GET', '**/api/outreach/onboarding*', { statusCode: 200, body: { success: true, data: onboarding( inbox ) } } );
  cy.intercept( 'GET', '**/api/outreach/first-send/latest*', { statusCode: 200, body: { success: true, data: latest, compliance } } ).as( 'latest' );
  cy.visit( '/help' );
  cy.window().then( ( win ) => {
    if ( handoff ) win.localStorage.setItem( 'outreach_network_handoff', JSON.stringify( { contactIds: ['c1', 'c2', 'c3'], at: new Date().toISOString() } ) );
    else win.localStorage.removeItem( 'outreach_network_handoff' );
  } );
}

describe( 'Outreach first email', () => {
  it( 'drafts one email per Network contact and shows why', () => {
    arrive();
    cy.intercept( 'POST', '**/api/outreach/first-send?*', { statusCode: 201, body: { success: true, data: batch() } } ).as( 'create' );
    cy.loginAsTestUser( '/setup/first-email' );

    cy.wait( '@create' ).its( 'request.body' ).should( 'deep.equal', { contactIds: ['c1', 'c2', 'c3'] } );
    cy.get( '[data-cy="first-email-heading"]' ).should( 'have.text', 'Your first email, written by the Marketing Assistant' );
    cy.get( '[data-cy="first-email-person"]' ).should( 'have.length', 3 );
    cy.get( '[data-cy="first-email-preview"]' ).should( 'contain.text', 'ada@analytical.co' ).and( 'contain.text', 'Quick question, Sarah' )
      .and( 'contain.text', 'Why the Marketing Assistant wrote it this way' );
    cy.get( '[data-cy="first-email-person"]' ).eq( 2 ).click();
    cy.get( '[data-cy="first-email-preview"]' ).should( 'contain.text', 'Priya Raman <c3@acme.com>' );
    cy.get( '[data-cy="first-email-send"]' ).should( 'contain.text', 'Send 3 from ada@analytical.co' );
    cy.screenshot( 'first-email/review', { capture: 'viewport' } );
  } );

  it( 'sends, shows progress, and says what happens next', () => {
    arrive( { latest: batch() } );
    cy.intercept( 'POST', '**/api/outreach/first-send/fs1/send*', { statusCode: 200, body: { success: true, data: batch( {
      status: 'sending', rows: [row( 'c1', 'Sarah Chen', { status: 'sent' } ), row( 'c2', 'Marcus Bell', { status: 'queued' } ), row( 'c3', 'Priya Raman', { status: 'queued' } )],
      counts: { total: 3, sent: 1, failed: 0 } } ) } } ).as( 'send' );
    cy.loginAsTestUser( '/setup/first-email' );

    cy.get( '[data-cy="first-email-send"]', { timeout: 15000 } ).should( 'not.be.disabled' ).click();
    cy.wait( '@send' );
    cy.get( '[data-cy="first-email-heading"]' ).should( 'have.text', 'Sending 2 of 3…' );
    cy.contains( 'You can leave this page. Sending carries on.' );
    cy.get( '[data-cy="first-email-rows"] li' ).first().should( 'contain.text', 'Sent' );
    cy.screenshot( 'first-email/sending', { capture: 'viewport' } );

    cy.intercept( 'GET', '**/api/outreach/first-send/latest*', { statusCode: 200, body: { success: true, compliance: complete, data: batch( {
      status: 'done', rows: [row( 'c1', 'Sarah Chen', { status: 'sent' } ), row( 'c2', 'Marcus Bell', { status: 'sent' } ), row( 'c3', 'Priya Raman', { status: 'sent' } )],
      counts: { total: 3, sent: 3, failed: 0 } } ) } } );
    cy.get( '[data-cy="first-email-heading"]', { timeout: 8000 } ).should( 'have.text', '3 emails sent.' );
    cy.get( '[data-cy="first-email-next"]' ).should( 'contain.text', 'What happens now' ).and( 'contain.text', 'usually within two days' );
  } );

  it( 'rewrites them softer and back', () => {
    arrive( { latest: batch() } );
    cy.intercept( 'POST', '**/api/outreach/first-send/fs1/redraft*', ( req ) =>
      req.reply( { statusCode: 200, body: { success: true, data: batch( { tone: req.body.tone } ) } } ) ).as( 'redraft' );
    cy.loginAsTestUser( '/setup/first-email' );

    cy.get( '[data-cy="first-email-tone"]', { timeout: 15000 } ).should( 'contain.text', 'Try a softer version' ).click();
    cy.wait( '@redraft' ).its( 'request.body' ).should( 'deep.equal', { tone: 'softer' } );
    cy.get( '[data-cy="first-email-tone"]' ).should( 'contain.text', 'Back to first version' );
  } );

  it( 'asks for the mailing address the footer needs before sending', () => {
    arrive( { latest: batch(), compliance: { isComplete: false, companyName: 'Analytical Co', mailingAddress: '' } } );
    cy.intercept( 'PUT', '**/api/outreach/compliance-address*', { statusCode: 200, body: { success: true, compliance: complete } } ).as( 'address' );
    cy.loginAsTestUser( '/setup/first-email' );

    cy.get( '[data-cy="first-email-address"]', { timeout: 15000 } ).should( 'contain.text', 'Your mailing address' );
    cy.get( '[data-cy="first-email-send"]' ).should( 'be.disabled' );
    cy.get( '[data-cy="address-street"]' ).type( '1 Main St' );
    cy.get( '[data-cy="address-city"]' ).type( 'Chicago' );
    cy.get( '[data-cy="address-save"]' ).click();
    cy.wait( '@address' ).its( 'request.body' ).should( 'include', { streetAddress: '1 Main St', city: 'Chicago', country: 'US' } );
    cy.get( '[data-cy="first-email-address"]' ).should( 'not.exist' );
    cy.get( '[data-cy="first-email-send"]' ).should( 'not.be.disabled' );
  } );

  it( 'waits for the inbox before sending', () => {
    arrive( { inbox: false, latest: batch( { mailboxAddress: '' } ) } );
    cy.loginAsTestUser( '/setup/first-email' );
    cy.contains( 'Connect your inbox first', { timeout: 15000 } );
    cy.get( '[data-cy="first-email-send"]' ).should( 'be.disabled' );
  } );

  it( 'offers Outreach to an unpaid user instead of drafting', () => {
    arrive();
    cy.intercept( 'POST', '**/api/outreach/first-send?*', { statusCode: 403, body: { success: false, error: 'APP_PURCHASE_REQUIRED' } } );
    cy.loginAsTestUser( '/setup/first-email' );
    cy.contains( 'Writing and sending them needs Outreach.', { timeout: 15000 } );
  } );

  it( 'explains where contacts come from when there are none yet', () => {
    arrive( { handoff: false } );
    cy.loginAsTestUser( '/setup/first-email' );
    cy.contains( 'h1', 'Who should hear from you first?', { timeout: 15000 } );
  } );
} );
