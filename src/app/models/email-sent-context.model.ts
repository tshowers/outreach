/** What TODD's assistant box reads about sent emails (moved from the old Signal Engine Sent tab). */
export interface EmailSentFollowUpCandidate {
  to: string;
  subject: string;
  reason: string;
  clickCount: number;
  openCount: number;
  sentDate: string;
}

export interface EmailSentAssistantContext {
  page: 'email-sent';
  rangeDays: number;
  totalEmails: number;
  openedEmails: number;
  unopenedEmails: number;
  clickedEmails: number;
  totalClicks: number;
  clickThroughRate: number;
  openRate: number;
  followUpNow: EmailSentFollowUpCandidate[];
  warmRecipients: EmailSentFollowUpCandidate[];
  coldRecipients: EmailSentFollowUpCandidate[];
  openedNoClickRecipients: EmailSentFollowUpCandidate[];
  topSubjects: { subject: string; count: number; }[];
  worstSubjects: { subject: string; count: number; }[];
}
