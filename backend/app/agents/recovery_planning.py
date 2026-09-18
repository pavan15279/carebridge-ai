"""
CareBridge AI - Recovery Planning Agent

Translates a clinical DischargeProfile into a structured 30-day recovery plan
decomposed into standardized post-discharge recovery phases.
"""
from typing import Any, Dict, List, Union
from app.schemas.clinical import DischargeProfile, RecoveryMilestone, RecoveryPlan


class RecoveryPlanningAgent:
    """Agent responsible for synthesizing recovery milestones and phase roadmaps."""

    def __init__(self) -> None:
        self.name = "Recovery Planning Agent"

    def run(
        self,
        profile: Union[DischargeProfile, Dict[str, Any]],
        current_day: int = 1
    ) -> RecoveryPlan:
        """
        Generate a 30-day recovery plan based on the patient's discharge profile.

        Standardized recovery phases:
          - Days 1-3: Acute Recovery & Rest
          - Days 4-7: Early Mobility & Wound Check
          - Days 8-14: Progressive Rehabilitation
          - Days 15-30: Long-Term Independence & Adherence
        """
        if isinstance(profile, dict):
            profile = DischargeProfile.model_validate(profile)

        # Determine current phase based on recovery day
        if current_day <= 3:
            current_phase = "Phase 1: Acute Recovery (Days 1-3)"
        elif current_day <= 7:
            current_phase = "Phase 2: Early Mobility & Wound Check (Days 4-7)"
        elif current_day <= 14:
            current_phase = "Phase 3: Progressive Rehabilitation (Days 8-14)"
        else:
            current_phase = "Phase 4: Long-Term Independence (Days 15-30)"

        first_appointment_provider = (
            profile.follow_up_appointments[0].provider
            if profile.follow_up_appointments
            else "your care team"
        )

        milestones: List[RecoveryMilestone] = [
            RecoveryMilestone(
                day=3,
                title="Acute Stabilization (Days 1-3)",
                description=(
                    f"Establish resting vitals baseline, maintain pain control, and strictly follow precautions: "
                    f"'{profile.activity_restrictions}'."
                )
            ),
            RecoveryMilestone(
                day=7,
                title="Early Mobility & Wound Inspection (Days 4-7)",
                description=(
                    f"Assess wound healing: '{profile.wound_care_instructions or 'Inspect daily for redness, warmth, or drainage'}'. "
                    f"Maintain prescribed diet: '{profile.dietary_instructions}'."
                )
            ),
            RecoveryMilestone(
                day=14,
                title="Progressive Rehabilitation (Days 8-14)",
                description=(
                    f"Gradually advance mobility and compile adherence logs for follow-up review with {first_appointment_provider}."
                )
            ),
            RecoveryMilestone(
                day=30,
                title="Independence & Long-Term Adherence (Days 15-30)",
                description="Achieve functional recovery milestones and sustain independent long-term medication adherence."
            )
        ]

        return RecoveryPlan(
            plan_id=f"PLAN-{profile.patient_id}",
            patient_id=profile.patient_id,
            duration_days=30,
            current_phase=current_phase,
            milestones=milestones
        )
