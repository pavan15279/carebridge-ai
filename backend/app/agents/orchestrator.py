"""
CareBridge AI - Agent Orchestrator

Central workflow coordinator presiding over the 6 specialized AI agents
and enforcing deterministic clinical safety engine evaluation.
"""
import json
from pathlib import Path
from typing import Any, Dict, Optional, Union

from app.core.config import settings
from app.core.safety_rules import RiskLevel
from app.schemas.clinical import (
    ChatMessageResponse,
    DischargeProfile,
    EscalationTicket,
    RecoveryPlan,
    RiskAssessment,
    SymptomReport,
)
from app.agents.discharge_understanding import DischargeUnderstandingAgent
from app.agents.recovery_planning import RecoveryPlanningAgent
from app.agents.monitoring import MonitoringAgent
from app.agents.risk_reasoning import RiskReasoningAgent
from app.agents.followup import FollowUpAgent
from app.agents.escalation_coordination import EscalationCoordinationAgent


DATA_FILES: Dict[str, str] = {
    "PT-CABG-001": "cabg_patient.json",
    "PT-TKA-002": "tka_patient.json",
    "PT-CHF-003": "chf_patient.json",
    "PT-PNA-004": "pneumonia_patient.json",
}


class CareBridgeOrchestrator:
    """
    Central workflow coordinator for CareBridge AI.

    Coordinates the execution:
      Discharge Understanding
              ↓
      Recovery Planning
              ↓
         Monitoring
              ↓
      Deterministic Safety Engine / Risk Reasoning
              ↓
      Follow-Up Agent (Low/Moderate) OR Escalation Agent (High/Critical)
    """

    def __init__(self) -> None:
        self.name = "CareBridge Orchestrator"
        self.discharge_agent = DischargeUnderstandingAgent()
        self.planning_agent = RecoveryPlanningAgent()
        self.monitoring_agent = MonitoringAgent()
        self.risk_agent = RiskReasoningAgent()
        self.followup_agent = FollowUpAgent()
        self.escalation_agent = EscalationCoordinationAgent()

    @staticmethod
    def load_patient_data(patient_id: str) -> Dict[str, Any]:
        """Load synthetic patient dataset from disk."""
        filename = DATA_FILES.get(patient_id)
        if not filename:
            raise ValueError(f"Unknown patient ID '{patient_id}'. Available: {list(DATA_FILES.keys())}")
        filepath = settings.DATA_DIR / filename
        if not filepath.exists():
            raise FileNotFoundError(f"Synthetic data file '{filename}' not found in {settings.DATA_DIR}")
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)

    def run_patient_workflow(
        self,
        patient_id: str,
        symptom_report: Optional[Union[SymptomReport, Dict[str, Any]]] = None,
        current_day: int = 2
    ) -> Dict[str, Any]:
        """
        Execute the complete post-discharge coordination workflow for a patient.

        Workflow steps:
        1. Discharge Understanding Agent converts raw discharge data to DischargeProfile.
        2. Recovery Planning Agent generates a 30-day milestone RecoveryPlan.
        3. Monitoring Agent computes adherence across scheduled care tasks.
        4. If symptom_report is provided:
           a. Risk Reasoning Agent evaluates deterministic safety rules and clinical risk.
           b. If risk is HIGH or CRITICAL: Escalation Coordination Agent creates SBAR ticket.
           c. If risk is LOW or MODERATE: Follow-Up Agent generates patient reassurance.
        """
        raw_data = self.load_patient_data(patient_id)
        patient_info = raw_data["patient"]
        patient_name = f"{patient_info['first_name']} {patient_info['last_name']}"

        # Step 1: Discharge Understanding Agent
        discharge_profile: DischargeProfile = self.discharge_agent.run(raw_data["discharge_profile"])

        # Step 2: Recovery Planning Agent
        recovery_plan: RecoveryPlan = self.planning_agent.run(discharge_profile, current_day=current_day)

        # Step 3: Monitoring Agent
        day_tasks = raw_data.get(f"initial_care_tasks_day_{current_day}", raw_data.get("initial_care_tasks_day_2", []))
        monitoring_summary = self.monitoring_agent.run(day_tasks, patient_id=patient_id)

        # Step 4: Safety & Risk Reasoning (if symptom reported)
        risk_assessment: Optional[RiskAssessment] = None
        escalation_ticket: Optional[EscalationTicket] = None
        followup_response: Optional[ChatMessageResponse] = None
        routed_to: Optional[str] = None

        if symptom_report is not None:
            if isinstance(symptom_report, dict):
                symptom_report = SymptomReport.model_validate(symptom_report)

            # Risk Reasoning Agent ALWAYS executes ClinicalSafetyEngine first
            risk_assessment = self.risk_agent.run(symptom_report, profile=discharge_profile)

            if risk_assessment.risk_level in (RiskLevel.HIGH, RiskLevel.CRITICAL):
                # Step 5A: Escalation Coordination Agent
                escalation_ticket = self.escalation_agent.run(
                    assessment=risk_assessment,
                    patient_name=patient_name,
                    patient_id=patient_id
                )
                routed_to = "ESCALATION_COORDINATION_AGENT"
            else:
                # Step 5B: Follow-Up Agent
                followup_response = self.followup_agent.run(
                    assessment=risk_assessment,
                    profile=discharge_profile,
                    patient_message=symptom_report.symptom_description
                )
                routed_to = "FOLLOW_UP_AGENT"

        return {
            "patient_id": patient_id,
            "patient_name": patient_name,
            "primary_diagnosis": discharge_profile.primary_diagnosis,
            "discharge_profile": discharge_profile.model_dump(mode="json"),
            "recovery_plan": recovery_plan.model_dump(mode="json"),
            "monitoring": monitoring_summary,
            "symptom_report": symptom_report.model_dump(mode="json") if symptom_report else None,
            "risk_assessment": risk_assessment.model_dump(mode="json") if risk_assessment else None,
            "escalation_ticket": escalation_ticket.model_dump(mode="json") if escalation_ticket else None,
            "followup_response": followup_response.model_dump(mode="json") if followup_response else None,
            "workflow_route": routed_to,
            "status": "COMPLETED"
        }
