"""
CareBridge AI: Post-Discharge Care Coordination System
Main FastAPI Application Entrypoint
"""
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, status, Header
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.safety_rules import ClinicalSafetyEngine, RiskLevel
from app.core.session_store import session_store
from app.core.auth import auth_manager
from app.agents.orchestrator import CareBridgeOrchestrator
from app.schemas.clinical import (
    DischargeProfile,
    PatientBase,
    SymptomReport,
    RiskAssessment,
    SbarNote,
    EscalationTicket,
    ChatMessageRequest,
    ChatMessageResponse,
    RecoveryEvent,
    RecoveryState,
    ClinicalReviewRequest,
    TaskActionRequest,
    DischargeUploadRequest,
    CreatePatientRequest,
    ExtractTextRequest,
    LoginRequest,
    LoginResponse,
    SignupRequest,
    SignupResponse
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
    data = session_store.get_patient_data(patient_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found.")
    return data

def extract_token(authorization: Optional[str] = Header(None)) -> Optional[str]:
    if not authorization:
        return None
    if authorization.startswith("Bearer "):
        return authorization[7:].strip()
    return authorization.strip()

def verify_patient_access(patient_id: str, authorization: Optional[str] = Header(None)) -> str:
    token = extract_token(authorization)
    is_ok, msg, code = auth_manager.verify_patient_access(token, patient_id)
    if not is_ok:
        raise HTTPException(status_code=code, detail=msg)
    return patient_id

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

@app.post("/api/v1/auth/signup", response_model=SignupResponse, tags=["Authentication"])
async def signup(req: SignupRequest):
    """
    Registers a new patient account with name, email, and password.
    Returns an active session token and newly generated Patient ID (PT-USER-*).
    """
    try:
        session_info = auth_manager.signup(
            full_name=req.full_name,
            email=req.email,
            password=req.password,
            confirm_password=req.confirm_password,
        )
        return SignupResponse(
            status="SUCCESS",
            session_token=session_info["session_token"],
            patient_id=session_info["patient_id"],
            patient_name=session_info["patient_name"],
            message="Registration successful"
        )
    except ValueError as e:
        err_msg = str(e).strip("'\"")
        if "already registered" in err_msg.lower():
            raise HTTPException(status_code=409, detail=err_msg)
        raise HTTPException(status_code=400, detail=err_msg)


@app.post("/api/v1/auth/login", response_model=LoginResponse, tags=["Authentication"])
async def login(req: LoginRequest):
    """
    Authenticates a patient using either Patient ID or Email, plus password.
    Returns session token and patient identity.
    """
    try:
        if req.email and req.email.strip():
            session_info = auth_manager.login_with_email(req.email.strip(), req.password)
        elif req.patient_id and req.patient_id.strip():
            session_info = auth_manager.login(req.patient_id.strip(), req.password)
        else:
            raise HTTPException(status_code=400, detail="Patient ID or email is required")

        return LoginResponse(
            status="SUCCESS",
            session_token=session_info["session_token"],
            patient_id=session_info["patient_id"],
            patient_name=session_info["patient_name"],
            message="Login successful"
        )
    except KeyError as e:
        raise HTTPException(status_code=401, detail=str(e).strip("'\""))
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e).strip("'\""))

@app.post("/api/v1/auth/logout", tags=["Authentication"])
async def logout(authorization: Optional[str] = Header(None)):
    """Logs out the active patient session and revokes the session token."""
    token = extract_token(authorization)
    if token:
        auth_manager.logout(token)
    return {"status": "SUCCESS", "message": "Logged out successfully"}

@app.get("/api/v1/auth/me", tags=["Authentication"])
async def get_current_user(authorization: Optional[str] = Header(None)):
    """Retrieves session metadata for the currently authenticated patient."""
    token = extract_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required. Please log in.")
    session_info = auth_manager.get_session(token)
    if not session_info:
        raise HTTPException(status_code=401, detail="Invalid or expired session token. Please log in again.")
    return {
        "authenticated": True,
        "patient_id": session_info["patient_id"],
        "patient_name": session_info["patient_name"],
        "created_at": session_info["created_at"]
    }

@app.get("/api/v1/patients", tags=["Synthetic Data"])
async def list_synthetic_patients():
    """Lists all available synthetic demo and custom uploaded patient profiles."""
    return session_store.list_all_patients()

@app.get("/api/v1/discharge/{patient_id}", response_model=DischargeProfile, tags=["Discharge Profile"])
async def get_discharge_profile(patient_id: str, authorization: Optional[str] = Header(None)):
    """Retrieves structured discharge profile for a patient."""
    verify_patient_access(patient_id, authorization)
    data = load_patient_dataset(patient_id)
    return data["discharge_profile"]

@app.get("/api/v1/tasks/today/{patient_id}", tags=["Tasks & Monitoring"])
async def get_today_tasks(patient_id: str, authorization: Optional[str] = Header(None)):
    """Retrieves current day tasks and real-time adherence for a patient from session store."""
    verify_patient_access(patient_id, authorization)
    load_patient_dataset(patient_id)
    state = session_store.get_or_init_state(patient_id)
    return {
        "patient_id": patient_id,
        "day_number": state.current_day,
        "adherence_percentage": state.adherence_percentage,
        "tasks": [t.model_dump(mode="json") for t in state.active_tasks]
    }

@app.post("/api/v1/symptoms/report", response_model=RiskAssessment, tags=["Symptom & Risk Engine"])
async def report_symptom(report: SymptomReport, authorization: Optional[str] = Header(None)):
    """
    Submits patient symptoms and runs through the Deterministic Safety Engine.
    Demonstrates immediate escalation if clinical red flags are triggered.
    """
    verify_patient_access(report.patient_id, authorization)
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
        critical_violations = [v for v in all_violations if v.risk_level == RiskLevel.CRITICAL]
        if critical_violations:
            highest_risk = RiskLevel.CRITICAL
            primary_violation = critical_violations[0]
        else:
            highest_risk = RiskLevel.HIGH
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
async def chat_message(req: ChatMessageRequest, authorization: Optional[str] = Header(None)):
    """
    Recovery companion chat endpoint. Enforces grounding and medical disclaimers.
    """
    verify_patient_access(req.patient_id, authorization)
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
async def run_workflow(
    patient_id: str,
    symptom_report: Optional[SymptomReport] = None,
    authorization: Optional[str] = Header(None)
):
    """
    Executes the multi-agent post-discharge workflow for a patient.
    Coordinates: Discharge Understanding -> Recovery Planning -> Monitoring ->
    Deterministic Safety Engine / Risk Reasoning -> Follow-Up OR Escalation.
    """
    verify_patient_access(patient_id, authorization)
    load_patient_dataset(patient_id)

    orchestrator = CareBridgeOrchestrator()
    return orchestrator.run_patient_workflow(
        patient_id=patient_id,
        symptom_report=symptom_report
    )


@app.post("/api/v1/documents/extract-text", tags=["Discharge Upload"])
async def extract_document_text(req: ExtractTextRequest):
    """
    Safely extracts readable text from PDF or TXT discharge documents.
    Returns HTTP 400 with user-friendly error if PDF contains no extractable text.
    """
    from app.core.pdf_extractor import extract_discharge_text
    try:
        text = extract_discharge_text(
            filename=req.filename,
            content=req.content,
            content_base64=req.content_base64
        )
        return {"filename": req.filename, "text": text}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document text extraction failed: {str(e)}")


@app.post("/api/v1/patients/upload-discharge", tags=["Discharge Upload"])
async def upload_discharge_summary(req: DischargeUploadRequest):
    """
    Ingests unstructured clinical discharge text or PDF, synthesizes care tasks and recovery plan,
    and registers an active RecoveryState.
    """
    if not req.content and not req.content_base64:
        raise HTTPException(status_code=400, detail="Discharge summary content cannot be empty.")

    orchestrator = CareBridgeOrchestrator()
    try:
        result = orchestrator.execute_discharge_upload(
            raw_text=req.content,
            content_base64=req.content_base64,
            filename=req.filename
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process discharge document: {str(e)}")


@app.post("/api/v1/patients/create", tags=["Patient Onboarding"])
async def create_patient(req: CreatePatientRequest):
    """
    Dynamically onboards a new patient with authorized/de-identified information
    and optional unstructured discharge summary text or PDF.
    Coordinates Discharge Understanding, Recovery Planning, and Monitoring Agents.
    """
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Patient name is required.")

    orchestrator = CareBridgeOrchestrator()
    try:
        result = orchestrator.create_dynamic_patient(req)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to onboard patient: {str(e)}")


@app.get("/api/v1/patients/{patient_id}/recovery-state", tags=["Recovery State"])
async def get_recovery_state(patient_id: str, authorization: Optional[str] = Header(None)):
    """Retrieves real-time session RecoveryState including active tasks and timeline."""
    verify_patient_access(patient_id, authorization)
    load_patient_dataset(patient_id)
    state = session_store.get_or_init_state(patient_id)
    return state.model_dump(mode="json")


@app.post("/api/v1/patients/{patient_id}/tasks/{task_id}/{action}", tags=["Tasks & Monitoring"])
async def update_task_action(
    patient_id: str,
    task_id: str,
    action: str,
    body: Optional[TaskActionRequest] = None,
    authorization: Optional[str] = Header(None)
):
    """
    Executes a user action on an active care task ('complete', 'snooze', 'miss').
    Updates RecoveryState and logs a RecoveryEvent to the patient's timeline.
    Returns HTTP 404 if task_id does not exist for the patient.
    """
    verify_patient_access(patient_id, authorization)
    if action not in ("complete", "snooze", "miss"):
        raise HTTPException(status_code=400, detail=f"Invalid task action '{action}'. Must be 'complete', 'snooze', or 'miss'.")

    load_patient_dataset(patient_id)
    orchestrator = CareBridgeOrchestrator()
    notes = body.notes if body else None
    try:
        return orchestrator.execute_task_action(
            patient_id=patient_id,
            task_id=task_id,
            action=action,
            notes=notes
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Task not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to execute task action: {str(e)}")


@app.post("/api/v1/escalations/{ticket_id}/review", tags=["Clinical Escalation & Verification"])
async def review_escalation_ticket(
    ticket_id: str,
    req: ClinicalReviewRequest,
    authorization: Optional[str] = Header(None)
):
    """
    Completes the human clinical verification loop for an open escalation ticket.
    Enforces strict patient data isolation: ticket must belong to the requested patient.
    Updates ticket status, resolves escalation, de-escalates active risk level,
    and logs a CLINICAL_REVIEW_COMPLETED event to the timeline.
    """
    # 1. Locate the ticket's actual patient owner
    ticket_owner_id = session_store.find_patient_by_ticket(ticket_id)
    if not ticket_owner_id:
        raise HTTPException(status_code=404, detail=f"Escalation ticket '{ticket_id}' not found.")

    verify_patient_access(ticket_owner_id, authorization)

    # 2. Strict patient ownership check: ticket.patient_id == request.patient_id
    if req.patient_id and req.patient_id != ticket_owner_id:
        raise HTTPException(
            status_code=403,
            detail=f"Patient ID mismatch: ticket '{ticket_id}' belongs to patient '{ticket_owner_id}', not '{req.patient_id}'."
        )

    patient_id = ticket_owner_id
    orchestrator = CareBridgeOrchestrator()
    try:
        return orchestrator.execute_clinical_review(
            patient_id=patient_id,
            ticket_id=ticket_id,
            clinician_name=req.clinician_name,
            action_notes=req.action_notes
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to review escalation: {str(e)}")


@app.get("/api/v1/patients/{patient_id}/timeline", tags=["Timeline & Auditing"])
async def get_patient_timeline(patient_id: str, authorization: Optional[str] = Header(None)):
    """Retrieves chronological audit events for a patient."""
    verify_patient_access(patient_id, authorization)
    load_patient_dataset(patient_id)
    events = CareBridgeOrchestrator().get_timeline(patient_id)
    return [e.model_dump(mode="json") for e in events]

