"""
CareBridge AI - Follow-Up Agent

Generates empathetic, non-diagnostic recovery companion responses
grounded strictly in the patient's discharge paperwork.
"""
from typing import Any, Dict, Optional, Union
from app.core.config import settings
from app.schemas.clinical import ChatMessageResponse, DischargeProfile, RiskAssessment


class FollowUpAgent:
    """Agent responsible for low/moderate risk patient guidance and reassurance."""

    def __init__(self) -> None:
        self.name = "Follow-Up Agent"

    def run(
        self,
        assessment: RiskAssessment,
        profile: Union[DischargeProfile, Dict[str, Any]],
        patient_message: Optional[str] = None
    ) -> ChatMessageResponse:
        """
        Generate a patient-friendly response grounded in the discharge profile.
        Always includes the mandatory medical disclaimer.
        """
        if isinstance(profile, dict):
            profile = DischargeProfile.model_validate(profile)

        follow_up_contact = (
            f"{profile.follow_up_appointments[0].provider} at {profile.follow_up_appointments[0].contact_number}"
            if profile.follow_up_appointments
            else "your clinic"
        )

        if patient_message:
            reply_msg = (
                f"Thank you for reaching out. Based on your discharge instructions for {profile.primary_diagnosis}, "
                f"please keep in mind: '{profile.activity_restrictions}'. "
                f"For dietary management, continue adhering to: '{profile.dietary_instructions}'. "
                f"If you have ongoing concerns, please contact {follow_up_contact}."
            )
        else:
            reply_msg = (
                f"Your reported symptoms appear consistent with expected recovery from {profile.primary_diagnosis}. "
                f"Continue observing your precautions: '{profile.activity_restrictions}'. "
                f"Take medications on schedule and rest comfortably. Contact {follow_up_contact} if symptoms change."
            )

        return ChatMessageResponse(
            reply=reply_msg,
            risk_level=assessment.risk_level,
            suggested_action="Continue daily care checklist and monitoring",
            disclaimer=settings.MANDATORY_DISCLAIMER
        )
