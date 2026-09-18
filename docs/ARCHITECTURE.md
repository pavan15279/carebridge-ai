# CareBridge AI: System Architecture Specification

## 1. Problem Statement: "Nobody Owns the Patient After Discharge"

Post-discharge care transition is one of the most hazardous and expensive phases in modern healthcare:
- **Clinical Information Overload:** Upon discharge, patients are handed 10–25 pages of clinical discharge instructions containing technical medical terms, complex drug titration regimens, wound dressing protocols, activity limits, and red-flag warning signs.
- **Cognitive Deficit at Transition:** Patients are fatigued, recovering from anesthesia, medicated, or anxious. Studies show over 50% of patients fail to understand or retain discharge instructions within 24 hours.
- **The "Care Void":** In traditional outpatient workflows, hospital teams receive zero feedback between discharge and the routine 14–30 day follow-up clinic visit. Complications often spiral unchecked until a catastrophic 911 emergency call or avoidable 30-day readmission occurs.
- **CareBridge AI Solution:** An intelligent, proactive, continuous care coordination system that bridges this gap—translating discharge instructions into structured daily plans, monitoring recovery milestones, evaluating reported symptoms against documented discharge orders, and alerting the clinical team proactively when red flags emerge.

---

## 2. High-Level System Architecture

CareBridge AI utilizes an asynchronous, event-driven decoupled architecture:

```mermaid
flowchart TB
    subgraph ClientLayer ["Client Presentation Layer"]
        PATIENT_PORTAL["Patient Recovery Portal (Next.js PWA)\n• Daily Recovery Checklist\n• AI Recovery Companion Chat\n• Symptom Reporting Wizard\n• Emergency Alert Banner"]
        CLINICAL_DASHBOARD["Healthcare Team Dashboard (Next.js)\n• Patient Triage Board (Red/Amber/Green)\n• SBAR Clinical Escalation Queue\n• Longitudinal Recovery Trajectory\n• Agent Audit & Reasoning Log"]
    end

    subgraph APILayer ["API Gateway Layer (FastAPI)"]
        AUTH_ROUTER["/api/v1/auth"]
        DISCHARGE_ROUTER["/api/v1/discharge"]
        PLANS_ROUTER["/api/v1/plans & /tasks"]
        SYMPTOMS_ROUTER["/api/v1/symptoms & /chat"]
        CLINICAL_ROUTER["/api/v1/clinical"]
    end

    subgraph AgentOrchestrationLayer ["Agentic AI Core (Orchestrator)"]
        AGENT_1["1. Discharge Understanding Agent"]
        AGENT_2["2. Recovery Planning Agent"]
        AGENT_3["3. Monitoring Agent"]
        AGENT_4["4. Risk / Reasoning Agent"]
        AGENT_5["5. Follow-Up Agent"]
        AGENT_6["6. Escalation / Coordination Agent"]
        
        SAFETY_ENGINE["Deterministic Safety Engine\n(Hardcoded Clinical Red Flags & Vitals Checks)"]
    end

    subgraph StorageLayer ["Persistence & Telemetry Layer"]
        DB[(SQLite / PostgreSQL\nRelational Clinical Store)]
        AUDIT_LOG[(Event & Reasoning Log\nAudit Trail)]
        SYNTHETIC_STORE[(Synthetic Discharge\nCorpus & Case Scenarios)]
    end

    subgraph LLMLayer ["LLM & Model Providers"]
        GEMINI_API["Google Gemini 2.5 Flash / 1.5 Pro\n(Structured JSON Output & Clinical Reasoning)"]
    end

    PATIENT_PORTAL <--> APILayer
    CLINICAL_DASHBOARD <--> APILayer
    
    APILayer <--> AgentOrchestrationLayer
    AgentOrchestrationLayer <--> SAFETY_ENGINE
    AgentOrchestrationLayer <--> GEMINI_API
    AgentOrchestrationLayer <--> StorageLayer
```

---

## 3. The Core Agentic Loop: OBSERVE → REASON → PLAN → ACT → FOLLOW-UP → OBSERVE

CareBridge AI operates on a continuous cybernetic feedback loop designed for patient recovery safety:

```mermaid
sequenceDiagram
    autonumber
    actor Patient
    participant Mon as Monitoring Agent
    participant Reason as Risk / Reasoning Agent
    participant Safety as Deterministic Safety Engine
    participant LLM as Google Gemini (Reasoning)
    participant Esc as Escalation Agent
    participant Follow as Follow-up Agent
    actor CareTeam as Healthcare Team

    Note over Patient,Mon: 1. OBSERVE
    Patient->>Mon: Submits symptom ("Incision site is red and warm, temp 101.8°F")
    Mon->>Mon: Captures timestamp, baseline vitals, missed meds context

    Note over Mon,Reason: 2. REASON
    Mon->>Reason: Dispatches RecoveryEvent payload
    Reason->>Safety: Check against deterministic red-flag rules
    Safety-->>Reason: VIOLATION: Fever > 101.5°F + Surgical site erythema (CRITICAL)
    Reason->>LLM: Formulate clinical reasoning trace & context comparison
    LLM-->>Reason: RiskAssessment (Risk: HIGH/CRITICAL, Suspected Wound Infection)

    Note over Reason,Esc: 3. PLAN
    alt High / Critical Risk
        Reason->>Esc: Delegate high-priority action plan
        Note over Esc,CareTeam: 4. ACT
        Esc->>Esc: Synthesize SBAR Clinical Note
        Esc->>CareTeam: Push real-time alert to Clinical Triage Board
        Esc->>Patient: Send urgent emergency directive ("Contact clinic or seek immediate care")
        Note over Esc,Mon: 5. FOLLOW-UP
        Esc->>Mon: Schedule mandatory 60-min clinical acknowledgment check
    else Low / Moderate Risk (Expected Symptoms)
        Reason->>Follow: Delegate routine follow-up plan
        Note over Follow,Patient: 4. ACT
        Follow->>Patient: Deliver reassuring guidance grounded in discharge notes
        Follow->>Patient: Ask clarifying questions (onset, pain scale 1-10)
        Note over Follow,Mon: 5. FOLLOW-UP
        Follow->>Mon: Schedule 4-hour re-check timer
    end

    Note over Mon,Patient: 6. OBSERVE (Cycle Repeats)
```

---

## 4. Dual-Layer Safety Architecture

To guarantee patient safety and zero clinical hallucinations, the system strictly implements **two distinct evaluation layers**:

### Layer 1: Deterministic Clinical Safety Engine (Pre-LLM & Non-Bypassing)
- Evaluates hard thresholds defined by the hospital's clinical protocols.
- Directly intercepts inputs *before or in parallel with* LLM reasoning.
- If a hard rule triggers (e.g., systolic blood pressure > 180 mmHg, acute chest pain post-CABG, sudden unilateral leg swelling post-TKA, fever > 101.5°F), the event is immediately elevated to `HIGH` or `CRITICAL` risk regardless of any generative model output.

### Layer 2: Contextual Agentic Reasoning Layer
- Evaluates multi-variable, qualitative, or temporal trends that simple rule engines miss (e.g., a patient who skipped 2 doses of beta-blockers and reports progressive dizziness when standing up).
- Grounded strictly in the ingested `DischargeProfile`.
- Restricted by strict system prompts prohibiting diagnostic declarations or dosage changes.

---

## 5. Non-Negotiable System Guardrails & Ethics

1. **No Diagnosis:** The system must never inform a patient "You have an infection" or "You have a pulmonary embolism." It states: *"Your reported symptoms (fever and warmth around your incision) require prompt evaluation by your surgical care team."*
2. **No Prescription or Dosage Modification:** The system must never say "Take an extra 5mg of lisinopril." It states: *"Your discharge instructions state to take your blood pressure medication as prescribed. Please contact your physician before making any adjustments."*
3. **Continuous Medical Disclaimer:** Every patient-facing interaction includes an unobtrusive yet clear notice: *"CareBridge AI is an administrative recovery coordinator, not a doctor. If you are experiencing a life-threatening emergency, call 911 immediately."*
4. **Zero Hallucinated Contacts:** Emergency contacts, clinic phone numbers, and surgeon details must only come from the ingested discharge document or system configuration.

---

## 6. Synthetic Data Strategy (HIPAA & Privacy Compliance)

Under no circumstances is real Protected Health Information (PHI) used. CareBridge AI provides 4 clinically realistic synthetic patient profiles:
- **Case 1: James Harrison (Post-CABG x3):** Coronary artery bypass graft recovery; sternal precautions; dual antiplatelets; wound monitoring.
- **Case 2: Elena Rostova (Total Knee Arthroplasty):** Joint replacement recovery; anticoagulation compliance (Lovenox/Eliquis); knee flexion exercises; DVT vigilance.
- **Case 3: Marcus Vance (Congestive Heart Failure):** Acute exacerbation post-discharge; strict daily weights; sodium restriction (<2000mg); diuretic titration compliance.
- **Case 4: Sarah Chen (Community-Acquired Pneumonia):** Antibiotic completion tracking; pulse oximetry monitoring; pleuritic chest symptom logging.
