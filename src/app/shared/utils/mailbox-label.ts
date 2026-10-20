import { MailboxConfigSummary } from '../../services/outreach-api.service';

type LabelledMailbox = Pick<MailboxConfigSummary, 'id' | 'emailAddress' | 'provider' | 'providerLabel' | 'auth' | 'createdAt'>;

/**
 * How a mailbox is connected, so two connections to the same address can
 * be told apart: "Google sign-in", or the provider with "app password".
 * When another connection to the same address reads the same, the date it
 * was added tells them apart ("Other IMAP · app password · added Sep 3").
 */
export function mailboxConnectionLabel ( mailbox: LabelledMailbox | null | undefined, all: LabelledMailbox[] = [] ): string {
  if ( !mailbox ) return '';
  const label = methodOf( mailbox );
  const twin = all.some( other => other.id !== mailbox.id && other.emailAddress === mailbox.emailAddress && methodOf( other ) === label );
  const added = mailbox.createdAt ? new Date( mailbox.createdAt ) : null;
  if ( !twin ) return label;
  return added && Number.isFinite( added.getTime() )
    ? `${ label } · added ${ added.toLocaleDateString( 'en-US', { month: 'short', day: 'numeric', year: 'numeric' } ) }`
    : `${ label } · ${ mailbox.id }`;
}

function methodOf ( mailbox: LabelledMailbox ): string {
  if ( mailbox.auth?.mode === 'oauth' ) return 'Google sign-in';
  const provider = String( mailbox.providerLabel || mailbox.provider || '' ).replace( /_/g, ' ' ).trim();
  return provider ? `${ provider } · app password` : 'App password';
}
