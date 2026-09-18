# CareBridge AI: Data Models & Schema Design

This document details the relational database schema and Pydantic v2 data models used across CareBridge AI.

---

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
    PATIENT {
        string id PK
        string first_name
        string last_name
        int age
        string gender
        string primary_care_physician
        string primary_clinic_phone
        datetime discharge_date
        string condition_category
    }

    DISCHARGE_PROFILE {
        string id PK
        string patient_id FK
        string primary_diagnosis
        string surgical_procedures
        string dietary_instructions
        string activity_restrictions
        json follow_up_appointments
        json red_flag_warnings
        datetime created_at
    }

    MEDICATION {
        string id PK
        string profile_id FK
        string drug_name
        string dosage
        string route
        string frequency
        json schedule_slots
        string indication
        boolean is_discontinued
        string special_instructions
    }

    RECOVERY_PLAN {
        string id PK
        string patient_id FK
        int duration_days
        string current_phase
        json milestone_roadmap
        datetime start_date
    }

    CARE_TASK {
        string id PK
        string plan_id FK
        string patient_id FK
        int day_number
        string category
        string title
        string description
        string scheduled_time
        string status
        datetime completed_at
        string notes
    }

    SYMPTOM_LOG {
        string id PK
        string patient_id FK
        string description
        int severity_score
        float measured_temp
        string anatomical_location
        datetime reported_at
    }

    AGENT_EVENT {
        string id PK
        string patient_id FK
        string agent_type
        string event_phase
        json observation_payload
        string reasoning_trace
        json decision_payload
        datetime timestamp
    }

    ESCALATION_TICKET {
        string id PK
        string patient_id FK
        string agent_event_id FK
        string risk_level
        string triggered_rule
        json sbar_note
        string status
        string clinician_notes
        datetime created_at
        datetime resolved_at
    }

    PATIENT ||--o{ DISCHARGE_PROFILE : has
    DISCHARGE_PROFILE ||--o{ MEDICATION : includes
    PATIENT ||--o{ RECOVERY_PLAN : follows
    RECOVERY_PLAN ||--o{ CARE_TASK : schedules
    PATIENT ||--o{ SYMPTOM_LOG : reports
    PATIENT ||--o{ AGENT_EVENT : generates
    PATIENT ||--o{ ESCALATION_TICKET : triggers
    AGENT_EVENT ||--o| ESCALATION_TICKET : spawns
```

---

## 2. Core Enumerations

```python
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

class AgentPhase(str, Enum):
    OBSERVE = "OBSERVE"
    REASON = "REASON"
    PLAN = "PLAN"
    ACT = "ACT"
    FOLLOW_UP = "FOLLOW_UP"

class TicketStatus(str, Enum):
    OPEN = "OPEN"
    IN_REVIEW = "IN_REVIEW"
    RESOLVED = "RESOLVED"
```

---

## 3. Pydantic v2 Core Clinical Schemas

The following models define the typed data contract between backend agents, storage, and the frontend:

### `DischargeProfile`
```python
class FollowUpAppointment(BaseModel):
    provider: str
    specialty: str
    clinic_name: str
    date_time: str
    contact_number: str

class MedicationItem(BaseModel):
    drug_name: str
    dosage: str
    route: str
    frequency: str
    schedule_slots: list[str]  # e.g., ["08:00", "20:00"]
    indication: str
    is_discontinued: bool = False
    warning: str | None = None

class DischargeProfile(BaseModel):
    patient_id: str
    primary_diagnosis: str
    procedures: list[str]
    discharge_date: str
    dietary_instructions: str
    activity_restrictions: str
    medications: list[MedicationItem]
    red_flag_warnings: list[str]
    follow_up_appointments: list[FollowUpAppointment]
```

### `RiskAssessment` & `SbarNote`
```python
class SbarNote(BaseModel):
    situation: str
    background: str
    assessment: str
    recommendation: str

class RiskAssessment(BaseModel):
    patient_id: str
    risk_level: RiskLevel
    deterministic_rule_triggered: str | None = None
    clinical_reasoning: str
    confidence_score: float
    immediate_patient_directive: str
    care_team_action_required: bool
    sbar: SbarNote | None = None
```
