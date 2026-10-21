/**
 * A letter's HTML, made ready for the paper's sandboxed frame.
 *
 * Plain mail (what people type: Outlook, Gmail, Apple Mail) takes the
 * paper's type and colors, so it reads like the rest of the letter; its
 * links, bold, lists and signature images stay. Designed mail (newsletters,
 * receipts, verification codes) keeps its own layout on its own canvas.
 *
 * The quoted thread under a reply is cut and kept as `full`, for "Show
 * earlier messages". A forward is never cut: the forwarded mail is the
 * message.
 */

export interface LetterTheme {
  text: string;
  muted: string;
  link: string;
  line: string;
  font: string;
}

export interface LetterHtml {
  /** The frame's document: the letter without its quoted thread. */
  own: string;
  /** The whole letter, when a thread was cut; else null. */
  full: string | null;
  designed: boolean;
}

const QUOTE_SELECTORS = [
  '.gmail_quote',
  'blockquote[type="cite"]',
  '#divRplyFwdMsg',
  '#appendonsend',
  '.yahoo_quoted',
  '#mail-editor-reference-message-container',
  'div[name="messageReplySection"]',
  '.moz-cite-prefix',
];

/**
 * Outlook's header block: "From: … Sent: … To: … Subject: …". Its lines
 * are split by <br>, which adds no space to textContent ("…>Sent:").
 */
const HEADER_BLOCK = /^from:\s.{1,300}?(sent|date):\s/i;
const WROTE_LINE = /^on\s.{3,200}wrote:?$/i;
const FORWARD_MARK = /begin forwarded message|-{2,}\s*forwarded message\s*-{2,}/i;
const DROP = 'script, noscript, iframe, frame, frameset, object, embed, applet, form, base, meta, link:not([rel~="stylesheet"]), title';

export function prepareLetterHtml ( html: string, theme: LetterTheme, opts: { forward?: boolean; } = {} ): LetterHtml | null {
  if ( !String( html || '' ).trim() || typeof DOMParser === 'undefined' ) return null;
  const doc = new DOMParser().parseFromString( html, 'text/html' );
  scrub( doc );
  if ( !text( doc.body ) && !doc.body.querySelector( 'img' ) ) return null;

  const designed = isDesigned( doc );
  const styles = Array.from( doc.querySelectorAll( 'style' ) ).map( style => style.outerHTML ).join( '' );
  doc.querySelectorAll( 'style' ).forEach( style => style.remove() );

  trimStart( doc.body );
  const forward = !!opts.forward || FORWARD_MARK.test( text( doc.body ).slice( 0, 4000 ) );
  const fullBody = doc.body.innerHTML;
  const cut = forward ? false : cutThread( doc );
  const page = ( body: string ) => frameDocument( body, styles, theme, designed, doc.body );
  return {
    own: page( doc.body.innerHTML ),
    full: cut ? page( fullBody ) : null,
    designed,
  };
}

/** Nothing that runs, submits or navigates; links open in a new tab (the frame's base). */
function scrub ( doc: Document ): void {
  doc.querySelectorAll( DROP ).forEach( node => node.remove() );
  doc.querySelectorAll( '*' ).forEach( element => {
    for ( const attr of Array.from( element.attributes ) ) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if ( name.startsWith( 'on' ) || ( ['href', 'src', 'action', 'formaction', 'xlink:href'].includes( name ) && /^(javascript|vbscript|data:text\/html)/.test( value ) ) ) {
        element.removeAttribute( attr.name );
      }
    }
  } );
}

/** Its own canvas: a colored background or a fixed-width layout table. */
function isDesigned ( doc: Document ): boolean {
  const plainColor = ( value: string ) => !value || /^(#fff(fff)?|white|transparent|none|inherit|initial|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(,\s*1(\.0+)?\s*)?\))$/i.test( value.trim() );
  for ( const element of Array.from( doc.querySelectorAll( 'body, table, td, div, center' ) ) as HTMLElement[] ) {
    const bg = element.getAttribute( 'bgcolor' ) || element.style?.backgroundColor || '';
    if ( !plainColor( bg ) ) return true;
    if ( /url\(/i.test( element.style?.backgroundImage || '' ) ) return true;
    if ( element.tagName === 'TABLE' ) {
      const width = parseInt( element.getAttribute( 'width' ) || element.style?.width || '', 10 );
      if ( width >= 480 ) return true;
    }
  }
  return false;
}

/**
 * Cuts the quoted thread: from the first quote marker (or Outlook's header
 * block, with the rule above it) to the end. Not when nothing of the
 * letter's own would be left.
 */
function cutThread ( doc: Document ): boolean {
  const start = quoteStart( doc );
  if ( !start ) return false;
  const before = doc.body.cloneNode( true ) as HTMLElement;

  // "On Tue, Oct 6, Ty wrote:" sits just above Apple's and Gmail's quote.
  let node: Node | null = start;
  const previous = previousContent( start );
  if ( previous && WROTE_LINE.test( text( previous ) ) ) node = previous;
  // Outlook rules the header block off with an <hr> or a top border.
  const rule = previousContent( node as Element );
  if ( rule && ( rule.nodeName === 'HR' || ( !text( rule ) && !( rule as Element ).querySelector?.( 'img' ) ) ) ) node = rule;

  removeFrom( node as Node, doc.body );
  trimEnd( doc.body );
  if ( !text( doc.body ) && !doc.body.querySelector( 'img' ) ) {
    doc.body.replaceWith( before );
    return false;
  }
  return true;
}

function quoteStart ( doc: Document ): Element | null {
  const marked = QUOTE_SELECTORS
    .map( selector => doc.body.querySelector( selector ) )
    .filter( ( element ): element is Element => !!element );
  let header: Element | null = null;
  for ( const element of Array.from( doc.body.querySelectorAll( 'div, p, td' ) ) ) {
    if ( !HEADER_BLOCK.test( text( element ) ) ) continue;
    // The innermost block that holds the whole header.
    header = element;
    let inner: Element | undefined;
    while ( ( inner = Array.from( header.children ).find( child => HEADER_BLOCK.test( text( child ) ) ) ) ) header = inner;
    // Outlook's header sits in its own bordered div: start there.
    const box = header.closest( 'div[style*="border-top"]' );
    if ( box && box !== doc.body ) header = box;
    break;
  }
  const candidates = header ? [...marked, header] : marked;
  if ( !candidates.length ) return null;
  return candidates.reduce( ( first, next ) =>
    first.compareDocumentPosition( next ) & Node.DOCUMENT_POSITION_PRECEDING ? next : first );
}

/** The sibling just before `node` that shows something, walking up when it's first. */
function previousContent ( node: Element ): Element | null {
  let current: Node | null = node;
  while ( current && current.nodeName !== 'BODY' ) {
    let sibling = current.previousSibling;
    while ( sibling && sibling.nodeType === Node.TEXT_NODE && !sibling.textContent?.trim() ) sibling = sibling.previousSibling;
    if ( sibling ) return sibling.nodeType === Node.ELEMENT_NODE ? sibling as Element : null;
    current = current.parentNode;
  }
  return null;
}

/** Removes `node`, everything after it, and everything after each of its parents. */
function removeFrom ( node: Node, body: HTMLElement ): void {
  let current: Node | null = node;
  while ( current && current !== body ) {
    const parent: Node | null = current.parentNode;
    while ( current.nextSibling ) current.nextSibling.remove();
    if ( current === node ) ( current as ChildNode ).remove();
    current = parent;
  }
}

/** Blank lines and empty blocks left at the end. */
function trimEnd ( element: Element ): void {
  let last = element.lastChild;
  while ( last ) {
    const blank = last.nodeType === Node.TEXT_NODE
      ? !last.textContent?.replace( / /g, ' ' ).trim()
      : last.nodeType === Node.ELEMENT_NODE && ( last.nodeName === 'BR' || last.nodeName === 'HR' || ( !text( last as Element ) && !( last as Element ).querySelector( 'img, table' ) && last.nodeName !== 'IMG' ) );
    if ( !blank ) {
      if ( last.nodeType === Node.ELEMENT_NODE ) trimEnd( last as Element );
      return;
    }
    const previous: ChildNode | null = last.previousSibling;
    last.remove();
    last = previous;
  }
}

/** Apple Mail's blank line before "Sent from my iPad", and the like. */
function trimStart ( element: Element ): void {
  let first = element.firstChild;
  while ( first ) {
    const blank = first.nodeType === Node.TEXT_NODE
      ? !first.textContent?.replace( /\u00a0/g, ' ' ).trim()
      : first.nodeName === 'BR' || ( first.nodeType === Node.ELEMENT_NODE && !text( first as Element ) && !( first as Element ).querySelector( 'img, table, hr' ) && !['IMG', 'HR', 'TABLE'].includes( first.nodeName ) );
    if ( !blank ) {
      if ( first.nodeType === Node.ELEMENT_NODE && !['IMG', 'TABLE'].includes( first.nodeName ) ) trimStart( first as Element );
      return;
    }
    const next: ChildNode | null = first.nextSibling;
    first.remove();
    first = next;
  }
}

function text ( node: Element | null ): string {
  return String( node?.textContent || '' ).replace( /[\s ]+/g, ' ' ).trim();
}

function frameDocument ( body: string, styles: string, theme: LetterTheme, designed: boolean, source: HTMLElement ): string {
  // The sender's body attributes (style, bgcolor, dir…): designed mail paints its page there.
  const bodyAttrs = Array.from( source.attributes )
    .map( attr => ` ${ attr.name }="${ escapeAttr( attr.value ) }"` )
    .join( '' );
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">`
    + `<style>${ baseCss( theme, designed ) }</style>${ styles }`
    + ( designed ? '' : `<style>${ plainCss( theme ) }</style>` )
    + `</head><body${ bodyAttrs }>${ body }</body></html>`;
}

function baseCss ( theme: LetterTheme, designed: boolean ): string {
  return `
    html, body { margin: 0; padding: 0; }
    html { background: ${ designed ? '#fff' : 'transparent' }; overflow-x: auto; overflow-y: hidden; }
    body { display: flow-root; ${ designed ? 'color: #111; font: 15px/1.5 -apple-system, system-ui, sans-serif;' : '' } overflow-wrap: anywhere; word-break: break-word; }
    img { max-width: 100%; height: auto; }
    img[width="1"], img[height="1"], img[width="0"], img[height="0"] { display: none !important; }
    pre { white-space: pre-wrap; }
    a { cursor: pointer; }
  `;
}

/** The paper's type: sizes and colors win over the sender's. */
function plainCss ( theme: LetterTheme ): string {
  return `
    body { color: ${ theme.text }; font-family: ${ theme.font }; font-size: 19px; line-height: 1.7; }
    body * { color: inherit !important; background-color: transparent !important; border-color: ${ theme.line } !important; font-family: inherit !important; font-size: inherit !important; line-height: inherit !important; }
    a, a * { color: ${ theme.link } !important; text-decoration: none !important; }
    /* Signature logos are drawn for white paper. */
    body img { background-color: #fff !important; border-radius: 4px; }
    a:hover { text-decoration: underline !important; }
    p { margin: 0 0 0.9em; }
    p.MsoNormal, p[class^="Mso"] { margin: 0; }
    blockquote { margin: 0.8em 0; padding: 0 0 0 16px; border-left: 3px solid ${ theme.line }; color: ${ theme.muted } !important; }
    blockquote * { color: ${ theme.muted } !important; }
    hr { border: 0; border-top: 1px solid ${ theme.line }; margin: 1.2em 0; }
    table { border-collapse: collapse; max-width: 100%; }
    td, th { vertical-align: top; }
    ul, ol { padding-left: 1.4em; }
  `;
}

function escapeAttr ( value: string ): string {
  return value.replace( /&/g, '&amp;' ).replace( /"/g, '&quot;' ).replace( /</g, '&lt;' );
}
