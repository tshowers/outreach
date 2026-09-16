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
    cy.intercept('https://api.taliferro.tech/api/outreach/signal-engine/bootstrap', {
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

  it('has no batch-action bar when there are no drafts to select', () => {
    cy.get('[data-cy="signal-engine-drafts"]').should('exist');
    cy.get('.draft-batch-bar').should('not.exist');
  });

  it('refresh re-fetches the bootstrap data', () => {
    cy.get('[data-cy="signal-engine-refresh"]').should('be.enabled').click();
    cy.wait('@bootstrap');
  });

  it('"Needs you" switches to the plan lane filtered to what needs a human', () => {
    cy.get('[data-cy="signal-engine-summary-needs-you"]').click();
    cy.get('[data-cy="signal-engine-plan"]').should('exist');
    cy.get('[data-cy="signal-engine-plan-filter-needs-you"]').should('have.class', 'active');
  });
});

describe('Inbox Access buttons', () => {
  beforeEach(() => {
    cy.loginAsTestUser('/inbox-access');
    cy.location('pathname', { timeout: 15000 }).should('eq', '/inbox-access');
  });

  it('switches between the Inbox and Inbox Settings tabs', () => {
    cy.contains('.inbox-access-tab', 'Inbox Settings').click().should('have.class', 'active');
    cy.contains('.inbox-access-tab', 'Inbox').click().should('have.class', 'active');
  });

  it('"Open Outbox Drafts" goes to Signal Engine', () => {
    cy.contains('button', 'Open Outbox Drafts').click();
    cy.location('pathname', { timeout: 10000 }).should('eq', '/signal-engine');
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

  // These route to '/contact-list' and '/contact-import', which aren't
  // routes in this standalone app (see app.routes.ts) - they look like
  // leftovers from the ported TODD/Network codebase (top-dog.component.ts's
  // onClickRoute). The wildcard route sends both to /app, which is the
  // actually-observed behavior this test documents; worth a product check
  // on whether these buttons should go somewhere else instead.
  it('"Go to Network" falls through to /app (route does not exist in this app)', () => {
    cy.contains('button', 'Go to Network').click();
    cy.location('pathname', { timeout: 10000 }).should('eq', '/app');
  });

  it('"Import Contacts" falls through to /app (route does not exist in this app)', () => {
    cy.contains('button', 'Import Contacts').click();
    cy.location('pathname', { timeout: 10000 }).should('eq', '/app');
  });
});
