/**
 * TODD Suite ($99/mo, every app - Ty 2026-10-21) from Outreach's /pricing:
 * the Suite card, the shared write-access prompt, and Stripe checkout
 * through todd-backend /api/billing/checkout (product "suite"). Stripe and
 * the backend are stubbed here; cypress/e2e in taliferrotech/frontend has
 * the on-demand run against real Stripe test mode.
 */
const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_suite';

describe( 'TODD Suite on Outreach /pricing', () => {
  it( 'offers Suite at $99/month next to the Outreach plan', () => {
    cy.visit( '/pricing' );
    cy.get( '[data-cy="get-the-app"]' ).should( 'be.visible' );
    cy.get( '[data-cy="get-the-app-suite"]' )
      .should( 'contain.text', '16Ahead Suite' )
      .and( 'contain.text', '$99' )
      .and( 'contain.text', 'Network, Pulse, and Docs & Knowledge' )
      .and( 'contain.text', 'The Marketing Assistant and Social' )
      .and( 'contain.text', '10x the daily Image Creator and Email Creator allowance' );
  } );

  it( 'asks a signed-out visitor to sign in first, and brings them back to pricing', () => {
    cy.visit( '/pricing' );
    cy.get( '[data-cy="get-the-app-suite-subscribe"]' ).click();
    cy.get( '[data-cy="write-access-prompt"]' ).should( 'contain.text', 'Sign in to get 16Ahead Suite' );
    cy.get( '[data-cy="write-access-prompt"]' ).contains( 'button', 'Sign in' ).click();
    cy.location( 'pathname' ).should( 'eq', '/get-started' );
    cy.location( 'search' ).should( 'include', 'returnUrl=%2Fpricing' );
  } );
} );
