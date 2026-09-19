"""
CareBridge AI - Multi-Agent Orchestrator & Safety Verification Script

Tests the CareBridge Orchestrator, all 6 specialized clinical agents,
deterministic safety rules, patient data isolation, PDF text extraction,
and strict non-hallucination guardrails across synthetic patient cases.
"""
import base64
import io
import sys
from pathlib import Path
import pypdf

# Add backend directory to sys.path
backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.schemas.clinical import (
    SymptomReport,
    RiskLevel,
    CreatePatientRequest,
    DischargeUploadRequest
)
from app.agents import CareBridgeOrchestrator
from app.agents.discharge_understanding import DischargeUnderstandingAgent
from app.core.session_store import session_store
from app.core.pdf_extractor import extract_discharge_text, ERROR_UNREADABLE_PDF
from app.core.safety_rules import ClinicalSafetyEngine


def run_orchestrator_tests() -> bool:
    print("=" * 65)
    print(" CareBridge AI - Multi-Agent Orchestrator & Safety Test Suite")
    print("=" * 65)

    orchestrator = CareBridgeOrchestrator()
    discharge_agent = DischargeUnderstandingAgent()

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
    # Verify non-diagnostic wording:
    situation_sbar = res4["escalation_ticket"]["sbar"]["situation"]
    reasoning_sbar = res4["risk_assessment"]["clinical_reasoning"]
    assert "cardiac distress symptoms" not in situation_sbar.lower()
    assert "The system does not determine the underlying medical cause." in reasoning_sbar
    print(f"  [PASS] Safety Engine Triggered: {res4['risk_assessment']['deterministic_rule_triggered']}")
    print(f"  [PASS] Risk Clamped To: {res4['risk_assessment']['risk_level']}")
    print(f"  [PASS] Routed To: {res4['workflow_route']}")
    print(f"  [PASS] Emergency Directive: {res4['risk_assessment']['immediate_patient_directive']}")
    print(f"  [PASS] Non-Diagnostic SBAR Situation: {situation_sbar}")

    # --- Scenario 5: PT-TKA-002 Routine Post-Discharge Recovery ---
    print("\n[TEST 5] Routine Post-Discharge Recovery (PT-TKA-002 - Elena Rostova)")
    res5 = orchestrator.run_patient_workflow("PT-TKA-002", symptom_report=None)
    assert res5["status"] == "COMPLETED"
    assert res5["workflow_route"] is None
    assert res5["monitoring"]["total_tasks"] == 4
    assert "Severe Right Knee Osteoarthritis" in res5["primary_diagnosis"]
    print(f"  [PASS] Routine Status: {res5['status']}, Tasks Monitored: {res5['monitoring']['total_tasks']}")

    # --- Scenario 6: PT-PNA-004 Pneumonia Fever (Context-Aware Care Team Routing) ---
    print("\n[TEST 6] Pneumonia Fever Event (PT-PNA-004 - Sarah Chen)")
    pna_fever = SymptomReport(
        patient_id="PT-PNA-004",
        symptom_description="Feverish chills and coughing with thick sputum.",
        severity_score=6,
        measured_temp=101.8
    )
    res6 = orchestrator.run_patient_workflow("PT-PNA-004", symptom_report=pna_fever)
    assert res6["workflow_route"] == "ESCALATION_COORDINATION_AGENT"
    assert res6["risk_assessment"]["risk_level"] == RiskLevel.HIGH
    assert "RULE-VITAL-TEMP-HIGH" in res6["risk_assessment"]["deterministic_rule_triggered"]
    directive_pna = res6["risk_assessment"]["immediate_patient_directive"]
    sbar_rec_pna = res6["escalation_ticket"]["sbar"]["recommendation"]
    assert "medical/respiratory care team" in directive_pna
    assert "surgical care team" not in directive_pna
    assert "medical/respiratory care team" in sbar_rec_pna
    print(f"  [PASS] Triggered: {res6['risk_assessment']['deterministic_rule_triggered']}")
    print(f"  [PASS] Context Directive: {directive_pna}")
    print(f"  [PASS] Context SBAR Recommendation: {sbar_rec_pna}")

    # --- Scenario 7: PT-CHF-003 Rapid Weight Gain Event ---
    print("\n[TEST 7] Heart Failure Rapid Weight Gain (PT-CHF-003 - Marcus Vance)")
    chf_weight = SymptomReport(
        patient_id="PT-CHF-003",
        symptom_description="Feeling bloated and weighed 3.5 lbs heavier this morning.",
        severity_score=5,
        weight_gain_24h_lbs=3.5
    )
    res7 = orchestrator.run_patient_workflow("PT-CHF-003", symptom_report=chf_weight)
    assert res7["workflow_route"] == "ESCALATION_COORDINATION_AGENT"
    assert res7["risk_assessment"]["risk_level"] == RiskLevel.HIGH
    assert "RULE-CHF-RAPID-WEIGHT" in res7["risk_assessment"]["deterministic_rule_triggered"]
    directive_chf = res7["risk_assessment"]["immediate_patient_directive"]
    assert "medical/cardiology care team" in directive_chf
    print(f"  [PASS] Triggered: {res7['risk_assessment']['deterministic_rule_triggered']}")
    print(f"  [PASS] Context Directive: {directive_chf}")

    # --- Scenario 8: Stateful Task Lifecycle & Live Adherence ---
    print("\n[TEST 8] Stateful Task Actions (Complete, Snooze, Miss)")
    state_init = orchestrator.get_recovery_state("PT-CABG-001")
    task_id = state_init.active_tasks[0].task_id

    # Complete task
    res_comp = orchestrator.execute_task_action("PT-CABG-001", task_id=task_id, action="complete")
    assert res_comp["status"] == "SUCCESS"
    assert res_comp["event"]["event_type"] == "TASK_COMPLETED"
    print(f"  [PASS] Task {task_id} Completed: Adherence is {res_comp['adherence_percentage']}%")

    # Snooze next task
    if len(res_comp["recovery_state"]["active_tasks"]) > 1:
        task2_id = res_comp["recovery_state"]["active_tasks"][1]["task_id"]
        res_snooze = orchestrator.execute_task_action("PT-CABG-001", task_id=task2_id, action="snooze", notes="Doctor recommended 30 min rest")
        assert res_snooze["event"]["event_type"] == "TASK_SNOOZED"
        assert len(res_snooze["recovery_state"]["snoozed_tasks"]) >= 1
        print(f"  [PASS] Task {task2_id} Snoozed: {len(res_snooze['recovery_state']['snoozed_tasks'])} snoozed tasks")

    # Verify timeline contains events
    timeline = orchestrator.get_timeline("PT-CABG-001")
    assert len(timeline) >= 2
    print(f"  [PASS] Timeline verified: {len(timeline)} chronological recovery events logged")

    # --- Scenario 9: Human Clinical Review Verification Loop ---
    print("\n[TEST 9] Simulated Human Clinical Review Verification Loop")
    esc_report = SymptomReport(
        patient_id="PT-CABG-001",
        symptom_description="Sternal wound drainage and temp 101.9 F",
        measured_temp=101.9,
        severity_score=8
    )
    esc_res = orchestrator.run_patient_workflow("PT-CABG-001", symptom_report=esc_report)
    ticket_id = esc_res["escalation_ticket"]["ticket_id"]
    assert esc_res["escalation_ticket"]["status"] == "OPEN"

    # Execute human clinical review verification
    rev_res = orchestrator.execute_clinical_review(
        patient_id="PT-CABG-001",
        ticket_id=ticket_id,
        clinician_name="Dr. Evelyn Reed, MD (Cardiothoracic Surgery)",
        action_notes="Evaluated sternal wound telemetry. Wound culture ordered. Home monitoring continued."
    )
    assert rev_res["status"] == "REVIEWED"
    assert rev_res["recovery_state"]["escalation_status"] == "RESOLVED"
    assert rev_res["event"]["event_type"] == "CLINICAL_REVIEW_COMPLETED"
    assert "Dr. Evelyn Reed" in rev_res["event"]["value"]
    print(f"  [PASS] Escalation Ticket {ticket_id} marked RESOLVED")
    print(f"  [PASS] Clinical Review Event recorded: {rev_res['event']['value'][:80]}...")

    # --- Scenario 10: Discharge Paperwork Text Parsing & Plan Synthesis ---
    print("\n[TEST 10] Unstructured Discharge Text Parsing & Initial Plan Synthesis")
    sample_discharge_text = (
        "DISCHARGE SUMMARY\n"
        "Patient: Robert Miller\n"
        "Age: 62\n"
        "Gender: Male\n"
        "Date of Admission: 2026-09-12\n"
        "Date of Discharge: 2026-09-17\n"
        "Attending Physician: Dr. Sarah Jenkins, MD\n"
        "Primary Diagnosis: Acute Appendicitis s/p Laparoscopic Appendectomy\n"
        "Procedure: Laparoscopic Appendectomy\n"
        "Allergies: Penicillin (severe hives)\n"
        "Discharge Medications:\n"
        "1. Acetaminophen 650 mg PO Q6H PRN pain\n"
        "2. Ciprofloxacin 500 mg PO BID x 5 days\n"
        "Activity Restrictions: No lifting over 10 lbs for 2 weeks. Ambulate 15 minutes daily.\n"
        "Dietary Instructions: Low residue diet for 48 hours, advance as tolerated. Hydrate 2L daily.\n"
        "Wound Care: Keep laparoscopic port dressings clean and dry. Remove sterile strips after 7 days.\n"
        "Red Flag Warning Signs: Fever >= 101.5 F, persistent nausea, worsening right lower quadrant pain.\n"
        "Follow-Up: Outpatient clinic appointment in 10 days with Dr. Jenkins at (555) 234-5678.\n"
    )
    upload_res = orchestrator.execute_discharge_upload(raw_text=sample_discharge_text, filename="miller_discharge.txt")
    assert upload_res["status"] == "INITIALIZED"
    assert "Robert Miller" in upload_res["patient"]["first_name"] + " " + upload_res["patient"]["last_name"]
    assert "Appendicitis" in upload_res["discharge_profile"]["primary_diagnosis"]
    assert len(upload_res["discharge_profile"]["medications"]) >= 2
    assert len(upload_res["recovery_state"]["active_tasks"]) >= 3
    print(f"  [PASS] Custom Patient Ingested: {upload_res['patient']['id']} - {upload_res['patient']['first_name']} {upload_res['patient']['last_name']}")
    print(f"  [PASS] Extracted Diagnosis: {upload_res['discharge_profile']['primary_diagnosis']}")
    print(f"  [PASS] Synthesized Tasks: {len(upload_res['recovery_state']['active_tasks'])} Day 2 recovery tasks")

    # --- Scenario 11: Dynamic Patient Creation (Basic info, No Discharge Summary) ---
    print("\n[TEST 11] Dynamic Patient Onboarding (Basic Info, Non-Hallucinated Neutral Tasks)")
    req11 = CreatePatientRequest(
        name="Ravi Kumar",
        age=62,
        gender="Male",
        primary_diagnosis="Total Knee Replacement Recovery",
        physician_care_team="Dr. Angela Thorne, MD (Orthopedic Surgery)",
        contact="555-0144"
    )
    res11 = orchestrator.create_dynamic_patient(req11)
    p11_id = res11["patient"]["id"]
    assert p11_id.startswith("PT-USER-")
    assert res11["patient"]["first_name"] == "Ravi"
    assert res11["patient"]["last_name"] == "Kumar"
    assert res11["patient"]["age"] == 62
    assert res11["patient"]["gender"] == "Male"
    assert res11["discharge_profile"]["primary_diagnosis"] == "Total Knee Replacement Recovery"
    # Guardrail check: No hallucinated medications
    assert len(res11["discharge_profile"]["medications"]) == 0
    # Verified strictly neutral tasks (4 tasks, zero medical prescriptions)
    assert len(res11["recovery_state"]["active_tasks"]) == 4
    task_titles = [t["title"] for t in res11["recovery_state"]["active_tasks"]]
    assert "Daily Recovery Check-In" in task_titles
    assert "Record Available Vitals" in task_titles
    assert "Review Documented Instructions" in task_titles
    assert "Confirm Follow-Up Information" in task_titles
    assert "Hydration & Rest Protocol" not in task_titles
    timeline11 = orchestrator.get_timeline(p11_id)
    event_types11 = [e.event_type for e in timeline11]
    assert "PATIENT_CREATED" in event_types11
    assert "RECOVERY_PLAN_CREATED" in event_types11
    assert timeline11[0].run_id == timeline11[-1].run_id
    print(f"  [PASS] Dynamic Patient Created: {p11_id} ({res11['patient']['first_name']} {res11['patient']['last_name']})")
    print(f"  [PASS] Safe Non-Hallucinated Neutral Tasks: {task_titles}")
    print(f"  [PASS] Event Correlated run_id: {timeline11[0].run_id}")

    # --- Scenario 12: Dynamic Patient Creation WITH Discharge Summary Upload ---
    print("\n[TEST 12] Dynamic Patient Onboarding WITH Discharge Paperwork Upload")
    summary12 = (
        "HOSPITAL DISCHARGE SUMMARY\n"
        "Patient: Maria Santos\n"
        "Age: 58\n"
        "Gender: Female\n"
        "Discharge Date: 2026-09-18\n"
        "Primary Diagnosis: Laparoscopic Cholecystectomy Recovery\n"
        "Attending: Dr. Carlos Mendez, MD (General Surgery)\n"
        "Discharge Medications:\n"
        "- Acetaminophen 500mg PO TID PRN pain\n"
        "- Ondansetron 4mg PO Q8H PRN nausea\n"
        "Activity Restrictions: No heavy lifting over 15 lbs for 2 weeks.\n"
        "Red Flag Warnings: Fever >= 101.5 F, persistent abdominal distension.\n"
    )
    req12 = CreatePatientRequest(
        name="Maria Santos",
        age=58,
        gender="Female",
        primary_diagnosis="Laparoscopic Cholecystectomy Recovery",
        physician_care_team="Dr. Carlos Mendez, MD (General Surgery)",
        discharge_summary_text=summary12
    )
    res12 = orchestrator.create_dynamic_patient(req12)
    p12_id = res12["patient"]["id"]
    assert p12_id.startswith("PT-USER-")
    assert p12_id != p11_id
    assert res12["patient"]["first_name"] == "Maria"
    assert len(res12["discharge_profile"]["medications"]) >= 2
    timeline12 = orchestrator.get_timeline(p12_id)
    event_types12 = [e.event_type for e in timeline12]
    assert "PATIENT_CREATED" in event_types12
    assert "DISCHARGE_UPLOADED" in event_types12
    assert "DISCHARGE_PARSED" in event_types12
    assert "RECOVERY_PLAN_CREATED" in event_types12
    print(f"  [PASS] Uploaded Patient Created: {p12_id} (Maria Santos)")
    print(f"  [PASS] Agent Event Chain: {event_types12}")

    # --- Scenario 13: Strict Patient Data Isolation ---
    print("\n[TEST 13] Patient Data Isolation (Zero Cross-Leakage Between Profiles)")
    state_ravi = orchestrator.get_recovery_state(p11_id)
    state_maria = orchestrator.get_recovery_state(p12_id)
    state_james = orchestrator.get_recovery_state("PT-CABG-001")

    assert state_ravi.patient_id != state_maria.patient_id
    assert state_maria.patient_id != state_james.patient_id
    assert state_ravi.active_tasks != state_maria.active_tasks
    ravi_data = session_store.get_patient_data(p11_id)
    assert ravi_data["patient"]["first_name"] == "Ravi"
    assert "CABG" not in ravi_data["discharge_profile"]["primary_diagnosis"]
    print(f"  [PASS] Isolation Confirmed: Ravi ({p11_id}) vs Maria ({p12_id}) vs James (PT-CABG-001)")

    # --- Scenario 14: Deterministic Safety Engine on Dynamic Patient ---
    print("\n[TEST 14] Deterministic Safety Engine Trigger for Dynamic Patient (Ravi Kumar)")
    fever_dynamic = SymptomReport(
        patient_id=p11_id,
        symptom_description="Feeling hot and shivering; thermometer reads elevated.",
        severity_score=7,
        measured_temp=101.8
    )
    res14 = orchestrator.run_patient_workflow(p11_id, symptom_report=fever_dynamic)
    assert res14["workflow_route"] == "ESCALATION_COORDINATION_AGENT"
    assert res14["risk_assessment"]["risk_level"] == RiskLevel.HIGH
    assert "RULE-VITAL-TEMP-HIGH" in res14["risk_assessment"]["deterministic_rule_triggered"]
    assert res14["escalation_ticket"] is not None
    assert res14["escalation_ticket"]["patient_id"] == p11_id
    print(f"  [PASS] Safety Engine Triggered on Dynamic Patient: {res14['risk_assessment']['deterministic_rule_triggered']}")
    print(f"  [PASS] Risk Level Clamped To: {res14['risk_assessment']['risk_level']}")
    print(f"  [PASS] Escalation Ticket for {p11_id}: {res14['escalation_ticket']['ticket_id']}")

    # --- Scenario 15: PDF Discharge Document Extraction & Empty PDF Guardrail ---
    print("\n[TEST 15] PDF Extraction Handling (Valid Text & Empty PDF Guardrail)")
    # Test valid text PDF
    pdf_bytes = b'''%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /Resources <</Font <</F1 4 0 R>>>> /MediaBox [0 0 612 792] /Contents 5 0 R>> endobj
4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
5 0 obj <</Length 68>> stream
BT
/F1 12 Tf
72 712 Td
(Patient Name: Samuel Taylor) Tj
0 -20 Td
(Diagnosis: Knee Osteoarthritis) Tj
ET
endstream endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000236 00000 n
0000000305 00000 n
trailer <</Size 6 /Root 1 0 R>>
startxref
424
%%EOF'''
    valid_b64 = base64.b64encode(pdf_bytes).decode()
    extracted_pdf_text = extract_discharge_text("taylor_discharge.pdf", content_base64=valid_b64)
    assert "Samuel Taylor" in extracted_pdf_text
    print(f"  [PASS] Valid PDF Text Extracted: '{extracted_pdf_text[:40]}...'")

    # Test blank PDF raises exact user-friendly error
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=100, height=100)
    blank_stream = io.BytesIO()
    writer.write(blank_stream)
    blank_b64 = base64.b64encode(blank_stream.getvalue()).decode()
    try:
        extract_discharge_text("empty.pdf", content_base64=blank_b64)
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert str(e) == ERROR_UNREADABLE_PDF
        print(f"  [PASS] Empty PDF Guardrail Triggered: '{str(e)}'")

    # --- Scenario 16: Condition Benchmark Testing (Conditions A through G) ---
    print("\n[TEST 16] Disease / Condition Testing (Conditions A through G)")
    benchmark_cases = [
        ("A. Knee replacement", "Patient: Sarah Connor\nDiagnosis: Total Knee Arthroplasty\nMedication: Enoxaparin 40 mg SubQ daily\nActivity: Weight-bearing as tolerated with walker"),
        ("B. Coronary artery bypass", "Patient: David Miller\nDiagnosis: Coronary Artery Bypass Graft Recovery\nMedication: Metoprolol Tartrate 25 mg PO twice daily\nRestrictions: Sternal precautions, no lifting over 5 lbs"),
        ("C. Heart failure", "Patient: Arthur Dent\nDiagnosis: Congestive Heart Failure\nMedication: Furosemide 40 mg PO once daily\nDiet: 2g sodium restriction and 1.5L fluid limit"),
        ("D. Pneumonia", "Patient: Grace Hopper\nDiagnosis: Community-Acquired Pneumonia\nMedication: Amoxicillin 500 mg three times daily"),
        ("E. Appendectomy", "Patient Name: Ravi Kumar\nAge: 62\nSex: Male\nDiagnosis: Acute appendicitis\nProcedure: Laparoscopic appendectomy\nMedication: Paracetamol 500 mg twice daily\nFollow-up: Surgical clinic in 7 days"),
        ("F. Type 2 diabetes", "Patient: Alice Wong\nDiagnosis: Type 2 Diabetes Mellitus\nMedication: Metformin 850 mg PO twice daily with meals\nDiet: Consistent carbohydrate diet"),
        ("G. Hypertension", "Patient: Bob Taylor\nDiagnosis: Essential Hypertension\nMedication: Amlodipine 5 mg PO daily\nPrecautions: Monitor morning blood pressure")
    ]
    for label, doc_text in benchmark_cases:
        p_bm, prof_bm = discharge_agent.parse_unstructured_text(doc_text)
        assert prof_bm.primary_diagnosis != "Not specified"
        assert len(prof_bm.medications) >= 1
        print(f"  [PASS] {label}: Diagnosis='{prof_bm.primary_diagnosis}', Med='{prof_bm.medications[0].drug_name}' ({prof_bm.medications[0].dosage}, {prof_bm.medications[0].frequency}, route: {prof_bm.medications[0].route})")

    # --- Scenario 17: Strict Non-Hallucination & Missing Information Handling ---
    print("\n[TEST 17] Strict Non-Hallucination Guardrail (Pneumonia Missing Data Test)")
    missing_data_doc = (
        "Diagnosis: Pneumonia\n"
        "Medication: Amoxicillin 500 mg three times daily"
    )
    p_miss, prof_miss = discharge_agent.parse_unstructured_text(missing_data_doc)
    assert p_miss.age is None, f"Age should be None, got {p_miss.age}"
    assert p_miss.primary_care_physician == "Not specified", f"Physician should be 'Not specified', got {p_miss.primary_care_physician}"
    assert p_miss.clinic_phone == "Not specified", f"Phone should be 'Not specified', got {p_miss.clinic_phone}"
    assert prof_miss.discharge_date == "Not specified", f"Date should be 'Not specified', got {prof_miss.discharge_date}"
    assert prof_miss.medications[0].route == "Not specified", f"Route should be 'Not specified', got {prof_miss.medications[0].route}"
    assert prof_miss.medications[0].frequency == "three times daily", f"Frequency should be 'three times daily', got {prof_miss.medications[0].frequency}"
    assert prof_miss.medications[0].drug_name == "Amoxicillin"
    print(f"  [PASS] Missing age preserved as: {p_miss.age} (not 65)")
    print(f"  [PASS] Missing physician preserved as: '{p_miss.primary_care_physician}' (not Dr. Vance)")
    print(f"  [PASS] Missing route preserved as: '{prof_miss.medications[0].route}' (not Oral)")
    print(f"  [PASS] Frequency preserved exactly: '{prof_miss.medications[0].frequency}' (not daily)")

    # --- Scenario 18: Invalid Task ID Returns 404 / Rejection (No Placeholder Creation) ---
    print("\n[TEST 18] Task ID Validation (Invalid Task ID Raises Error, No Placeholder Created)")
    initial_task_count = len(orchestrator.get_recovery_state("PT-CABG-001").active_tasks)
    try:
        orchestrator.execute_task_action(
            patient_id="PT-CABG-001",
            task_id="NON_EXISTENT_TASK_9999",
            action="complete"
        )
        assert False, "Should have raised KeyError for non-existent task"
    except KeyError:
        # Verify no placeholder task was injected
        new_task_count = len(orchestrator.get_recovery_state("PT-CABG-001").active_tasks)
        assert new_task_count == initial_task_count
        print(f"  [PASS] Non-existent task rejected with KeyError (404). Task count remained {new_task_count} (no placeholder created)")

    # --- Scenario 19: Escalation Ticket Ownership Isolation ---
    print("\n[TEST 19] Escalation Ticket Ownership Enforcement (Cross-Patient Review Rejection)")
    # Create escalation ticket for PT-CABG-001
    cabg_esc = orchestrator.run_patient_workflow(
        "PT-CABG-001",
        symptom_report=SymptomReport(patient_id="PT-CABG-001", symptom_description="Feverish and severe shivering", measured_temp=102.1, severity_score=8)
    )
    cabg_ticket_id = cabg_esc["escalation_ticket"]["ticket_id"]

    # Attempt clinical review using WRONG patient ID (e.g. PT-TKA-002 trying to resolve PT-CABG-001's ticket)
    try:
        orchestrator.execute_clinical_review(
            patient_id="PT-TKA-002",
            ticket_id=cabg_ticket_id,
            clinician_name="Dr. Rogue Clinician",
            action_notes="Attempting cross-patient resolution"
        )
        assert False, "Should have rejected cross-patient ticket modification"
    except KeyError as e:
        print(f"  [PASS] Cross-patient ticket modification rejected: {str(e)}")

    # --- Scenario 20: Live Symptom Evaluation Regression ('Severe chest pain' + Severity 9 -> CRITICAL) ---
    print("\n[TEST 20] Live Symptom Regression: 'Severe chest pain' + Severity 9 -> CRITICAL")
    severe_chest_report = SymptomReport(
        patient_id="PT-CABG-001",
        symptom_description="Severe chest pain",
        severity_score=9,
        measured_temp=98.6,
        systolic_bp=150.0,
        diastolic_bp=95.0,
        spo2=94.0
    )
    res20 = orchestrator.run_patient_workflow("PT-CABG-001", symptom_report=severe_chest_report)
    assert res20["workflow_route"] == "ESCALATION_COORDINATION_AGENT"
    assert res20["risk_assessment"]["risk_level"] == RiskLevel.CRITICAL
    assert "RULE-SYMP-CHEST-PAIN" in res20["risk_assessment"]["deterministic_rule_triggered"]
    assert res20["risk_assessment"]["care_team_action_required"] is True
    assert "PLEASE CALL 911 IMMEDIATELY" in res20["risk_assessment"]["immediate_patient_directive"]
    assert "The system does not determine the underlying medical cause." in res20["risk_assessment"]["clinical_reasoning"]
    assert res20["escalation_ticket"]["risk_level"] == RiskLevel.CRITICAL
    print("  [PASS] 'Severe chest pain' + severity 9 -> CRITICAL with RULE-SYMP-CHEST-PAIN")
    print(f"  [PASS] Directive: {res20['risk_assessment']['immediate_patient_directive'][:60]}...")
    print(f"  [PASS] Non-diagnostic reasoning: {res20['risk_assessment']['clinical_reasoning']}")

    # Verify robustness across natural phrase variations:
    variations_to_verify = [
        "chest pain",
        "Severe chest pain",
        "I have severe chest pain",
        "pressure in my chest",
        "pain in my chest",
        "tightness in my chest",
    ]
    for var_phrase in variations_to_verify:
        var_violations = ClinicalSafetyEngine.evaluate_symptom_keywords(var_phrase)
        assert any(v.rule_id == "RULE-SYMP-CHEST-PAIN" and v.risk_level == RiskLevel.CRITICAL for v in var_violations), (
            f"Failed to match chest distress for variation: '{var_phrase}'"
        )
    print(f"  [PASS] Successfully verified {len(variations_to_verify)} natural phrasing variations for acute chest distress")

    print("\n" + "=" * 65)
    print(" ALL 20 ORCHESTRATOR & AGENT TESTS PASSED SUCCESSFULLY (100%)")
    print("=" * 65)
    return True


if __name__ == "__main__":
    success = run_orchestrator_tests()
    sys.exit(0 if success else 1)
