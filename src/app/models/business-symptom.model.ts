export type ReliefStatus =
  | 'needs-relief'
  | 'todd-working'
  | 'improving'
  | 'relief-delivered'
  | 'watching'
  | 'needs-user-decision'
  | 'insufficient-information';

export type SeverityLevel =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'informational';

export type SymptomTrend = 'improving' | 'declining' | 'stable' | 'unknown';

export interface SymptomEvidence {
  label: string;
  value: string;
  detail?: string;
  gaugeValue?: number;
  gaugeMax?: number;
  gaugeTone?: 'info' | 'positive' | 'attention' | 'warn';
}

export interface ToddReliefAction {
  label: string;
  detail: string;
}

export interface ReliefProgress {
  summary: string;
}

export interface BusinessOutcome {
  label: string;
  value: string;
  detail?: string;
  observed: boolean;
  maxValue?: number;
}

export interface BusinessSymptom {
  id: string;
  title: string;
  description: string;
  severity: SeverityLevel;
  reliefStatus: ReliefStatus;
  evidence: SymptomEvidence[];
  toddActions: ToddReliefAction[];
  progress?: ReliefProgress;
  outcome?: BusinessOutcome;
  trend?: SymptomTrend;
  module?: 'network' | 'outreach' | 'moves' | 'pulse' | 'docs' | 'social' | 'momentum';
  requiresUserAction?: boolean;
  userActionLabel?: string;
  userActionRoute?: string | null;
}
