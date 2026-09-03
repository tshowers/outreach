/** Ported field list from services/nomenclature.service.ts's Nomenclature interface. */
export interface Nomenclature {
  person: string;
  organization: string;
  firstName: string;
  middleName: string;
  lastName: string;
  companyName: string;
  dbaName: string;
  employeeCount: string;
  projects: string;
  capabilities: string;
  title: string;
  status: string;
  vip: string;
  email: string;
  phone: string;
  address: string;
  onlinePresence: string;
  nickname: string;
  birthday: string;
  anniversary: string;
  gender: string;
  category: string;
  timezone: string;
  businessType: string;
  task: string;
  survey: string;
  lead: string;
  qualification: string;
  engaged: string;
  proposal: string;
  negotiation: string;
  closing: string;
  post: string;
  closed: string;
  [key: string]: string | undefined;
}
