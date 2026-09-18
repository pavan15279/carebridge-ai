# CareBridge AI: Post-Discharge Care Coordination System
> *"Nobody Owns the Patient After Discharge."*

CareBridge AI is an Agentic AI healthcare coordination system designed for post-discharge recovery. It continuously coordinates a patient's recovery journey by understanding discharge paperwork, generating structured recovery plans, tracking daily tasks, monitoring reported symptoms, evaluating clinical risks against documented instructions and hard safety guardrails, and escalating red flags to healthcare teams via standardized SBAR notes.

---

## ⚠️ Important Clinical Disclaimer & Safety Boundary

**CareBridge AI is NOT a doctor.**
- The system does **not** diagnose medical conditions.
- The system does **not** prescribe pharmaceuticals or alter medication dosages.
- The system does **not** replace licensed physicians, nurses, or emergency services.
- The system operates strictly as an **administrative care coordinator, recovery companion, and safety escalation bridge** anchored to documented hospital discharge orders and deterministic clinical safety guardrails.

---

## Core Purpose & Capabilities

1. **Discharge Understanding:** Ingests complex discharge summaries and extracts structured clinical profiles (diagnoses, medications, precautions, red flags).
2. **Recovery Planning:** Translates clinical instructions into personalized day-by-day milestone roadmaps and actionable daily checklists.
3. **Recovery Task Monitoring:** Tracks medication compliance, vital sign logs, incision care, and mobility goals.
4. **Symptom Reporting:** Provides a patient-friendly interface for logging symptoms (onset, severity, anatomical location).
5. **Continuous Context Retention:** Maintains longitudinal patient recovery state, baseline comparisons, and cumulative adherence.
6. **Clinical Safety Reasoning:** Evaluates patient events against documented discharge instructions and hardcoded deterministic clinical safety rules.
7. **Escalation & Follow-Up Workflows:** Automatically triages events into reassurance/clarification (low risk) or care-team alerts with SBAR clinical notes (high risk).
8. **Healthcare-Team Dashboard:** Real-time triage board prioritizing patients by risk score with drill-down audit logs.
9. **Recovery Summaries:** Generates longitudinal clinical handoffs for outpatient follow-up visits.

---

## The Agentic AI Architecture

CareBridge AI implements a continuous closed loop:
```
OBSERVE → REASON → PLAN → ACT → FOLLOW-UP → OBSERVE
```

### The 6 Specialized Agents
1. **Discharge Understanding Agent:** Analyzes raw discharge summaries; produces structured `DischargeProfile`.
2. **Recovery Planning Agent:** Creates personalized milestone plans and daily `CareTask` lists.
3. **Monitoring Agent:** Tracks task completion, detects missed check-ins, and collects patient inputs.
4. **Risk / Reasoning Agent:** Evaluates patient symptoms and trends using deterministic safety rules and clinical reasoning; outputs `RiskAssessment`.
5. **Follow-up Agent:** Engages patient with reassuring, non-prescriptive guidance and collects symptom clarifications for mild/moderate concerns.
6. **Escalation / Coordination Agent:** Dispatches high/critical alerts to the care-team dashboard, generates SBAR notes, and directs urgent patient action.

---

## Repository Structure

```
carebridge-ai/
├── backend/                  # Python FastAPI Backend & Agent Core
│   ├── app/
│   │   ├── agents/           # 6 Agent Implementations & Orchestrator
│   │   ├── api/v1/           # Modular REST Endpoints
│   │   ├── core/             # Config, Safety Rules & System Prompts
│   │   ├── data/             # Realistic Synthetic Patient Datasets
│   │   ├── db/               # Relational Persistence Layer
│   │   └── schemas/          # Pydantic v2 Clinical Data Models
│   ├── requirements.txt
│   └── main.py
├── frontend/                 # Next.js 14 Web Application
│   ├── src/
│   │   ├── app/              # Patient Portal & Clinical Dashboard Pages
│   │   ├── components/       # UI Components (Patient, Clinical, Shared)
│   │   └── lib/              # TypeScript Types, API Client & Demo Data
│   └── package.json
├── docs/                     # Architectural & Engineering Specifications
│   ├── ARCHITECTURE.md       # Full System Architecture & Data Flow
│   ├── AGENTS.md             # 6-Agent Specifications & Prompts
│   ├── SAFETY_AND_GUARDRAILS.md # Clinical Safety Rules & Legal Guardrails
│   ├── API_SPEC.md           # OpenAPI / REST Endpoints
│   ├── DATA_MODELS.md        # Database & Pydantic Schemas
│   └── ROADMAP.md            # 4-Developer Hackathon Sprints & Ownership
├── scripts/                  # Verification & Simulation Scripts
└── README.md
```

---

## 4-Developer Team Ownership

| Role | Team Member | Primary Domain |
| :--- | :--- | :--- |
| **Dev 1** | AI & Safety Lead | Risk/Reasoning Agent, Escalation Agent, Safety Engine (`core/safety_rules.py`), Orchestration Loop |
| **Dev 2** | Backend & Data Lead | Discharge Understanding Agent, Recovery Planning Agent, Pydantic Schemas, FastAPI Endpoints |
| **Dev 3** | Clinical Frontend Lead | Care Team Triage Dashboard, SBAR Note Viewer, Escalation Ticket Management |
| **Dev 4** | Patient Frontend Lead | Mobile Patient Portal, Daily Checklist, Recovery Companion Chat, Symptom Logging Wizard |

---

## Synthetic Demo Datasets

To ensure compliance with healthcare privacy and HIPAA standards, **zero real patient data is used**. 4 clinically validated synthetic cases are included in `backend/app/data/`:
1. **Post-CABG (Coronary Artery Bypass Graft):** Sternal precautions, dual antiplatelets, beta blockers, wound monitoring, daily weights.
2. **Total Knee Arthroplasty (TKA):** DVT prevention (anticoagulant), physical therapy milestones, wound care, pain management.
3. **Congestive Heart Failure (CHF) Exacerbation:** Strict fluid restrictions, daily dry weights, diuretic schedule, salt monitoring.
4. **Community-Acquired Pneumonia:** Antibiotic adherence, temperature monitoring, pulse oximetry, respiratory symptom checks.

---

## Getting Started

### 1. Verification of Foundation & Schemas
Ensure Python 3.10+ is installed, then test the synthetic datasets and safety engine:
```bash
python scripts/verify_synthetic_data.py
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Open API documentation at: `http://localhost:8000/docs`

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open Web Application at: `http://localhost:3000`
- Patient View: `http://localhost:3000/patient`
- Clinical Dashboard: `http://localhost:3000/clinical`

---

## Documentation Links
- [System Architecture](file:///docs/ARCHITECTURE.md)
- [Agent Specifications](file:///docs/AGENTS.md)
- [Safety & Guardrails](file:///docs/SAFETY_AND_GUARDRAILS.md)
- [API Specification](file:///docs/API_SPEC.md)
- [Data Models](file:///docs/DATA_MODELS.md)
- [Hackathon Roadmap](file:///docs/ROADMAP.md)
