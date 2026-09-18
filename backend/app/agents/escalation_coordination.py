"""
CareBridge AI - Escalation Coordination Agent

Generates standardized SBAR clinical notes and escalation tickets
for healthcare teams when high or critical risks are detected.
"""
from datetime import datetime
from typing import Optional
from app.schemas.clinical import EscalationTicket, RiskAssessment, SbarNote, TicketStatus


class EscalationCoordinationAgent:
    """Agent responsible for healthcare-team escalation and draft SBAR synthesis."""

    def __init__(self) -> None:
        self.name = "Escalation Coordination Agent"

    def run(
        self,
        assessment: RiskAssessment,
        patient_name: str = "Patient",
        patient_id: Optional[str] = None
    ) -> EscalationTicket:
        """
        Create a structured escalation ticket with draft SBAR note for clinical review.

        Clearly indicates that human clinical review is required before any intervention.
        Does not prescribe medication or modify treatment plans.
        """
        effective_patient_id = patient_id or assessment.patient_id

        # Use existing SBAR from risk assessment or construct structured note
        if assessment.sbar:
            sbar = assessment.sbar
        else:
            sbar = SbarNote(
                situation=f"Clinical alert for patient {effective_patient_id} ({patient_name}). Risk level: {assessment.risk_level}.",
                background=f"Rule triggered: {assessment.deterministic_rule_triggered or 'Clinical threshold exceeded'}.",
                assessment=assessment.clinical_reasoning,
                recommendation="Urgent healthcare team outreach and clinical symptom validation required."
            )

        ticket_id = f"TICK-{effective_patient_id}-{int(datetime.utcnow().timestamp())}"

        return EscalationTicket(
            ticket_id=ticket_id,
            patient_id=effective_patient_id,
            patient_name=patient_name,
            risk_level=assessment.risk_level,
            triggered_rule=assessment.deterministic_rule_triggered,
            sbar=sbar,
            status=TicketStatus.OPEN,
            clinician_notes="AI-GENERATED DRAFT — REQUIRES HEALTHCARE PROFESSIONAL CLINICAL REVIEW AND VALIDATION BEFORE ACTION",
            created_at=datetime.utcnow()
        )
