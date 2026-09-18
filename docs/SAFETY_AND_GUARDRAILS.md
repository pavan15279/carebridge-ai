# CareBridge AI: Safety & Guardrails Specification

## 1. Ethical & Legal Boundaries

CareBridge AI is designed with strict healthcare safety guardrails:
1. **NOT A LICENSED HEALTHCARE PROVIDER:** CareBridge AI does not have a medical license, cannot practice medicine, cannot diagnose diseases, cannot order diagnostic tests, and cannot prescribe or modify medication dosages.
2. **CLINICAL TRIAGE & COORDINATION ONLY:** The sole operational mandate of the platform is to support the patient in understanding their physician's existing orders, tracking recovery tasks, and escalating deviations to human clinicians.
3. **MANDATORY DISCLAIMER:** Every patient interaction must display or include:
   > *"CareBridge AI is an AI recovery coordinator, not a doctor. It does not provide medical diagnoses or alter prescribed treatments. For emergencies, please call 911 immediately."*

---

## 2. Deterministic Safety Rule Engine (Zero-Hallucination Tier)

Before any LLM reasoning takes place, all patient-reported data (vitals, symptoms, task misses) is evaluated through a deterministic, hardcoded rules engine.

### Critical Safety Rules Table

| Rule ID | Parameter | Condition / Trigger Threshold | Action | Risk Level |
| :--- | :--- | :--- | :--- | :--- |
| `RULE-VITAL-BP-SYS` | Systolic Blood Pressure | `>= 180 mmHg` OR `<= 85 mmHg` | Immediate Clinical Escalation + 911 Warning | **CRITICAL** |
| `RULE-VITAL-BP-DIA` | Diastolic Blood Pressure | `>= 110 mmHg` OR `<= 50 mmHg` | Immediate Clinical Escalation | **HIGH** |
| `RULE-VITAL-HR` | Heart Rate | `>= 130 bpm` OR `<= 45 bpm` | Clinical Alert | **HIGH** |
| `RULE-VITAL-SPO2` | Oxygen Saturation (SpO2) | `<= 90%` (or `<= 88%` with COPD) | Immediate Escalation + Emergency Directive | **CRITICAL** |
| `RULE-VITAL-TEMP` | Body Temperature | `>= 101.5°F (38.6°C)` | Suspected Infection / Surgical Site Alert | **HIGH** |
| `RULE-CHF-WEIGHT` | Weight Gain (CHF Patient) | `>= 3 lbs in 24 hrs` OR `>= 5 lbs in 1 week` | Decompensation Alert + Nurse Call | **HIGH** |
| `RULE-SYMP-CHEST` | Chest Pain / Pressure | Keyword detection: "chest pain", "tightness", "pressure radiating" | Immediate Emergency Protocol (Call 911) | **CRITICAL** |
| `RULE-SYMP-DVT` | Unilateral Leg Swelling / Pain | Keyword: "calf swollen", "pain in back of leg", "hot calf" (Post-op) | Urgent Outpatient Escalation (Rule out DVT) | **HIGH** |
| `RULE-MED-ANTICOAG` | Missed Anticoagulant | Missed 2 consecutive doses of blood thinner | Clinical Escalation (Stroke/Clot Risk) | **HIGH** |

### Dual-Layer Evaluation Architecture
```
[Patient Input: Symptom / Vital]
         │
         ├──► [Deterministic Safety Engine] ──(Violation Triggered?)──► FORCE Escalation Ticket
         │                                                                   │
         └──► [Risk / Reasoning Agent (LLM)] ──(Contextual Nuance)───────────┘
```
- If the **Deterministic Safety Engine** detects a violation, the final risk score is clamped to **`HIGH` or `CRITICAL`**, even if the LLM produces a milder assessment.
- If no deterministic rule triggers, the LLM provides contextual reasoning for subtler patterns.

---

## 3. Strict LLM Output Guardrails

To prevent hallucinated medical advice, prompt templates enforce the following restrictions:

1. **Restricted Vocabulary & Phrasing:**
   - 🚫 Prohibited: *"You have...", "I diagnose you with...", "You should increase your dose to...", "Stop taking this medication."*
   - ✅ Allowed: *"Your discharge instructions advise...", "This symptom is something your doctor needs to review...", "Please contact your clinic at [PHONE]..."*

2. **Grounding Constraint:**
   - Every reassurance or procedural guideline given to a patient must reference a specific section of their ingested `DischargeProfile`.
   - If an inquiry falls outside the scope of the discharge document, the agent replies:
     *"That question is outside the scope of your discharge paperwork. Please check with your physician or pharmacist."*

3. **Hallucination Protection on Contact Information:**
   - Contact numbers, clinic hours, and emergency instructions must only be populated from validated configuration fields or parsed document records. The LLM is forbidden from creating placeholder phone numbers.
