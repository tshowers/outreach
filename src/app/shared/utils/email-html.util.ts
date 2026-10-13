/**
 * An email's own HTML, trimmed for reading in the inbox: no quoted thread,
 * broken inline (cid:) images, tracking pixels or hard-coded colours that
 * fight the dark theme. Angular's [innerHTML] sanitizer still runs after this.
 * Returns '' when there's nothing worth showing, so callers fall back to text.
 */
export function cleanEmailHtml ( raw: string | null | undefined ): string {
  const source = String( raw || '' );
  if ( !source.trim() || typeof DOMParser === 'undefined' ) return '';
  const doc = new DOMParser().parseFromString( source, 'text/html' );
  const body = doc.body;
  if ( !body ) return '';

  body.querySelectorAll( 'script, style, link, meta, title, head, iframe, object, embed, form' ).forEach( el => el.remove() );

  // Quoted thread: Gmail, Apple Mail and Outlook web/desktop markers.
  const quote = body.querySelector( '.gmail_quote, blockquote[type="cite"], #divRplyFwdMsg, #appendonsend, #mail-editor-reference-message-container' )
    || findOutlookHeaderBlock( body );
  if ( quote ) {
    const kept = body.cloneNode( true ) as HTMLElement;
    removeFromHere( quote, body );
    if ( !hasReadableText( body ) ) body.replaceChildren( ...Array.from( kept.childNodes ) );
  }

  body.querySelectorAll( 'img' ).forEach( img => {
    const src = img.getAttribute( 'src' ) || '';
    const tiny = img.getAttribute( 'width' ) === '1' || img.getAttribute( 'height' ) === '1';
    if ( !/^https?:/i.test( src ) || tiny ) img.remove();
  } );
  body.querySelectorAll( '[bgcolor], [color], [background]' ).forEach( el => {
    el.removeAttribute( 'bgcolor' );
    el.removeAttribute( 'color' );
    el.removeAttribute( 'background' );
  } );
  body.querySelectorAll( 'a[href]' ).forEach( a => {
    a.setAttribute( 'target', '_blank' );
    a.setAttribute( 'rel', 'noopener noreferrer' );
  } );
  trimTrailingBlanks( body );

  return hasReadableText( body ) ? body.innerHTML : '';
}

/** Outlook desktop: the "From: … Sent: …" block that starts the quoted thread. */
function findOutlookHeaderBlock ( body: HTMLElement ): Element | null {
  const candidates = Array.from( body.querySelectorAll( 'div, p' ) );
  return candidates.find( el => {
    const text = ( el.textContent || '' ).replace( /\s+/g, ' ' ).trim();
    return text.length < 1500 && /^From:.+?(Sent|Date):/i.test( text );
  } ) || null;
}

/** Remove el and everything after it, up to body. */
function removeFromHere ( el: Element, body: HTMLElement ): void {
  let node: Element | null = el;
  while ( node && node !== body ) {
    while ( node.nextSibling ) node.nextSibling.remove();
    const parent: Element | null = node.parentElement;
    if ( node === el ) node.remove();
    node = parent;
  }
}

/** Drop empty paragraphs at the end, inside wrappers like Outlook's WordSection1 too. */
function trimTrailingBlanks ( container: Element ): void {
  let last = container.lastElementChild;
  while ( last && !hasReadableText( last ) && !last.querySelector( 'img' ) ) {
    const previous = last.previousElementSibling;
    last.remove();
    last = previous;
  }
  if ( last && /^(DIV|SECTION|ARTICLE|TD)$/.test( last.tagName ) ) trimTrailingBlanks( last );
}

function hasReadableText ( el: Element ): boolean {
  return !!( el.textContent || '' ).replace( /[\s ]/g, '' );
}
