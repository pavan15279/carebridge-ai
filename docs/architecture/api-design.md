# CareBridge AI: REST API Architecture & Interface Design

## 1. API Architecture Principles

CareBridge AI exposes a secure, high-performance RESTful API operating under the following architectural standards:
- **Base URL:** `/api/v1`
- **Protocol:** HTTPS (TLS 1.3 mandatory)
- **Serialization:** JSON (`Content-Type: application/json; charset=utf-8`)
- **Idempotency:** All state mutations support optional `Idempotency-Key` headers.
- **Unified Response Envelope:** Every response adheres to a predictable envelope:

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "timestamp": "2026-09-18T13:30:00Z",
  "meta": { "version": "1.0.0", "correlation_id": "req-98f3b" }
}
```

### Standard HTTP Status Codes

| Code | Status | Usage in CareBridge AI |
| :--- | :--- | :--- |
| `200` | OK | Successful fetch, update, or synchronous evaluation |
| `201` | Created | Plan, task, or escalation ticket successfully instantiated |
| `400` | Bad Request | Malformed payload or validation schema mismatch |
| `401` | Unauthorized | Missing or expired JWT Bearer token |
| `403` | Forbidden | Insufficient RBAC privileges for the requested endpoint |
| `404` | Not Found | Target patient, task, or ticket ID does not exist |
| `422` | Unprocessable | Pydantic validation failure on clinical fields |
| `500` | Internal Server Error | Unhandled backend exception (triggers fallback protocol) |

---

## 2. Authentication, Authorization & RBAC

All endpoints (excluding public health checks) require a signed JWT Bearer token passed in the `Authorization: Bearer <token>` header.

### Role-Based Access Matrix

| Endpoint Group | Resource Path | Patient / Proxy | Triage Nurse | Physician | Admin / Auditor |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Discharge** | `/discharge/*` | ❌ | Read/Write | Read/Write | Read |
| **Plans & Tasks**| `/plans/*`, `/tasks/*` | Read/Write (Self) | Read/Write | Read/Write | Read |
| **Vitals & Symptoms**| `/vitals/*`, `/symptoms/*` | Read/Write (Self) | Read | Read | Read |
| **Recovery Companion**| `/chat/*` | Read/Write (Self) | Read | Read | Read |
| **Clinical Triage**| `/clinical/*` | ❌ | Read/Write | Read/Write | Read |
| **Audit Logs** | `/audit/*` | ❌ | Read | Read | Full Access |

---

## 3. Detailed Endpoint Specifications

### 3.1 Discharge Ingestion & Parsing (`/discharge`)

#### `POST /api/v1/discharge/ingest`
Ingests raw discharge text or metadata from the EHR.
- **Request:**
  ```json
  {
    "patient_id": "PT-CABG-001",
    "raw_text": "HOSPITAL DISCHARGE SUMMARY\nPatient: James Harrison\nDOB: 1955-03-12...",
    "source": "EHR_PORTAL"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "summary_id": "DS-88219",
      "patient_id": "PT-CABG-001",
      "status": "INGESTED",
      "received_at": "2026-09-18T13:30:00Z"
    }
  }
  ```

#### `POST /api/v1/discharge/{summary_id}/parse`
Triggers the **Discharge Understanding Agent** to parse raw text into a structured profile.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "profile_id": "DP-CABG-001",
      "patient_id": "PT-CABG-001",
      "primary_diagnosis": "Triple-vessel CAD post-CABG x3",
      "procedures": ["Coronary Artery Bypass Graft x3 (LIMA-LAD, SVG-OM1, SVG-RCA)"],
      "dietary_instructions": "Low sodium (<2,000 mg/day), fluid intake 1.5L-2.0L",
      "activity_restrictions": "Sternal precautions: no lifting > 10 lbs for 6 weeks",
      "medications_count": 6,
      "red_flags": [
        "Fever > 101.5 F or chills",
        "Chest pain, sternal clicking, or excessive shortness of breath",
        "Redness, warmth, or drainage from sternal or leg incisions"
      ],
      "follow_up_appointments": [
        {
          "provider": "Dr. Sarah Jenkins, MD (Cardiothoracic Surgery)",
          "clinic_name": "Cardiothoracic Surgery Outpatient Clinic",
          "date_time": "2026-10-02T10:00:00Z",
          "contact_number": "555-0199"
        }
      ]
    }
  }
  ```

---

### 3.2 Recovery Plans & Tasks (`/plans`, `/tasks`)

#### `POST /api/v1/plans/generate/{patient_id}`
Triggers the **Recovery Planning Agent** to synthesize the 30-day recovery roadmap and populate tasks.
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "plan_id": "PLAN-CABG-001",
      "patient_id": "PT-CABG-001",
      "duration_days": 30,
      "current_phase": "Phase 1: Acute Recovery (Days 1-3)",
      "total_tasks_generated": 120,
      "milestones": [
        { "day": 3, "title": "Resting Baseline", "goal": "Comfortable with sternal precautions; stable vitals" },
        { "day": 7, "title": "Wound Inspection", "goal": "Clean incision line, sutures/staples inspected" },
        { "day": 14, "title": "Clinic Outpatient Prep", "goal": "Pre-appointment vitals log review" }
      ]
    }
  }
  ```

#### `GET /api/v1/tasks/today/{patient_id}`
Returns today's recovery checklist for the patient portal.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "patient_id": "PT-CABG-001",
      "recovery_day": 3,
      "adherence_rate": 66.7,
      "tasks": [
        {
          "task_id": "TASK-101",
          "category": "MEDICATION",
          "title": "Morning Medications (Metoprolol 50mg, Aspirin 81mg)",
          "description": "Take with breakfast and a glass of water.",
          "scheduled_time": "08:00",
          "status": "COMPLETED",
          "completed_at": "2026-09-18T08:15:00Z"
        },
        {
          "task_id": "TASK-102",
          "category": "VITAL_CHECK",
          "title": "Record Morning Weight & Blood Pressure",
          "description": "Weigh yourself after using the bathroom, before breakfast.",
          "scheduled_time": "09:00",
          "status": "COMPLETED",
          "completed_at": "2026-09-18T09:05:00Z"
        },
        {
          "task_id": "TASK-103",
          "category": "WOUND_CARE",
          "title": "Sternal Incision Inspection",
          "description": "Gently check incision for redness, warmth, or drainage.",
          "scheduled_time": "13:00",
          "status": "PENDING",
          "completed_at": null
        }
      ]
    }
  }
  ```

#### `PATCH /api/v1/tasks/{task_id}/status`
Updates task execution status. Dispatches event to **Monitoring Agent**.
- **Request:**
  ```json
  {
    "status": "COMPLETED",
    "notes": "Checked incision with mirror; no obvious drainage."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "task_id": "TASK-103",
      "status": "COMPLETED",
      "completed_at": "2026-09-18T13:15:00Z"
    }
  }
  ```

---

### 3.3 Symptoms & Patient Companion (`/symptoms`, `/chat`)

#### `POST /api/v1/symptoms/report`
Reports an acute symptom or abnormal vital sign. Triggers **Monitoring**, **Deterministic Safety Check**, **Risk/Reasoning**, and potentially **Escalation**.
- **Request:**
  ```json
  {
    "patient_id": "PT-CABG-001",
    "symptom_description": "My chest incision feels hot and looks noticeably red, and my thermometer reads 101.8 F.",
    "severity_score": 7,
    "measured_temp": 101.8,
    "anatomical_location": "Chest Incision"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "event_id": "EVT-99210",
      "risk_level": "HIGH",
      "deterministic_rule_violated": "RULE-VITAL-TEMP (Temp 101.8 F >= 101.5 F threshold)",
      "immediate_patient_directive": "We have alerted your surgical care team regarding your fever and incision redness. Please do not apply any ointment or bandage tightly. A nurse will reach out promptly.",
      "escalation_ticket_id": "TICK-4401"
    }
  }
  ```

#### `POST /api/v1/chat/message`
Multi-turn conversational companion (triggers **Follow-Up Agent**).
- **Request:**
  ```json
  {
    "patient_id": "PT-CABG-001",
    "message": "Is it okay if I sleep on my side tonight? My back is feeling sore."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "reply": "According to your sternal precautions, you should continue sleeping flat on your back for the first few weeks to protect your healing breastbone. Sleeping on your side can place uneven pressure on your sternum. Using an extra pillow under your knees while on your back can often help relieve lower back soreness.",
      "grounded_source": "Discharge Profile: Activity Restrictions (Sternal Precautions)",
      "requires_clinical_escalation": false
    }
  }
  ```

---

### 3.4 Healthcare Team Clinical Portal (`/clinical`)

#### `GET /api/v1/clinical/triage-board`
Returns a risk-prioritized list of active recovery cases for the clinical team.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "summary": {
        "critical_count": 0,
        "high_count": 1,
        "moderate_count": 2,
        "low_count": 1
      },
      "patients": [
        {
          "patient_id": "PT-CABG-001",
          "full_name": "James Harrison",
          "age": 71,
          "condition": "Cardiac Surgery (CABG x3)",
          "post_op_day": 3,
          "risk_level": "HIGH",
          "active_ticket_id": "TICK-4401",
          "triggered_rule": "RULE-VITAL-TEMP (101.8°F)",
          "sbar_summary": "Fever 101.8°F with sternal incision erythema and warmth.",
          "last_event_time": "2026-09-18T13:20:00Z"
        }
      ]
    }
  }
  ```

#### `GET /api/v1/clinical/tickets/{ticket_id}`
Retrieves the complete clinical escalation packet with full SBAR note.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "ticket_id": "TICK-4401",
      "patient_id": "PT-CABG-001",
      "risk_level": "HIGH",
      "status": "OPEN",
      "sbar": {
        "situation": "Patient James Harrison (Post-Op Day 3 CABG) reports core body temperature of 101.8°F accompanied by localized warmth and erythema at the sternotomy site.",
        "background": "71yo male post-CABG x3 on 2026-09-16. Current medications include Metoprolol, Aspirin, and Plavix. No baseline history of sternal wound complication.",
        "assessment": "Deterministic threshold breached (RULE-VITAL-TEMP). Symptom triad indicates probable early surgical site infection (SSI) or deep sternal wound complication.",
        "recommendation": "Prompt nurse telephone triage to inspect for sternal instability or purulent exudate; arrange same-day wound clinic evaluation or empiric antibiotic protocol per surgical attending."
      },
      "created_at": "2026-09-18T13:20:00Z",
      "assigned_to": null
    }
  }
  ```

#### `PATCH /api/v1/clinical/tickets/{ticket_id}/status`
Updates escalation ticket workflow status.
- **Request:**
  ```json
  {
    "status": "IN_REVIEW",
    "assigned_to": "Nurse Coordinator Rachel Adams, RN",
    "clinician_notes": "Telephoned patient at 13:35. Confirmed temp 101.8°F. Instructed patient to report to outpatient surgery clinic today at 15:00 for wound culture."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "ticket_id": "TICK-4401",
      "status": "IN_REVIEW",
      "updated_at": "2026-09-18T13:38:00Z"
    }
  }
  ```

---

## 4. Error Handling & Resilience

### Standardized Error Format
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "SAFETY_RULE_VIOLATION",
    "message": "Reported physiological parameter breaches critical clinical threshold.",
    "details": {
      "parameter": "systolic_bp",
      "value": 192,
      "threshold": 180
    }
  },
  "timestamp": "2026-09-18T13:30:00Z",
  "meta": { "correlation_id": "req-98f3b" }
}
```

### LLM Degradation & Circuit Breaking
If Google Gemini experiences latency $> 4,000\text{ms}$ or HTTP $5xx$ errors:
1. **Fallback to Rule Engine:** The system bypasses generative reasoning and relies 100% on the **Deterministic Safety Engine**.
2. **Safe Default Responses:** Patient companion queries fallback to: *"We are experiencing a temporary communication delay. If your inquiry is urgent or you are experiencing distressing symptoms, please call your clinic directly at [CLINIC_PHONE] or 911."*
3. **No Silently Dropped Events:** Every un-evaluated event is queued in persistent storage with an alert to the administrative queue.
