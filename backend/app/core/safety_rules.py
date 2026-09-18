"""
CareBridge AI Deterministic Clinical Safety Engine
This module executes hardcoded safety checks BEFORE any generative LLM reasoning.
Violations immediately elevate the patient event risk to HIGH or CRITICAL.
"""
from dataclasses import dataclass
from typing import List, Optional
from enum import Enum

class RiskLevel(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

@dataclass
class RuleViolation:
    rule_id: str
    parameter: str
    observed_value: str
    threshold: str
    risk_level: RiskLevel
    clinical_note: str
    emergency_directive: str

class ClinicalSafetyEngine:
    """Deterministic, rule-based clinical boundary checker."""

    @staticmethod
    def evaluate_vitals(
        systolic_bp: Optional[float] = None,
        diastolic_bp: Optional[float] = None,
        heart_rate: Optional[float] = None,
        spo2: Optional[float] = None,
        temperature_f: Optional[float] = None,
        weight_gain_24h_lbs: Optional[float] = None,
        is_copd_patient: bool = False,
    ) -> List[RuleViolation]:
        violations: List[RuleViolation] = []

        # 1. Blood Pressure - Systolic
        if systolic_bp is not None:
            if systolic_bp >= 180.0:
                violations.append(RuleViolation(
                    rule_id="RULE-VITAL-BP-SYS-CRIT",
                    parameter="Systolic Blood Pressure",
                    observed_value=f"{systolic_bp} mmHg",
                    threshold=">= 180 mmHg",
                    risk_level=RiskLevel.CRITICAL,
                    clinical_note="Hypertensive crisis threshold reached. Risk of acute stroke, aortic dissection, or heart failure.",
                    emergency_directive="Please seek immediate emergency medical care or call 911 if accompanied by chest pain, shortness of breath, or headache."
                ))
            elif systolic_bp <= 85.0:
                violations.append(RuleViolation(
                    rule_id="RULE-VITAL-BP-SYS-HYPO",
                    parameter="Systolic Blood Pressure",
                    observed_value=f"{systolic_bp} mmHg",
                    threshold="<= 85 mmHg",
                    risk_level=RiskLevel.HIGH,
                    clinical_note="Severe hypotension. Risk of syncope, hypoperfusion, or internal hemorrhage.",
                    emergency_directive="Please sit or lie down immediately and contact your doctor's emergency triage line."
                ))

        # 2. Blood Pressure - Diastolic
        if diastolic_bp is not None:
            if diastolic_bp >= 110.0:
                violations.append(RuleViolation(
                    rule_id="RULE-VITAL-BP-DIA-CRIT",
                    parameter="Diastolic Blood Pressure",
                    observed_value=f"{diastolic_bp} mmHg",
                    threshold=">= 110 mmHg",
                    risk_level=RiskLevel.HIGH,
                    clinical_note="Critically elevated diastolic pressure.",
                    emergency_directive="Contact your prescribing cardiologist or clinic triage immediately."
                ))

        # 3. Heart Rate
        if heart_rate is not None:
            if heart_rate >= 130.0:
                violations.append(RuleViolation(
                    rule_id="RULE-VITAL-HR-TACHY",
                    parameter="Heart Rate",
                    observed_value=f"{heart_rate} bpm",
                    threshold=">= 130 bpm",
                    risk_level=RiskLevel.HIGH,
                    clinical_note="Marked tachycardia. Potential arrhythmia (e.g. post-op AFib), sepsis, or pulmonary embolism.",
                    emergency_directive="Rest quietly. If you feel dizzy, faint, or experience chest flutter, call 911 immediately."
                ))
            elif heart_rate <= 45.0:
                violations.append(RuleViolation(
                    rule_id="RULE-VITAL-HR-BRADY",
                    parameter="Heart Rate",
                    observed_value=f"{heart_rate} bpm",
                    threshold="<= 45 bpm",
                    risk_level=RiskLevel.HIGH,
                    clinical_note="Severe bradycardia. Medication excess (e.g. beta blocker) or heart block.",
                    emergency_directive="Contact your cardiologist immediately before taking further heart medications."
                ))

        # 4. Oxygen Saturation (SpO2)
        if spo2 is not None:
            spo2_thresh = 88.0 if is_copd_patient else 90.0
            if spo2 <= spo2_thresh:
                violations.append(RuleViolation(
                    rule_id="RULE-VITAL-SPO2-HYPOXIA",
                    parameter="SpO2",
                    observed_value=f"{spo2}%",
                    threshold=f"<= {spo2_thresh}%",
                    risk_level=RiskLevel.CRITICAL,
                    clinical_note="Severe hypoxemia. Risk of pulmonary embolism, pneumonia progression, or pulmonary edema.",
                    emergency_directive="Call 911 or proceed to the nearest emergency department immediately."
                ))

        # 5. Temperature (Surgical Site Infection / Sepsis)
        if temperature_f is not None:
            if temperature_f >= 101.5:
                violations.append(RuleViolation(
                    rule_id="RULE-VITAL-TEMP-HIGH",
                    parameter="Body Temperature",
                    observed_value=f"{temperature_f}°F",
                    threshold=">= 101.5°F",
                    risk_level=RiskLevel.HIGH,
                    clinical_note="Post-operative fever threshold exceeded. Suspected surgical site infection, atelectasis, or UTI.",
                    emergency_directive="Alerting your surgical care team now. Do not apply topical ointments to any incision without surgeon orders."
                ))

        # 6. CHF Rapid Weight Gain
        if weight_gain_24h_lbs is not None:
            if weight_gain_24h_lbs >= 3.0:
                violations.append(RuleViolation(
                    rule_id="RULE-CHF-RAPID-WEIGHT",
                    parameter="24-Hour Weight Gain",
                    observed_value=f"+{weight_gain_24h_lbs} lbs",
                    threshold=">= 3.0 lbs in 24 hrs",
                    risk_level=RiskLevel.HIGH,
                    clinical_note="Acute fluid retention indicating decompensation in heart failure.",
                    emergency_directive="Contact your heart failure clinic triage nurse today for diuretic adjustment."
                ))

        return violations

    @staticmethod
    def evaluate_symptom_keywords(symptom_text: str) -> List[RuleViolation]:
        """Scans reported symptom text for high-risk red-flag clinical keywords."""
        violations: List[RuleViolation] = []
        lower = symptom_text.lower()

        # Acute Chest Distress
        if any(term in lower for term in ["chest pain", "chest pressure", "crushing", "radiating to jaw", "radiating to arm"]):
            violations.append(RuleViolation(
                rule_id="RULE-SYMP-CHEST-PAIN",
                parameter="Reported Symptom",
                observed_value="Chest pain/pressure description",
                threshold="Presence of acute cardiac distress symptoms",
                risk_level=RiskLevel.CRITICAL,
                clinical_note="Potential acute coronary syndrome, graft failure, or pulmonary embolism.",
                emergency_directive="PLEASE CALL 911 IMMEDIATELY. Chew an aspirin if directed by emergency responders."
            ))

        # Deep Vein Thrombosis (DVT) Warning
        if any(term in lower for term in ["calf pain", "calf swelling", "back of leg hot", "one leg swollen"]):
            violations.append(RuleViolation(
                rule_id="RULE-SYMP-DVT-SUSPECTED",
                parameter="Reported Symptom",
                observed_value="Unilateral lower extremity symptom",
                threshold="Calf tenderness, localized swelling, or heat post-op",
                risk_level=RiskLevel.HIGH,
                clinical_note="Suspected Deep Vein Thrombosis (DVT). High risk of detachment into Pulmonary Embolism.",
                emergency_directive="Avoid walking or massaging the calf. Contact your surgical team immediately for an urgent ultrasound."
            ))

        # Sternal Instability (CABG)
        sternum_terms = ["sternum", "breastbone", "chest bone"]
        instability_terms = ["clicking", "popping", "shifting", "grating"]
        if any(st in lower for st in sternum_terms) and any(it in lower for it in instability_terms):
            violations.append(RuleViolation(
                rule_id="RULE-SYMP-STERNAL-DEHISCENCE",
                parameter="Reported Symptom",
                observed_value="Sternal clicking / movement",
                threshold="Sternal instability reported post-sternotomy",
                risk_level=RiskLevel.HIGH,
                clinical_note="Potential sternal wire dehiscence or non-union. Risk of mediastinitis.",
                emergency_directive="Limit arm movements immediately. Use your cough pillow and contact your cardiothoracic clinic."
            ))

        return violations
