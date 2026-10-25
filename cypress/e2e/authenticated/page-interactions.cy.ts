// Button-level coverage for the authenticated pages, on top of the plain
// routing coverage in authenticated-flow.cy.ts. Scoped deliberately to
// buttons that are safe and meaningful to exercise for a brand-new test
// user with no seeded data (no drafts, no contacts, no connected mailbox):
// navigation, tab switching, and empty-state actions. Mutating actions
// (approve/reject/discard a draft, send a reply, sync a mailbox) aren't
// covered here - they only render once real draft/mailbox data exists, so
// testing them meaningfully needs seeded Firestore fixtures, not just the
// blanket API stub from cypress/support/e2e.ts.

// Drafts and Outbox (design_handoff_outreach_mail), from a stubbed bootstrap:
// one engaged follow-up, one first email, one approved email waiting to send.
describe('Mail pages', () => {
  const hours = (n: number) => new Date(Date.now() + n * 3600000).toISOString();
  const threads = [
    {
      id: 'theo', contactId: 'theo', contactName: 'Theodore Ricks-Freeman', companyName: 'The DC Voice', userLane: 'drafts',
      touchCount: 4, openCount: 3, clickCount: 8, lastSentAt: hours(-30), lastUpdated: hours(-2),
      draftSubject: 'Re: Forwarding to Don', draftBody: '<p>Hi Theodore,</p><p>Did Don get a chance to see it?</p><p>Happy to work around your week.</p>',
      strategySummary: 'He clicked the link 8 times but has not replied.',
    },
    {
      id: 'willy', contactId: 'willy', contactName: 'Willy Gevers', companyName: 'Gevers Wealth', userLane: 'drafts',
      touchCount: 0, openCount: 0, clickCount: 0, lastUpdated: hours(-72),
      draftSubject: 'Quick chat about client acquisition', draftBody: '<p>Hi Willy, a quick question.</p>',
    },
    {
      id: 'brad', contactId: 'brad', contactName: 'Brad Aken', companyName: 'Agate Pass Investment', userLane: 'outbox', queueState: 'queued',
      touchCount: 1, scheduledAt: hours(2), draftSubject: 'Quick question about Agate Pass', draftBody: '<p>Hi Brad, would you be open to a call?</p>',
    },
  ];

  beforeEach(() => {
    // Matched on the path: the app adds ?ngsw-bypass=true to every request.
    cy.intercept({ method: 'GET', pathname: '/api/outreach/signal-engine/bootstrap' }, {
      statusCode: 200,
      body: { success: true, message: '', data: { threads, summary: {}, generatedAt: new Date().toISOString() } },
    }).as('bootstrap');
    // The test user can write, so the write gate lets the buttons through.
    cy.intercept('GET', '**/api/account/summary*', { statusCode: 200, body: { success: true, data: { writeAccess: { outreach: true } } } });
    cy.intercept({ method: 'POST', pathname: '/api/outreach/momentum-threads/*/approve-draft' }, { statusCode: 200, body: { success: true, data: { scheduledAt: hours(20) } } }).as('approve');
    cy.intercept({ method: 'POST', pathname: '/api/outreach/momentum-threads/*/reject-draft' }, { statusCode: 200, body: { success: true, data: {} } }).as('rewrite');
    cy.intercept({ method: 'POST', pathname: '/api/outreach/momentum-threads/*/discard-draft' }, { statusCode: 200, body: { success: true, data: {} } }).as('discard');
    cy.intercept({ method: 'POST', pathname: '/api/outreach/momentum-threads/*/send-now' }, { statusCode: 200, body: { success: true, data: {} } }).as('sendNow');
    cy.intercept({ method: 'POST', pathname: '/api/outreach/momentum-threads/*/return-to-drafts' }, { statusCode: 200, body: { success: true, data: {} } }).as('moveBack');
  });

  it('Drafts puts people who engaged first, and the sidebar counts them', () => {
    cy.loginAsTestUser('/drafts');
    cy.wait('@bootstrap', { timeout: 20000 });
    cy.contains('.section-head h2', 'Follow-ups to people who engaged').parent().should('contain', '1');
    cy.contains('.section-head h2', 'First emails');
    cy.get('[data-cy="draft-theo"]').should('contain', 'Follow-up · email 5').and('contain', 'Clicked 8×').and('contain', 'Why Maya wrote this');
    cy.get('[data-cy="draft-willy"]').should('contain', 'First email').and('contain', 'No emails yet.');
    cy.contains('.sidebar__item', 'Drafts').find('.sidebar__badge').should('have.text', '2');
    cy.contains('.sidebar__item', 'Outbox').find('.sidebar__badge').should('have.text', '1');
  });

  it('Read full email opens the whole message', () => {
    cy.loginAsTestUser('/drafts');
    cy.wait('@bootstrap', { timeout: 20000 });
    cy.get('[data-cy="draft-theo"]').within(() => {
      cy.contains('button', 'Read full email').click();
      cy.contains('Your signature is added when it sends.');
      cy.contains('button', 'Show less');
    });
  });

  it('Approve moves it to Outbox with a toast', () => {
    cy.loginAsTestUser('/drafts');
    cy.wait('@bootstrap', { timeout: 20000 });
    cy.get('[data-cy="draft-approve-willy"]').click();
    cy.wait('@approve');
    cy.get('[data-cy="draft-willy"]').should('not.exist');
    cy.contains('.mail-toast', 'Approved. Sends').find('a').should('have.text', 'View in Outbox');
  });

  it('Ask Maya to rewrite shows her working', () => {
    cy.loginAsTestUser('/drafts');
    cy.wait('@bootstrap', { timeout: 20000 });
    cy.get('[data-cy="draft-rewrite-theo"]').click();
    cy.wait('@rewrite').its('request.body').should('deep.include', { draftKind: 'outbound' });
    cy.get('[data-cy="draft-theo"]').should('contain', 'Maya is rewriting this with a different angle.');
  });

  it('Discard can be undone', () => {
    cy.loginAsTestUser('/drafts');
    cy.wait('@bootstrap', { timeout: 20000 });
    cy.get('[data-cy="draft-willy"]').find('button[aria-label="More actions"]').click();
    cy.get('[data-cy="draft-discard-willy"]').click();
    cy.get('[data-cy="draft-willy"]').should('not.exist');
    cy.contains('.mail-toast button', 'Undo').click();
    cy.get('[data-cy="draft-willy"]').should('exist');
  });

  it('Outbox opens a row to send now or move it back', () => {
    cy.loginAsTestUser('/outbox');
    cy.wait('@bootstrap', { timeout: 20000 });
    cy.get('[data-cy="outbox-brad"]').should('contain', 'Brad Aken').and('contain', 'In 2 hours');
    cy.get('[data-cy="outbox-brad"] .outbox__summary').click();
    cy.get('[data-cy="outbox-brad"]').should('contain', 'Hi Brad, would you be open to a call?');
    cy.get('[data-cy="outbox-move-back-brad"]').click();
    cy.wait('@moveBack');
    cy.contains('.mail-toast', "Moved back to Drafts. It won't send until you approve it again.");
  });

  it('Send now sends it and says so', () => {
    cy.loginAsTestUser('/outbox');
    cy.wait('@bootstrap', { timeout: 20000 });
    cy.get('[data-cy="outbox-brad"] .outbox__summary').click();
    cy.get('[data-cy="outbox-send-now-brad"]').click();
    cy.wait('@sendNow');
    cy.contains('.mail-toast', 'Sending to Brad Aken now.');
  });

  it("Activity's Maya's plan lists who Maya will contact next", () => {
    cy.loginAsTestUser('/maya-day?tab=plan');
    cy.wait('@bootstrap', { timeout: 20000 });
    cy.get('[data-cy="maya-day-tab-plan"]').should('have.class', 'is-on');
    cy.contains('Theodore Ricks-Freeman');
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
