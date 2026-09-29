/**
 * Outreach's pre-sign-in wizard at /get-started: which email they send
 * from (address only - never a password), who hosts it, what connecting
 * means, then name, then TODD's hosted login. The draft survives that
 * redirect in localStorage; after sign-in the visitor lands on
 * /inbox-access pre-filled (OutreachSignupDraftService.submitIfPending).
 */
describe( 'Outreach get started wizard', () => {
  const storageKey = 'outreach_signup_draft';

  beforeEach( () => cy.clearLocalStorage() );

  it( 'asks for the email, detects the provider, and saves no password', () => {
    cy.visit( '/get-started' );
    cy.get( '[data-cy="get-started-progress"] li' ).should( 'have.length', 4 );
    cy.get( '[data-cy="get-started-progress"] li' ).eq( 0 ).should( 'have.class', 'is-done' );

    cy.get( '[data-cy="get-started-next"]' ).should( 'be.disabled' );
    cy.get( '[data-cy="get-started-input"]' ).type( 'ada@icloud.com' );
    cy.get( '[data-cy="get-started-next"]' ).click();

    cy.contains( '[data-cy="get-started-question"]', 'Who hosts that email?' );
    cy.contains( '[data-cy="get-started-provider"]', 'iCloud' ).should( 'have.attr', 'aria-checked', 'true' );
    cy.get( '[data-cy="get-started-next"]' ).click();

    cy.get( '[data-cy="get-started-preview"]' ).should( 'contain.text', 'ada@icloud.com' ).and( 'contain.text', 'app password' );
    cy.get( '[data-cy="get-started-next"]' ).should( 'contain.text', 'Continue to sign up' ).click();

    cy.get( '[data-cy="get-started-input"]' ).type( 'Ada{enter}' );
    cy.get( '[data-cy="get-started-input"]' ).type( 'Lovelace{enter}' );

    cy.contains( '[data-cy="get-started-question"]', 'create your account' );
    cy.window().then( ( win ) => {
      const raw = win.localStorage.getItem( storageKey ) || '{}';
      expect( JSON.parse( raw ) ).to.include( {
        emailAddress: 'ada@icloud.com', provider: 'icloud', firstName: 'Ada', lastName: 'Lovelace', readyToSubmit: true,
      } );
      expect( raw.toLowerCase() ).not.to.include( 'password' );
    } );
  } );

  it( 'lets the visitor correct the provider', () => {
    cy.visit( '/get-started' );
    cy.get( '[data-cy="get-started-input"]' ).type( 'ada@company.com' );
    cy.get( '[data-cy="get-started-next"]' ).click();
    cy.contains( '[data-cy="get-started-provider"]', 'Gmail / Google Workspace' ).should( 'have.attr', 'aria-checked', 'true' );
    cy.contains( '[data-cy="get-started-provider"]', 'Outlook / Microsoft 365' ).click().should( 'have.attr', 'aria-checked', 'true' );
  } );

  it( 'links returning users straight to sign-in', () => {
    cy.visit( '/get-started' );
    cy.get( '[data-cy="get-started-existing"]' ).should( 'have.attr', 'href' ).and( 'include', '/login' );
  } );

  it( 'sends old Stripe checkout links to the app', () => {
    cy.visit( '/success?session_id=old-session' );
    cy.location( 'pathname' ).should( 'eq', '/app' );
  } );
} );
