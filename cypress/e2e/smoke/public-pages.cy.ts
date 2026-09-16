describe('Public pages', () => {
  it('loads the landing page', () => {
    cy.visit('/');
    cy.contains('Outreach');
    cy.contains('more follow-up clarity');
  });

  it('loads the pricing page', () => {
    cy.visit('/pricing');
    cy.location('pathname').should('eq', '/pricing');
  });

  it('loads the iOS app showcase page', () => {
    cy.visit('/ios');
    cy.location('pathname').should('eq', '/ios');
  });

  it('redirects unknown routes to /app', () => {
    cy.visit('/this-route-does-not-exist');
    cy.location('pathname').should('eq', '/app');
  });
});
