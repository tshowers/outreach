// Coverage for every route the platform menu (top-right hamburger, global
// on every page - see app.component.html) links to for a signed-in user,
// driven the same way a person would: open the menu, click the link,
// land on the page. See platform-menu.component.ts's `baseOutreachLinks`
// for the source of truth this list mirrors.
describe('Platform menu navigation', () => {
  const openMenu = () => cy.get('.platform-menu-trigger').click();

  beforeEach(() => {
    cy.loginAsTestUser('/app');
    cy.location('pathname', { timeout: 15000 }).should('eq', '/app');
  });

  const menuLinks: Array<{ label: string; route: string }> = [
    // landingRedirectGuard sends a signed-in visitor to '/' straight to
    // /app, so "Home" lands there rather than on '/' itself.
    { label: 'Home', route: '/app' },
    { label: 'Growth', route: '/app' },
    { label: 'Inbox', route: '/inbox-access' },
    { label: 'Outbox', route: '/signal-engine' },
    { label: 'Catalyst', route: '/email-processor' },
    { label: 'Email Composer', route: '/compose-email' },
    { label: 'iOS App', route: '/ios' },
  ];

  menuLinks.forEach(({ label, route }) => {
    it(`navigates to ${route} via the "${label}" menu link`, () => {
      openMenu();
      cy.contains('.platform-menu-route', label).click();
      cy.location('pathname', { timeout: 10000 }).should('eq', route);
    });
  });

  it('signs out via the menu', () => {
    openMenu();
    cy.contains('.platform-menu-route', 'Sign Out').click();

    // Signing out is async (a real Firebase call, even against the
    // emulator), and races the same click's routerLink navigation, so the
    // reliable signal is the menu itself flipping back to a signed-out
    // state rather than any one intermediate URL.
    openMenu();
    cy.contains('.platform-menu-route', 'Sign In', { timeout: 10000 }).should('exist');
  });
});
