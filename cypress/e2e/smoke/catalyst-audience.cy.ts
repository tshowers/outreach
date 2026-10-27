/**
 * Catalyst's Choose who (Ty, 2026-10-25): the stale queue by default, or a
 * group (No company, Subscribers, Affiliates, Resellers) or a category.
 * Uses the dev-only ?designPreview=1 sample contacts.
 */
describe( 'Catalyst Choose who', () => {
  beforeEach( () => {
    cy.viewport( 1280, 900 );
    cy.visit( '/email-processor?designPreview=1' );
  } );

  it( 'starts on the stale queue, with the groups and categories listed', () => {
    cy.get( '[data-cy="catalyst-audience"]' ).should( 'have.value', 'stale' );
    cy.contains( '#choose-title', 'People you may have forgotten' );
    cy.get( '[data-cy="catalyst-audience"] optgroup[label="Groups"] option' ).then( ( options ) => {
      expect( [...options].map( ( option ) => option.textContent?.trim() ) ).to.deep.equal( ['No company (3)', 'Subscribers (2)', 'Affiliates (3)', 'Resellers (0)'] );
    } );
    cy.get( '[data-cy="catalyst-audience"] optgroup[label="Categories"]' ).should( 'contain', 'Fashion (72)' );
  } );

  it( 'Affiliates includes people with no company, and warns about {{company}}', () => {
    cy.get( '[data-cy="catalyst-audience"]' ).select( 'group:affiliates' );
    cy.contains( '#choose-title', 'Affiliates' );
    cy.get( '[data-cy="catalyst-audience-summary"]' ).should( 'contain', '3 can be emailed' );
    cy.contains( '.up-next__row', 'Ana Ruiz' ).should( 'contain', 'No company' );
    cy.get( '[data-cy="catalyst-no-company-warning"]' ).should( 'contain', '2 of these have no company' );
  } );

  it( 'leaves out anyone emailed in the last 3 days', () => {
    cy.get( '[data-cy="catalyst-audience"]' ).select( 'group:subscribers' );
    cy.get( '[data-cy="catalyst-audience-summary"]' ).should( 'contain', '1 can be emailed' );
    cy.contains( '.up-next__row', 'Di Okafor' );
    cy.contains( '.up-next__row', 'Ed Lund' ).should( 'not.exist' );
  } );

  it( 'an empty group says so', () => {
    cy.get( '[data-cy="catalyst-audience"]' ).select( 'group:resellers' );
    cy.contains( '.up-next__empty', 'Nobody in this audience can be emailed right now.' );
  } );

  // Recent runs: an unfinished run can be picked back up (2026-10-27).
  it( "Resume loads an unfinished run's people who haven't been emailed", () => {
    cy.get( '[data-cy="catalyst-run-resume-r3"]' ).click();
    cy.get( '[data-cy="catalyst-audience"]' ).should( 'have.value', 'run:r3' );
    cy.contains( '#choose-title', 'No company · Oct 26 (not emailed yet)' );
    // Ed Lund was emailed after the run started, so he's left out.
    cy.contains( '.choose__note', "2 of 3 haven't been emailed yet" );
    cy.get( '[data-cy="catalyst-run-stop-r3"]' ).should( 'exist' );
  } );
} );
