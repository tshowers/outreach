/**
 * What kind of email this is, for the Inbox tags and filters (design 4f).
 * The server's `classification` only covers replies from contacts, so the
 * type comes from the sender, subject and text - the same rules as the iOS
 * app (MessageKind.swift) and the server's Needs You (outreach/replyText.js).
 */
export type MessageKind = 'reply' | 'outOfOffice' | 'bounce' | 'forward' | 'newsletter';

export const MESSAGE_KIND_LABELS: Record<MessageKind, string> = {
  reply: 'Reply',
  outOfOffice: 'Out of office',
  bounce: 'Bounce',
  forward: 'Forward',
  newsletter: 'Newsletter'
};

interface MessageLike {
  subject?: string | null;
  fromEmail?: string | null;
  preview?: string | null;
  text?: string | null;
  signalSummary?: string | null;
}

export function messageKind ( message: MessageLike ): MessageKind {
  const subject = String( message.subject || '' ).toLowerCase();
  const from = String( message.fromEmail || '' ).toLowerCase();
  const text = `${ subject }\n${ message.preview || '' }\n${ message.text || '' }`.toLowerCase();

  if ( from.includes( 'mailer-daemon' ) || from.includes( 'postmaster' )
    || ['delivery status notification', 'undeliverable', 'mail delivery failed', 'returned mail', 'delivery has failed'].some( phrase => subject.includes( phrase ) )
    || /(address|account|email) (is )?no longer (active|in use|valid|monitored)|no longer with (the company|us)/.test( text ) ) {
    return 'bounce';
  }
  if ( ['automatic reply', 'auto:', 'autoreply', 'auto-reply', 'out of office', 'out of the office'].some( prefix => subject.startsWith( prefix ) )
    || /out of (the )?office|\booo\b|on (annual |parental |maternity |paternity )?leave|limited (access to )?e-?mail|will (be )?(return|back) (on|by|after)/.test( text ) ) {
    return 'outOfOffice';
  }
  if ( subject.startsWith( 'fw:' ) || subject.startsWith( 'fwd:' ) ) {
    return 'forward';
  }
  // Senders only: replies to Outreach quote its unsubscribe footer, and
  // small businesses answer from info@ or hello@.
  if ( /(no-?reply|do-?not-?reply|newsletter|news|marketing|notifications?|updates)@/.test( from ) ) {
    return 'newsletter';
  }
  return 'reply';
}

/**
 * Outlook's text part puts a blank line after every line (one <p> each) and
 * two or more where the sender left a real gap, so every line - signature
 * included - reads double-spaced once runs collapse. When the sender's own
 * text has no two adjacent lines and at least one longer gap, turn single
 * blanks back into line breaks and longer runs into one paragraph break.
 */
export function undoubleSpace ( raw: string | null | undefined ): string {
  const lines = String( raw || '' ).replace( /\r\n?/g, '\n' ).split( '\n' );
  const isBlank = ( line: string ) => !line.replace( /[\s ]/g, '' );
  const quoteStart = lines.findIndex( line => /^\s*(>|from:\s|on .{3,200}wrote:?\s*$|-{2,}\s*original message)/i.test( line ) );
  const own = quoteStart < 0 ? lines : lines.slice( 0, quoteStart );
  let adjacent = false;
  let longGap = false;
  let run = 0;
  own.forEach( ( line, i ) => {
    if ( isBlank( line ) ) {
      run++;
      return;
    }
    if ( run >= 2 ) longGap = true;
    if ( i > 0 && run === 0 ) adjacent = true;
    run = 0;
  } );
  if ( adjacent || !longGap ) return lines.join( '\n' );

  const out: string[] = [];
  run = 0;
  for ( const line of lines ) {
    if ( isBlank( line ) ) {
      run++;
      continue;
    }
    if ( out.length && run >= 2 ) out.push( '' );
    out.push( line );
    run = 0;
  }
  return out.join( '\n' );
}

/** Readable email text: no tracking links, header blocks or quoted thread. */
export function cleanMessageText ( raw: string | null | undefined ): string {
  const withoutLinks = String( raw || '' )
    .replace( /\r\n?/g, '\n' )
    .replace( /[_=]{5,}/g, '\n-----\n' )
    .replace( /\[(?:cid:|https?:\/\/)[^\]]*\]/gi, '' )
    .replace( /<(?:mailto:|https?:\/\/)[^>]*>/gi, '' )
    .replace( /https?:\/\/\S+/gi, '' )
    .replace( /[ \t]+/g, ' ' );
  const own: string[] = [];
  let quoted: string[] | null = null;
  for ( const rawLine of withoutLinks.split( '\n' ) ) {
    const line = rawLine.trim();
    const isMarker = /^on .{3,200}wrote:?$|^-{2,}\s*(original|forwarded) message\s*-{2,}$|^begin forwarded message:?$|^[\s_\-=*]{5,}$/i.test( line );
    if ( isMarker || line.startsWith( '>' ) ) {
      quoted = [];
      continue;
    }
    ( quoted || own ).push( line );
  }
  const isHeader = ( line: string ) => /^(from|sent|to|cc|bcc|date|subject|reply-to):\s/i.test( line );
  const hasOwnText = own.some( line => line && !isHeader( line ) );
  const kept = hasOwnText ? own : ( quoted || own ).filter( line => !isHeader( line ) );
  return kept
    .filter( line => !/^[\w ]{1,30}:$/.test( line ) )
    .join( '\n' )
    .replace( /\n{3,}/g, '\n\n' )
    .trim();
}
