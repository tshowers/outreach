/**
 * Groups of contacts that aren't a Category value (Ty, 2026-10-25): No
 * company, Subscribers, Affiliates and Resellers. The same rules as the
 * server's Drips audiences (todd-backend outreach/drips/drips.audience.js
 * CONTACT_GROUPS), so Catalyst and Drips agree on who's in each.
 */
export type ContactGroupId = 'no-company' | 'subscribers' | 'affiliates' | 'resellers';

type AnyContact = Record<string, any> | null | undefined;

const lower = ( value: unknown ) => String( value ?? '' ).trim().toLowerCase();

export function categoriesOf ( contact: AnyContact ): string[] {
  const value = contact?.['category'];
  return ( Array.isArray( value ) ? value : value ? [value] : [] )
    .map( ( item: any ) => String( item && typeof item === 'object' ? item.name || item.label : item ).trim() )
    .filter( Boolean );
}

const hasCategory = ( contact: AnyContact, names: string[] ) => categoriesOf( contact ).some( ( value ) => names.includes( value.toLowerCase() ) );

export function companyNameOf ( contact: AnyContact ): string {
  return String( contact?.['company']?.name || contact?.['companyName'] || '' ).trim();
}

export const CONTACT_GROUPS: Array<{ id: ContactGroupId; name: string; test: ( contact: AnyContact ) => boolean; }> = [
  { id: 'no-company', name: 'No company', test: ( contact ) => !companyNameOf( contact ) },
  { id: 'subscribers', name: 'Subscribers', test: ( contact ) => contact?.['subscriber'] === true || contact?.['subscribed'] === true || contact?.['newsletter'] === true || hasCategory( contact, ['subscriber', 'subscribers'] ) },
  { id: 'affiliates', name: 'Affiliates', test: ( contact ) => contact?.['affiliate'] === true || lower( contact?.['type'] ) === 'affiliate' || hasCategory( contact, ['affiliate', 'affiliates'] ) },
  { id: 'resellers', name: 'Resellers', test: ( contact ) => contact?.['reseller'] === true || lower( contact?.['type'] ) === 'reseller' || hasCategory( contact, ['reseller', 'resellers'] ) },
];
