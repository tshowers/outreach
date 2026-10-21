import { prepareLetterHtml } from './letter-html';

const theme = { text: '#fff', muted: '#999', link: '#69f', line: '#333', font: 'system-ui' };

describe( 'prepareLetterHtml', () => {
  it( "cuts Outlook's quoted thread (header lines split by <br>) and keeps it for Show earlier messages", () => {
    const html = '<body><div><p>Hello Ty,</p><p>Neil</p><p><img src="data:image/png;base64,AAAA" alt="logo"></p>'
      + '<div style="border:none;border-top:solid #E1E1E1 1.0pt"><p><b>From:</b> Ty &lt;ty@x.com&gt;<br><b>Sent:</b> Wednesday<br><b>Subject:</b> Re: Uploads</p></div>'
      + '<p>Old thread</p></div></body>';
    const result = prepareLetterHtml( html, theme )!;
    expect( result.own ).toContain( 'Neil' );
    expect( result.own ).toContain( 'alt="logo"' );
    expect( result.own ).not.toContain( 'Old thread' );
    expect( result.full ).toContain( 'Old thread' );
    expect( result.designed ).toBeFalse();
  } );

  it( 'never cuts a forward: the forwarded mail is the message', () => {
    const html = '<body><br><div>Sent from my iPad</div><div>Begin forwarded message:</div><blockquote type="cite"><div><b>From:</b> Sam<br><b>Date:</b> Oct 13</div><p>The reception starts at 6</p></blockquote></body>';
    const result = prepareLetterHtml( html, theme, { forward: true } )!;
    expect( result.own ).toContain( 'The reception starts at 6' );
    expect( result.full ).toBeNull();
  } );

  it( "cuts Apple Mail's quote with its 'wrote:' line", () => {
    const html = '<body><div>Sounds good.</div><div>On Oct 6, 2026, at 9:00 AM, Ty wrote:</div><blockquote type="cite">Earlier</blockquote></body>';
    const result = prepareLetterHtml( html, theme )!;
    expect( result.own ).toContain( 'Sounds good.' );
    expect( result.own ).not.toContain( 'wrote:' );
    expect( result.own ).not.toContain( 'Earlier' );
  } );

  it( 'keeps designed mail on its own canvas, body styles included', () => {
    const html = '<body style="background:#45484d"><table width="600" bgcolor="#333333"><tr><td>Code 000000</td></tr></table></body>';
    const result = prepareLetterHtml( html, theme )!;
    expect( result.designed ).toBeTrue();
    expect( result.own ).toContain( 'style="background:#45484d"' );
  } );

  it( 'drops scripts, handlers and javascript: links', () => {
    const html = '<body onload="x()"><p onclick="y()">Hi <a href="javascript:alert(1)">there</a></p><script>z()</script></body>';
    const result = prepareLetterHtml( html, theme )!;
    expect( result.own ).not.toContain( 'onload' );
    expect( result.own ).not.toContain( 'onclick' );
    expect( result.own ).not.toContain( 'javascript:' );
    expect( result.own ).not.toContain( '<script' );
  } );

  it( 'returns null for empty mail, so the letter shows its text', () => {
    expect( prepareLetterHtml( '<html><head></head><body><br></body></html>', theme ) ).toBeNull();
  } );
} );
