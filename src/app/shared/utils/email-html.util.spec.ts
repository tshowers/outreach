import { scrubEmailHtml } from './email-html.util';

describe( 'scrubEmailHtml (Drafts preview, 2026-11-04)', () => {
  it( 'keeps inline styles, so the signature looks as it will when sent', () => {
    const html = scrubEmailHtml( '<p>Hi Jim,</p><table><tr><td style="background:#1f4e8c;color:#fff;border-radius:50%">TT</td><td><strong style="font-size:18px">Marketing Assistant to Ty Showers</strong></td></tr></table>' );
    expect( html ).toContain( 'style="background:#1f4e8c;color:#fff;border-radius:50%"' );
    expect( html ).toContain( 'style="font-size:18px"' );
  } );

  it( 'drops anything that runs, submits or navigates', () => {
    const html = scrubEmailHtml( '<p onclick="steal()">Hi</p><script>steal()</script><a href="javascript:steal()">x</a><iframe src="https://x"></iframe><form><input></form><a href="https://16ahead.com">ok</a>' );
    expect( html ).not.toContain( 'onclick' );
    expect( html ).not.toContain( '<script' );
    expect( html ).not.toContain( 'javascript:' );
    expect( html ).not.toContain( '<iframe' );
    expect( html ).not.toContain( '<form' );
    expect( html ).toContain( 'href="https://16ahead.com"' );
  } );

  it( 'nothing in, nothing out', () => {
    expect( scrubEmailHtml( '' ) ).toBe( '' );
    expect( scrubEmailHtml( null ) ).toBe( '' );
  } );
} );
