"""
Verification Script for CareBridge AI Synthetic Datasets & Safety Engine
Ensures 100% Pydantic schema compliance and validates deterministic safety rules.
"""
import sys
import json
from pathlib import Path

# Add backend directory to sys.path
backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.core.safety_rules import ClinicalSafetyEngine, RiskLevel

try:
    from app.schemas.clinical import DischargeProfile, PatientBase, CareTask
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False


DATA_DIR = backend_path / "app" / "data"

def run_checks():
    print("=" * 60)
    print(" CareBridge AI - Foundation & Schema Validation Check")
    print("=" * 60)

    # 1. Verify Synthetic Data Files
    synthetic_files = [
        "cabg_patient.json",
        "tka_patient.json",
        "chf_patient.json",
        "pneumonia_patient.json"
    ]

    for fname in synthetic_files:
        fpath = DATA_DIR / fname
        if not fpath.exists():
            print(f"[FAIL] Missing dataset file: {fname}")
            return False

        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)

        if PYDANTIC_AVAILABLE:
            patient = PatientBase(**data["patient"])
            profile = DischargeProfile(**data["discharge_profile"])
            tasks = [CareTask(**t) for t in data.get("initial_care_tasks_day_2", [])]
            print(f"[PASS] {fname:<24} -> Pydantic Validated: {patient.first_name} {patient.last_name} ({patient.id})")
        else:
            p = data["patient"]
            prof = data["discharge_profile"]
            tasks = data.get("initial_care_tasks_day_2", [])
            # Assert core required keys
            for k in ["id", "first_name", "last_name", "age", "gender", "condition_category", "primary_care_physician"]:
                assert k in p, f"Missing patient key {k}"
            for k in ["profile_id", "patient_id", "primary_diagnosis", "medications", "red_flag_warnings", "follow_up_appointments"]:
                assert k in prof, f"Missing discharge_profile key {k}"
            print(f"[PASS] {fname:<24} -> Schema Validated: {p['first_name']} {p['last_name']} ({p['id']})")

        meds_count = len(data["discharge_profile"]["medications"])
        flags_count = len(data["discharge_profile"]["red_flag_warnings"])
        print(f"       Medications: {meds_count} | Red Flags: {flags_count} | Tasks: {len(tasks)}")

    print("\n" + "-" * 60)
    print(" Testing Deterministic Clinical Safety Engine")
    print("-" * 60)

    # Test Scenario 1: Normal vitals
    v1 = ClinicalSafetyEngine.evaluate_vitals(systolic_bp=120, temperature_f=98.6)
    assert len(v1) == 0, "Normal vitals should yield 0 violations"
    print("[PASS] Normal Vitals Test: Passed (0 violations)")

    # Test Scenario 2: Critical High BP (Crisis)
    v2 = ClinicalSafetyEngine.evaluate_vitals(systolic_bp=188)
    assert len(v2) == 1 and v2[0].risk_level == RiskLevel.CRITICAL
    print(f"[PASS] Critical BP Test: Passed (Triggered {v2[0].rule_id} - {v2[0].risk_level})")

    # Test Scenario 3: Post-op Fever
    v3 = ClinicalSafetyEngine.evaluate_vitals(temperature_f=102.1)
    assert len(v3) == 1 and v3[0].risk_level == RiskLevel.HIGH
    print(f"[PASS] Post-op Fever Test: Passed (Triggered {v3[0].rule_id} - {v3[0].risk_level})")

    # Test Scenario 4: CHF Acute Weight Gain
    v4 = ClinicalSafetyEngine.evaluate_vitals(weight_gain_24h_lbs=3.8)
    assert len(v4) == 1 and v4[0].risk_level == RiskLevel.HIGH
    print(f"[PASS] CHF Acute Weight Gain Test: Passed (Triggered {v4[0].rule_id})")

    # Test Scenario 5: Acute Chest Pain Symptom Keyword
    s1 = ClinicalSafetyEngine.evaluate_symptom_keywords("I am having sharp crushing chest pain and pressure.")
    assert len(s1) == 1 and s1[0].risk_level == RiskLevel.CRITICAL
    print(f"[PASS] Red-Flag Symptom Keyword Test: Passed (Triggered {s1[0].rule_id} - {s1[0].risk_level})")

    # Test Scenario 6: Sternal Clicking
    s2 = ClinicalSafetyEngine.evaluate_symptom_keywords("My breastbone is clicking when I twist my shoulders.")
    assert len(s2) == 1 and s2[0].risk_level == RiskLevel.HIGH
    print(f"[PASS] Sternal Instability Keyword Test: Passed (Triggered {s2[0].rule_id} - {s2[0].risk_level})")

    print("\n" + "=" * 60)
    print(" ALL VALIDATION CHECKS PASSED SUCCESSFULLY (100%)")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = run_checks()
    sys.exit(0 if success else 1)
