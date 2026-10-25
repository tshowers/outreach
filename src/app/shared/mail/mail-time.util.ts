/** Times on the mail pages, the way the design writes them. */

const DAY_MS = 86400000;

function startOfDay ( date: Date ): number {
  return new Date( date.getFullYear(), date.getMonth(), date.getDate() ).getTime();
}

function clock ( date: Date ): string {
  return date.toLocaleTimeString( 'en-US', { hour: 'numeric', minute: '2-digit' } );
}

/** "Dana" from "Dana Whitfield". */
export function firstName ( name: string ): string {
  return String( name || '' ).trim().split( /\s+/ )[0] || 'their';
}

/** When something is about to happen: "today at 3:00 PM", "tomorrow at 9:00 AM", "Mon, Oct 26 at 9:00 AM". */
export function sendTimeLabel ( date: Date, now = new Date() ): string {
  if ( Number.isNaN( date.getTime() ) ) return '';
  const days = Math.round( ( startOfDay( date ) - startOfDay( now ) ) / DAY_MS );
  if ( days === 0 ) return `today at ${ clock( date ) }`;
  if ( days === 1 ) return `tomorrow at ${ clock( date ) }`;
  return `${ date.toLocaleDateString( 'en-US', { weekday: 'short', month: 'short', day: 'numeric' } ) } at ${ clock( date ) }`;
}

/** When something happened: "today at 1:41 PM", "yesterday", "3 days ago", "on Oct 5". */
export function sinceLabel ( iso: string | undefined | null, now = new Date() ): string {
  const date = new Date( String( iso || '' ) );
  if ( !iso || Number.isNaN( date.getTime() ) ) return '';
  const days = Math.round( ( startOfDay( now ) - startOfDay( date ) ) / DAY_MS );
  if ( days <= 0 ) return `today at ${ clock( date ) }`;
  if ( days === 1 ) return 'yesterday';
  if ( days < 7 ) return `${ days } days ago`;
  return `on ${ date.toLocaleDateString( 'en-US', { month: 'short', day: 'numeric' } ) }`;
}

/** A countdown for Outbox: "In 2 hours", "In 25 minutes", "Tomorrow", "In 3 days". */
export function countdownLabel ( date: Date, now = new Date() ): string {
  const ms = date.getTime() - now.getTime();
  if ( Number.isNaN( ms ) ) return '';
  if ( ms <= 60000 ) return 'Any minute';
  const minutes = Math.round( ms / 60000 );
  if ( minutes < 60 ) return `In ${ minutes } minute${ minutes === 1 ? '' : 's' }`;
  const days = Math.round( ( startOfDay( date ) - startOfDay( now ) ) / DAY_MS );
  if ( days === 0 ) {
    const hours = Math.round( minutes / 60 );
    return `In ${ hours } hour${ hours === 1 ? '' : 's' }`;
  }
  if ( days === 1 ) return 'Tomorrow';
  return `In ${ days } days`;
}
