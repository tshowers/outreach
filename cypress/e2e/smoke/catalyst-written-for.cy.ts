/**
 * An email from the Marketing Assistant carries the audience it was written
 * for (Ty, 2026-10-31): Catalyst preselects the contacts who match, or says
 * the list isn't that audience. Uses the dev-only ?designPreview=1 sample
 * contacts, with the handoff read stubbed.
 */
describe( 'Catalyst with an email written for an audience', () => {
  const handoff = ( audienceMatch: unknown ) => ( {
    success: true,
    data: { kind: 'email-template', subject: 'Agencies: never drop a client thread again', preheader: '', html: '<p>Hi {{firstName}}</p>', tokens: ['firstName'], audience: 'Agencies/consultants', audienceMatch },
  } );

  beforeEach( () => cy.viewport( 1280, 900 ) );

  it( 'preselects the contacts who match it', () => {
    cy.intercept( 'GET', '**/email-creator/handoff/h1*', handoff( { contactIds: ['preview-0-0', 'preview-0-1', 'preview-2-0'], terms: ['consulting', 'agency'], total: 3 } ) );
    cy.visit( '/email-processor?designPreview=1&emailCreatorHandoff=h1' );
    cy.get( '[data-cy="catalyst-audience"]' ).should( 'have.value', 'match:written-for' );
    cy.contains( '#choose-title', 'Written for: Agencies/consultants' );
    cy.contains( '.choose__note', 'Matched to "Agencies/consultants" by industry, title or company (consulting, agency)' );
    cy.get( '[data-cy="catalyst-audience-summary"]' ).should( 'contain', '3 can be emailed' );
    cy.get( '[data-cy="catalyst-written-for-warning"]' ).should( 'not.exist' );

    // Picking another list is allowed, with a reminder of who the email was for.
    cy.get( '[data-cy="catalyst-audience"]' ).select( 'stale' );
    cy.get( '[data-cy="catalyst-written-for-warning"]' ).should( 'contain', 'This email was written for Agencies/consultants, and this list isn\'t that audience' );
  } );

  it( 'says so when nobody matches, and leaves the choice to the user', () => {
    cy.intercept( 'GET', '**/email-creator/handoff/h1*', handoff( { contactIds: [], terms: ['agency'], total: 0 } ) );
    cy.visit( '/email-processor?designPreview=1&emailCreatorHandoff=h1' );
    cy.get( '[data-cy="email-creator-template-loaded"]' ).should( 'exist' );
    cy.get( '[data-cy="catalyst-audience"]' ).should( 'have.value', 'stale' );
    cy.get( '[data-cy="catalyst-written-for-warning"]' ).should( 'contain', 'none of your contacts clearly match that' );
  } );
} );
