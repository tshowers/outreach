import { BusinessSymptom, ReliefStatus, SeverityLevel } from '../../models/business-symptom.model';

export type CockpitDiagnosisTone = 'info' | 'positive' | 'attention' | 'warn' | 'idle';

export interface CockpitDiagnosisRowVm {
  id: string;
  title: string;
  severity: SeverityLevel;
  reliefStatus: ReliefStatus;
  statusTone: CockpitDiagnosisTone;
  severityLabel: string;
  reliefLabel: string;
  symptom: string;
  evidence: string;
  treatment: string;
  relief: string;
  proofLabel: string;
  proofReadout: string;
  proofDetail: string;
  proofValue: number;
  proofMax: number;
}

export function buildCockpitDiagnosisRows ( symptoms: BusinessSymptom[] ): CockpitDiagnosisRowVm[] {
  return symptoms.map( symptom => {
    const proofLabel = symptom.outcome?.label || 'Proof';
    const proofReadout = symptom.outcome?.value || '0';
    const proofValue = parseNumericReadout( proofReadout );

    return {
      id: symptom.id,
      title: symptom.title,
      severity: symptom.severity,
      reliefStatus: symptom.reliefStatus,
      statusTone: toneFromSymptom( symptom ),
      severityLabel: labelFromSeverity( symptom.severity ),
      reliefLabel: labelFromReliefStatus( symptom.reliefStatus ),
      symptom: symptom.description,
      evidence: symptom.evidence[0]?.detail || symptom.evidence[0]?.value || 'Signal appears after live data is connected.',
      treatment: symptom.toddActions[0]?.detail || 'TODD is standing by for the next treatment step.',
      relief: symptom.progress?.summary || 'Relief becomes visible as the treatment starts producing proof.',
      proofLabel,
      proofReadout,
      proofDetail: symptom.outcome?.detail || 'Proof appears when live business data supports the outcome.',
      proofValue,
      proofMax: symptom.outcome?.maxValue ?? maxFromReadout( proofReadout, proofValue )
    };
  } );
}

function toneFromSymptom ( symptom: BusinessSymptom ): CockpitDiagnosisTone {
  if ( symptom.reliefStatus === 'relief-delivered' || symptom.reliefStatus === 'improving' ) {
    return 'positive';
  }

  if ( symptom.reliefStatus === 'todd-working' || symptom.reliefStatus === 'needs-user-decision' ) {
    return 'attention';
  }

  if ( symptom.reliefStatus === 'watching' || symptom.reliefStatus === 'insufficient-information' ) {
    return 'info';
  }

  if ( symptom.severity === 'critical' || symptom.severity === 'high' ) {
    return 'warn';
  }

  if ( symptom.severity === 'medium' ) {
    return 'attention';
  }

  if ( symptom.severity === 'low' ) {
    return 'positive';
  }

  return 'info';
}

function labelFromSeverity ( severity: SeverityLevel ): string {
  switch ( severity ) {
    case 'critical':
      return 'CRITICAL';
    case 'high':
      return 'HIGH';
    case 'medium':
      return 'MEDIUM';
    case 'low':
      return 'LOW';
    case 'informational':
    default:
      return 'INFORMATIONAL';
  }
}

function labelFromReliefStatus ( reliefStatus: ReliefStatus ): string {
  switch ( reliefStatus ) {
    case 'needs-relief':
      return 'NEEDS RELIEF';
    case 'todd-working':
      return 'TODD IS WORKING';
    case 'improving':
      return 'IMPROVING';
    case 'relief-delivered':
      return 'RELIEF DELIVERED';
    case 'watching':
      return 'WATCHING';
    case 'needs-user-decision':
      return 'NEEDS DECISION';
    case 'insufficient-information':
    default:
      return 'PREVIEW MODE';
  }
}

function parseNumericReadout ( readout: string ): number {
  const match = String( readout || '' ).match( /-?\d+(\.\d+)?/ );
  if ( !match ) {
    return 0;
  }

  return Number( match[0] ) || 0;
}

function maxFromReadout ( readout: string, value: number ): number {
  if ( String( readout || '' ).includes( '%' ) ) {
    return 100;
  }

  return Math.max( value, 1 );
}
