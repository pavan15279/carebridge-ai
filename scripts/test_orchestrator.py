"""
CareBridge AI - Agent Orchestrator Verification Script

Tests the central CareBridgeOrchestrator and all 6 specialized clinical agents
across synthetic post-discharge patient cases:
  1. Routine Post-Discharge Recovery (No symptoms)
  2. Mild / Expected Recovery Symptoms (Routes to Follow-Up Agent)
  3. High-Risk Surgical Site Infection (Deterministic Safety Engine -> Escalation Agent)
  4. Critical-Risk Chest Distress (Deterministic Safety Engine -> Escalation Agent)
"""
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.schemas.clinical import SymptomReport, RiskLevel
from app.agents import CareBridgeOrchestrator


def run_orchestrator_tests() -> bool:
    print("=" * 65)
    print(" CareBridge AI - Multi-Agent Orchestrator Test Suite")
    print("=" * 65)

    orchestrator = CareBridgeOrchestrator()

    # --- Scenario 1: Routine Recovery (No Acute Symptoms) ---
    print("\n[TEST 1] Routine Recovery Check (PT-CABG-001 - James Harrison)")
    res1 = orchestrator.run_patient_workflow("PT-CABG-001", symptom_report=None)
    assert res1["status"] == "COMPLETED"
    assert res1["discharge_profile"] is not None
    assert res1["recovery_plan"]["duration_days"] == 30
    assert len(res1["recovery_plan"]["milestones"]) == 4
    assert res1["monitoring"]["adherence_percentage"] > 0
    assert res1["workflow_route"] is None
    print(f"  [PASS] Discharge Profile Loaded: {res1['primary_diagnosis']}")
    print(f"  [PASS] 30-Day Plan Synthesized: {res1['recovery_plan']['current_phase']}")
    print(f"  [PASS] Task Monitoring: {res1['monitoring']['adherence_percentage']}% adherence "
          f"({res1['monitoring']['completed_count']}/{res1['monitoring']['total_tasks']} tasks)")

    # --- Scenario 2: Mild / Moderate Symptoms (Follow-Up Route) ---
    print("\n[TEST 2] Mild Expected Symptoms (PT-TKA-002 - Elena Rostova)")
    mild_report = SymptomReport(
        patient_id="PT-TKA-002",
        symptom_description="Slight knee stiffness after completing morning exercises, no swelling.",
        severity_score=3,
        measured_temp=98.4
    )
    res2 = orchestrator.run_patient_workflow("PT-TKA-002", symptom_report=mild_report)
    assert res2["workflow_route"] == "FOLLOW_UP_AGENT"
    assert res2["risk_assessment"]["risk_level"] == RiskLevel.LOW
    assert res2["followup_response"] is not None
    assert "CareBridge AI" in res2["followup_response"]["disclaimer"]
    print(f"  [PASS] Deterministic Rules: No violation (Severity 3/10)")
    print(f"  [PASS] Risk Assessment: {res2['risk_assessment']['risk_level']}")
    print(f"  [PASS] Routed To: {res2['workflow_route']}")
    print(f"  [PASS] Patient Guidance: {res2['followup_response']['reply'][:90]}...")

    # --- Scenario 3: High-Risk Post-Op Fever (Deterministic Safety Trigger) ---
    print("\n[TEST 3] High-Risk Post-Op Fever (PT-CABG-001 - James Harrison)")
    fever_report = SymptomReport(
        patient_id="PT-CABG-001",
        symptom_description="Incision line is red, warm to touch, and I feel feverish.",
        severity_score=7,
        measured_temp=101.9
    )
    res3 = orchestrator.run_patient_workflow("PT-CABG-001", symptom_report=fever_report)
    assert res3["workflow_route"] == "ESCALATION_COORDINATION_AGENT"
    assert res3["risk_assessment"]["risk_level"] == RiskLevel.HIGH
    assert "RULE-VITAL-TEMP-HIGH" in res3["risk_assessment"]["deterministic_rule_triggered"]
    assert res3["escalation_ticket"] is not None
    assert res3["escalation_ticket"]["sbar"] is not None
    print(f"  [PASS] Safety Engine Triggered: {res3['risk_assessment']['deterministic_rule_triggered']}")
    print(f"  [PASS] Risk Clamped To: {res3['risk_assessment']['risk_level']}")
    print(f"  [PASS] Routed To: {res3['workflow_route']}")
    print(f"  [PASS] Escalation Ticket Created: {res3['escalation_ticket']['ticket_id']}")
    print(f"  [PASS] SBAR Situation: {res3['escalation_ticket']['sbar']['situation']}")

    # --- Scenario 4: Critical-Risk Chest Pain (Immediate 911 / Escalation Trigger) ---
    print("\n[TEST 4] Critical Red-Flag Emergency (PT-CHF-003 - Marcus Vance)")
    chest_report = SymptomReport(
        patient_id="PT-CHF-003",
        symptom_description="Sudden crushing chest pain and severe shortness of breath.",
        severity_score=9
    )
    res4 = orchestrator.run_patient_workflow("PT-CHF-003", symptom_report=chest_report)
    assert res4["workflow_route"] == "ESCALATION_COORDINATION_AGENT"
    assert res4["risk_assessment"]["risk_level"] == RiskLevel.CRITICAL
    assert "RULE-SYMP-CHEST-PAIN" in res4["risk_assessment"]["deterministic_rule_triggered"]
    assert res4["escalation_ticket"]["risk_level"] == RiskLevel.CRITICAL
    print(f"  [PASS] Safety Engine Triggered: {res4['risk_assessment']['deterministic_rule_triggered']}")
    print(f"  [PASS] Risk Clamped To: {res4['risk_assessment']['risk_level']}")
    print(f"  [PASS] Routed To: {res4['workflow_route']}")
    print(f"  [PASS] Emergency Directive: {res4['risk_assessment']['immediate_patient_directive']}")

    print("\n" + "=" * 65)
    print(" ALL ORCHESTRATOR & AGENT TESTS PASSED SUCCESSFULLY (100%)")
    print("=" * 65)
    return True


if __name__ == "__main__":
    success = run_orchestrator_tests()
    sys.exit(0 if success else 1)
