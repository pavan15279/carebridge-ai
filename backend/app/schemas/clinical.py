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

class TicketStatus(str, Enum):
    OPEN = "OPEN"
    IN_REVIEW = "IN_REVIEW"
    RESOLVED = "RESOLVED"

# --- Patient Demographics ---
class PatientBase(BaseModel):
    id: str
    first_name: str
    last_name: str
    age: int
    gender: str
    discharge_date: str
    condition_category: str
    primary_care_physician: str
    clinic_phone: str
    emergency_contact: str

# --- Medications ---
class MedicationItem(BaseModel):
    drug_name: str
    dosage: str
    route: str = "Oral"
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
