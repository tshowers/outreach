import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Contact } from '../../models/contact.model';

// A compact hover/preview card for a real Contact record - deliberately not
// <app-read> (see contact/read/read.component.ts). That component renders
// through .contact-section-card (24px border-radius, its own
// backdrop-filter, clamp(1rem,2vw,1.3rem) padding per section, stacked
// Company/Communication/etc. cards) - built for a full contact page, not a
// quick glance on hover. This shows the same underlying Contact data
// (fetched by the caller, not fabricated) in one tight block instead.
@Component( {
  selector: 'app-contact-preview-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './contact-preview-card.component.html',
  styleUrl: './contact-preview-card.component.css'
} )
export class ContactPreviewCardComponent {
  @Input() contact: Contact | null = null;

  get fullName (): string {
    const first = String( this.contact?.firstName || '' ).trim();
    const last = String( this.contact?.lastName || '' ).trim();
    return [first, last].filter( Boolean ).join( ' ' ) || 'Unknown contact';
  }

  get primaryEmail (): string {
    return String( this.contact?.emailAddresses?.[0]?.emailAddress || '' ).trim();
  }

  get primaryPhone (): string {
    return String( this.contact?.phoneNumbers?.[0]?.phoneNumber || '' ).trim();
  }
}
