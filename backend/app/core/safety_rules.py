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


def resolve_care_team_label(
    condition_category: Optional[str] = None,
    primary_diagnosis: Optional[str] = None,
    specialty: Optional[str] = None,
) -> str:
    """
    Resolves the context-appropriate care team routing label based on patient care context.
    NOTE: This is a routing / notification label only, NOT a medical diagnosis.
    """
    text = f"{condition_category or ''} {primary_diagnosis or ''} {specialty or ''}".lower()

    if any(k in text for k in ["pulmonary", "pneumonia", "respiratory", "lung"]):
        return "medical/respiratory care team"
    if any(k in text for k in ["heart failure", "hfref", "chf", "cardiomyopathy"]):
        return "medical/cardiology care team"
    if any(k in text for k in ["orthopedic", "knee", "tka", "arthroplasty", "joint", "hip"]):
        return "surgical/orthopedic care team"
    if any(k in text for k in ["cabg", "sternotomy", "bypass", "cardiothoracic", "cardiac surgery"]):
        return "surgical/cardiothoracic care team"
    if any(k in text for k in ["surgery", "surgical", "post-op"]):
        return "surgical care team"

    return "primary clinical care team"


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
        care_team: Optional[str] = None,
    ) -> List[RuleViolation]:
        violations: List[RuleViolation] = []
        team = care_team or "clinical care team"

        # 1. Blood Pressure - Systolic
        if systolic_bp is not None:
            if systolic_bp >= 180.0:
                violations.append(RuleViolation(
                    rule_id="RULE-VITAL-BP-SYS-CRIT",
                    parameter="Systolic Blood Pressure",
                    observed_value=f"{systolic_bp} mmHg",
                    threshold=">= 180 mmHg",
                    risk_level=RiskLevel.CRITICAL,
                    clinical_note="Hypertensive crisis threshold reached. Severe blood pressure deviation requiring urgent medical evaluation. The system does not determine the underlying medical cause.",
                    emergency_directive="Please seek immediate emergency medical care or call 911 if accompanied by chest discomfort, shortness of breath, or headache."
                ))
            elif systolic_bp <= 85.0:
                violations.append(RuleViolation(
                    rule_id="RULE-VITAL-BP-SYS-HYPO",
                    parameter="Systolic Blood Pressure",
                    observed_value=f"{systolic_bp} mmHg",
                    threshold="<= 85 mmHg",
                    risk_level=RiskLevel.HIGH,
                    clinical_note="Severe hypotension threshold reached. Low blood pressure requires prompt clinical evaluation. The system does not determine the underlying medical cause.",
                    emergency_directive=f"Please sit or lie down immediately and contact your {team} emergency triage line."
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
                    clinical_note="Critically elevated diastolic pressure requiring prompt clinical evaluation. The system does not determine the underlying medical cause.",
                    emergency_directive=f"Contact your {team} triage immediately."
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
                    clinical_note="Elevated heart rate exceeds deterministic safety threshold requiring prompt clinical evaluation. The system does not determine the underlying medical cause.",
                    emergency_directive="Rest quietly. If you feel dizzy, faint, or experience chest distress, call 911 immediately."
                ))
            elif heart_rate <= 45.0:
                violations.append(RuleViolation(
                    rule_id="RULE-VITAL-HR-BRADY",
                    parameter="Heart Rate",
                    observed_value=f"{heart_rate} bpm",
                    threshold="<= 45 bpm",
                    risk_level=RiskLevel.HIGH,
                    clinical_note="Low heart rate below deterministic safety threshold requiring prompt clinical evaluation. The system does not determine the underlying medical cause.",
                    emergency_directive=f"Contact your {team} immediately for clinical evaluation before taking further scheduled medications."
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
                    clinical_note="Oxygen saturation fell to or below deterministic safety threshold. Hypoxia requires immediate emergency medical evaluation. The system does not determine the underlying medical cause.",
                    emergency_directive="Call 911 or proceed to the nearest emergency department immediately."
                ))

        # 5. Temperature (Context-Aware Clinical Safety Trigger)
        if temperature_f is not None:
            if temperature_f >= 101.5:
                violations.append(RuleViolation(
                    rule_id="RULE-VITAL-TEMP-HIGH",
                    parameter="Body Temperature",
                    observed_value=f"{temperature_f}°F",
                    threshold=">= 101.5°F",
                    risk_level=RiskLevel.HIGH,
                    clinical_note="Reported temperature exceeds the deterministic safety threshold. This is a high-priority safety trigger requiring prompt clinical evaluation. The system does not determine the underlying medical cause.",
                    emergency_directive=f"Alerting your {team} now. Please rest quietly while your care team is notified for clinical triage evaluation."
                ))

        # 6. CHF Rapid Weight Gain
        if weight_gain_24h_lbs is not None:
            if weight_gain_24h_lbs >= 3.0:
                chf_team = care_team if "cardiology" in (care_team or "") else "medical/cardiology care team"
                violations.append(RuleViolation(
                    rule_id="RULE-CHF-RAPID-WEIGHT",
                    parameter="24-Hour Weight Gain",
                    observed_value=f"+{weight_gain_24h_lbs} lbs",
                    threshold=">= 3.0 lbs in 24 hrs",
                    risk_level=RiskLevel.HIGH,
                    clinical_note="24-hour weight gain exceeds the deterministic safety threshold of 3.0 lbs. Prompt clinical review by the care team is required.",
                    emergency_directive=f"Contact your {chf_team} triage nurse today for clinical guidance and symptom evaluation."
                ))

        return violations

    @staticmethod
    def evaluate_symptom_keywords(symptom_text: str, care_team: Optional[str] = None) -> List[RuleViolation]:
        """Scans reported symptom text for high-risk red-flag clinical keywords."""
        violations: List[RuleViolation] = []
        lower = symptom_text.lower()
        team = care_team or "clinical care team"

        # Acute Chest Distress (CRITICAL emergency trigger - non-diagnostic)
        if any(term in lower for term in ["chest pain", "chest pressure", "crushing", "radiating to jaw", "radiating to arm"]):
            violations.append(RuleViolation(
                rule_id="RULE-SYMP-CHEST-PAIN",
                parameter="Reported Symptom",
                observed_value="Chest pain/pressure description",
                threshold="Reported acute chest pain or radiating discomfort",
                risk_level=RiskLevel.CRITICAL,
                clinical_note="Severe chest pain is a deterministic high-priority safety trigger requiring immediate emergency evaluation. The system does not determine the underlying medical cause.",
                emergency_directive="PLEASE CALL 911 IMMEDIATELY. Stop all physical activity and seek emergency medical evaluation. Do not drive yourself."
            ))

        # Lower Extremity Unilateral Symptoms Warning
        if any(term in lower for term in ["calf pain", "calf swelling", "back of leg hot", "one leg swollen"]):
            violations.append(RuleViolation(
                rule_id="RULE-SYMP-DVT-SUSPECTED",
                parameter="Reported Symptom",
                observed_value="Unilateral lower extremity symptom",
                threshold="Calf tenderness, localized swelling, or heat",
                risk_level=RiskLevel.HIGH,
                clinical_note="Reported unilateral lower extremity symptom matches deterministic safety criteria. Prompt clinical evaluation is required. The system does not determine the underlying medical cause.",
                emergency_directive=f"Avoid walking or massaging the leg. Contact your {team} immediately for prompt clinical evaluation."
            ))

        # Sternal Instability (Post-sternotomy mechanical warning)
        sternum_terms = ["sternum", "breastbone", "chest bone"]
        instability_terms = ["clicking", "popping", "shifting", "grating"]
        if any(st in lower for st in sternum_terms) and any(it in lower for it in instability_terms):
            violations.append(RuleViolation(
                rule_id="RULE-SYMP-STERNAL-DEHISCENCE",
                parameter="Reported Symptom",
                observed_value="Sternal clicking / movement",
                threshold="Sternal instability reported post-sternotomy",
                risk_level=RiskLevel.HIGH,
                clinical_note="Reported sternal mechanical sensation matches deterministic safety criteria. Prompt evaluation by the cardiothoracic surgical team is required. The system does not determine the underlying medical cause.",
                emergency_directive="Limit arm movements immediately and contact your cardiothoracic clinic for prompt clinical evaluation."
            ))

        return violations
