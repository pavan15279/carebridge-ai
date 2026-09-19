"""
CareBridge AI - Recovery Planning Agent

Translates a clinical DischargeProfile into a structured 30-day recovery plan
decomposed into standardized post-discharge recovery phases.
"""
import re
from typing import Any, Dict, List, Optional, Tuple, Union
from app.schemas.clinical import (
    CareTask,
    DischargeProfile,
    RecoveryMilestone,
    RecoveryPlan,
    TaskCategory,
    TaskStatus,
    TimingType,
)


def normalize_clock_time(time_str: str) -> Optional[str]:
    """Convert clock time formats ('5 PM', '9:00 AM', '17:00') to standardized 24-hour HH:MM."""
    time_str = time_str.strip().lower()
    m24 = re.match(r"^([01]?\d|2[0-3]):([0-5]\d)$", time_str)
    if m24:
        return f"{int(m24.group(1)):02d}:{m24.group(2)}"
    m12 = re.match(r"^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$", time_str)
    if m12:
        hours = int(m12.group(1))
        minutes = m12.group(2) or "00"
        period = m12.group(3)
        if period == "pm" and hours < 12:
            hours += 12
        elif period == "am" and hours == 12:
            hours = 0
        return f"{hours:02d}:{minutes}"
    return None


def extract_instruction_timing(text: Optional[str], default_label: str = "Daily") -> Tuple[str, TimingType]:
    """Derives timing strictly from documented instruction without inventing synthetic times."""
    if not text or "not specified" in text.lower():
        return default_label, TimingType.UNSPECIFIED

    text_lower = text.lower()
    # Check for explicit clock time
    clock_matches = re.findall(r"\b(\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)|\b(?:[01]?\d|2[0-3]):[0-5]\d)\b", text_lower)
    if clock_matches:
        for cm in clock_matches:
            nt = normalize_clock_time(cm)
            if nt:
                return nt, TimingType.CLOCK_TIME

    if "after breakfast" in text_lower:
        return "Morning (after breakfast)", TimingType.ROUTINE_WINDOW
    if "with breakfast" in text_lower:
        return "Morning (with breakfast)", TimingType.ROUTINE_WINDOW
    if "before breakfast" in text_lower:
        return "Morning (before breakfast)", TimingType.ROUTINE_WINDOW
    if "at bedtime" in text_lower or "before sleep" in text_lower or "bedtime" in text_lower:
        return "At bedtime", TimingType.ROUTINE_WINDOW
    if "after dinner" in text_lower or "with dinner" in text_lower or "evening" in text_lower:
        return "Evening", TimingType.ROUTINE_WINDOW
    if "after lunch" in text_lower or "with lunch" in text_lower or "midday" in text_lower or "noon" in text_lower:
        return "Midday", TimingType.ROUTINE_WINDOW
    if "morning" in text_lower:
        return "Morning", TimingType.ROUTINE_WINDOW
    if "once daily" in text_lower or "daily" in text_lower:
        return "Daily", TimingType.ROUTINE_WINDOW
    if "as needed" in text_lower or "prn" in text_lower:
        return "PRN (As needed)", TimingType.PRN_AS_NEEDED

    return default_label, TimingType.ROUTINE_WINDOW


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
        Never invents arbitrary clock times (such as 08:00, 08:30, 09:00, 12:00, 14:00, 16:00, 20:00).
        If multiple doses are documented (e.g. morning and night, twice daily), generates separate CareTasks.
        """
        if isinstance(profile, dict):
            profile = DischargeProfile.model_validate(profile)

        tasks: List[CareTask] = []
        task_idx = 1

        # 1. Medication tasks from profile
        for med in profile.medications:
            if med.is_discontinued:
                continue

            slots = med.schedule_slots if med.schedule_slots else ["As directed"]
            med_timing_type = med.timing_type or TimingType.ROUTINE_WINDOW
            doc_instr = med.documented_instruction or f"{med.drug_name} {med.dosage} {med.frequency}"

            if len(slots) > 1:
                # Multiple doses: create separate CareTasks for each dose
                for dose_idx, slot in enumerate(slots, 1):
                    slot_timing_type = med_timing_type
                    if re.match(r"^\d{1,2}:\d{2}$", slot):
                        slot_timing_type = TimingType.CLOCK_TIME

                    dose_label = slot if slot in ("Morning", "Night", "Evening", "Midday") else f"Dose {dose_idx}"
                    tasks.append(CareTask(
                        task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
                        patient_id=profile.patient_id,
                        day_number=day_number,
                        category=TaskCategory.MEDICATION,
                        title=f"Take {med.drug_name} ({med.dosage}) — {dose_label}",
                        description=f"{med.frequency}. {med.indication}.",
                        scheduled_time=slot,
                        timing_type=slot_timing_type,
                        documented_instruction=doc_instr
                    ))
                    task_idx += 1
            else:
                single_slot = slots[0]
                tasks.append(CareTask(
                    task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
                    patient_id=profile.patient_id,
                    day_number=day_number,
                    category=TaskCategory.MEDICATION,
                    title=f"Take {med.drug_name} ({med.dosage})",
                    description=f"{med.frequency}. {med.indication}.",
                    scheduled_time=single_slot,
                    timing_type=med_timing_type,
                    documented_instruction=doc_instr
                ))
                task_idx += 1

        # 2. Vital check task (grounded in daily routine, not fabricated clock time)
        tasks.append(CareTask(
            task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
            patient_id=profile.patient_id,
            day_number=day_number,
            category=TaskCategory.VITAL_CHECK,
            title="Log Resting Vitals & Temperature",
            description="Record body temperature, blood pressure, heart rate, and oxygen saturation.",
            scheduled_time="Morning",
            timing_type=TimingType.ROUTINE_WINDOW,
            documented_instruction="Record morning resting vitals and temperature"
        ))
        task_idx += 1

        # 3. Wound care / Incision check or general comfort check-in
        if (
            profile.wound_care_instructions
            and "no surgical" not in profile.wound_care_instructions.lower()
            and "not specified" not in profile.wound_care_instructions.lower()
        ):
            wound_time, wound_type = extract_instruction_timing(
                profile.wound_care_instructions,
                default_label="Daily wound inspection"
            )
            tasks.append(CareTask(
                task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
                patient_id=profile.patient_id,
                day_number=day_number,
                category=TaskCategory.WOUND_CARE,
                title="Inspect Incision & Wound Dressing",
                description=profile.wound_care_instructions,
                scheduled_time=wound_time,
                timing_type=wound_type,
                documented_instruction=profile.wound_care_instructions
            ))
            task_idx += 1
        else:
            tasks.append(CareTask(
                task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
                patient_id=profile.patient_id,
                day_number=day_number,
                category=TaskCategory.CHECK_IN,
                title="Recovery Comfort & Symptom Check-In",
                description="Evaluate pain control, breathing comfort, and monitor for red flag symptoms.",
                scheduled_time="Daily",
                timing_type=TimingType.ROUTINE_WINDOW,
                documented_instruction="Evaluate daily recovery comfort and report red flags"
            ))
            task_idx += 1

        # 4. Hydration & Diet Task (only if explicitly documented in discharge profile)
        if profile.dietary_instructions and "not specified" not in profile.dietary_instructions.lower():
            diet_time, diet_type = extract_instruction_timing(
                profile.dietary_instructions,
                default_label="Daily with meals"
            )
            tasks.append(CareTask(
                task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
                patient_id=profile.patient_id,
                day_number=day_number,
                category=TaskCategory.HYDRATION_DIET,
                title="Maintain Prescribed Dietary Guidelines",
                description=profile.dietary_instructions,
                scheduled_time=diet_time,
                timing_type=diet_type,
                documented_instruction=profile.dietary_instructions
            ))
            task_idx += 1

        # 5. Activity Precaution / Rest / Physical Therapy Task
        if profile.activity_restrictions and "not specified" not in profile.activity_restrictions.lower():
            act_text = profile.activity_restrictions
            act_lower = act_text.lower()
            if "twice daily" in act_lower or "2 times a day" in act_lower:
                tasks.append(CareTask(
                    task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
                    patient_id=profile.patient_id,
                    day_number=day_number,
                    category=TaskCategory.PHYSICAL_THERAPY,
                    title="Physical Mobility / Walking — Session 1",
                    description=act_text,
                    scheduled_time="Morning",
                    timing_type=TimingType.ROUTINE_WINDOW,
                    documented_instruction=act_text
                ))
                task_idx += 1
                tasks.append(CareTask(
                    task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
                    patient_id=profile.patient_id,
                    day_number=day_number,
                    category=TaskCategory.PHYSICAL_THERAPY,
                    title="Physical Mobility / Walking — Session 2",
                    description=act_text,
                    scheduled_time="Evening",
                    timing_type=TimingType.ROUTINE_WINDOW,
                    documented_instruction=act_text
                ))
                task_idx += 1
            else:
                act_time, act_type = extract_instruction_timing(act_text, default_label="Daily")
                tasks.append(CareTask(
                    task_id=f"TASK-{profile.patient_id}-D{day_number}-{task_idx:02d}",
                    patient_id=profile.patient_id,
                    day_number=day_number,
                    category=TaskCategory.PHYSICAL_THERAPY,
                    title="Observe Activity Restrictions & Mobility",
                    description=act_text,
                    scheduled_time=act_time,
                    timing_type=act_type,
                    documented_instruction=act_text
                ))
                task_idx += 1

        return tasks
