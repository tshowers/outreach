// Runs only against `ng serve --configuration=e2e` (see the "e2e:auth" npm
// script), which points the app at the local Firebase Auth/Firestore
// emulators instead of live Firebase (see app.config.ts). That lets us
// sign in as a fake user through the app's real callback flow
// (AuthCallbackComponent -> OutreachAuthService.signInWithCustomToken)
// without ever touching real credentials or the production project.
describe('Authenticated outreach flow', () => {
  const protectedRoutes = ['/signal-engine', '/inbox-access', '/engagement', '/email-processor', '/compose-email'];

  protectedRoutes.forEach((route) => {
    it(`reaches ${route} once signed in`, () => {
      cy.loginAsTestUser(route);
      cy.location('pathname', { timeout: 15000 }).should('eq', route);
    });
  });

  it('does not redirect back to the hosted login once signed in', () => {
    cy.loginAsTestUser('/app');
    cy.location('pathname', { timeout: 15000 }).should('eq', '/app');
  });
});
