"""
CareBridge AI: Post-Discharge Care Coordination System
Main FastAPI Application Entrypoint
"""
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.safety_rules import ClinicalSafetyEngine, RiskLevel
from app.agents.orchestrator import CareBridgeOrchestrator
from app.schemas.clinical import (
    DischargeProfile,
    PatientBase,
    SymptomReport,
    RiskAssessment,
    SbarNote,
    EscalationTicket,
    ChatMessageRequest,
    ChatMessageResponse
)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Agentic AI Post-Discharge Care Coordination System",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enable CORS for Next.js frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_FILES = {
    "PT-CABG-001": "cabg_patient.json",
    "PT-TKA-002": "tka_patient.json",
    "PT-CHF-003": "chf_patient.json",
    "PT-PNA-004": "pneumonia_patient.json",
}

def load_patient_dataset(patient_id: str) -> Dict[str, Any]:
    filename = DATA_FILES.get(patient_id)
    if not filename:
        raise HTTPException(status_code=404, detail=f"Synthetic patient {patient_id} not found.")
    filepath = settings.DATA_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=500, detail=f"Data file {filename} missing.")
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)

@app.get("/", tags=["Root"])
async def root():
    return {
        "system": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "ONLINE",
        "loop": "OBSERVE -> REASON -> PLAN -> ACT -> FOLLOW-UP -> OBSERVE",
        "disclaimer": settings.MANDATORY_DISCLAIMER
    }

@app.get("/api/v1/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "agents": {
            "discharge_understanding": "READY",
            "recovery_planning": "READY",
            "monitoring": "READY",
            "risk_reasoning": "READY",
            "followup": "READY",
            "escalation_coordination": "READY"
        },
        "safety_engine": "ACTIVE"
    }

@app.get("/api/v1/patients", tags=["Synthetic Data"])
async def list_synthetic_patients():
    """Lists all available synthetic demo patient profiles."""
    results = []
    for pid in DATA_FILES.keys():
        data = load_patient_dataset(pid)
        results.append(data["patient"])
    return results

@app.get("/api/v1/discharge/{patient_id}", response_model=DischargeProfile, tags=["Discharge Profile"])
async def get_discharge_profile(patient_id: str):
    """Retrieves structured discharge profile for a synthetic patient."""
    data = load_patient_dataset(patient_id)
    return data["discharge_profile"]

@app.get("/api/v1/tasks/today/{patient_id}", tags=["Tasks & Monitoring"])
async def get_today_tasks(patient_id: str):
    """Retrieves current day tasks for a patient."""
    data = load_patient_dataset(patient_id)
    tasks = data.get("initial_care_tasks_day_2", [])
    completed_count = sum(1 for t in tasks if t.get("status") == "COMPLETED")
    adherence = round((completed_count / len(tasks) * 100.0), 1) if tasks else 0.0
    return {
        "patient_id": patient_id,
        "day_number": 2,
        "adherence_percentage": adherence,
        "tasks": tasks
    }

@app.post("/api/v1/symptoms/report", response_model=RiskAssessment, tags=["Symptom & Risk Engine"])
async def report_symptom(report: SymptomReport):
    """
    Submits patient symptoms and runs through the Deterministic Safety Engine.
    Demonstrates immediate escalation if clinical red flags are triggered.
    """
    # 1. Run Deterministic Safety Checks on Vitals
    vital_violations = ClinicalSafetyEngine.evaluate_vitals(
        systolic_bp=report.systolic_bp,
        diastolic_bp=report.diastolic_bp,
        heart_rate=report.heart_rate,
        spo2=report.spo2,
        temperature_f=report.measured_temp,
        weight_gain_24h_lbs=report.weight_gain_24h_lbs
    )

    # 2. Run Keyword Safety Checks on Symptom Text
    symptom_violations = ClinicalSafetyEngine.evaluate_symptom_keywords(report.symptom_description)

    all_violations = vital_violations + symptom_violations

    if all_violations:
        highest_risk = RiskLevel.CRITICAL if any(v.risk_level == RiskLevel.CRITICAL for v in all_violations) else RiskLevel.HIGH
        primary_violation = all_violations[0]

        # Formulate clinical SBAR note automatically
        sbar = SbarNote(
            situation=f"Triggered Safety Rule {primary_violation.rule_id}: {primary_violation.parameter} is {primary_violation.observed_value}.",
            background=f"Patient {report.patient_id} reported: '{report.symptom_description}' with severity score {report.severity_score}/10.",
            assessment=primary_violation.clinical_note,
            recommendation="Clinical triage nurse or on-call surgeon should initiate patient contact immediately."
        )

        return RiskAssessment(
            patient_id=report.patient_id,
            risk_level=highest_risk,
            deterministic_rule_triggered=f"{primary_violation.rule_id} ({primary_violation.observed_value})",
            clinical_reasoning=primary_violation.clinical_note,
            immediate_patient_directive=primary_violation.emergency_directive,
            care_team_action_required=True,
            sbar=sbar
        )

    # If no deterministic violations, return standard reassuring evaluation
    return RiskAssessment(
        patient_id=report.patient_id,
        risk_level=RiskLevel.LOW if report.severity_score <= 4 else RiskLevel.MODERATE,
        deterministic_rule_triggered=None,
        clinical_reasoning="No immediate deterministic safety thresholds violated. Symptoms appear consistent with expected healing trajectory.",
        immediate_patient_directive="Continue resting and following your daily discharge recovery tasks. If your discomfort increases, please log it again.",
        care_team_action_required=False,
        sbar=None
    )

@app.post("/api/v1/chat/message", response_model=ChatMessageResponse, tags=["Patient Companion Chat"])
async def chat_message(req: ChatMessageRequest):
    """
    Recovery companion chat endpoint. Enforces grounding and medical disclaimers.
    """
    patient_data = load_patient_dataset(req.patient_id)
    profile = patient_data["discharge_profile"]

    # Scan for emergency keywords first
    violations = ClinicalSafetyEngine.evaluate_symptom_keywords(req.message)
    if violations:
        v = violations[0]
        return ChatMessageResponse(
            reply=f"⚠️ URGENT SAFETY ALERT: {v.emergency_directive}",
            risk_level=v.risk_level,
            suggested_action=f"Call clinic triage immediately: {patient_data['patient']['clinic_phone']}",
            disclaimer=settings.MANDATORY_DISCLAIMER
        )

    reply_msg = (
        f"Thank you for checking in. According to your discharge instructions for {profile['primary_diagnosis']}, "
        f"remember to observe: '{profile['activity_restrictions']}'. "
        f"If you have any clinical doubts, please contact {profile['follow_up_appointments'][0]['provider']} at {profile['follow_up_appointments'][0]['contact_number']}."
    )

    return ChatMessageResponse(
        reply=reply_msg,
        risk_level=RiskLevel.LOW,
        suggested_action="Review daily care tasks",
        disclaimer=settings.MANDATORY_DISCLAIMER
    )

@app.get("/api/v1/clinical/triage-board", tags=["Care Team Dashboard"])
async def get_triage_board():
    """Returns clinical triage board ranking demo patients by risk score."""
    triage_list = [
        {
            "patient_id": "PT-CABG-001",
            "name": "James Harrison",
            "procedure": "CABG x3",
            "discharge_date": "2026-09-16",
            "days_post_op": 2,
            "risk_level": "HIGH",
            "status_alert": "Suspected Surgical Site Infection (Temp 101.8°F)",
            "adherence_rate": 75.0,
            "pending_escalation": True
        },
        {
            "patient_id": "PT-CHF-003",
            "name": "Marcus Vance",
            "procedure": "Acute HFrEF Exacerbation",
            "discharge_date": "2026-09-17",
            "days_post_op": 1,
            "risk_level": "MODERATE",
            "status_alert": "Weight logged +1.5 lbs, monitoring fluid restriction",
            "adherence_rate": 100.0,
            "pending_escalation": False
        },
        {
            "patient_id": "PT-TKA-002",
            "name": "Elena Rostova",
            "procedure": "Right TKA",
            "discharge_date": "2026-09-17",
            "days_post_op": 1,
            "risk_level": "LOW",
            "status_alert": "Adhering to Lovenox anticoagulant and ankle pump PT",
            "adherence_rate": 100.0,
            "pending_escalation": False
        },
        {
            "patient_id": "PT-PNA-004",
            "name": "Sarah Chen",
            "procedure": "Community-Acquired Pneumonia",
            "discharge_date": "2026-09-17",
            "days_post_op": 1,
            "risk_level": "LOW",
            "status_alert": "Completed oral Levofloxacin dose 2/5, SpO2 96%",
            "adherence_rate": 100.0,
            "pending_escalation": False
        }
    ]
    return {
        "total_monitored": len(triage_list),
        "high_risk_count": sum(1 for p in triage_list if p["risk_level"] == "HIGH"),
        "moderate_risk_count": sum(1 for p in triage_list if p["risk_level"] == "MODERATE"),
        "low_risk_count": sum(1 for p in triage_list if p["risk_level"] == "LOW"),
        "patients": triage_list
    }


@app.post("/api/v1/workflow/{patient_id}", tags=["Agentic Workflow"])
async def run_workflow(patient_id: str, symptom_report: Optional[SymptomReport] = None):
    """
    Executes the multi-agent post-discharge workflow for a patient.
    Coordinates: Discharge Understanding -> Recovery Planning -> Monitoring ->
    Deterministic Safety Engine / Risk Reasoning -> Follow-Up OR Escalation.
    """
    if patient_id not in DATA_FILES:
        raise HTTPException(status_code=404, detail=f"Synthetic patient {patient_id} not found.")

    orchestrator = CareBridgeOrchestrator()
    return orchestrator.run_patient_workflow(
        patient_id=patient_id,
        symptom_report=symptom_report
    )

