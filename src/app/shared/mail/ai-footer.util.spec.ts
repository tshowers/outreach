import { stripAiFooter } from './ai-footer.util';

describe( 'stripAiFooter', () => {
  const todd = 'Maya drafted this message, but the thinking and intent behind it came from a real person. She’s just better at putting it into words. Maya is TODD’s AI Marketing Director.';

  it( 'removes the old TODD/Maya footer paragraph and keeps the signature', () => {
    const body = `<p>Hi Ada,</p><table><tr><td>Ty</td></tr></table><p style="font-size:11px;color:#8a8f98;margin-top:12px;">${ todd }</p>`;
    expect( stripAiFooter( body ) ).toBe( '<p>Hi Ada,</p><table><tr><td>Ty</td></tr></table>' );
  } );

  it( 'removes the 16Ahead wording too', () => {
    const body = '<p>Hi Ada,</p><p style="font-size:11px;">16Ahead’s AI Marketing Assistant drafted this message, but the thinking and intent behind it came from a real person. It’s just better at putting it into words.</p>';
    expect( stripAiFooter( body ) ).toBe( '<p>Hi Ada,</p>' );
  } );

  it( 'leaves the compliance footer and other paragraphs alone', () => {
    const compliance = '<p style="font-size:11px;">This email is an advertisement for Acme.</p>';
    expect( stripAiFooter( `<p>Hi Ada,</p><p>${ todd }</p>${ compliance }` ) ).toBe( `<p>Hi Ada,</p>${ compliance }` );
  } );

  it( 'returns a body without the footer unchanged', () => {
    expect( stripAiFooter( '<p>Hi Ada,</p> ' ) ).toBe( '<p>Hi Ada,</p> ' );
    expect( stripAiFooter( '' ) ).toBe( '' );
  } );
} );
