"""
CareBridge AI: Automated Test Suite for Documented Discharge Reminders
Tests the 9 mandatory timing and grounding scenarios:
- TEST 1: Exact clock time ("Take medicine at 5 PM" -> "17:00", CLOCK_TIME)
- TEST 2: Routine window ("Take medicine with breakfast" -> contains "breakfast", ROUTINE_WINDOW, NO "08:00")
- TEST 3: Bedtime ("Take medicine at bedtime" -> "At bedtime", ROUTINE_WINDOW, NO "21:00")
- TEST 4: Multiple doses ("Take medicine morning and night" -> TWO medication CareTasks)
- TEST 5: Interval ("Take medicine every 8 hours" -> INTERVAL)
- TEST 6: PRN ("Take medicine as needed for pain" -> PRN_AS_NEEDED, no overdue alarm)
- TEST 7: Activity ("Walk for 15 minutes after breakfast every day" -> grounded in "after breakfast")
- TEST 8: Wound Care ("Inspect wound once daily" -> Daily wound care task)
- TEST 9: Unspecified ("Take prescribed tablet" -> No invented clock time)
"""
import os
import sys

# Add backend directory to sys.path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from app.schemas.clinical import TimingType, TaskCategory, DischargeProfile
from app.agents.discharge_understanding import DischargeUnderstandingAgent, parse_timing_from_instruction
from app.agents.recovery_planning import RecoveryPlanningAgent


def run_tests():
    print("=" * 65)
    print(" CareBridge AI - Documented Reminders & Timing Test Suite")
    print("=" * 65)

    discharge_agent = DischargeUnderstandingAgent()
    planning_agent = RecoveryPlanningAgent()

    # TEST 1: Explicit clock time
    print("\n[TEST 1] Explicit Clock Time: 'Take medicine at 5 PM.'")
    t1_type, t1_slots = parse_timing_from_instruction("Take medicine at 5 PM.")
    assert t1_type == TimingType.CLOCK_TIME, f"Expected CLOCK_TIME, got {t1_type}"
    assert "17:00" in t1_slots, f"Expected 17:00 in slots, got {t1_slots}"
    print(f"  [PASS] timing_type: {t1_type.value}, scheduled_time: {t1_slots[0]}")

    # TEST 2: Routine timing with breakfast (NO fabricated 08:00)
    print("\n[TEST 2] Routine Window: 'Take medicine with breakfast.'")
    t2_type, t2_slots = parse_timing_from_instruction("Take medicine with breakfast.")
    assert t2_type == TimingType.ROUTINE_WINDOW, f"Expected ROUTINE_WINDOW, got {t2_type}"
    assert "breakfast" in t2_slots[0].lower(), f"Expected 'breakfast' in scheduled_time, got {t2_slots[0]}"
    assert "08:00" not in t2_slots, f"Violation: Fabricated '08:00' found in {t2_slots}"
    print(f"  [PASS] timing_type: {t2_type.value}, scheduled_time: {t2_slots[0]} (Zero fabricated 08:00)")

    # TEST 3: Bedtime timing (NO fabricated 21:00)
    print("\n[TEST 3] Bedtime Timing: 'Take medicine at bedtime.'")
    t3_type, t3_slots = parse_timing_from_instruction("Take medicine at bedtime.")
    assert t3_type == TimingType.ROUTINE_WINDOW, f"Expected ROUTINE_WINDOW, got {t3_type}"
    assert "bedtime" in t3_slots[0].lower(), f"Expected bedtime in scheduled_time, got {t3_slots[0]}"
    assert "21:00" not in t3_slots, f"Violation: Fabricated '21:00' found in {t3_slots}"
    print(f"  [PASS] timing_type: {t3_type.value}, scheduled_time: {t3_slots[0]} (Zero fabricated 21:00)")

    # TEST 4: Multiple doses (Morning and Night -> TWO separate CareTasks)
    print("\n[TEST 4] Multiple Doses: 'Take medicine morning and night.'")
    raw_doc_4 = """
    Patient: John Doe
    Diagnosis: Post-CABG
    Medications:
    - Metoprolol 25 mg Oral morning and night
    """
    _, profile_4 = discharge_agent.parse_unstructured_text(raw_doc_4)
    tasks_4 = planning_agent.generate_initial_care_tasks(profile_4)
    med_tasks_4 = [t for t in tasks_4 if t.category == TaskCategory.MEDICATION]
    assert len(med_tasks_4) == 2, f"Expected 2 medication tasks for morning and night, got {len(med_tasks_4)}"
    assert any("Morning" in t.scheduled_time for t in med_tasks_4), "Missing Morning dose task"
    assert any("Night" in t.scheduled_time for t in med_tasks_4), "Missing Night dose task"
    print(f"  [PASS] Generated {len(med_tasks_4)} distinct medication tasks: {[t.title + ' -> ' + t.scheduled_time for t in med_tasks_4]}")

    # TEST 5: Interval-based timing ("every 8 hours")
    print("\n[TEST 5] Interval-based Timing: 'Take medicine every 8 hours.'")
    t5_type, t5_slots = parse_timing_from_instruction("Take medicine every 8 hours.")
    assert t5_type == TimingType.INTERVAL, f"Expected INTERVAL, got {t5_type}"
    assert "every 8 hours" in t5_slots[0].lower(), f"Expected 'Every 8 hours' in slot, got {t5_slots[0]}"
    print(f"  [PASS] timing_type: {t5_type.value}, scheduled_time: {t5_slots[0]}")

    # TEST 6: PRN / As Needed ("as needed for pain")
    print("\n[TEST 6] PRN / As Needed: 'Take medicine as needed for pain.'")
    t6_type, t6_slots = parse_timing_from_instruction("Take medicine as needed for pain.")
    assert t6_type == TimingType.PRN_AS_NEEDED, f"Expected PRN_AS_NEEDED, got {t6_type}"
    assert "prn" in t6_slots[0].lower() or "as needed" in t6_slots[0].lower()
    print(f"  [PASS] timing_type: {t6_type.value}, scheduled_time: {t6_slots[0]}")

    # TEST 7: Recovery activity grounded in "after breakfast"
    print("\n[TEST 7] Activity Grounding: 'Walk for 15 minutes after breakfast every day.'")
    raw_doc_7 = """
    Patient: Jane Smith
    Diagnosis: Post-op Knee
    Activity: Walk for 15 minutes after breakfast every day.
    """
    _, profile_7 = discharge_agent.parse_unstructured_text(raw_doc_7)
    tasks_7 = planning_agent.generate_initial_care_tasks(profile_7)
    act_tasks_7 = [t for t in tasks_7 if t.category == TaskCategory.PHYSICAL_THERAPY]
    assert len(act_tasks_7) > 0, "Expected at least 1 physical therapy task"
    assert "after breakfast" in act_tasks_7[0].scheduled_time.lower(), f"Expected 'after breakfast' in scheduled_time, got {act_tasks_7[0].scheduled_time}"
    assert act_tasks_7[0].timing_type == TimingType.ROUTINE_WINDOW
    print(f"  [PASS] Activity task: '{act_tasks_7[0].title}' -> scheduled_time: '{act_tasks_7[0].scheduled_time}'")

    # TEST 8: Wound care task grounded in "once daily"
    print("\n[TEST 8] Wound Care Grounding: 'Inspect wound once daily.'")
    raw_doc_8 = """
    Patient: Alice Brown
    Diagnosis: Post-op Laparoscopy
    Wound Care: Inspect wound once daily for redness or swelling.
    """
    _, profile_8 = discharge_agent.parse_unstructured_text(raw_doc_8)
    tasks_8 = planning_agent.generate_initial_care_tasks(profile_8)
    wound_tasks_8 = [t for t in tasks_8 if t.category == TaskCategory.WOUND_CARE]
    assert len(wound_tasks_8) > 0, "Expected at least 1 wound care task"
    assert "daily" in wound_tasks_8[0].scheduled_time.lower(), f"Expected 'Daily' in scheduled_time, got {wound_tasks_8[0].scheduled_time}"
    print(f"  [PASS] Wound care task: '{wound_tasks_8[0].title}' -> scheduled_time: '{wound_tasks_8[0].scheduled_time}'")

    # TEST 9: Unspecified timing ("Take prescribed tablet.")
    print("\n[TEST 9] Unspecified Timing: 'Take prescribed tablet.'")
    t9_type, t9_slots = parse_timing_from_instruction("Take prescribed tablet.")
    assert t9_type == TimingType.UNSPECIFIED, f"Expected UNSPECIFIED, got {t9_type}"
    assert not any(c in t9_slots[0] for c in [":", "08", "09", "12", "14", "16", "20"]), f"Invented clock time found in {t9_slots}"
    print(f"  [PASS] timing_type: {t9_type.value}, scheduled_time: '{t9_slots[0]}' (Zero invented clock times)")

    print("\n" + "=" * 65)
    print(" ALL 9 MANDATORY GROUNDED REMINDER TESTS PASSED SUCCESSFULLY (100%)")
    print("=" * 65)


if __name__ == "__main__":
    run_tests()
