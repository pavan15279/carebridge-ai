import httpx

def test_live_api_chest_pain():
    client = httpx.Client(base_url="http://127.0.0.1:8000", timeout=10.0)

    # 1. Login
    auth_res = client.post("/api/v1/auth/login", json={"patient_id": "PT-CABG-001", "password": "CareBridge@123"})
    assert auth_res.status_code == 200, f"Login failed: {auth_res.text}"
    token = auth_res.json()["session_token"]

    scenarios = [
        ("Severe chest pain", 9, 98.6, 150.0, 95.0, 94.0),
        ("pressure in my chest", 8, None, None, None, None),
        ("I have severe chest pain", 9, None, None, None, None),
        ("pain in my chest", 7, None, None, None, None),
        ("tightness in my chest", 6, None, None, None, None),
        ("crushing chest pain", 10, None, None, None, None),
    ]

    print("\n" + "=" * 65)
    print(" CareBridge AI - Live API Chest Pain & Distress Workflow Verification")
    print("=" * 65)

    for desc, sev, temp, sbp, dbp, spo2 in scenarios:
        payload = {
            "patient_id": "PT-CABG-001",
            "symptom_description": desc,
            "severity_score": sev,
        }
        if temp is not None:
            payload["measured_temp"] = temp
        if sbp is not None:
            payload["systolic_bp"] = sbp
        if dbp is not None:
            payload["diastolic_bp"] = dbp
        if spo2 is not None:
            payload["spo2"] = spo2

        res = client.post(
            "/api/v1/workflow/PT-CABG-001",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        assert res.status_code == 200, f"Workflow failed for {desc}: {res.text}"
        data = res.json()
        ra = data["risk_assessment"]
        assert ra["risk_level"] == "CRITICAL", f"Expected CRITICAL, got {ra['risk_level']} for {desc}"
        assert "RULE-SYMP-CHEST-PAIN" in ra["deterministic_rule_triggered"], (
            f"Expected RULE-SYMP-CHEST-PAIN for {desc}, got {ra['deterministic_rule_triggered']}"
        )
        assert data["workflow_route"] == "ESCALATION_COORDINATION_AGENT", (
            f"Expected ESCALATION_COORDINATION_AGENT, got {data['workflow_route']}"
        )
        assert "PLEASE CALL 911 IMMEDIATELY" in ra["immediate_patient_directive"]
        print(f"  [PASS] '{desc}' (sev {sev}) -> Risk: {ra['risk_level']}, Rule: {ra['deterministic_rule_triggered']}, Route: {data['workflow_route']}")

    print("\n" + "=" * 65)
    print(" ALL LIVE API CHEST PAIN SCENARIOS VERIFIED CRITICAL (100% PASS)")
    print("=" * 65)
    return True


if __name__ == "__main__":
    test_live_api_chest_pain()
