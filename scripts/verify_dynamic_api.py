"""
Live API Verification Script for CareBridge AI Dynamic Patient Onboarding
"""
import requests
import json

BASE_URL = "http://127.0.0.1:8000"

def test_live_api():
    print("=" * 60)
    print("Testing Live API: Dynamic Real Patient Onboarding")
    print("=" * 60)

    # 1. Health check
    h = requests.get(f"{BASE_URL}/api/v1/health")
    assert h.status_code == 200, f"Health check failed: {h.text}"
    print("[1] Backend Health: OK")

    # 2. List initial patients (must have 4 demo patients)
    pts = requests.get(f"{BASE_URL}/api/v1/patients").json()
    demo_ids = [p["id"] for p in pts]
    print(f"[2] Initial Patients: {demo_ids}")
    assert "PT-CABG-001" in demo_ids
    assert "PT-TKA-002" in demo_ids
    assert "PT-CHF-003" in demo_ids
    assert "PT-PNA-004" in demo_ids

    # 3. Create Dynamic Patient A: Ravi Kumar (no discharge summary)
    req_ravi = {
        "name": "Ravi Kumar",
        "age": 62,
        "gender": "Male",
        "primary_diagnosis": "Knee replacement recovery",
        "condition_category": "Orthopedic Recovery",
        "procedure": "Right Knee Arthroplasty",
        "physician_care_team": "Dr. Angela Thorne, MD (Orthopedics)",
        "contact": "555-0144",
        "emergency_contact": "Sunita Kumar (Spouse) - 555-0199"
    }
    r_ravi = requests.post(f"{BASE_URL}/api/v1/patients/create", json=req_ravi)
    assert r_ravi.status_code == 200, f"Create patient failed: {r_ravi.text}"
    ravi_data = r_ravi.json()
    ravi_id = ravi_data["patient"]["id"]
    assert ravi_id.startswith("PT-USER-"), f"Unexpected ID format: {ravi_id}"
    assert ravi_data["patient"]["first_name"] == "Ravi"
    assert ravi_data["patient"]["last_name"] == "Kumar"
    assert ravi_data["patient"]["age"] == 62
    assert ravi_data["patient"]["gender"] == "Male"
    assert len(ravi_data["recovery_state"]["active_tasks"]) == 4
    # Check no fabricated medications
    assert len(ravi_data["discharge_profile"]["medications"]) == 0
    print(f"[3] Created Dynamic Patient: {ravi_id} (Ravi Kumar, 62yo Male, Knee replacement recovery)")

    # 4. Create Dynamic Patient B: Maria Santos (with discharge summary)
    summary_maria = (
        "DISCHARGE SUMMARY\n"
        "Patient: Maria Santos\n"
        "Age: 58\n"
        "Gender: Female\n"
        "Discharge Date: 2026-09-18\n"
        "Primary Diagnosis: Laparoscopic Cholecystectomy Recovery\n"
        "Attending: Dr. Carlos Mendez, MD (General Surgery)\n"
        "Discharge Medications:\n"
        "- Acetaminophen 500mg PO TID PRN pain\n"
        "- Ondansetron 4mg PO Q8H PRN nausea\n"
        "Activity: Avoid lifting over 15 lbs for 2 weeks.\n"
        "Red Flags: Fever >= 101.5 F, severe abdominal swelling.\n"
    )
    req_maria = {
        "name": "Maria Santos",
        "age": 58,
        "gender": "Female",
        "primary_diagnosis": "Laparoscopic Cholecystectomy Recovery",
        "physician_care_team": "Dr. Carlos Mendez, MD (General Surgery)",
        "discharge_summary_text": summary_maria
    }
    r_maria = requests.post(f"{BASE_URL}/api/v1/patients/create", json=req_maria)
    assert r_maria.status_code == 200, f"Create patient failed: {r_maria.text}"
    maria_data = r_maria.json()
    maria_id = maria_data["patient"]["id"]
    assert maria_id.startswith("PT-USER-")
    assert maria_id != ravi_id
    assert len(maria_data["discharge_profile"]["medications"]) >= 2
    print(f"[4] Created Dynamic Patient with Discharge Summary: {maria_id} (Maria Santos, {len(maria_data['discharge_profile']['medications'])} meds)")

    # 5. Verify list endpoint contains demo patients and newly created patients with correct is_demo flag
    updated_pts = requests.get(f"{BASE_URL}/api/v1/patients").json()
    updated_ids = [p["id"] for p in updated_pts]
    assert ravi_id in updated_ids
    assert maria_id in updated_ids
    demo_p = next(p for p in updated_pts if p["id"] == "PT-CABG-001")
    ravi_p = next(p for p in updated_pts if p["id"] == ravi_id)
    assert demo_p.get("is_demo") is True
    assert ravi_p.get("is_demo") is False
    print(f"[5] List Patients Verified: {len(updated_pts)} total ({demo_p['id']} is_demo=True, {ravi_id} is_demo=False)")

    # 6. Verify Routine Workflow on Dynamic Patient (Ravi Kumar)
    wf_routine = requests.post(f"{BASE_URL}/api/v1/workflow/{ravi_id}")
    assert wf_routine.status_code == 200
    res_wf = wf_routine.json()
    assert res_wf["patient_id"] == ravi_id
    assert res_wf["patient_name"] == "Ravi Kumar"
    assert "Knee" in res_wf["primary_diagnosis"]
    print(f"[6] Routine Workflow for {ravi_id}: Status={res_wf['status']}, Tasks={res_wf['monitoring']['total_tasks']}")

    # 7. Verify Telemetry & Deterministic Safety Trigger on Dynamic Patient (Ravi Kumar Fever 101.8°F)
    fever_payload = {
        "patient_id": ravi_id,
        "symptom_description": "Feeling feverish and sweating; thermometer reads high.",
        "severity_score": 6,
        "measured_temp": 101.8
    }
    wf_fever = requests.post(f"{BASE_URL}/api/v1/workflow/{ravi_id}", json=fever_payload)
    assert wf_fever.status_code == 200
    res_fever = wf_fever.json()
    assert res_fever["workflow_route"] == "ESCALATION_COORDINATION_AGENT"
    assert res_fever["risk_assessment"]["risk_level"] == "HIGH"
    assert "RULE-VITAL-TEMP-HIGH" in res_fever["risk_assessment"]["deterministic_rule_triggered"]
    assert res_fever["escalation_ticket"] is not None
    assert res_fever["escalation_ticket"]["patient_id"] == ravi_id
    ticket_id = res_fever["escalation_ticket"]["ticket_id"]
    print(f"[7] Deterministic Safety Triggered on {ravi_id}: Risk=HIGH, Ticket={ticket_id}")

    # 8. Verify Human Clinical Review Loop on Dynamic Patient
    rev_payload = {
        "patient_id": ravi_id,
        "clinician_name": "Dr. Evelyn Reed, MD",
        "action_notes": "Reviewed temperature elevation. Advised hydration and clinical re-check in 2 hours."
    }
    r_rev = requests.post(f"{BASE_URL}/api/v1/escalations/{ticket_id}/review", json=rev_payload)
    assert r_rev.status_code == 200
    assert r_rev.json()["status"] == "REVIEWED"
    assert r_rev.json()["recovery_state"]["escalation_status"] == "RESOLVED"
    print(f"[8] Human Clinical Review completed for {ticket_id}: RESOLVED")

    # 9. Verify Chronological Timeline for Ravi Kumar
    tl_res = requests.get(f"{BASE_URL}/api/v1/patients/{ravi_id}/timeline")
    assert tl_res.status_code == 200
    events = tl_res.json()
    evt_types = [e["event_type"] for e in events]
    print(f"[9] Chronological Timeline for {ravi_id}: {evt_types}")
    assert "CLINICAL_REVIEW_COMPLETED" in evt_types
    assert "SAFETY_TRIGGERED" in evt_types
    assert "PATIENT_CREATED" in evt_types
    assert "RECOVERY_PLAN_CREATED" in evt_types

    # 10. Verify Strict Data Isolation
    tl_maria = requests.get(f"{BASE_URL}/api/v1/patients/{maria_id}/timeline").json()
    maria_evt_types = [e["event_type"] for e in tl_maria]
    assert "SAFETY_TRIGGERED" not in maria_evt_types, "Maria's timeline contaminated by Ravi's fever event!"
    assert "Cholecystectomy" in maria_data["discharge_profile"]["primary_diagnosis"]
    assert "Knee" not in maria_data["discharge_profile"]["primary_diagnosis"]
    print("[10] Strict Data Isolation Verified: 100% independent data sets.")

    print("\n" + "=" * 60)
    print(" ALL 10 LIVE API END-TO-END VERIFICATION CHECKS PASSED (100%)")
    print("=" * 60)

if __name__ == "__main__":
    test_live_api()
