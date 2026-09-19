"""
CareBridge AI - Agent Orchestrator

Central workflow coordinator presiding over the 6 specialized AI agents,
enforcing deterministic clinical safety engine evaluation, and managing
stateful recovery loops with RecoveryEvents and in-memory session persistence.
"""
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from app.core.config import settings
from app.core.safety_rules import RiskLevel
from app.core.session_store import session_store
from app.schemas.clinical import (
    CareTask,
    ChatMessageResponse,
    CreatePatientRequest,
    DischargeProfile,
    EscalationTicket,
    FollowUpAppointment,
    PatientBase,
    RecoveryEvent,
    RecoveryEventType,
    RecoveryMilestone,
    RecoveryPlan,
    RecoveryState,
    RiskAssessment,
    SymptomReport,
    TaskCategory,
    TaskStatus,
)
from app.agents.discharge_understanding import DischargeUnderstandingAgent
from app.agents.recovery_planning import RecoveryPlanningAgent
from app.agents.monitoring import MonitoringAgent
from app.agents.risk_reasoning import RiskReasoningAgent
from app.agents.followup import FollowUpAgent
from app.agents.escalation_coordination import EscalationCoordinationAgent


class CareBridgeOrchestrator:
    """
    Central workflow coordinator for CareBridge AI.

    Coordinates the execution:
      EVENT
        ↓
      ORCHESTRATOR
        ↓
      MONITORING AGENT
        ↓
      DETERMINISTIC SAFETY ENGINE
        ↓
      RISK / REASONING AGENT
        ↓
      FOLLOW-UP OR ESCALATION AGENT
        ↓
      HUMAN CLINICAL REVIEW (WHEN REQUIRED)
        ↓
      VERIFICATION & RECOVERY STATE UPDATE
    """

    def __init__(self) -> None:
        self.name = "CareBridge Orchestrator"
        self.discharge_agent = DischargeUnderstandingAgent()
        self.planning_agent = RecoveryPlanningAgent()
        self.monitoring_agent = MonitoringAgent()
        self.risk_agent = RiskReasoningAgent()
        self.followup_agent = FollowUpAgent()
        self.escalation_agent = EscalationCoordinationAgent()

    def load_patient_data(self, patient_id: str) -> Dict[str, Any]:
        """Load patient dataset from session store or disk."""
        data = session_store.get_patient_data(patient_id)
        if not data:
            raise ValueError(f"Unknown patient ID '{patient_id}'.")
        return data

    def run_patient_workflow(
        self,
        patient_id: str,
        symptom_report: Optional[Union[SymptomReport, Dict[str, Any]]] = None,
        current_day: int = 2
    ) -> Dict[str, Any]:
        """
        Execute the complete post-discharge coordination workflow for a patient.
        Updates persistent session RecoveryState and logs chronological RecoveryEvents.
        """
        raw_data = self.load_patient_data(patient_id)
        patient_info = raw_data["patient"]
        patient_name = f"{patient_info['first_name']} {patient_info['last_name']}"

        # Initialize or retrieve current RecoveryState
        session_state = session_store.get_or_init_state(patient_id)

        # Step 1: Discharge Understanding Agent
        discharge_profile: DischargeProfile = self.discharge_agent.run(raw_data["discharge_profile"])

        # Step 2: Recovery Planning Agent
        recovery_plan: RecoveryPlan = self.planning_agent.run(discharge_profile, current_day=current_day)

        # Step 3: Monitoring Agent (evaluated on live session tasks if available)
        tasks_to_monitor = session_state.active_tasks if session_state.active_tasks else raw_data.get(
            f"initial_care_tasks_day_{current_day}", raw_data.get("initial_care_tasks_day_2", [])
        )
        monitoring_summary = self.monitoring_agent.run(tasks_to_monitor, patient_id=patient_id)

        # Step 4: Safety & Risk Reasoning (if symptom or vital reported)
        risk_assessment: Optional[RiskAssessment] = None
        escalation_ticket: Optional[EscalationTicket] = None
        followup_response: Optional[ChatMessageResponse] = None
        routed_to: Optional[str] = None

        if symptom_report is not None:
            if isinstance(symptom_report, dict):
                symptom_report = SymptomReport.model_validate(symptom_report)

            run_id = f"run_{uuid.uuid4().hex[:8]}"

            # Determine event type (Vital vs Symptom)
            has_vitals = any([
                symptom_report.measured_temp is not None,
                symptom_report.systolic_bp is not None,
                symptom_report.diastolic_bp is not None,
                symptom_report.heart_rate is not None,
                symptom_report.spo2 is not None,
                symptom_report.weight_gain_24h_lbs is not None,
            ])
            initial_event_type = (
                RecoveryEventType.VITAL_RECORDED if has_vitals else RecoveryEventType.SYMPTOM_REPORTED
            )

            # Record initial patient event in timeline
            session_store.record_event(RecoveryEvent(
                event_id=f"evt_{uuid.uuid4().hex[:8]}",
                run_id=run_id,
                patient_id=patient_id,
                event_type=initial_event_type,
                status="REPORTED",
                value=symptom_report.symptom_description,
                source="PATIENT",
                metadata=symptom_report.model_dump(mode="json"),
                timestamp=datetime.utcnow()
            ))

            # Risk Reasoning Agent ALWAYS executes ClinicalSafetyEngine first
            risk_assessment = self.risk_agent.run(symptom_report, profile=discharge_profile)

            if risk_assessment.risk_level in (RiskLevel.HIGH, RiskLevel.CRITICAL):
                # Deterministic rule triggered event
                session_store.record_event(RecoveryEvent(
                    event_id=f"evt_{uuid.uuid4().hex[:8]}",
                    run_id=run_id,
                    patient_id=patient_id,
                    event_type=RecoveryEventType.SAFETY_TRIGGERED,
                    status="FLAGGED",
                    value=risk_assessment.deterministic_rule_triggered or "Clinical threshold breached",
                    source="SAFETY_ENGINE",
                    metadata={"risk_level": risk_assessment.risk_level.value},
                    timestamp=datetime.utcnow()
                ))

                # Step 5A: Escalation Coordination Agent
                escalation_ticket = self.escalation_agent.run(
                    assessment=risk_assessment,
                    patient_name=patient_name,
                    patient_id=patient_id
                )
                routed_to = "ESCALATION_COORDINATION_AGENT"

                # Log escalation creation event
                session_store.record_event(RecoveryEvent(
                    event_id=f"evt_{uuid.uuid4().hex[:8]}",
                    run_id=run_id,
                    patient_id=patient_id,
                    event_type=RecoveryEventType.ESCALATION_CREATED,
                    status="HUMAN_REVIEW_PENDING",
                    value=f"Draft SBAR generated for ticket {escalation_ticket.ticket_id}. Clinical review pending.",
                    source="ESCALATION_AGENT",
                    metadata={"ticket_id": escalation_ticket.ticket_id, "risk_level": risk_assessment.risk_level.value},
                    timestamp=datetime.utcnow()
                ))

                # Update session recovery state with active escalation ticket
                session_state.active_ticket = escalation_ticket
                session_state.escalation_status = "OPEN"
                session_state.risk_level = risk_assessment.risk_level

            else:
                # Step 5B: Follow-Up Agent
                followup_response = self.followup_agent.run(
                    assessment=risk_assessment,
                    profile=discharge_profile,
                    patient_message=symptom_report.symptom_description
                )
                routed_to = "FOLLOW_UP_AGENT"

                # Log follow-up event
                session_store.record_event(RecoveryEvent(
                    event_id=f"evt_{uuid.uuid4().hex[:8]}",
                    run_id=run_id,
                    patient_id=patient_id,
                    event_type=RecoveryEventType.FOLLOWUP_COMPLETED,
                    status="COMPLETED",
                    value=followup_response.suggested_action or "Routine guidance provided",
                    source="FOLLOW_UP_AGENT",
                    metadata={"risk_level": risk_assessment.risk_level.value},
                    timestamp=datetime.utcnow()
                ))

                session_state.risk_level = risk_assessment.risk_level

        # Refresh session state
        session_state.adherence_percentage = monitoring_summary.get("adherence_percentage", session_state.adherence_percentage)

        return {
            "patient_id": patient_id,
            "patient_name": patient_name,
            "primary_diagnosis": discharge_profile.primary_diagnosis,
            "discharge_profile": discharge_profile.model_dump(mode="json"),
            "recovery_plan": recovery_plan.model_dump(mode="json"),
            "monitoring": monitoring_summary,
            "symptom_report": symptom_report.model_dump(mode="json") if symptom_report else None,
            "risk_assessment": risk_assessment.model_dump(mode="json") if risk_assessment else None,
            "escalation_ticket": escalation_ticket.model_dump(mode="json") if escalation_ticket else (session_state.active_ticket.model_dump(mode="json") if session_state.active_ticket else None),
            "followup_response": followup_response.model_dump(mode="json") if followup_response else None,
            "workflow_route": routed_to or (None if session_state.escalation_status == "NONE" else session_state.escalation_status),
            "recovery_state": session_state.model_dump(mode="json"),
            "status": "COMPLETED"
        }

    def execute_task_action(
        self,
        patient_id: str,
        task_id: str,
        action: str,  # "complete", "snooze", "miss"
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """Executes a real-time user task action, updates RecoveryState and logs to timeline."""
        run_id = f"run_{uuid.uuid4().hex[:8]}"
        event, state = session_store.update_task_action(
            patient_id=patient_id,
            task_id=task_id,
            action=action,
            notes=notes,
            run_id=run_id
        )
        return {
            "event": event.model_dump(mode="json"),
            "recovery_state": state.model_dump(mode="json"),
            "adherence_percentage": state.adherence_percentage,
            "status": "SUCCESS"
        }

    def execute_clinical_review(
        self,
        patient_id: str,
        ticket_id: str,
        clinician_name: str,
        action_notes: str
    ) -> Dict[str, Any]:
        """Executes simulated human clinical review, completing the verification loop."""
        run_id = f"run_{uuid.uuid4().hex[:8]}"
        event, state = session_store.record_clinical_review(
            patient_id=patient_id,
            ticket_id=ticket_id,
            clinician_name=clinician_name,
            action_notes=action_notes,
            run_id=run_id
        )
        return {
            "event": event.model_dump(mode="json"),
            "recovery_state": state.model_dump(mode="json"),
            "status": "REVIEWED"
        }

    def execute_discharge_upload(
        self,
        raw_text: Optional[str] = None,
        content_base64: Optional[str] = None,
        filename: str = "discharge_summary.txt"
    ) -> Dict[str, Any]:
        """
        Parses uploaded discharge paperwork (TXT or PDF), synthesizes personalized 4-phase plan,
        and initializes active RecoveryState in session store.
        """
        from app.core.pdf_extractor import extract_discharge_text
        extracted_text = extract_discharge_text(
            filename=filename,
            content=raw_text,
            content_base64=content_base64
        )
        patient, profile = self.discharge_agent.parse_unstructured_text(extracted_text)
        plan = self.planning_agent.run(profile, current_day=2)
        tasks = self.planning_agent.generate_initial_care_tasks(profile, day_number=2)

        state = session_store.register_custom_patient(
            patient=patient,
            discharge_profile=profile,
            recovery_plan=plan,
            tasks=tasks
        )

        monitoring_summary = self.monitoring_agent.run(tasks, patient_id=patient.id)

        return {
            "patient": patient.model_dump(mode="json"),
            "discharge_profile": profile.model_dump(mode="json"),
            "recovery_plan": plan.model_dump(mode="json"),
            "recovery_state": state.model_dump(mode="json"),
            "monitoring": monitoring_summary,
            "status": "INITIALIZED"
        }

    def create_dynamic_patient(self, req: CreatePatientRequest) -> Dict[str, Any]:
        """
        Dynamically onboards a new patient with optional discharge summary upload (.txt or .pdf).
        Generates unique patient ID format: PT-USER-<hex>
        Correlates onboarding events under a single run_id:
        - PATIENT_CREATED (source="USER_INPUT")
        - DISCHARGE_UPLOADED (if summary provided)
        - DISCHARGE_PARSED (if summary provided)
        - RECOVERY_PLAN_CREATED (synthesized plan)
        Ensures strict patient data isolation and non-hallucinated tasks.
        """
        patient_id = f"PT-USER-{uuid.uuid4().hex[:6].upper()}"
        run_id = f"run_{uuid.uuid4().hex[:8]}"

        name_parts = req.name.strip().split()
        first_name = name_parts[0] if name_parts else "Patient"
        last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

        creation_events: List[RecoveryEvent] = []

        patient_created_event = RecoveryEvent(
            event_id=f"evt_{uuid.uuid4().hex[:8]}",
            run_id=run_id,
            patient_id=patient_id,
            event_type=RecoveryEventType.PATIENT_CREATED,
            status="CREATED",
            value=f"Patient profile created for {req.name} (ID: {patient_id}).",
            source="USER_INPUT",
            metadata={"name": req.name, "source": "USER_INPUT"},
            timestamp=datetime.utcnow()
        )
        creation_events.append(patient_created_event)

        # Resolve discharge summary text if provided (either raw text or base64 PDF/TXT)
        summary_text = None
        if req.discharge_summary_base64 and req.discharge_summary_base64.strip():
            from app.core.pdf_extractor import extract_discharge_text
            summary_text = extract_discharge_text(
                filename=req.discharge_summary_filename or "discharge_summary.pdf",
                content_base64=req.discharge_summary_base64
            )
        elif req.discharge_summary_text and req.discharge_summary_text.strip():
            from app.core.pdf_extractor import extract_discharge_text
            summary_text = extract_discharge_text(
                filename=req.discharge_summary_filename or "discharge_summary.txt",
                content=req.discharge_summary_text
            )

        if summary_text:
            upload_event = RecoveryEvent(
                event_id=f"evt_{uuid.uuid4().hex[:8]}",
                run_id=run_id,
                patient_id=patient_id,
                event_type=RecoveryEventType.DISCHARGE_UPLOADED,
                status="UPLOADED",
                value="Clinical discharge summary uploaded for parsing.",
                source="USER_INPUT",
                metadata={"source": "USER_INPUT", "text_length": len(summary_text)},
                timestamp=datetime.utcnow()
            )
            creation_events.append(upload_event)

            parsed_patient, parsed_profile = self.discharge_agent.parse_unstructured_text(
                raw_text=summary_text,
                custom_patient_id=patient_id
            )

            patient = PatientBase(
                id=patient_id,
                first_name=first_name or parsed_patient.first_name,
                last_name=last_name or parsed_patient.last_name,
                age=req.age if req.age is not None else parsed_patient.age,
                gender=req.gender if req.gender and req.gender != "Not specified" else parsed_patient.gender,
                discharge_date=req.discharge_date or parsed_patient.discharge_date,
                condition_category=req.condition_category or parsed_patient.condition_category,
                primary_care_physician=req.physician_care_team if req.physician_care_team and req.physician_care_team != "Not specified" else parsed_patient.primary_care_physician,
                clinic_phone=req.contact if req.contact and req.contact != "Not specified" else parsed_patient.clinic_phone,
                emergency_contact=req.emergency_contact if req.emergency_contact and req.emergency_contact != "Not specified" else parsed_patient.emergency_contact,
                is_demo=False
            )

            procedures_list = [req.procedure] if req.procedure else parsed_profile.procedures
            diag = req.primary_diagnosis if req.primary_diagnosis and req.primary_diagnosis != "General Post-Discharge Recovery" else parsed_profile.primary_diagnosis

            profile = DischargeProfile(
                profile_id=f"DP-{patient_id}",
                patient_id=patient_id,
                primary_diagnosis=diag,
                procedures=procedures_list,
                discharge_date=patient.discharge_date or parsed_profile.discharge_date,
                dietary_instructions=parsed_profile.dietary_instructions,
                activity_restrictions=parsed_profile.activity_restrictions,
                wound_care_instructions=parsed_profile.wound_care_instructions,
                medications=parsed_profile.medications,
                red_flag_warnings=parsed_profile.red_flag_warnings,
                follow_up_appointments=parsed_profile.follow_up_appointments
            )

            parsed_event = RecoveryEvent(
                event_id=f"evt_{uuid.uuid4().hex[:8]}",
                run_id=run_id,
                patient_id=patient_id,
                event_type=RecoveryEventType.DISCHARGE_PARSED,
                status="PARSED",
                value=f"Discharge summary parsed: diagnosis '{profile.primary_diagnosis}', {len(profile.medications)} medications documented.",
                source="DISCHARGE_UNDERSTANDING_AGENT",
                metadata={"primary_diagnosis": profile.primary_diagnosis, "med_count": len(profile.medications)},
                timestamp=datetime.utcnow()
            )
            creation_events.append(parsed_event)

            plan = self.planning_agent.run(profile, current_day=2)
            tasks = self.planning_agent.generate_initial_care_tasks(profile, day_number=2)

            plan_event = RecoveryEvent(
                event_id=f"evt_{uuid.uuid4().hex[:8]}",
                run_id=run_id,
                patient_id=patient_id,
                event_type=RecoveryEventType.RECOVERY_PLAN_CREATED,
                status="CREATED",
                value=f"4-phase recovery roadmap synthesized with {len(tasks)} Day 2 recovery tasks.",
                source="RECOVERY_PLANNING_AGENT",
                metadata={"duration_days": plan.duration_days, "task_count": len(tasks)},
                timestamp=datetime.utcnow()
            )
            creation_events.append(plan_event)

        else:
            patient = PatientBase(
                id=patient_id,
                first_name=first_name,
                last_name=last_name,
                age=req.age,
                gender=req.gender or "Not specified",
                discharge_date=req.discharge_date or "Not specified",
                condition_category=req.condition_category or "General Medicine",
                primary_care_physician=req.physician_care_team or "Not specified",
                clinic_phone=req.contact or "Not specified",
                emergency_contact=req.emergency_contact or "Not specified",
                is_demo=False
            )

            procedures_list = [req.procedure] if req.procedure else []
            primary_diag = req.primary_diagnosis or "General Post-Discharge Recovery"

            profile = DischargeProfile(
                profile_id=f"DP-{patient_id}",
                patient_id=patient_id,
                primary_diagnosis=primary_diag,
                procedures=procedures_list,
                discharge_date=patient.discharge_date or "Not specified",
                dietary_instructions="Not specified in available discharge information.",
                activity_restrictions="Not specified in available discharge information.",
                wound_care_instructions="Not specified in available discharge information.",
                medications=[],
                red_flag_warnings=[],
                follow_up_appointments=[]
            )

            plan = RecoveryPlan(
                plan_id=f"PLAN-{patient_id}",
                patient_id=patient_id,
                duration_days=30,
                current_phase="Phase 1: Acute Home Recovery (Days 1-3)",
                milestones=[
                    RecoveryMilestone(day=1, title="Discharge Transition", description="Establish safe home recovery environment and emergency contacts."),
                    RecoveryMilestone(day=3, title="Initial Telemetry Stabilization", description="Confirm baseline vitals, temperature, and resting tolerance."),
                    RecoveryMilestone(day=7, title="Early Recovery Assessment", description="Evaluate mobility progression and outpatient follow-up schedule."),
                    RecoveryMilestone(day=14, title="Mid-Term Functional Check", description="Transition toward independent daily living activities.")
                ]
            )

            tasks = [
                CareTask(
                    task_id=f"TASK-{patient_id}-01",
                    patient_id=patient_id,
                    day_number=2,
                    category=TaskCategory.CHECK_IN,
                    title="Daily Recovery Check-In",
                    description="Confirm resting comfort and log overall recovery progress.",
                    scheduled_time="09:00",
                    status=TaskStatus.PENDING
                ),
                CareTask(
                    task_id=f"TASK-{patient_id}-02",
                    patient_id=patient_id,
                    day_number=2,
                    category=TaskCategory.VITAL_CHECK,
                    title="Record Available Vitals",
                    description="Log resting vitals and temperature if monitoring equipment is available.",
                    scheduled_time="12:00",
                    status=TaskStatus.PENDING
                ),
                CareTask(
                    task_id=f"TASK-{patient_id}-03",
                    patient_id=patient_id,
                    day_number=2,
                    category=TaskCategory.CHECK_IN,
                    title="Review Documented Instructions",
                    description="Review discharge paperwork and report any new or worsening symptoms.",
                    scheduled_time="15:00",
                    status=TaskStatus.PENDING
                ),
                CareTask(
                    task_id=f"TASK-{patient_id}-04",
                    patient_id=patient_id,
                    day_number=2,
                    category=TaskCategory.CHECK_IN,
                    title="Confirm Follow-Up Information",
                    description="Verify upcoming clinical outpatient appointments and contact information.",
                    scheduled_time="18:00",
                    status=TaskStatus.PENDING
                )
            ]

            plan_event = RecoveryEvent(
                event_id=f"evt_{uuid.uuid4().hex[:8]}",
                run_id=run_id,
                patient_id=patient_id,
                event_type=RecoveryEventType.RECOVERY_PLAN_CREATED,
                status="CREATED",
                value=f"Standard post-discharge recovery monitoring plan initialized with {len(tasks)} neutral tracking tasks.",
                source="RECOVERY_PLANNING_AGENT",
                metadata={"duration_days": 30, "task_count": len(tasks)},
                timestamp=datetime.utcnow()
            )
            creation_events.append(plan_event)

        reversed_events = list(reversed(creation_events))
        state = session_store.register_dynamic_patient(
            patient=patient,
            discharge_profile=profile,
            recovery_plan=plan,
            tasks=tasks,
            events=reversed_events
        )

        monitoring_summary = self.monitoring_agent.run(tasks, patient_id=patient_id)

        return {
            "patient": patient.model_dump(mode="json"),
            "discharge_profile": profile.model_dump(mode="json"),
            "recovery_plan": plan.model_dump(mode="json"),
            "recovery_state": state.model_dump(mode="json"),
            "monitoring": monitoring_summary,
            "events": [e.model_dump(mode="json") for e in reversed_events],
            "status": "INITIALIZED"
        }

    def get_recovery_state(self, patient_id: str) -> RecoveryState:
        """Retrieves active RecoveryState for a patient."""
        return session_store.get_or_init_state(patient_id)

    def get_timeline(self, patient_id: str) -> List[RecoveryEvent]:
        """Retrieves chronological events for a patient."""
        state = session_store.get_or_init_state(patient_id)
        return state.recent_events
