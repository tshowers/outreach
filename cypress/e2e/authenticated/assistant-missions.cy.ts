// The Outreach assistant and Missions (design_handoff_todd_missions,
// 2026-10-20): the assistant opens large and centered; real work becomes a
// Mission shown right in the conversation, where the person also finishes
// any step that needs them (sending, until it's automated). Quick questions
// are answered by the right tool; help questions fall through to the chat.
// Fixtures come from todd-backend scripts/missions-fixtures.js (the real engine).
describe('Outreach assistant: Missions', () => {
  const MISSIONS = 'https://api.taliferro.tech/api/orchestration/missions';

  const openAssistant = () => {
    cy.loginAsTestUser('/app', 'uid-owner');
    cy.location('pathname', { timeout: 15000 }).should('eq', '/app');
    cy.get('.talk-to-todd-glass').click({ force: true });
    cy.get('.todd-assistant-window-open').should('be.visible');
    // The window has its own close button; the launcher steps aside while it's open.
    cy.get('.talk-to-todd-glass').should('have.class', 'talk-to-todd-glass-hidden');
  };

  const ask = (text: string) => {
    cy.get('.todd-assistant-window-open .ios-input').type(text);
    cy.get('.todd-assistant-window-open .assistant-bar .btn-todd').first().click();
  };

  const missionAt = (fixture: string, id = 'reach-named-person') => {
    cy.fixture(`missions/${fixture}.json`).then((m) => {
      cy.intercept('POST', `${MISSIONS}?*`, { statusCode: 202, body: { success: true, mode: 'mission', mission: { ...m, id, status: 'queued', steps: [] } } }).as('ask');
      cy.intercept('GET', `${MISSIONS}/${id}?*`, { success: true, mission: { ...m, id } }).as('mission');
    });
  };

  it('opens centered, at 80% of the screen', () => {
    openAssistant();
    cy.window().then((win) => {
      // Layout size, not the on-screen box: the open animation scales it from 96%.
      cy.get('.todd-assistant-window-open').should(($el) => {
        const el = $el[0] as HTMLElement;
        expect(el.offsetWidth).to.be.closeTo(win.innerWidth * 0.8, 2);
        expect(el.offsetHeight).to.be.closeTo(win.innerHeight * 0.8, 2);
        expect(el.offsetLeft).to.be.closeTo(win.innerWidth * 0.1, 2);
        // Nothing on the page sits on top of it (the sidebar used to).
        const box = el.getBoundingClientRect();
        expect(win.document.elementFromPoint(box.left + 20, box.top + box.height / 2)).to.satisfy((hit: Element) => el.contains(hit));
      });
    });
    cy.get('.todd-assistant-scrim').click({ force: true });
    cy.get('.todd-assistant-window-open').should('not.exist');
  });

  it('a campaign request becomes a Mission in the conversation, with the page as context', () => {
    missionAt('roland-proposed');
    openAssistant();
    ask('Send an email campaign to small businesses about our new service');
    cy.wait('@ask').its('request.body').should((body) => {
      expect(body).to.include({ origin: 'ask' });
      expect(body.context).to.include({ app: 'outreach', path: '/app' });
    });
    // The Mission is taller than the window (the window scrolls), so check what a person sees first.
    cy.get('[data-cy="assistant-mission"]').should('exist').within(() => {
      cy.get('[data-cy="mission-title"]').should('be.visible').and('contain.text', 'Reach a named person');
      cy.get('[data-cy="start"]').should('be.visible');
      cy.get('[data-cy="plan-strip-list"]').should('exist');
      cy.contains('a', 'Open in Moves').should('have.attr', 'href', 'https://moves.taliferro.tech/missions/reach-named-person');
    });
  });

  it('emailing a whole industry becomes the segment Mission, right in the conversation', () => {
    missionAt('segment-proposed', 'pitch-segment');
    openAssistant();
    ask('Email the venture capital and finance firms in my contacts asking if they are interested in investing');
    cy.wait('@ask').its('request.body').should((body) => {
      expect(body.request).to.contain('venture capital');
      expect(body.context).to.include({ app: 'outreach' });
    });
    cy.get('[data-cy="assistant-mission"]').should('exist').within(() => {
      cy.get('[data-cy="mission-title"]').should('be.visible').and('contain.text', 'Email an industry segment');
      cy.get('[data-cy="start"]').should('be.visible');
      cy.contains('a', 'Open in Moves').should('have.attr', 'href', 'https://moves.taliferro.tech/missions/pitch-segment');
    });
  });

  it('a step that needs you (the send) is finished right here', () => {
    missionAt('roland-send-handed');
    cy.intercept('POST', `${MISSIONS}/reach-named-person/steps/send?*`, { statusCode: 202, body: { success: true } }).as('done');
    openAssistant();
    ask('Email Roland Martin');
    cy.get('[data-cy="assistant-mission"] [data-cy="mission-banner"]').should('contain.text', 'Waiting on you: send it');
    cy.get('[data-cy="assistant-mission"] [data-cy="banner-cta"]').click();
    cy.get('[data-cy="step-drawer"]').should('be.visible')
      .and('contain.text', 'Send the approved email from Outreach and mark this done');
    cy.get('[data-cy="drawer-done"]').click();
    cy.wait('@done').its('request.body.type').should('eq', 'complete');
  });

  it('a quick question is answered by the right tool, no Mission', () => {
    cy.intercept('POST', `${MISSIONS}?*`, { statusCode: 200, body: { success: true, mode: 'direct', tool: 'outreach.engagement', product: 'outreach', summary: '12 sent, 5 opened, 1 replied in 7 days' } }).as('ask');
    openAssistant();
    ask('How did my emails do this week?');
    cy.wait('@ask');
    cy.get('.todd-assistant-window-open .assistant-response').should('contain.text', '12 sent, 5 opened, 1 replied in 7 days');
    cy.get('[data-cy="assistant-mission"]').should('not.exist');
  });

  it('a help question falls through to the assistant as before', () => {
    cy.intercept('POST', `${MISSIONS}?*`, { statusCode: 200, body: { success: true, mode: 'direct', assessment: { mode: 'direct' }, answer: null } }).as('ask');
    openAssistant();
    ask('How do I connect my Gmail?');
    cy.wait('@ask');
    cy.get('[data-cy="assistant-mission"]').should('not.exist');
  });
});
