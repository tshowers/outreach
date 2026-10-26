/**
 * Catalyst's start date and time (Ty, 2026-10-25): Start now, or pick a day
 * and time; nothing goes out before it (todd-backend scheduleCatalystEmail
 * notBefore). Uses the dev-only ?designPreview=1 sample contacts.
 */
describe( 'Catalyst start date and time', () => {
  beforeEach( () => {
    cy.viewport( 1280, 900 );
    cy.visit( '/email-processor?designPreview=1' );
  } );

  it( 'starts now by default', () => {
    cy.get( '[data-cy="catalyst-start-now"]' ).should( 'have.class', 'is-on' );
    cy.get( '.send__start' ).should( 'contain.text', 'Start' );
    cy.get( '[data-cy="catalyst-start-date"]' ).should( 'not.exist' );
  } );

  it( 'picks a start: tomorrow 9:00 AM, and says nothing goes out before it', () => {
    cy.get( '[data-cy="catalyst-start-later"]' ).click();
    const tomorrow = new Date( Date.now() + 86400000 );
    const value = `${ tomorrow.getFullYear() }-${ String( tomorrow.getMonth() + 1 ).padStart( 2, '0' ) }-${ String( tomorrow.getDate() ).padStart( 2, '0' ) }`;
    cy.get( '[data-cy="catalyst-start-date"]' ).should( 'have.value', value );
    cy.get( '[data-cy="catalyst-start-time"]' ).should( 'have.value', '09:00' );
    cy.get( '[data-cy="catalyst-start-note"]' ).should( 'contain.text', 'Nothing goes out before' ).and( 'contain.text', '9:00 AM' );
    cy.get( '.send__start' ).should( 'contain.text', 'Schedule' );
    // Scheduled: no Auto-send switch - the first email is checked, the rest queue themselves.
    cy.get( '.send__toggle' ).should( 'not.exist' );
    cy.get( '[data-cy="catalyst-schedule-note"]' ).should( 'contain.text', "We'll show you the first email" ).and( 'contain.text', 'are queued for' ).and( 'contain.text', '9:00 AM automatically' );
    cy.get( '[data-cy="catalyst-start-now"]' ).click();
    cy.get( '.send__toggle' ).should( 'exist' );
    cy.get( '[data-cy="catalyst-auto-send-note"]' ).should( 'contain.text', 'Off: Catalyst stops on each email' );
  } );

  it( 'refuses a start in the past', () => {
    cy.get( '[data-cy="catalyst-start-later"]' ).click();
    cy.get( '[data-cy="catalyst-start-date"]' ).invoke( 'val', '2020-01-01' ).trigger( 'input' );
    cy.contains( '.send__note--warn', 'Pick a start time in the future.' );
    cy.get( '.send__start' ).should( 'be.disabled' );
  } );
} );
