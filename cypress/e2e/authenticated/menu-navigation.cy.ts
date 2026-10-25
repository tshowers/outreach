// Coverage for every route the platform menu (top-right hamburger, global
// on every page - see app.component.html) links to for a signed-in user,
// driven the same way a person would: open the menu, click the link,
// land on the page. See platform-menu.component.ts's `baseOutreachLinks`
// for the source of truth this list mirrors.
describe('Platform menu navigation', () => {
  // On a laptop-width window the sidebar's Menu button opens it (the header trigger is hidden in the shell).
  const openMenu = () => cy.get('.sidebar__menu:visible, .platform-menu-trigger:visible').first().click();

  beforeEach(() => {
    cy.loginAsTestUser('/app');
    cy.location('pathname', { timeout: 15000 }).should('eq', '/app');
  });

  const menuLinks: Array<{ label: string; route: string }> = [
    // landingRedirectGuard sends a signed-in visitor to '/' straight to
    // /app, so "Home" lands there rather than on '/' itself.
    { label: 'Home', route: '/app' },
    { label: 'Growth', route: '/app' },
    { label: 'Inbox', route: '/inbox' },
    { label: 'Drafts', route: '/drafts' },
    { label: 'Outbox', route: '/outbox' },
    { label: 'Sent', route: '/sent' },
    { label: 'Catalyst', route: '/email-processor' },
    { label: 'Drips', route: '/drips' },
    { label: 'Email Composer', route: '/compose-email' },
    { label: 'iOS App', route: '/ios' },
  ];

  menuLinks.forEach(({ label, route }) => {
    it(`navigates to ${route} via the "${label}" menu link`, () => {
      openMenu();
      cy.contains('.um-row', label).click();
      cy.location('pathname', { timeout: 10000 }).should('eq', route);
    });
  });

  it('signs out via the menu', () => {
    openMenu();
    cy.contains('.um-row', 'Sign out').click();

    // Signing out is async (a real Firebase call, even against the
    // emulator), and races the same click's routerLink navigation, so the
    // reliable signal is the menu itself flipping back to a signed-out
    // state rather than any one intermediate URL.
    openMenu();
    cy.contains('.um-signin', 'Sign in', { timeout: 10000 }).should('exist');
  });
});

// The sidebar (design_handoff_outreach_mail 1b): New email, then Mail and Maya groups.
describe('Sidebar', () => {
  beforeEach(() => {
    cy.viewport(1280, 900);
    cy.loginAsTestUser('/app');
    cy.location('pathname', { timeout: 15000 }).should('eq', '/app');
  });

  it('lists Growth, Needs you, Mail and Maya in order', () => {
    cy.get('.sidebar__group').then((groups) => {
      expect([...groups].map((group) => group.textContent?.trim().toUpperCase())).to.deep.equal(['MAIL', 'MAYA']);
    });
    cy.get('.sidebar__item .sidebar__label').then((labels) => {
      expect([...labels].map((label) => label.textContent?.trim())).to.deep.equal(['Growth', 'Needs you', 'Inbox', 'Drafts', 'Outbox', 'Sent', 'Activity', 'Drips', 'Catalyst']);
    });
  });

  it('New email opens the composer', () => {
    cy.get('[data-cy="sidebar-new-email"]').click();
    cy.location('pathname', { timeout: 10000 }).should('eq', '/compose-email');
  });

  it('old Signal Engine links land on the new pages', () => {
    cy.visit('/signal-engine?tab=outbox');
    cy.location('pathname', { timeout: 10000 }).should('eq', '/outbox');
    cy.visit('/signal-engine?tab=plan&filter=hot');
    cy.location('search', { timeout: 10000 }).should('contain', 'tab=plan').and('contain', 'filter=hot');
    cy.location('pathname').should('eq', '/maya-day');
  });
});
