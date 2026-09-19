"""
CareBridge AI Clinical Pydantic Schemas (v2)
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class RiskLevel(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class TaskCategory(str, Enum):
    MEDICATION = "MEDICATION"
    VITAL_CHECK = "VITAL_CHECK"
    WOUND_CARE = "WOUND_CARE"
    PHYSICAL_THERAPY = "PHYSICAL_THERAPY"
    HYDRATION_DIET = "HYDRATION_DIET"
    CHECK_IN = "CHECK_IN"

class TaskStatus(str, Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    MISSED = "MISSED"
    SKIPPED = "SKIPPED"
    SNOOZED = "SNOOZED"

class TicketStatus(str, Enum):
    OPEN = "OPEN"
    IN_REVIEW = "IN_REVIEW"
    RESOLVED = "RESOLVED"

# --- Patient Demographics ---
class PatientBase(BaseModel):
    id: str
    first_name: str
    last_name: str
    age: Optional[int] = None
    gender: Optional[str] = "Not specified"
    discharge_date: Optional[str] = None
    condition_category: Optional[str] = "General Medicine"
    primary_care_physician: Optional[str] = "Not specified"
    clinic_phone: Optional[str] = "Not specified"
    emergency_contact: Optional[str] = "Not specified"
    is_demo: bool = False

# --- Medications ---
class MedicationItem(BaseModel):
    drug_name: str
    dosage: str
    route: str = "Not specified"
    frequency: str
    schedule_slots: List[str] = Field(default_factory=list, description="e.g. ['08:00', '20:00']")
    indication: str
    is_discontinued: bool = False
    warning: Optional[str] = None

# --- Follow-Up Appointments ---
class FollowUpAppointment(BaseModel):
    provider: str
    specialty: str
    clinic_name: str
    date_time: str
    contact_number: str

# --- Discharge Profile ---
class DischargeProfile(BaseModel):
    profile_id: str
    patient_id: str
    primary_diagnosis: str
    procedures: List[str] = Field(default_factory=list)
    discharge_date: str
    dietary_instructions: str
    activity_restrictions: str
    wound_care_instructions: Optional[str] = None
    medications: List[MedicationItem] = Field(default_factory=list)
    red_flag_warnings: List[str] = Field(default_factory=list)
    follow_up_appointments: List[FollowUpAppointment] = Field(default_factory=list)

# --- Recovery Plan & Tasks ---
class RecoveryMilestone(BaseModel):
    day: int
    title: str
    description: str

class CareTask(BaseModel):
    task_id: str
    patient_id: str
    day_number: int
    category: TaskCategory
    title: str
    description: str
    scheduled_time: str
    status: TaskStatus = TaskStatus.PENDING
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None

class RecoveryPlan(BaseModel):
    plan_id: str
    patient_id: str
    duration_days: int = 30
    current_phase: str
    milestones: List[RecoveryMilestone] = Field(default_factory=list)

# --- Symptom Reporting ---
class SymptomReport(BaseModel):
    patient_id: str
    symptom_description: str
    severity_score: int = Field(ge=1, le=10)
    measured_temp: Optional[float] = None
    systolic_bp: Optional[float] = None
    diastolic_bp: Optional[float] = None
    heart_rate: Optional[float] = None
    spo2: Optional[float] = None
    weight_gain_24h_lbs: Optional[float] = None
    anatomical_location: Optional[str] = None
    reported_at: datetime = Field(default_factory=datetime.utcnow)

# --- SBAR Clinical Note ---
class SbarNote(BaseModel):
    situation: str
    background: str
    assessment: str
    recommendation: str

# --- Risk Assessment ---
class RiskAssessment(BaseModel):
    patient_id: str
    risk_level: RiskLevel
    deterministic_rule_triggered: Optional[str] = None
    clinical_reasoning: str
    immediate_patient_directive: str
    care_team_action_required: bool
    sbar: Optional[SbarNote] = None

# --- Escalation Ticket ---
class EscalationTicket(BaseModel):
    ticket_id: str
    patient_id: str
    patient_name: str
    risk_level: RiskLevel
    triggered_rule: Optional[str] = None
    sbar: SbarNote
    status: TicketStatus = TicketStatus.OPEN
    clinician_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

# --- Chat Interaction ---
class ChatMessageRequest(BaseModel):
    patient_id: str
    message: str

class ChatMessageResponse(BaseModel):
    reply: str
    risk_level: RiskLevel = RiskLevel.LOW
    suggested_action: Optional[str] = None
    disclaimer: str


# --- Recovery Events & Stateful Coordination ---
class RecoveryEventType(str, Enum):
    PATIENT_CREATED = "PATIENT_CREATED"
    DISCHARGE_UPLOADED = "DISCHARGE_UPLOADED"
    DISCHARGE_PARSED = "DISCHARGE_PARSED"
    RECOVERY_PLAN_CREATED = "RECOVERY_PLAN_CREATED"
    TASK_COMPLETED = "TASK_COMPLETED"
    TASK_MISSED = "TASK_MISSED"
    TASK_SNOOZED = "TASK_SNOOZED"
    VITAL_RECORDED = "VITAL_RECORDED"
    SYMPTOM_REPORTED = "SYMPTOM_REPORTED"
    FOLLOWUP_COMPLETED = "FOLLOWUP_COMPLETED"
    REMINDER_SENT = "REMINDER_SENT"
    SAFETY_TRIGGERED = "SAFETY_TRIGGERED"
    ESCALATION_CREATED = "ESCALATION_CREATED"
    ESCALATION_ACKNOWLEDGED = "ESCALATION_ACKNOWLEDGED"
    CLINICAL_REVIEW_COMPLETED = "CLINICAL_REVIEW_COMPLETED"


class RecoveryEvent(BaseModel):
    event_id: str
    run_id: str
    patient_id: str
    event_type: RecoveryEventType
    task_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    status: Optional[str] = None
    value: Optional[Any] = None
    source: Optional[str] = "PATIENT"
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RecoveryState(BaseModel):
    patient_id: str
    current_phase: str = "Phase 1: Acute Recovery (Days 1-3)"
    current_day: int = 2
    active_tasks: List[CareTask] = Field(default_factory=list)
    completed_tasks: List[CareTask] = Field(default_factory=list)
    missed_tasks: List[CareTask] = Field(default_factory=list)
    snoozed_tasks: List[CareTask] = Field(default_factory=list)
    adherence_percentage: float = 100.0
    recent_symptoms: List[Dict[str, Any]] = Field(default_factory=list)
    recent_vitals: List[Dict[str, Any]] = Field(default_factory=list)
    recent_events: List[RecoveryEvent] = Field(default_factory=list)
    pending_followups: List[str] = Field(default_factory=list)
    risk_level: RiskLevel = RiskLevel.LOW
    escalation_status: str = "NONE"  # "NONE", "OPEN", "IN_REVIEW", "RESOLVED"
    active_ticket: Optional[EscalationTicket] = None
    last_updated: datetime = Field(default_factory=datetime.utcnow)


class ClinicalReviewRequest(BaseModel):
    patient_id: Optional[str] = None
    clinician_name: str = "Dr. On-Call Attending, MD"
    action_notes: str = "Symptom and telemetry reviewed. Continued home recovery monitoring authorized."


class TaskActionRequest(BaseModel):
    notes: Optional[str] = None


class ExtractTextRequest(BaseModel):
    filename: str = "discharge_summary.txt"
    content: Optional[str] = None
    content_base64: Optional[str] = None


class DischargeUploadRequest(BaseModel):
    filename: str = "discharge_summary.txt"
    content: Optional[str] = None
    content_base64: Optional[str] = None


class CreatePatientRequest(BaseModel):
    name: str
    age: Optional[int] = None
    gender: Optional[str] = "Not specified"
    contact: Optional[str] = "Not specified"
    emergency_contact: Optional[str] = "Not specified"
    discharge_date: Optional[str] = None
    primary_diagnosis: Optional[str] = "General Post-Discharge Recovery"
    condition_category: Optional[str] = "General Medicine"
    procedure: Optional[str] = None
    physician_care_team: Optional[str] = "Not specified"
    discharge_summary_text: Optional[str] = None
    discharge_summary_base64: Optional[str] = None
    discharge_summary_filename: Optional[str] = None


class LoginRequest(BaseModel):
    patient_id: Optional[str] = None
    email: Optional[str] = None
    password: str


class LoginResponse(BaseModel):
    status: str = "SUCCESS"
    session_token: str
    patient_id: str
    patient_name: str
    message: str = "Login successful"


class SignupRequest(BaseModel):
    full_name: str
    email: str
    password: str
    confirm_password: str


class SignupResponse(BaseModel):
    status: str = "SUCCESS"
    session_token: str
    patient_id: str
    patient_name: str
    message: str = "Registration successful"
