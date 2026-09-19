"""
CareBridge AI In-Memory Session Recovery Store
Provides persistent stateful recovery coordination during patient sessions.
Maintains RecoveryState, active tasks, adherence, and chronological RecoveryEvents.
"""
import json
import threading
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings
from app.schemas.clinical import (
    CareTask,
    DischargeProfile,
    EscalationTicket,
    PatientBase,
    RecoveryEvent,
    RecoveryEventType,
    RecoveryPlan,
    RecoveryState,
    RiskLevel,
    TaskCategory,
    TaskStatus,
    TicketStatus,
)

DATA_FILES: Dict[str, str] = {
    "PT-CABG-001": "cabg_patient.json",
    "PT-TKA-002": "tka_patient.json",
    "PT-CHF-003": "chf_patient.json",
    "PT-PNA-004": "pneumonia_patient.json",
}


class SessionRecoveryStore:
    """Thread-safe in-memory session manager for patient recovery coordination."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._states: Dict[str, RecoveryState] = {}
        self._custom_patients: Dict[str, Dict[str, Any]] = {}

    def _load_synthetic_file(self, patient_id: str) -> Optional[Dict[str, Any]]:
        filename = DATA_FILES.get(patient_id)
        if not filename:
            return None
        filepath = settings.DATA_DIR / filename
        if not filepath.exists():
            return None
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)

    def get_patient_data(self, patient_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            if patient_id in self._custom_patients:
                return self._custom_patients[patient_id]
        return self._load_synthetic_file(patient_id)

    def get_or_init_state(self, patient_id: str) -> RecoveryState:
        with self._lock:
            if patient_id in self._states:
                return self._states[patient_id]

            # Initialize from synthetic or custom patient data
            raw_data = self._custom_patients.get(patient_id) or self._load_synthetic_file(patient_id)
            if not raw_data:
                # Default empty fallback state
                state = RecoveryState(patient_id=patient_id)
                self._states[patient_id] = state
                return state

            initial_tasks_raw = raw_data.get("initial_care_tasks_day_2", [])
            tasks: List[CareTask] = [CareTask.model_validate(t) for t in initial_tasks_raw]

            completed = [t for t in tasks if t.status == TaskStatus.COMPLETED]
            missed = [t for t in tasks if t.status == TaskStatus.MISSED]
            snoozed = [t for t in tasks if t.status == TaskStatus.SNOOZED]
            active = [t for t in tasks if t.status == TaskStatus.PENDING]

            adherence = (
                round((len(completed) / len(tasks)) * 100.0, 1) if tasks else 100.0
            )

            # Initial setup event
            run_id = f"run_{uuid.uuid4().hex[:8]}"
            init_event = RecoveryEvent(
                event_id=f"evt_{uuid.uuid4().hex[:8]}",
                run_id=run_id,
                patient_id=patient_id,
                event_type=RecoveryEventType.REMINDER_SENT,
                status="COMPLETED",
                value="Day 2 recovery plan active. Scheduled tasks loaded.",
                source="MONITORING_AGENT",
                timestamp=datetime.utcnow()
            )

            state = RecoveryState(
                patient_id=patient_id,
                current_phase="Phase 1: Acute Recovery (Days 1-3)",
                current_day=2,
                active_tasks=tasks,
                completed_tasks=completed,
                missed_tasks=missed,
                snoozed_tasks=snoozed,
                adherence_percentage=adherence,
                recent_events=[init_event],
                risk_level=RiskLevel.LOW,
                escalation_status="NONE",
                last_updated=datetime.utcnow()
            )
            self._states[patient_id] = state
            return state

    def record_event(self, event: RecoveryEvent) -> RecoveryState:
        with self._lock:
            state = self.get_or_init_state(event.patient_id)
            state.recent_events.insert(0, event)
            state.last_updated = datetime.utcnow()
            return state

    def update_task_action(
        self,
        patient_id: str,
        task_id: str,
        action: str,  # "complete", "snooze", "miss"
        notes: Optional[str] = None,
        run_id: Optional[str] = None
    ) -> Tuple[RecoveryEvent, RecoveryState]:
        with self._lock:
            effective_run_id = run_id or f"run_{uuid.uuid4().hex[:8]}"
            state = self.get_or_init_state(patient_id)

            target_task: Optional[CareTask] = None
            for t in state.active_tasks:
                if t.task_id == task_id:
                    target_task = t
                    break

            if not target_task:
                raise KeyError(f"Task '{task_id}' not found for patient '{patient_id}'.")

            event_type = RecoveryEventType.TASK_COMPLETED
            if action == "complete":
                target_task.status = TaskStatus.COMPLETED
                target_task.completed_at = datetime.utcnow()
                event_type = RecoveryEventType.TASK_COMPLETED
                msg = f"Task completed: '{target_task.title}'"
            elif action == "snooze":
                target_task.status = TaskStatus.SNOOZED
                event_type = RecoveryEventType.TASK_SNOOZED
                msg = f"Task snoozed (reminder set in 2 hours): '{target_task.title}'"
            elif action == "miss":
                target_task.status = TaskStatus.MISSED
                event_type = RecoveryEventType.TASK_MISSED
                msg = f"Task marked missed: '{target_task.title}'"
            else:
                target_task.status = TaskStatus.PENDING
                event_type = RecoveryEventType.REMINDER_SENT
                msg = f"Task reset to pending: '{target_task.title}'"

            if notes:
                target_task.notes = notes

            # Recalculate adherence and task buckets
            state.completed_tasks = [t for t in state.active_tasks if t.status == TaskStatus.COMPLETED]
            state.missed_tasks = [t for t in state.active_tasks if t.status == TaskStatus.MISSED]
            state.snoozed_tasks = [t for t in state.active_tasks if t.status == TaskStatus.SNOOZED]

            total = len(state.active_tasks)
            state.adherence_percentage = (
                round((len(state.completed_tasks) / total) * 100.0, 1) if total > 0 else 100.0
            )

            event = RecoveryEvent(
                event_id=f"evt_{uuid.uuid4().hex[:8]}",
                run_id=effective_run_id,
                patient_id=patient_id,
                event_type=event_type,
                task_id=task_id,
                status=target_task.status.value,
                value=msg,
                source="PATIENT",
                metadata={"task_title": target_task.title, "adherence": state.adherence_percentage},
                timestamp=datetime.utcnow()
            )

            state.recent_events.insert(0, event)
            state.last_updated = datetime.utcnow()
            return event, state

    def record_clinical_review(
        self,
        patient_id: str,
        ticket_id: str,
        clinician_name: str,
        action_notes: str,
        run_id: Optional[str] = None
    ) -> Tuple[RecoveryEvent, RecoveryState]:
        with self._lock:
            state = self.get_or_init_state(patient_id)
            effective_run_id = run_id or f"run_{uuid.uuid4().hex[:8]}"

            if not state.active_ticket or state.active_ticket.ticket_id != ticket_id:
                raise KeyError(f"Ticket '{ticket_id}' not found for patient '{patient_id}'.")

            state.active_ticket.status = TicketStatus.RESOLVED
            state.active_ticket.clinician_notes = f"Reviewed by {clinician_name}: {action_notes}"

            state.escalation_status = "RESOLVED"
            # De-escalate active risk level back to LOW/MODERATE after validated human review
            if state.risk_level in (RiskLevel.HIGH, RiskLevel.CRITICAL):
                state.risk_level = RiskLevel.MODERATE

            event = RecoveryEvent(
                event_id=f"evt_{uuid.uuid4().hex[:8]}",
                run_id=effective_run_id,
                patient_id=patient_id,
                event_type=RecoveryEventType.CLINICAL_REVIEW_COMPLETED,
                status="REVIEWED",
                value=f"Simulated Human Clinical Review completed by {clinician_name}. Notes: '{action_notes}'",
                source="CLINICIAN",
                metadata={"ticket_id": ticket_id, "clinician": clinician_name, "notes": action_notes},
                timestamp=datetime.utcnow()
            )

            state.recent_events.insert(0, event)
            state.last_updated = datetime.utcnow()
            return event, state

    def find_patient_by_ticket(self, ticket_id: str) -> Optional[str]:
        with self._lock:
            for pid, state in self._states.items():
                if state.active_ticket and state.active_ticket.ticket_id == ticket_id:
                    return pid
            return None

    def register_custom_patient(
        self,
        patient: PatientBase,
        discharge_profile: DischargeProfile,
        recovery_plan: RecoveryPlan,
        tasks: List[CareTask]
    ) -> RecoveryState:
        with self._lock:
            patient_id = patient.id
            raw_dataset = {
                "patient": patient.model_dump(mode="json"),
                "discharge_profile": discharge_profile.model_dump(mode="json"),
                "recovery_plan": recovery_plan.model_dump(mode="json"),
                "initial_care_tasks_day_2": [t.model_dump(mode="json") for t in tasks]
            }
            self._custom_patients[patient_id] = raw_dataset

            run_id = f"run_{uuid.uuid4().hex[:8]}"
            upload_event = RecoveryEvent(
                event_id=f"evt_{uuid.uuid4().hex[:8]}",
                run_id=run_id,
                patient_id=patient_id,
                event_type=RecoveryEventType.REMINDER_SENT,
                status="INITIALIZED",
                value=f"Discharge summary processed for {patient.first_name} {patient.last_name}. 4-phase recovery plan synthesized.",
                source="DISCHARGE_UNDERSTANDING_AGENT",
                timestamp=datetime.utcnow()
            )

            state = RecoveryState(
                patient_id=patient_id,
                current_phase=recovery_plan.current_phase,
                current_day=2,
                active_tasks=tasks,
                completed_tasks=[],
                missed_tasks=[],
                snoozed_tasks=[],
                adherence_percentage=0.0 if tasks else 100.0,
                recent_events=[upload_event],
                risk_level=RiskLevel.LOW,
                escalation_status="NONE",
                last_updated=datetime.utcnow()
            )
            self._states[patient_id] = state
            return state

    def register_raw_patient(self, patient_id: str, raw_dataset: Dict[str, Any]) -> None:
        with self._lock:
            self._custom_patients[patient_id] = raw_dataset

    def register_dynamic_patient(
        self,
        patient: PatientBase,
        discharge_profile: DischargeProfile,
        recovery_plan: RecoveryPlan,
        tasks: List[CareTask],
        events: List[RecoveryEvent],
    ) -> RecoveryState:
        with self._lock:
            patient_id = patient.id
            raw_dataset = {
                "patient": patient.model_dump(mode="json"),
                "discharge_profile": discharge_profile.model_dump(mode="json"),
                "recovery_plan": recovery_plan.model_dump(mode="json"),
                "initial_care_tasks_day_2": [t.model_dump(mode="json") for t in tasks]
            }
            self._custom_patients[patient_id] = raw_dataset

            completed = [t for t in tasks if t.status == TaskStatus.COMPLETED]
            missed = [t for t in tasks if t.status == TaskStatus.MISSED]
            snoozed = [t for t in tasks if t.status == TaskStatus.SNOOZED]

            total = len(tasks)
            adherence = (
                round((len(completed) / total) * 100.0, 1) if total > 0 else 100.0
            )

            state = RecoveryState(
                patient_id=patient_id,
                current_phase=recovery_plan.current_phase,
                current_day=2,
                active_tasks=tasks,
                completed_tasks=completed,
                missed_tasks=missed,
                snoozed_tasks=snoozed,
                adherence_percentage=adherence,
                recent_events=events,
                risk_level=RiskLevel.LOW,
                escalation_status="NONE",
                last_updated=datetime.utcnow()
            )
            self._states[patient_id] = state
            return state

    def list_all_patients(self) -> List[Dict[str, Any]]:
        with self._lock:
            results = []
            # Synthetic cohort
            for pid in DATA_FILES.keys():
                data = self._load_synthetic_file(pid)
                if data and "patient" in data:
                    p = dict(data["patient"])
                    p["is_demo"] = True
                    results.append(p)
            # Custom uploaded/created patients
            for data in self._custom_patients.values():
                if "patient" in data:
                    p = dict(data["patient"])
                    p["is_demo"] = False
                    results.append(p)
            return results


# Global singleton instance
session_store = SessionRecoveryStore()
