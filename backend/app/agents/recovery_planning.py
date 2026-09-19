"""
CareBridge AI - Recovery Planning Agent

Translates a clinical DischargeProfile into a structured 30-day recovery plan
decomposed into standardized post-discharge recovery phases.
"""
from typing import Any, Dict, List, Union
from app.schemas.clinical import (
    CareTask,
    DischargeProfile,
    RecoveryMilestone,
    RecoveryPlan,
    TaskCategory,
    TaskStatus,
)


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

    def generate_initial_care_tasks(
        self,
        profile: Union[DischargeProfile, Dict[str, Any]],
        day_number: int = 2
    ) -> List[CareTask]:
        """
        Synthesizes day-specific atomic care tasks grounded strictly in the DischargeProfile.
        Does not invent unsupported clinical treatments.
        """
        if isinstance(profile, dict):
            profile = DischargeProfile.model_validate(profile)

        tasks: List[CareTask] = []
        task_idx = 1

        # 1. Medication tasks from profile
        for med in profile.medications:
            slot = med.schedule_slots[0] if med.schedule_slots else "09:00"
            tasks.append(CareTask(
                task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
                patient_id=profile.patient_id,
                day_number=day_number,
                category=TaskCategory.MEDICATION,
                title=f"Take {med.drug_name} ({med.dosage})",
                description=f"{med.frequency}. {med.indication}.",
                scheduled_time=slot
            ))
            task_idx += 1

        # 2. Vital check task
        tasks.append(CareTask(
            task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
            patient_id=profile.patient_id,
            day_number=day_number,
            category=TaskCategory.VITAL_CHECK,
            title="Log Morning Resting Vitals",
            description="Record body temperature, blood pressure, heart rate, and oxygen saturation.",
            scheduled_time="08:30"
        ))
        task_idx += 1

        # 3. Wound care / Incision check or general symptom check
        if profile.wound_care_instructions and "no surgical" not in profile.wound_care_instructions.lower():
            tasks.append(CareTask(
                task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
                patient_id=profile.patient_id,
                day_number=day_number,
                category=TaskCategory.WOUND_CARE,
                title="Inspect Incision & Wound Dressing",
                description=profile.wound_care_instructions,
                scheduled_time="12:00"
            ))
        else:
            tasks.append(CareTask(
                task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
                patient_id=profile.patient_id,
                day_number=day_number,
                category=TaskCategory.CHECK_IN,
                title="Midday Recovery & Comfort Check-In",
                description="Evaluate pain control, breathing comfort, and monitor for red flag symptoms.",
                scheduled_time="12:00"
            ))
        task_idx += 1

        # 4. Hydration & Diet Task (only if explicitly documented in discharge profile)
        if profile.dietary_instructions and "not specified" not in profile.dietary_instructions.lower():
            tasks.append(CareTask(
                task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
                patient_id=profile.patient_id,
                day_number=day_number,
                category=TaskCategory.HYDRATION_DIET,
                title="Maintain Prescribed Dietary Guidelines",
                description=profile.dietary_instructions,
                scheduled_time="14:00"
            ))
            task_idx += 1

        # 5. Activity Precaution / Rest Task (only if explicitly documented in discharge profile)
        if profile.activity_restrictions and "not specified" not in profile.activity_restrictions.lower():
            tasks.append(CareTask(
                task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
                patient_id=profile.patient_id,
                day_number=day_number,
                category=TaskCategory.PHYSICAL_THERAPY,
                title="Observe Activity Restrictions & Mobility Pacing",
                description=profile.activity_restrictions,
                scheduled_time="16:00"
            ))

        return tasks
