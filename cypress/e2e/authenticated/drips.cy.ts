// Outreach Drips end to end (design_handoff_outreach_drips), against a stubbed
// Drips API: the support file already blocks every real api.taliferro.tech
// call, and this spec answers /outreach/drips/** from an in-memory state so
// the switch, dialogs and saves behave like the server.

// Matched on the path: the app adds ?ngsw-bypass=true to every request.
const API = '/api/outreach/drips';
const idFrom = ( url: string, back = 0 ) => new URL( url ).pathname.split( '/' ).slice( -1 - back )[0];
const DAY = 86400000;
const iso = ( offsetDays: number ) => new Date( Date.now() + offsetDays * DAY ).toISOString().slice( 0, 10 );
const TODAY = iso( 0 );

const EMAIL_HTML = `
  <h1>Federal RFP season is here</h1>
  <p>Hi {{firstName}}, here is how small teams get a first draft out the same day.</p>
  <p><a href="https://taliferro.tech/newsletter" style="display:inline-block;padding:12px 20px;background:#2f6bff;color:#fff;border-radius:999px">Read the newsletter</a></p>
  <p><a href="https://taliferro.tech/blog/rfp-20-minutes">How to read a federal RFP in 20 minutes</a></p>
  <p><a href="taliferro-tech-unsubscribe">Unsubscribe</a></p>`;

const counters = ( over: Record<string, number> = {} ) => ( { total: 0, queued: 0, sent: 0, bounced: 0, unsubscribed: 0, skipped: 0, failed: 0, ...over } );

function baseDrip ( over: Record<string, unknown> = {} ) {
  return {
    id: 'ready1', title: 'Announcement: TODD Docs free tier', kind: 'announcement', subject: 'TODD Docs now has a free tier', preheader: '',
    html: EMAIL_HTML, status: 'ready', audience: null, rateMinutes: 30, startMode: 'now', startDate: null, endDate: null,
    timezone: 'America/Los_Angeles', startedAt: null, archivedAt: null, archivedReason: null, sourceDripId: null,
    counters: counters(), stats: null, zones: [], nextSendAt: null, lastSentAt: null, blocker: null,
    fromName: 'Ty Showers', fromEmail: 'ty.showers@taliferro.tech', ...over,
  };
}

function seedState () {
  const running = baseDrip( {
    id: 'run1', title: 'October newsletter: RFP season is here', kind: 'newsletter', subject: 'RFP season is here. Are your answers ready?',
    status: 'running', rateMinutes: 15, startDate: iso( -8 ), endDate: iso( 22 ), startedAt: new Date( Date.now() - 8 * DAY ).toISOString(),
    audience: { id: 'aud-gov', name: 'Gov contractors · VA/MD', source: 'leadVault', count: 1240 },
    counters: counters( { total: 1240, queued: 628, sent: 612, unsubscribed: 3, bounced: 5 } ),
    stats: { emails: 612, opens: 251, clickers: 42, clicks: 35, links: [
      { url: 'https://taliferro.tech/newsletter', count: 24 },
      { url: 'https://taliferro.tech/blog/rfp-20-minutes', count: 11 },
    ] },
    nextSendAt: Date.now() + 11 * 60000,
  } );
  const paused = baseDrip( {
    id: 'pause1', title: 'Blog: Why small firms lose winnable RFPs', kind: 'blog', status: 'paused', rateMinutes: 60,
    startDate: iso( -21 ), endDate: iso( 9 ), audience: { id: 'aud-se', name: 'Small RFP firms · Southeast', source: 'leadVault', count: 860 },
    counters: counters( { total: 860, queued: 462, sent: 398 } ), stats: { emails: 398, opens: 170, clickers: 31, clicks: 31, links: [] },
  } );
  const scheduled = baseDrip( {
    id: 'sched1', title: 'Invite: RFP office hours webinar', status: 'scheduled', startDate: iso( 40 ), endDate: iso( 54 ),
    audience: { id: 'aud-se', name: 'Small RFP firms · Southeast', source: 'leadVault', count: 860 },
  } );
  const ready = baseDrip();
  const archived = baseDrip( {
    id: 'arch1', title: 'September newsletter', kind: 'newsletter', status: 'archived', startDate: iso( -45 ), endDate: iso( -15 ),
    archivedAt: new Date( Date.now() - 15 * DAY ).toISOString(), archivedReason: 'ended',
    audience: { id: 'aud-gov', name: 'Gov contractors · VA/MD', source: 'leadVault', count: 1240 },
    counters: counters( { total: 1240, sent: 1240 } ), stats: { emails: 1240, opens: 500, clickers: 87, clicks: 90, links: [] },
  } );
  return {
    drips: [running, paused, scheduled, ready, archived] as any[],
    audiences: [
      { id: 'aud-news', name: 'Newsletter subscribers', source: 'contacts', mode: 'category', query: 'Newsletter', count: 3180, createdAt: '2026-10-01' },
      { id: 'aud-gov', name: 'Gov contractors · VA/MD', source: 'leadVault', mode: 'search', query: 'gov contractors', count: 1240, createdAt: '2026-09-01' },
    ] as any[],
  };
}

let state = seedState();

const ok = ( data: unknown ) => ( { statusCode: 200, body: { success: true, data } } );
const find = ( id: string ) => state.drips.find( ( drip ) => drip.id === id );
const slotHolders = ( id: string ) => state.drips.filter( ( drip ) => drip.id !== id && ['running', 'paused', 'scheduled', 'starting'].includes( drip.status ) )
    .map( ( { id: otherId, title, status, startDate, endDate } ) => ( { id: otherId, title, status, startDate, endDate } ) );
const listCopy = () => state.drips.map( ( { html, ...rest } ) => rest );

function stubDripsApi () {
  cy.intercept( { method: 'GET', pathname: API }, ( req ) => req.reply( ok( { drips: listCopy(), slots: { max: 2, inUse: 2 } } ) ) ).as( 'list' );
  cy.intercept( { method: 'GET', pathname: `${ API }/audiences/categories` }, ok( [{ name: 'Consumer Goods', count: 8104 }, { name: 'Business', count: 1825 }] ) ).as( 'categories' );
  cy.intercept( { method: 'POST', pathname: `${ API }/audiences/preview` }, ( req ) => req.reply( ok( { count: 477, terms: ['fashion', 'apparel'], sample: ['Zoe Lin', 'Ana Ruiz'] } ) ) ).as( 'preview' );
  cy.intercept( { method: 'POST', pathname: `${ API }/audiences` }, ( req ) => {
    const audience = { id: 'aud-fashion', name: req.body.name, source: req.body.source, mode: req.body.mode, query: req.body.query, count: 477, createdAt: TODAY };
    state.audiences.unshift( audience );
    req.reply( ok( audience ) );
  } ).as( 'createAudience' );
  cy.intercept( { method: 'GET', pathname: `${ API }/*` }, ( req ) => {
    const id = idFrom( req.url );
    const drip = find( id );
    if ( !drip ) return req.reply( { statusCode: 404, body: { success: false, message: 'That drip wasn\'t found.' } } );
    req.reply( ok( {
      drip, others: slotHolders( id ), audiences: ['ready', 'scheduled'].includes( drip.status ) ? state.audiences : [],
      today: TODAY, rates: [1, 5, 15, 30, 60, 120, 240, 1440], maxDays: 30, maxLeadDays: 120,
    } ) );
  } ).as( 'detail' );
  cy.intercept( { method: 'PATCH', pathname: `${ API }/*` }, ( req ) => {
    const drip = find( idFrom( req.url ) );
    const patch = req.body || {};
    if ( patch.audienceId ) {
      const audience = state.audiences.find( ( item ) => item.id === patch.audienceId );
      drip.audience = { id: audience.id, name: audience.name, source: audience.source, count: audience.count };
      // The server paces it to the dates: ~21 weekdays × 480 minutes over the audience.
      drip.rateMinutes = Math.max( 1, Math.min( 480, Math.floor( 21 * 480 / audience.count ) ) );
    }
    ['kind', 'startMode', 'startDate', 'endDate'].forEach( ( key ) => {
      if ( patch[key] !== undefined ) drip[key] = patch[key];
    } );
    if ( patch.startMode === 'now' ) drip.startDate = null;
    req.reply( ok( drip ) );
  } ).as( 'patch' );
  cy.intercept( { method: 'POST', pathname: `${ API }/*/toggle` }, ( req ) => {
    const drip = find( idFrom( req.url, 1 ) );
    const on = req.body.on;
    if ( !on ) {
      drip.status = drip.status === 'running' ? 'paused' : drip.status === 'scheduled' ? 'ready' : drip.status;
      return req.reply( ok( drip ) );
    }
    if ( drip.status === 'paused' ) {
      drip.status = 'running';
      return req.reply( ok( drip ) );
    }
    const start = drip.startMode === 'date' && drip.startDate ? drip.startDate : TODAY;
    const end = drip.endDate || new Date( Date.parse( `${ start }T00:00:00Z` ) + 30 * DAY ).toISOString().slice( 0, 10 );
    Object.assign( drip, { status: start > TODAY ? 'scheduled' : 'starting', startDate: start, endDate: end } );
    req.reply( ok( drip ) );
  } ).as( 'toggle' );
  cy.intercept( { method: 'POST', pathname: `${ API }/*/archive` }, ( req ) => {
    const drip = find( idFrom( req.url, 1 ) );
    Object.assign( drip, { status: 'archived', archivedAt: new Date().toISOString(), archivedReason: 'manual' } );
    req.reply( ok( drip ) );
  } ).as( 'archive' );
  cy.intercept( { method: 'POST', pathname: `${ API }/*/duplicate` }, ( req ) => {
    const source = find( idFrom( req.url, 1 ) );
    const copy = baseDrip( { id: 'copy1', title: `${ source.title } (copy)`, kind: source.kind, rateMinutes: source.rateMinutes, sourceDripId: source.id } );
    state.drips.push( copy );
    req.reply( ok( copy ) );
  } ).as( 'duplicate' );
}

describe( 'Outreach Drips', () => {
  beforeEach( () => {
    state = seedState();
    stubDripsApi();
  } );

  describe( 'the list', () => {
    beforeEach( () => {
      cy.loginAsTestUser( '/drips' );
      cy.wait( '@list' );
    } );

    it( 'shows both slots, then scheduled, ready and archived drips', () => {
      cy.contains( 'h1', 'Drips' );
      cy.contains( '.label', 'Drip slots' ).should( 'contain', '2 of 2 in use' );
      cy.get( '.slot:not(.slot--open)' ).should( 'have.length', 2 );
      cy.get( '.slot--open' ).should( 'not.exist' );

      cy.contains( '.slot', 'October newsletter' ).within( () => {
        cy.contains( '.tag', 'Newsletter' );
        cy.contains( '.tag', 'Sending' ).should( 'have.class', 'tag--live' );
        cy.contains( 'Day 9' );
        cy.contains( '.slot__next', /^Next send in \d+:\d\d$/ );
        cy.contains( '.tile', '612' ).should( 'contain', 'of 1,240 sent' );
        cy.contains( '.tile', '41%' ).should( 'contain', 'opened' );
        cy.contains( '.tile', '6.9%' ).should( 'contain', 'clicked' );
        cy.contains( 'Gov contractors · VA/MD · 1 every 15 minutes' );
      } );
      cy.contains( '.slot', 'Blog: Why small firms' ).within( () => {
        cy.contains( '.tag', 'Paused' );
        cy.contains( '.slot__next', 'Paused' );
      } );

      cy.contains( 'section', 'Scheduled' ).contains( '.row', 'Invite: RFP office hours webinar' ).should( 'contain', 'Starts' ).and( 'contain', 'archives' );
      cy.contains( 'section', 'Ready to drip' ).contains( '.row', 'Announcement: TODD Docs free tier' ).should( 'contain', 'No audience yet · 1 every 30 minutes' );
      cy.contains( 'section', 'Archived' ).contains( '.row', 'September newsletter' ).should( 'contain', '1,240 sent' ).and( 'contain', '7% clicked' );
      cy.contains( 'a', 'New drip from Email Creator' ).should( 'have.attr', 'href' ).and( 'include', 'emails.taliferro.tech' );
    } );

    it( 'duplicating an archived drip opens the copy, ready to set up', () => {
      cy.contains( 'section', 'Archived' ).contains( 'button', 'Duplicate' ).click();
      cy.wait( '@duplicate' );
      cy.location( 'pathname' ).should( 'eq', '/drips/copy1' );
      cy.wait( '@detail' );
      cy.contains( 'h2', 'September newsletter (copy)' );
      cy.contains( '.tag', 'Ready' );
    } );

    it( 'shows an open slot when one is free', () => {
      state.drips = state.drips.filter( ( drip ) => drip.id !== 'pause1' );
      cy.reload();
      cy.wait( '@list' );
      cy.get( '.slot--open' ).should( 'have.length', 1 ).and( 'contain', 'Open slot' );
    } );
  } );

  describe( 'a ready drip', () => {
    beforeEach( () => {
      // Free a slot so a start today fits.
      state.drips = state.drips.filter( ( drip ) => drip.id !== 'pause1' );
      cy.loginAsTestUser( '/drips/ready1' );
      cy.wait( '@detail' );
    } );

    it( 'sets the kind, builds a new audience, and starts', () => {
      cy.contains( '.tag', 'Ready' );
      cy.contains( '.control__sentence', 'Off. Turning it on starts sending today.' );
      cy.get( '.switch' ).should( 'have.attr', 'data-state', 'off' );

      cy.contains( '.seg button', 'Blog post' ).click();
      cy.wait( '@patch' ).its( 'request.body' ).should( 'deep.equal', { kind: 'blog' } );
      cy.contains( '.tag', 'Blog post' );

      // No slider: the server paces it from the audience and the dates.
      cy.get( 'input.slider' ).should( 'not.exist' );
      cy.contains( '[data-cy="drip-send-rate"] .rate', 'Set by your audience' );

      // The switch won't start without an audience.
      cy.get( '.switch' ).click();
      cy.contains( '.warn', 'Choose who gets it first.' );

      cy.contains( 'button', 'New audience' ).click();
      cy.wait( '@categories' );
      cy.get( '.new-audience input.field' ).first().type( 'fashion brands' );
      cy.contains( 'button', 'Find people' ).click();
      cy.wait( '@preview' ).its( 'request.body' ).should( 'deep.equal', { source: 'contacts', mode: 'search', query: 'fashion brands' } );
      cy.contains( '.found', '477 people' ).and( 'contain', 'Zoe Lin' );
      cy.get( '.found input.field' ).clear().type( 'Fashion brands' );
      cy.contains( 'button', 'Save and use' ).click();
      cy.wait( '@createAudience' ).its( 'request.body' ).should( 'include', { name: 'Fashion brands', source: 'contacts' } );
      cy.wait( '@patch' ).its( 'request.body' ).should( 'deep.equal', { audienceId: 'aud-fashion' } );
      cy.contains( '.audience.is-on', 'Fashion brands' ).should( 'contain', '477' );
      cy.contains( '.reach', /Reaches all 477 people by about \w{3} \d+, then stops on its own\./ );

      cy.get( '.switch' ).click();
      cy.get( '.dialog' ).within( () => {
        cy.contains( 'h2', 'Start this drip?' );
        cy.contains( 'It sends 1 every 21 minutes to Fashion brands (477 people), weekdays 9 am–5 pm' );
        cy.contains( 'button', 'Start drip' ).click();
      } );
      cy.wait( '@toggle' ).its( 'request.body' ).should( 'deep.equal', { on: true } );
      cy.contains( '.toast', 'Drip started.' );
      cy.contains( '.tag', 'Starting' );
      cy.get( '.switch' ).should( 'have.attr', 'data-state', 'on' );
      cy.get( '.locked' ).should( 'contain', 'Fashion brands' ).and( 'contain', 'Locked' );
    } );

    it( 'a Lead Vault audience it can\'t use says why', () => {
      cy.intercept( { method: 'POST', pathname: `${ API }/audiences/preview` }, { statusCode: 402, body: { success: false, message: 'Lead Vault Unlimited subscription required to use lead vault contacts in campaigns.' } } ).as( 'previewDenied' );
      cy.contains( 'button', 'New audience' ).click();
      cy.contains( '.new-audience .seg button', 'Lead Vault' ).click();
      cy.get( '.new-audience input.field' ).type( 'fashion brands in New York' );
      cy.contains( 'button', 'Find people' ).click();
      cy.wait( '@previewDenied' );
      cy.contains( '.new-audience .warn', 'Lead Vault Unlimited subscription required' );
    } );

    it( 'Contacts and Lead Vault can be searched together, and one always stays on', () => {
      cy.intercept( { method: 'POST', pathname: `${ API }/audiences/preview` }, ok( { count: 912, terms: [], sample: ['Zoe Lin'] } ) ).as( 'previewBoth' );
      cy.contains( 'button', 'New audience' ).click();
      cy.contains( '.new-audience .seg button', 'Contacts' ).should( 'have.attr', 'aria-pressed', 'true' );
      cy.get( '.new-audience input.field' ).type( 'fashion brands' );
      cy.contains( '.new-audience .seg button', 'Lead Vault' ).click().should( 'have.attr', 'aria-pressed', 'true' );
      cy.contains( '.new-audience .seg button', 'By category' ).should( 'not.exist' );
      cy.get( '.new-audience input.field' ).should( 'have.value', 'fashion brands' );
      cy.contains( 'button', 'Find people' ).click();
      cy.wait( '@previewBoth' ).its( 'request.body' ).should( 'deep.equal', { source: 'both', mode: 'search', query: 'fashion brands' } );
      cy.contains( '.found', '912 people' );

      cy.contains( '.new-audience .seg button', 'Contacts' ).click().should( 'have.attr', 'aria-pressed', 'false' );
      cy.contains( '.new-audience .seg button', 'Lead Vault' ).click().should( 'have.attr', 'aria-pressed', 'true' );
    } );

    it( 'a picked start day schedules it instead', () => {
      cy.contains( '.audience', 'Newsletter subscribers' ).click();
      cy.wait( '@patch' );
      cy.contains( '.seg button', 'Pick a start day' ).click();
      cy.wait( '@patch' ).its( 'request.body' ).should( 'include', { startMode: 'date' } );
      cy.contains( '.control__sentence', /^Off\. Turn on to schedule it for \w{3} \d+\.$/ );
      cy.get( '.switch' ).click();
      cy.get( '.dialog' ).within( () => {
        cy.contains( 'h2', 'Schedule this drip?' );
        cy.contains( 'button', 'Schedule drip' ).click();
      } );
      cy.wait( '@toggle' );
      cy.contains( '.toast', /^Scheduled\. It starts \w{3} \d+ and archives \w{3} \d+\.$/ );
      cy.contains( '.tag', 'Scheduled' );
      cy.get( '.switch' ).should( 'have.attr', 'data-state', 'scheduled' );
    } );
  } );

  describe( 'when both slots are taken', () => {
    beforeEach( () => {
      // Both slot holders cover today and the next 30 days.
      state.drips.find( ( drip ) => drip.id === 'pause1' ).endDate = iso( 40 );
      state.drips.find( ( drip ) => drip.id === 'run1' ).endDate = iso( 22 );
      state.drips.find( ( drip ) => drip.id === 'ready1' ).audience = { id: 'aud-news', name: 'Newsletter subscribers', source: 'contacts', count: 3180 };
      cy.loginAsTestUser( '/drips/ready1' );
      cy.wait( '@detail' );
    } );

    it( 'warns on the page, and the switch offers to free a slot', () => {
      cy.contains( '.note--conflict', /^Two drips already run on \w{3} \d+\. Move these dates or free a slot\.$/ );
      cy.get( '.switch' ).click();
      cy.get( '.dialog' ).within( () => {
        cy.contains( 'h2', 'Two drips already run on' );
        cy.contains( 'a paused drip keeps its slot' );
        cy.get( '.conflict' ).should( 'have.length', 2 );
        cy.contains( '.conflict', 'Blog: Why small firms lose winnable RFPs' ).should( 'contain', 'Paused' ).contains( 'button', 'Archive' ).click();
      } );
      cy.wait( '@archive' );
      cy.contains( '.toast', 'Archived. That slot is free.' );
      cy.get( '.dialog' ).should( 'not.exist' );
      cy.get( '.note--conflict' ).should( 'not.exist' );
    } );

    it( '"Change dates" just closes the dialog', () => {
      cy.get( '.switch' ).click();
      cy.contains( '.dialog button', 'Change dates' ).click();
      cy.get( '.dialog' ).should( 'not.exist' );
      cy.get( '@toggle.all' ).should( 'have.length', 0 );
    } );
  } );

  describe( 'a running drip', () => {
    beforeEach( () => {
      cy.loginAsTestUser( '/drips/run1' );
      cy.wait( '@detail' );
    } );

    it( 'shows the clicks heatmap, the numbers and the archive countdown', () => {
      cy.contains( 'h2', 'October newsletter: RFP season is here' );
      cy.contains( '.preview__subject', 'RFP season is here. Are your answers ready?' ).and( 'contain', 'From Ty Showers · ty.showers@taliferro.tech' );
      cy.contains( '.seg button', 'Clicks' ).should( 'have.class', 'is-on' );
      cy.get( 'iframe.paper__frame' ).its( '0.contentDocument.body' ).should( ( body ) => {
        const badges = [...body.querySelectorAll( '[data-drip-heat]' )].map( ( node ) => node.textContent );
        expect( badges ).to.deep.equal( ['69% · 24', '31% · 11'] );
      } );
      cy.contains( '.seg button', 'Email' ).click();
      cy.get( 'iframe.paper__frame' ).its( '0.contentDocument.body' ).should( ( body ) => {
        expect( body.querySelectorAll( '[data-drip-heat]' ).length ).to.equal( 0 );
      } );

      cy.contains( '.clicks', '35 clicks from 612 sent' );
      cy.get( '.clicks__row' ).first().should( 'contain', 'Read the newsletter' ).and( 'contain', '24' );
      cy.get( '.clicks__row' ).eq( 1 ).should( 'contain', 'How to read a federal RFP in 20 minutes' );

      cy.contains( '.control__sentence', 'On. Sending 1 every 15 minutes.' );
      cy.get( '.locked' ).should( 'contain', 'Lead Vault · Gov contractors · VA/MD · 1,240' );
      cy.contains( '.expiry', '22 days left' ).and( 'contain', 'can\'t be restarted' );
      cy.contains( '.reach', 'Reaches about' ).and( 'contain', 'of 1,240 people before it archives' );
      cy.contains( '.sofar .label__end', /^Next send in \d+:\d\d$/ );
      cy.contains( '.sofar .tile', '612' ).should( 'contain', 'sent of 1,240' );
      cy.contains( '.sofar .tile', '628' ).should( 'contain', 'still in the queue' );
      cy.contains( '.sofar .tile', 'unsubscribed' ).should( 'contain', '3' );
      cy.contains( '.sofar .tile', 'bounced' ).should( 'contain', '5' );
      cy.contains( '.sofar', 'Opens are estimates' );
    } );

    it( 'pauses and resumes', () => {
      cy.get( '.switch' ).click();
      cy.wait( '@toggle' ).its( 'request.body' ).should( 'deep.equal', { on: false } );
      cy.contains( '.toast', 'Paused. It still archives on' );
      cy.contains( '.tag', 'Paused' );
      cy.contains( '.control__sentence', 'Off. The clock keeps running' );
      cy.get( '.switch' ).click();
      cy.wait( '@toggle' ).its( 'request.body' ).should( 'deep.equal', { on: true } );
      cy.contains( '.tag', 'Sending' );
    } );

    it( 'Archive now asks first, then shows the archived panel with Duplicate', () => {
      cy.contains( 'button', 'Archive now and free the slot' ).click();
      cy.get( '.dialog' ).within( () => {
        cy.contains( 'h2', 'Archive now?' );
        cy.contains( '628 people in the queue won\'t get it.' );
        cy.contains( 'button', 'Keep it' ).click();
      } );
      cy.get( '@archive.all' ).should( 'have.length', 0 );

      cy.contains( 'button', 'Archive now and free the slot' ).click();
      cy.contains( '.dialog button', /^Archive$/ ).click();
      cy.wait( '@archive' );
      cy.contains( '.toast', 'Archived. That slot is free.' );
      cy.get( '.archived-panel' ).should( 'contain', 'It was archived early' );
      cy.get( '.switch' ).should( 'not.exist' );
      cy.contains( '.archived-panel button', 'Duplicate as new drip' ).click();
      cy.wait( '@duplicate' );
      cy.location( 'pathname' ).should( 'eq', '/drips/copy1' );
    } );
  } );

  it( 'a drip from another workspace (or one that\'s gone) says so', () => {
    cy.loginAsTestUser( '/drips/nope' );
    cy.wait( '@detail' );
    cy.contains( '.state--error', 'That drip wasn\'t found.' );
  } );
} );
