/**
 * Trimmed version of TODD's Contact interface
 * (frontend/src/app/shared/data/interfaces/contact.model.ts) - that one is
 * huge and covers every feature across TODD (opportunities, engagements,
 * subscriptions, etc.). This grows field-by-field as more of Network's
 * pages get ported and actually need them, rather than porting the whole
 * interface up front.
 */
export interface EmailAddress {
  emailAddress: string;
  emailAddressType?: string;
  blocked?: boolean;
}

export interface PhoneNumber {
  phoneNumber: string;
  phoneNumberType?: string;
}

export interface Address {
  addressType?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

export interface SocialMedia {
  platform: string;
  url?: string;
  username?: string;
}

export interface Note {
  subject?: string;
  body?: string;
  lastUpdated?: string;
}

export interface ContactImage {
  src: string;
  alt?: string;
  _loadError?: boolean;
}

export interface Company {
  name?: string;
  url?: string;
  logoUrl?: string;
  publicInfo?: string;
  dba?: string;
  numberOfEmployees?: string;
  sicCode?: string;
  capabilities?: string[];
  addresses?: Address[];
  products?: import( './product.model' ).Product[];
}

export interface Contact {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  profession?: string;
  gender?: string;
  category?: string | string[];
  company?: Company;
  emailAddresses?: EmailAddress[];
  phoneNumbers?: PhoneNumber[];
  socialMedia?: SocialMedia[];
  profileTypes?: string[];
  addresses?: Address[];
  notes?: Note[];
  images?: ContactImage[];
  lastUpdated?: string;
  important?: boolean;
  status?: string;
  emailStage?: string;
  nickname?: string;
  birthday?: string;
}
