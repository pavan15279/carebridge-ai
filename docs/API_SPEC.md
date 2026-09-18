# CareBridge AI: REST API Specification

Base URL: `/api/v1`

---

## 1. Discharge Ingestion & Parsing (`/discharge`)

### `POST /api/v1/discharge/ingest`
Ingests raw discharge text or file metadata.
- **Request Body:**
  ```json
  {
    "patient_id": "PT-CABG-001",
    "raw_text": "DISCHARGE SUMMARY...\nPatient: James Harrison...",
    "source": "EHR_PORTAL"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "summary_id": "DS-90210",
    "patient_id": "PT-CABG-001",
    "status": "INGESTED",
    "received_at": "2026-09-18T13:00:00Z"
  }
  ```

### `POST /api/v1/discharge/{summary_id}/parse`
Triggers the **Discharge Understanding Agent** to parse raw text into structured profile.
- **Response (200 OK):**
  ```json
  {
    "profile_id": "DP-001",
    "patient_id": "PT-CABG-001",
    "primary_diagnosis": "Coronary Artery Disease, post 3-vessel CABG",
    "procedures": ["Coronary Artery Bypass Graft x3"],
    "medications_count": 6,
    "red_flags_count": 5,
    "dietary_instructions": "Low sodium (<2000mg/day), heart healthy diet",
    "activity_restrictions": "Sternal precautions: no lifting > 10 lbs for 6 weeks",
    "follow_up_appointments": [
      {
        "provider": "Dr. Sarah Jenkins, Cardiothoracic Surgery",
        "date_time": "2026-10-02T10:00:00Z",
        "clinic_name": "Cardiovascular Clinic",
        "contact_number": "555-0199"
      }
    ]
  }
  ```

---

## 2. Recovery Plans & Daily Tasks (`/plans`, `/tasks`)

### `POST /api/v1/plans/generate/{patient_id}`
Triggers the **Recovery Planning Agent** to synthesize a 30-day recovery plan and daily checklist.
- **Response (201 Created):**
  ```json
  {
    "plan_id": "PLAN-001",
    "patient_id": "PT-CABG-001",
    "duration_days": 30,
    "current_phase": "Phase 1: Acute Recovery (Days 1-3)",
    "milestones": [
      { "day": 3, "goal": "Comfortable with daily sternal support, walking short indoor distances" },
      { "day": 7, "goal": "Wound check and staple inspection, vitals stabilized" }
    ]
  }
  ```

### `GET /api/v1/tasks/today/{patient_id}`
Returns today's scheduled recovery tasks with completion statuses.
- **Response (200 OK):**
  ```json
  {
    "patient_id": "PT-CABG-001",
    "day_number": 2,
    "adherence_percentage": 75.0,
    "tasks": [
      {
        "task_id": "TASK-101",
        "title": "Morning Medications (Metoprolol, Aspirin)",
        "category": "MEDICATION",
        "scheduled_time": "08:00",
        "status": "COMPLETED",
        "completed_at": "2026-09-18T08:15:00Z"
      },
      {
        "task_id": "TASK-102",
        "title": "Log Morning Weight & Blood Pressure",
        "category": "VITAL_CHECK",
        "scheduled_time": "09:00",
        "status": "COMPLETED",
        "completed_at": "2026-09-18T09:05:00Z"
      },
      {
        "task_id": "TASK-103",
        "title": "Midday Sternal Incision Inspection",
        "category": "WOUND_CARE",
        "scheduled_time": "13:00",
        "status": "PENDING",
        "completed_at": null
      }
    ]
  }
  ```

### `PATCH /api/v1/tasks/{task_id}/status`
Marks a task as completed or skipped.
- **Request Body:**
  ```json
  {
    "status": "COMPLETED",
    "notes": "Taken with breakfast"
  }
  ```

---

## 3. Symptom Reporting & Patient Chat (`/symptoms`, `/chat`)

### `POST /api/v1/symptoms/report`
Submits a patient-reported symptom. Immediately triggers the **Monitoring Agent** and **Risk/Reasoning Agent**.
- **Request Body:**
  ```json
  {
    "patient_id": "PT-CABG-001",
    "symptom_description": "My chest incision feels unusually warm and looks red today, and I feel a little feverish.",
    "severity_score": 7,
    "measured_temp": 101.8,
    "reported_at": "2026-09-18T13:10:00Z"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "event_id": "EVT-8821",
    "risk_level": "HIGH",
    "violation_detected": true,
    "safety_rule_triggered": "RULE-VITAL-TEMP (Temp 101.8°F >= 101.5°F)",
    "immediate_directive": "Your care team has been alerted. Please monitor your temperature and refrain from applying any creams or ointments to the incision site.",
    "escalation_ticket_id": "TICKET-4401"
  }
  ```

### `POST /api/v1/chat/message`
Multi-turn conversational recovery companion (invokes **Follow-Up Agent**).
- **Request Body:**
  ```json
  {
    "patient_id": "PT-CABG-001",
    "message": "Is it normal to hear a slight clicking sensation in my chest when I cough?"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "reply": "Your discharge instructions specifically address sternal precautions. Any clicking, popping, or shifting sensation in your chest bone when coughing or moving is an important sign that should be reported to Dr. Jenkins' clinic immediately so they can verify proper sternal healing. While you contact them, remember to use your cough pillow to support your chest.",
    "risk_level": "MODERATE",
    "suggested_follow_up": "Check clinic contact number: 555-0199"
  }
  ```

---

## 4. Clinical Care-Team Dashboard (`/clinical`)

### `GET /api/v1/clinical/triage-board`
Returns all patients monitored by the care team, ranked by risk score (Red / Amber / Green).
- **Response (200 OK):**
  ```json
  {
    "total_active_patients": 4,
    "high_risk_count": 1,
    "moderate_risk_count": 1,
    "low_risk_count": 2,
    "patients": [
      {
        "patient_id": "PT-CABG-001",
        "name": "James Harrison",
        "procedure": "CABG x3",
        "discharge_date": "2026-09-16",
        "days_post_op": 2,
        "risk_level": "HIGH",
        "latest_alert": "Suspected Surgical Site Infection (Temp 101.8°F)",
        "adherence_rate": 75.0,
        "active_ticket_id": "TICKET-4401"
      }
    ]
  }
  ```

### `GET /api/v1/clinical/tickets/{ticket_id}/sbar`
Fetches the standardized SBAR note generated by the **Escalation/Coordination Agent**.
- **Response (200 OK):**
  ```json
  {
    "ticket_id": "TICKET-4401",
    "patient_name": "James Harrison",
    "risk_level": "HIGH",
    "sbar": {
      "situation": "Patient reports feverishness and incision warmth; logged temp 101.8°F (safety threshold >= 101.5°F exceeded).",
      "background": "72yo male, POD 2 post-CABG x3. Discharged on Metoprolol, Clopidogrel, Aspirin, Atorvastatin.",
      "assessment": "High probability of early surgical site infection. Rule violation RULE-VITAL-TEMP detected. Adherence to medications is 75%.",
      "recommendation": "Triage nurse to call patient immediately to inspect incision photo or schedule urgent same-day wound evaluation clinic visit."
    },
    "created_at": "2026-09-18T13:10:05Z",
    "status": "OPEN"
  }
  ```

### `POST /api/v1/clinical/tickets/{ticket_id}/acknowledge`
Clinician marks escalation ticket as reviewed or resolved with clinical action notes.
