"""
CareBridge AI: Simple Single Login & Patient Isolation Test Suite
Verifies:
1. Valid login with demo credentials
2. Invalid patient ID rejection (401)
3. Invalid password rejection (401)
4. Unauthenticated endpoint access rejection (401)
5. Successful logout & session invalidation
6. Patient data access for authenticated patient
7. Attempt to access another patient's data rejection (403)
8. Existing multi-agent workflow execution after authentication
9. Existing deterministic safety triggers execution after authentication
10. Dynamic patient registration and authentication with CareBridge@123
11. Successful signup with full name, email, and password (PT-USER-* generated)
12. Duplicate email rejection (409/400)
13. Password mismatch rejection (400)
14. Successful login via email
15. Wrong password for email account (401)
16. Unknown email rejection (401)
17. Verify /auth/me session for email-authenticated patient
18. Unique PT-USER-* ID generation across multiple users
19. Cross-patient isolation for newly registered accounts (403)
"""
import sys
from pathlib import Path

# Ensure backend path is on sys.path
backend_path = Path(__file__).resolve().parent.parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from fastapi.testclient import TestClient
from main import app
from app.core.auth import DEMO_PASSWORD, auth_manager

client = TestClient(app)


def run_all_auth_tests():
    print("=================================================================")
    print(" CareBridge AI - Hackathon Authentication & Isolation Test Suite")
    print("=================================================================")

    # Clear any previous test sessions
    auth_manager.clear_all_sessions()

    # --- Test 1: Valid Login with Demo Credentials ---
    print("\n[TEST 1] Valid Login with Demo Credentials (PT-CABG-001)")
    res1 = client.post(
        "/api/v1/auth/login",
        json={"patient_id": "PT-CABG-001", "password": DEMO_PASSWORD}
    )
    assert res1.status_code == 200, f"Expected 200, got {res1.status_code}: {res1.text}"
    body1 = res1.json()
    assert body1["status"] == "SUCCESS"
    assert body1["patient_id"] == "PT-CABG-001"
    assert "James Harrison" in body1["patient_name"]
    token1 = body1["session_token"]
    assert token1.startswith("cb_sess_")
    print(f"  [PASS] Logged in successfully as {body1['patient_name']} ({body1['patient_id']})")
    print(f"  [PASS] Session Token: {token1[:18]}...")

    # --- Test 2: Invalid Patient ID Rejection ---
    print("\n[TEST 2] Invalid Patient ID (PT-UNKNOWN-999)")
    res2 = client.post(
        "/api/v1/auth/login",
        json={"patient_id": "PT-UNKNOWN-999", "password": DEMO_PASSWORD}
    )
    assert res2.status_code == 401, f"Expected 401, got {res2.status_code}"
    print(f"  [PASS] Correctly rejected unknown patient with HTTP 401: {res2.json()['detail']}")

    # --- Test 3: Invalid Password Rejection ---
    print("\n[TEST 3] Invalid Password for Valid Patient")
    res3 = client.post(
        "/api/v1/auth/login",
        json={"patient_id": "PT-CABG-001", "password": "WrongPassword123!"}
    )
    assert res3.status_code == 401, f"Expected 401, got {res3.status_code}"
    print(f"  [PASS] Correctly rejected invalid password with HTTP 401: {res3.json()['detail']}")

    # --- Test 4: Unauthenticated Access Rejection ---
    print("\n[TEST 4] Unauthenticated Access to Patient Endpoints")
    res4_discharge = client.get("/api/v1/discharge/PT-CABG-001")
    assert res4_discharge.status_code == 401, f"Expected 401, got {res4_discharge.status_code}"

    res4_tasks = client.get("/api/v1/tasks/today/PT-CABG-001")
    assert res4_tasks.status_code == 401, f"Expected 401, got {res4_tasks.status_code}"

    res4_state = client.get("/api/v1/patients/PT-CABG-001/recovery-state")
    assert res4_state.status_code == 401, f"Expected 401, got {res4_state.status_code}"

    res4_wf = client.post("/api/v1/workflow/PT-CABG-001")
    assert res4_wf.status_code == 401, f"Expected 401, got {res4_wf.status_code}"

    print("  [PASS] All unauthenticated requests rejected with HTTP 401")

    # --- Test 5: Successful Logout & Invalidation ---
    print("\n[TEST 5] Successful Logout & Session Invalidation")
    # Log in as PT-TKA-002 to test logout
    res_tka = client.post(
        "/api/v1/auth/login",
        json={"patient_id": "PT-TKA-002", "password": DEMO_PASSWORD}
    )
    tka_token = res_tka.json()["session_token"]

    # Verify session is currently active
    res_me_before = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tka_token}"})
    assert res_me_before.status_code == 200

    # Logout
    res_logout = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {tka_token}"})
    assert res_logout.status_code == 200
    assert res_logout.json()["status"] == "SUCCESS"

    # Verify session is now revoked (401)
    res_me_after = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tka_token}"})
    assert res_me_after.status_code == 401
    print("  [PASS] Session logged out and subsequently rejected with HTTP 401")

    # --- Test 6: Patient Isolation - Authenticated Patient Accessing Own Data ---
    print("\n[TEST 6] Authenticated Access to Own Data (PT-CABG-001)")
    headers1 = {"Authorization": f"Bearer {token1}"}

    res6_discharge = client.get("/api/v1/discharge/PT-CABG-001", headers=headers1)
    assert res6_discharge.status_code == 200
    assert "Coronary" in res6_discharge.json()["primary_diagnosis"]

    res6_tasks = client.get("/api/v1/tasks/today/PT-CABG-001", headers=headers1)
    assert res6_tasks.status_code == 200
    assert res6_tasks.json()["patient_id"] == "PT-CABG-001"

    res6_state = client.get("/api/v1/patients/PT-CABG-001/recovery-state", headers=headers1)
    assert res6_state.status_code == 200
    assert res6_state.json()["patient_id"] == "PT-CABG-001"
    print("  [PASS] Authenticated patient successfully read their own discharge, tasks, and state")

    # --- Test 7: Patient Isolation - Attempt to Access Another Patient's Data ---
    print("\n[TEST 7] Cross-Patient Access Rejection (PT-CABG-001 trying to access PT-TKA-002)")
    res7_cross_discharge = client.get("/api/v1/discharge/PT-TKA-002", headers=headers1)
    assert res7_cross_discharge.status_code == 403
    assert "Access denied" in res7_cross_discharge.json()["detail"]

    res7_cross_tasks = client.get("/api/v1/tasks/today/PT-TKA-002", headers=headers1)
    assert res7_cross_tasks.status_code == 403

    res7_cross_state = client.get("/api/v1/patients/PT-TKA-002/recovery-state", headers=headers1)
    assert res7_cross_state.status_code == 403

    res7_cross_wf = client.post("/api/v1/workflow/PT-TKA-002", headers=headers1)
    assert res7_cross_wf.status_code == 403

    res7_cross_task_action = client.post(
        "/api/v1/patients/PT-TKA-002/tasks/TASK-01/complete",
        headers=headers1
    )
    assert res7_cross_task_action.status_code == 403

    print("  [PASS] All cross-patient access attempts strictly blocked with HTTP 403 Forbidden")

    # --- Test 8: Existing Workflow Works After Authentication ---
    print("\n[TEST 8] Multi-Agent Workflow Execution with Valid Session")
    res8_wf = client.post("/api/v1/workflow/PT-CABG-001", headers=headers1)
    assert res8_wf.status_code == 200
    wf_data = res8_wf.json()
    assert wf_data["patient_id"] == "PT-CABG-001"
    assert wf_data["status"] == "COMPLETED"
    print(f"  [PASS] Workflow executed successfully. Current phase: {wf_data['recovery_plan']['current_phase']}")

    # --- Test 9: Safety Triggers Work After Authentication ---
    print("\n[TEST 9] Safety Trigger Execution with Valid Session (Fever Alert)")
    fever_report = {
        "patient_id": "PT-CABG-001",
        "symptom_description": "Post-op shivering and feeling feverish",
        "severity_score": 7,
        "measured_temp": 102.0
    }
    res9_safety = client.post(
        "/api/v1/symptoms/report",
        json=fever_report,
        headers=headers1
    )
    assert res9_safety.status_code == 200
    safety_data = res9_safety.json()
    assert safety_data["risk_level"] == "HIGH"
    assert "RULE-VITAL-TEMP-HIGH" in safety_data["deterministic_rule_triggered"]
    assert safety_data["care_team_action_required"] is True
    print(f"  [PASS] Deterministic safety trigger correctly clamped risk to: {safety_data['risk_level']}")
    print(f"  [PASS] Rule triggered: {safety_data['deterministic_rule_triggered']}")

    # --- Test 10: Dynamic Patient Functionality with CareBridge@123 ---
    print("\n[TEST 10] Dynamic Patient Creation & Subsequent Login")
    # Onboard dynamic patient
    res10_create = client.post(
        "/api/v1/patients/create",
        json={
            "name": "Kavita Patel",
            "age": 42,
            "gender": "Female",
            "primary_diagnosis": "Laparoscopic Cholecystectomy",
            "condition_category": "General Surgery"
        }
    )
    assert res10_create.status_code == 200
    dyn_patient = res10_create.json()["patient"]
    dyn_id = dyn_patient["id"]
    print(f"  [PASS] Dynamic patient onboarded: {dyn_patient['first_name']} {dyn_patient['last_name']} ({dyn_id})")

    # Login as dynamic patient with demo password
    res10_login = client.post(
        "/api/v1/auth/login",
        json={"patient_id": dyn_id, "password": DEMO_PASSWORD}
    )
    assert res10_login.status_code == 200
    dyn_token = res10_login.json()["session_token"]
    dyn_headers = {"Authorization": f"Bearer {dyn_token}"}
    print(f"  [PASS] Logged in as dynamic patient {dyn_id} with CareBridge@123")

    # Access dynamic patient's state
    res10_dyn_state = client.get(f"/api/v1/patients/{dyn_id}/recovery-state", headers=dyn_headers)
    assert res10_dyn_state.status_code == 200
    assert res10_dyn_state.json()["patient_id"] == dyn_id

    # Verify cross-access protection on dynamic patient
    res10_cross = client.get("/api/v1/discharge/PT-CABG-001", headers=dyn_headers)
    assert res10_cross.status_code == 403
    print("  [PASS] Dynamic patient isolation confirmed: cannot access PT-CABG-001")

    # --- Test 11: Successful Signup ---
    print("\n[TEST 11] Successful Signup with Full Name, Email, Password")
    signup_payload = {
        "full_name": "Eleanor Vance",
        "email": "eleanor.vance@example.com",
        "password": "SecurePassword123!",
        "confirm_password": "SecurePassword123!"
    }
    res11 = client.post("/api/v1/auth/signup", json=signup_payload)
    assert res11.status_code == 200, f"Expected 200, got {res11.status_code}: {res11.text}"
    body11 = res11.json()
    assert body11["status"] == "SUCCESS"
    assert body11["patient_id"].startswith("PT-USER-")
    assert body11["patient_name"] == "Eleanor Vance"
    assert "password" not in body11
    user11_id = body11["patient_id"]
    user11_token = body11["session_token"]
    print(f"  [PASS] Successfully registered patient {body11['patient_name']} with ID {user11_id}")

    # Verify no fabricated data in discharge profile for newly registered patient
    res11_discharge = client.get(f"/api/v1/discharge/{user11_id}", headers={"Authorization": f"Bearer {user11_token}"})
    assert res11_discharge.status_code == 200
    d_data = res11_discharge.json()
    assert d_data["discharge_date"] == "Not specified", f"Expected 'Not specified', got {d_data['discharge_date']}"
    assert d_data["primary_diagnosis"] == "Not specified", f"Expected 'Not specified', got {d_data['primary_diagnosis']}"
    assert d_data["medications"] == [], f"Expected empty medications, got {d_data['medications']}"
    assert d_data["red_flag_warnings"] == [], f"Expected empty red flags, got {d_data['red_flag_warnings']}"
    print("  [PASS] Verified zero fabricated clinical data: discharge_date, diagnosis, meds, and red flags are all clean")

    # --- Test 12: Duplicate Email Rejection ---
    print("\n[TEST 12] Duplicate Email Rejection (409/400)")
    res12 = client.post("/api/v1/auth/signup", json=signup_payload)
    assert res12.status_code in (400, 409), f"Expected 400 or 409, got {res12.status_code}: {res12.text}"
    print(f"  [PASS] Correctly rejected duplicate email with HTTP {res12.status_code}: {res12.json().get('detail')}")

    # --- Test 13: Password Mismatch & Short Password Rejection ---
    print("\n[TEST 13] Password Validation (Mismatch & <8 Chars Rejection)")
    res13 = client.post("/api/v1/auth/signup", json={
        "full_name": "Bob Smith",
        "email": "bob.smith@example.com",
        "password": "Password123!",
        "confirm_password": "DifferentPassword456!"
    })
    assert res13.status_code == 400, f"Expected 400, got {res13.status_code}: {res13.text}"
    print(f"  [PASS] Correctly rejected mismatched passwords with HTTP 400: {res13.json().get('detail')}")

    res13_len = client.post("/api/v1/auth/signup", json={
        "full_name": "Short Pw",
        "email": "short.pw@example.com",
        "password": "Pass12!",
        "confirm_password": "Pass12!"
    })
    assert res13_len.status_code == 400, f"Expected 400, got {res13_len.status_code}: {res13_len.text}"
    assert "8 characters" in res13_len.json().get("detail", "")
    print(f"  [PASS] Correctly rejected password < 8 characters with HTTP 400: {res13_len.json().get('detail')}")

    # --- Test 14: Successful Email Login ---
    print("\n[TEST 14] Successful Login via Email")
    res14 = client.post("/api/v1/auth/login", json={
        "email": "eleanor.vance@example.com",
        "password": "SecurePassword123!"
    })
    assert res14.status_code == 200, f"Expected 200, got {res14.status_code}: {res14.text}"
    body14 = res14.json()
    assert body14["status"] == "SUCCESS"
    assert body14["patient_id"] == user11_id
    assert body14["patient_name"] == "Eleanor Vance"
    email_login_token = body14["session_token"]
    print(f"  [PASS] Successfully logged in with email for {body14['patient_name']}")

    # --- Test 15: Wrong Password for Email Account ---
    print("\n[TEST 15] Wrong Password for Email Account (401)")
    res15 = client.post("/api/v1/auth/login", json={
        "email": "eleanor.vance@example.com",
        "password": "IncorrectPassword!"
    })
    assert res15.status_code == 401, f"Expected 401, got {res15.status_code}"
    print(f"  [PASS] Correctly rejected wrong password with HTTP 401: {res15.json().get('detail')}")

    # --- Test 16: Unknown Email Rejection ---
    print("\n[TEST 16] Unknown Email Rejection (401)")
    res16 = client.post("/api/v1/auth/login", json={
        "email": "nonexistent.user@example.com",
        "password": "AnyPassword123!"
    })
    assert res16.status_code == 401, f"Expected 401, got {res16.status_code}"
    print(f"  [PASS] Correctly rejected unknown email with HTTP 401: {res16.json().get('detail')}")

    # --- Test 17: /auth/me Returns Authenticated Patient After Email Login ---
    print("\n[TEST 17] Verify /auth/me Session for Email Authenticated Patient")
    res17 = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {email_login_token}"})
    assert res17.status_code == 200, f"Expected 200, got {res17.status_code}: {res17.text}"
    body17 = res17.json()
    assert body17["patient_id"] == user11_id
    assert body17["patient_name"] == "Eleanor Vance"
    print(f"  [PASS] Verified active session for {body17['patient_name']} via /auth/me")

    # --- Test 18: Unique PT-USER-* IDs for Multiple Registered Users ---
    print("\n[TEST 18] Unique PT-USER-* ID Generation")
    res18 = client.post("/api/v1/auth/signup", json={
        "full_name": "Gregory House",
        "email": "gregory.house@example.com",
        "password": "DiagnosticExpert123!",
        "confirm_password": "DiagnosticExpert123!"
    })
    assert res18.status_code == 200
    user18_id = res18.json()["patient_id"]
    assert user18_id.startswith("PT-USER-")
    assert user18_id != user11_id, "Patient IDs must be unique"
    print(f"  [PASS] Generated unique patient IDs: {user11_id} != {user18_id}")

    # --- Test 19: Patient Isolation for Registered Patient ---
    print("\n[TEST 19] Patient Isolation for Registered Patient (Cross-access 403)")
    headers_user11 = {"Authorization": f"Bearer {email_login_token}"}
    # Can access own tasks
    res19_own_tasks = client.get(f"/api/v1/tasks/today/{user11_id}", headers=headers_user11)
    assert res19_own_tasks.status_code == 200, f"Expected 200, got {res19_own_tasks.status_code}"
    tasks19 = res19_own_tasks.json()["tasks"]
    task_titles = [t["title"] for t in tasks19]
    assert "Hydration Reminder" not in task_titles, "Hydration Reminder must not be present"
    assert "Record Available Vitals" in task_titles, "Record Available Vitals neutral task must be present"
    assert "Welcome Check-In" in task_titles
    print(f"  [PASS] Verified neutral onboarding tasks only: {task_titles}")

    # Cannot access another patient's data
    res19_cross = client.get("/api/v1/discharge/PT-CABG-001", headers=headers_user11)
    assert res19_cross.status_code == 403, f"Expected 403, got {res19_cross.status_code}"
    res19_cross_user = client.get(f"/api/v1/tasks/today/{user18_id}", headers=headers_user11)
    assert res19_cross_user.status_code == 403, f"Expected 403, got {res19_cross_user.status_code}"
    print("  [PASS] Registered patient access strictly isolated from other patients (HTTP 403)")

    print("\n=================================================================")
    print(" ALL 19 AUTHENTICATION & ISOLATION TESTS PASSED (100%)")
    print("=================================================================")


if __name__ == "__main__":
    run_all_auth_tests()

