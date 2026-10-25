// Button-level coverage for the authenticated pages, on top of the plain
// routing coverage in authenticated-flow.cy.ts. Scoped deliberately to
// buttons that are safe and meaningful to exercise for a brand-new test
// user with no seeded data (no drafts, no contacts, no connected mailbox):
// navigation, tab switching, and empty-state actions. Mutating actions
// (approve/reject/discard a draft, send a reply, sync a mailbox) aren't
// covered here - they only render once real draft/mailbox data exists, so
// testing them meaningfully needs seeded Firestore fixtures, not just the
// blanket API stub from cypress/support/e2e.ts.

describe('Signal Engine buttons', () => {
  beforeEach(() => {
    // The whole summary strip - including the Refresh button - only
    // renders when the bootstrap response has a `summary` object (see
    // signal-engine.component.ts loadBootstrap: `response?.data?.summary
    // || null`, and the template's `*ngIf="summary as s"`). The blanket
    // support-file stub returns `{}`, which would hide it, so give this
    // endpoint a realistic empty-but-shaped response instead.
    // Matched on the path: the app adds ?ngsw-bypass=true to every request.
    cy.intercept({ method: 'GET', pathname: '/api/outreach/signal-engine/bootstrap' }, {
      statusCode: 200,
      body: {
        success: true,
        message: '',
        data: {
          threads: [],
          summary: { activeThreads: 0, queuedActions: 0, sending: 0, hotLeads: 0, warmLeads: 0, draftReady: 0, stalledWaiting: 0, needsHuman: 0 },
          generatedAt: new Date().toISOString(),
        },
      },
    }).as('bootstrap');

    cy.loginAsTestUser('/signal-engine');
    cy.wait('@bootstrap');
  });

  it('points drafts to the Outreach app instead of a Drafts tab', () => {
    cy.get('[data-cy="signal-engine-drafts-in-app"]').should('exist');
    cy.get('[data-cy="signal-engine-tab-drafts"]').should('not.exist');
  });

  it('refresh re-fetches the bootstrap data', () => {
    cy.get('[data-cy="signal-engine-refresh"]').should('be.enabled').click();
    cy.wait('@bootstrap');
  });

  // People waiting on you have their own page now (Needs you), not a filter on Plan.
  it('"Needs you" opens the Needs you page', () => {
    cy.get('[data-cy="signal-engine-summary-needs-you"]').click();
    cy.location('pathname', { timeout: 10000 }).should('eq', '/needs-you');
  });
});

describe('Inbox Access buttons', () => {
  // The inbox moved to /inbox (Outreach Inbox 2026); this page is settings only.
  it('is the Inbox settings page once an inbox is connected', () => {
    cy.intercept('GET', '**/api/outreach/mailboxes*', { statusCode: 200, body: { success: true, data: [
      { id: 'm1', emailAddress: 'ada@analytical.co', provider: 'gmail', isPrimary: true, auth: { mode: 'oauth' }, imap: {}, smtp: {} },
    ] } });
    cy.loginAsTestUser('/inbox-access');
    cy.location('pathname', { timeout: 15000 }).should('eq', '/inbox-access');
    cy.contains('h1', 'Inbox settings').should('be.visible');
  });

  // With nothing connected it's the guided first connect (design_handoff_outreach_onboarding 2).
  it('guides the first connect when no inbox is connected', () => {
    cy.loginAsTestUser('/inbox-access');
    cy.location('pathname', { timeout: 15000 }).should('eq', '/inbox-access');
    cy.contains('h1', 'Connect the inbox you send from').should('be.visible');
  });
});

describe('Catalyst (email-processor) empty-state buttons', () => {
  beforeEach(() => {
    cy.loginAsTestUser('/email-processor');
    cy.location('pathname', { timeout: 15000 }).should('eq', '/email-processor');
    // A brand-new test user has no contacts, so the empty-state CTA
    // ("Catalyst needs contacts to work") is what actually renders.
    cy.contains('h2', 'Catalyst needs contacts to work').should('be.visible');
  });

  // Contacts live in the Network app, so both open it in a new tab.
  it('"Go to Network" opens Network\'s contact list', () => {
    cy.contains('a', 'Go to Network').should('have.attr', 'href', 'https://network.taliferro.tech/contact-list').and('have.attr', 'target', '_blank');
  });

  it('"Import Contacts" opens Network\'s import', () => {
    cy.contains('a', 'Import Contacts').should('have.attr', 'href', 'https://network.taliferro.tech/contact-import').and('have.attr', 'target', '_blank');
  });
});
