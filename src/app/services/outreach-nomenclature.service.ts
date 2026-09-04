import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Nomenclature } from '../models/nomenclature.model';

/**
 * TODD's real NomenclatureService (193 lines) lets a tenant relabel terms
 * across the whole app for different business verticals - CRM ("Lead",
 * "Qualification"...), LMS ("Student", "Campus"...), LIS ("Patient",
 * "Lab"...), etc. Outreach only ever presents as a CRM/relationship tool
 * (every ported page reads and writes Contact records under the default
 * vertical's labels), so rather than port the vertical-switching machinery,
 * this just serves
 * that one vertical's default labels as a static, non-configurable set -
 * the exact 'default' entries from the original service.
 */
const DEFAULT_NOMENCLATURE: Nomenclature = {
  person: 'Contact',
  organization: 'Company',
  firstName: 'First Name',
  middleName: 'Middle Name',
  lastName: 'Last Name',
  companyName: 'Company Name',
  dbaName: 'DBA Name',
  employeeCount: 'Number of Employees',
  projects: 'Projects',
  capabilities: 'Capabilities',
  title: 'Title or Profession',
  status: 'Status',
  vip: 'VIP/Important',
  email: 'Email Address',
  phone: 'Phone Number',
  address: 'Address',
  onlinePresence: 'Online Presence',
  nickname: 'Nickname',
  birthday: 'Birthday',
  anniversary: 'Anniversary',
  gender: 'Gender',
  category: 'Category',
  timezone: 'Timezone',
  businessType: 'Business Type',
  task: 'Task',
  survey: 'Survey',
  lead: 'Lead',
  qualification: 'Qualification',
  engaged: 'Engaged',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closing: 'Closing',
  post: 'Post Sale',
  closed: 'Closed Won',
};

@Injectable( { providedIn: 'root' } )
export class OutreachNomenclatureService {
  readonly currentNomenclature$: Observable<Nomenclature> = of( DEFAULT_NOMENCLATURE );

  getNomenclature ( key: keyof Nomenclature ): string {
    return DEFAULT_NOMENCLATURE[key] || '';
  }
}
