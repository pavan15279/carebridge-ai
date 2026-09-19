"""
CareBridge AI - Risk Reasoning Agent

Evaluates patient-reported symptoms and physiological telemetry.
ALWAYS executes the Deterministic Clinical Safety Engine first.
Never bypasses deterministic rules. Never diagnoses or prescribes.
"""
from typing import Any, Dict, Optional, Union
from app.core.safety_rules import ClinicalSafetyEngine, RiskLevel, resolve_care_team_label
from app.schemas.clinical import DischargeProfile, RiskAssessment, SbarNote, SymptomReport


class RiskReasoningAgent:
    """
    Cognitive clinical decision support agent.
    Combines deterministic safety checks with contextual reasoning.
    """

    def __init__(self) -> None:
        self.name = "Risk Reasoning Agent"

    def run(
        self,
        report: Union[SymptomReport, Dict[str, Any]],
        profile: Optional[DischargeProfile] = None
    ) -> RiskAssessment:
        """
        Evaluate patient symptoms against clinical safety rules and discharge context.

        Safety Rules Precedence:
        1. ALWAYS call ClinicalSafetyEngine first.
        2. If any violation is found, clamp risk to HIGH or CRITICAL.
        3. Never diagnose diseases, prescribe medication, or alter dosages.
        """
        if isinstance(report, dict):
            report = SymptomReport.model_validate(report)

        # Resolve context-appropriate care team routing label
        first_specialty = (
            profile.follow_up_appointments[0].specialty
            if (profile and profile.follow_up_appointments)
            else None
        )
        care_team = resolve_care_team_label(
            primary_diagnosis=profile.primary_diagnosis if profile else None,
            specialty=first_specialty
        )

        # 1. Deterministic Vitals Check (Pre-LLM)
        vital_violations = ClinicalSafetyEngine.evaluate_vitals(
            systolic_bp=report.systolic_bp,
            diastolic_bp=report.diastolic_bp,
            heart_rate=report.heart_rate,
            spo2=report.spo2,
            temperature_f=report.measured_temp,
            weight_gain_24h_lbs=report.weight_gain_24h_lbs,
            care_team=care_team
        )

        # 2. Deterministic Symptom Keyword Check
        symptom_violations = ClinicalSafetyEngine.evaluate_symptom_keywords(
            report.symptom_description,
            care_team=care_team
        )

        all_violations = vital_violations + symptom_violations

        # 3. Deterministic Safety Override
        if all_violations:
            critical_violations = [v for v in all_violations if v.risk_level == RiskLevel.CRITICAL]
            if critical_violations:
                highest_risk = RiskLevel.CRITICAL
                primary = critical_violations[0]
            else:
                highest_risk = RiskLevel.HIGH
                primary = all_violations[0]

            sbar = SbarNote(
                situation=(
                    f"Safety Rule Triggered: {primary.rule_id}. "
                    f"Observed {primary.parameter}: {primary.observed_value} (Threshold: {primary.threshold})."
                ),
                background=(
                    f"Patient {report.patient_id} reported: '{report.symptom_description}' "
                    f"(Severity {report.severity_score}/10)."
                    + (f" Primary Diagnosis: {profile.primary_diagnosis}." if profile else "")
                ),
                assessment=(
                    f"{primary.clinical_note} Deterministic safety rule breached. "
                    f"Requires prompt clinical evaluation by the {care_team}."
                ),
                recommendation=(
                    f"Clinical triage nurse or {care_team} should review this case and initiate prompt patient contact. "
                    f"Confirm symptoms and clinical status directly with patient before intervention."
                )
            )

            return RiskAssessment(
                patient_id=report.patient_id,
                risk_level=highest_risk,
                deterministic_rule_triggered=f"{primary.rule_id} ({primary.observed_value})",
                clinical_reasoning=primary.clinical_note,
                immediate_patient_directive=primary.emergency_directive,
                care_team_action_required=True,
                sbar=sbar
            )

        # 4. Contextual Baseline Evaluation (No rule violations)
        risk_level = RiskLevel.LOW if report.severity_score <= 4 else RiskLevel.MODERATE
        reasoning = (
            "No immediate deterministic safety thresholds breached. "
            "Reported symptoms appear consistent with expected post-discharge healing trajectory."
        )
        directive = (
            "Continue resting and following your daily discharge care checklist. "
            "If your discomfort increases or new symptoms arise, please report them immediately."
        )

        return RiskAssessment(
            patient_id=report.patient_id,
            risk_level=risk_level,
            deterministic_rule_triggered=None,
            clinical_reasoning=reasoning,
            immediate_patient_directive=directive,
            care_team_action_required=False,
            sbar=None
        )
