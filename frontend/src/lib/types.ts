/**
 * CareBridge AI: Frontend TypeScript Interfaces
 * Strictly mirrored from backend Pydantic models in app/schemas/clinical.py
 */

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type TaskCategory = 
  | 'MEDICATION' 
  | 'VITAL_CHECK' 
  | 'WOUND_CARE' 
  | 'PHYSICAL_THERAPY' 
  | 'HYDRATION_DIET' 
  | 'CHECK_IN';

export type TaskStatus = 'PENDING' | 'COMPLETED' | 'MISSED' | 'SKIPPED' | 'SNOOZED';

export type TicketStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED';

export type RecoveryEventType = 
  | 'PATIENT_CREATED'
  | 'DISCHARGE_UPLOADED'
  | 'DISCHARGE_PARSED'
  | 'RECOVERY_PLAN_CREATED'
  | 'TASK_COMPLETED'
  | 'TASK_MISSED'
  | 'TASK_SNOOZED'
  | 'VITAL_RECORDED'
  | 'SYMPTOM_REPORTED'
  | 'FOLLOWUP_COMPLETED'
  | 'REMINDER_SENT'
  | 'SAFETY_TRIGGERED'
  | 'ESCALATION_CREATED'
  | 'ESCALATION_ACKNOWLEDGED'
  | 'CLINICAL_REVIEW_COMPLETED';

export interface RecoveryEvent {
  event_id: string;
  run_id: string;
  patient_id: string;
  event_type: RecoveryEventType;
  task_id?: string;
  timestamp: string;
  status?: string;
  value?: any;
  source?: string;
  metadata?: Record<string, any>;
}

export interface EscalationTicket {
  ticket_id: string;
  patient_id: string;
  patient_name?: string;
  risk_level: RiskLevel;
  triggered_rule: string;
  status: TicketStatus;
  created_at: string;
  sbar: SbarNote;
  assigned_clinician?: string;
  clinician_notes?: string;
}

export interface PatientBase {
  id: string;
  first_name: string;
  last_name: string;
  age?: number;
  gender?: string;
  discharge_date?: string;
  condition_category?: string;
  primary_care_physician?: string;
  clinic_phone?: string;
  emergency_contact?: string;
  is_demo?: boolean;
}

export interface CreatePatientRequest {
  name: string;
  age?: number;
  gender?: string;
  contact?: string;
  emergency_contact?: string;
  discharge_date?: string;
  primary_diagnosis?: string;
  condition_category?: string;
  procedure?: string;
  physician_care_team?: string;
  discharge_summary_text?: string;
}

export type TimingType = 'CLOCK_TIME' | 'ROUTINE_WINDOW' | 'INTERVAL' | 'PRN_AS_NEEDED' | 'UNSPECIFIED';

export interface MedicationItem {
  drug_name: string;
  dosage: string;
  route: string;
  frequency: string;
  schedule_slots: string[];
  timing_type?: TimingType;
  documented_instruction?: string;
  indication: string;
  is_discontinued: boolean;
  warning?: string;
}

export interface FollowUpAppointment {
  provider: string;
  specialty: string;
  clinic_name: string;
  date_time: string;
  contact_number: string;
}

export interface DischargeProfile {
  profile_id: string;
  patient_id: string;
  primary_diagnosis: string;
  procedures: string[];
  discharge_date: string;
  dietary_instructions: string;
  activity_restrictions: string;
  wound_care_instructions?: string;
  medications: MedicationItem[];
  red_flag_warnings: string[];
  follow_up_appointments: FollowUpAppointment[];
}

export interface CareTask {
  task_id: string;
  patient_id: string;
  day_number: number;
  category: TaskCategory;
  title: string;
  description: string;
  scheduled_time: string;
  timing_type?: TimingType;
  documented_instruction?: string;
  status: TaskStatus;
  completed_at?: string;
  notes?: string;
}

export interface SymptomReport {
  patient_id: string;
  symptom_description: string;
  severity_score: number; // 1 to 10
  measured_temp?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  heart_rate?: number;
  spo2?: number;
  weight_gain_24h_lbs?: number;
  anatomical_location?: string;
}

export interface SbarNote {
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
}

export interface RiskAssessment {
  patient_id: string;
  risk_level: RiskLevel;
  deterministic_rule_triggered?: string;
  clinical_reasoning: string;
  immediate_patient_directive: string;
  care_team_action_required: boolean;
  sbar?: SbarNote;
}

export interface TriagePatientItem {
  patient_id: string;
  name: string;
  procedure: string;
  discharge_date: string;
  days_post_op: number;
  risk_level: RiskLevel;
  status_alert: string;
  adherence_rate: number;
  pending_escalation: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'patient' | 'companion' | 'system';
  content: string;
  timestamp: string;
  risk_level?: RiskLevel;
  suggested_action?: string;
}

export interface RecoveryState {
  patient_id: string;
  current_phase: string;
  current_day: number;
  active_tasks: CareTask[];
  completed_tasks: CareTask[];
  missed_tasks: CareTask[];
  snoozed_tasks: CareTask[];
  adherence_percentage: number;
  recent_symptoms: any[];
  recent_vitals: any[];
  recent_events: RecoveryEvent[];
  pending_followups: string[];
  risk_level: RiskLevel;
  escalation_status: string;
  active_ticket?: EscalationTicket;
  last_updated: string;
}
