import { SurveyType } from '../../types/survey';

export interface PartnerContact {
  id: string;
  companyName: string;
  partnerType: SurveyType;
  contactPerson: string;
  email: string;
  ccEmails: string[];
  updatedAt: string;
}

export type EmailStatus = 'Queued' | 'Returned' | 'Sent' | 'Failed';

export interface ReportRevisionEntry {
  action: 'Queued' | 'Returned' | 'Revised & Re-queued' | 'Confirmed Immediately' | 'Auto-Sent' | 'Resent';
  timestamp: string;
  actor: string;
  details?: string;
}

export interface QueuedReportEmail {
  id: string;
  surveyId: string;
  surveyTitle: string;
  // Required for newly queued reports. Optional only so previously persisted
  // name-only queue entries can be detected and rejected safely at runtime.
  companyId?: string;
  companyName: string;
  surveyType: SurveyType;
  periodCovered: string;
  recipientEmail: string;
  ccEmails: string[];
  subject: string;
  body: string;
  status: EmailStatus;
  queuedAt: string; // ISO date string
  timerDurationMinutes: number;
  expiresAt: string; // ISO date string
  sentAt?: string;
  queuedBy: string; // email of admin who queued it
  returnedBy?: string;
  returnReason?: string;
  responseCount: number;
  overallScore: number;
  history: ReportRevisionEntry[];
}

export interface FeedbackHubSettings {
  defaultTimerMinutes: number; // e.g., 30
}
