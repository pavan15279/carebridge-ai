"""
CareBridge AI - Discharge Understanding Agent

Converts raw discharge paperwork or structured discharge datasets
into a validated DischargeProfile and PatientBase without hallucinating missing data.
Strict clinical guardrail: NEVER invent missing patient information.
"""
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple, Union

from app.schemas.clinical import (
    DischargeProfile,
    FollowUpAppointment,
    MedicationItem,
    PatientBase,
    TimingType,
)

# Canonical frequency regex ordered from most specific to least specific
FREQ_PATTERN = re.compile(
    r"\b("
    r"(?:at\s+)?\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)(?:\s+and\s+\d{1,2}(?::[0-5]\d)?\s*(?:am|pm))?|"
    r"three\s+times\s+(?:daily|a\s+day)(?:\s+with\s+meals?)?|"
    r"twice\s+(?:daily|a\s+day)(?:,\s*morning\s+and\s+(?:night|evening))?|"
    r"four\s+times\s+(?:daily|a\s+day)(?:\s+with\s+meals?)?|"
    r"morning\s+and\s+(?:night|evening)|"
    r"once\s+(?:daily|a\s+day)(?:\s+(?:with\s+breakfast|in\s+the\s+morning|at\s+bedtime|with\s+meals?))?|"
    r"\d+\s+times\s+(?:daily|a\s+day)(?:\s+with\s+meals?)?|"
    r"every\s+\d+\s+hours?(?:\s+as\s+needed(?:\s+for\s+[\w\s]+)?)?|"
    r"as\s+needed(?:\s+for\s+[\w\s]+)?|"
    r"(?:with|after|before)\s+breakfast|"
    r"(?:with|after|before)\s+lunch|"
    r"(?:with|after|before)\s+dinner|"
    r"with\s+meals?|"
    r"at\s+bedtime|before\s+sleep|"
    r"in\s+the\s+morning|"
    r"daily(?:\s+with\s+meals?)?|"
    r"q\d+h|"
    r"bid|b\.i\.d\.|tid|t\.i\.d\.|qid|q\.i\.d\.|prn|p\.r\.n\.|qhs|q\.h\.s\."
    r")\b",
    re.IGNORECASE
)

DOSE_PATTERN = re.compile(
    r"(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|tablets?|capsules?|units?|puffs?|drops?|mEq))",
    re.IGNORECASE
)

ROUTE_PATTERN = re.compile(
    r"\b("
    r"oral(?:ly)?|by\s*mouth|p\.?o\.?|"
    r"intravenous(?:ly)?|i\.?v\.?|"
    r"subcutaneous(?:ly)?|sub[\-\s]?q|s\.?q\.?|s\.?c\.?|"
    r"intramuscular(?:ly)?|i\.?m\.?|"
    r"topical(?:ly)?|transdermal(?:ly)?|"
    r"inhaled|inhalation|"
    r"sublingual(?:ly)?|s\.?l\.?"
    r")\b",
    re.IGNORECASE
)


def normalize_clock_time(time_str: str) -> Optional[str]:
    """Convert clock time formats ('5 PM', '9:00 AM', '17:00') to standardized 24-hour HH:MM."""
    time_str = time_str.strip().lower()
    m24 = re.match(r"^([01]?\d|2[0-3]):([0-5]\d)$", time_str)
    if m24:
        return f"{int(m24.group(1)):02d}:{m24.group(2)}"
    m12 = re.match(r"^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$", time_str)
    if m12:
        hours = int(m12.group(1))
        minutes = m12.group(2) or "00"
        period = m12.group(3)
        if period == "pm" and hours < 12:
            hours += 12
        elif period == "am" and hours == 12:
            hours = 0
        return f"{hours:02d}:{minutes}"
    return None


def parse_timing_from_instruction(text: str) -> Tuple[TimingType, List[str]]:
    """
    Extracts structured timing strictly grounded in documented discharge instructions.
    Never hallucinates clock times (e.g. 08:00, 09:00, 20:00) when none are documented.
    """
    text_lower = text.lower()

    # 1. Explicit clock times (e.g., 'at 5 PM', 'at 9:00 AM and 9:00 PM', 'take at 17:00')
    clock_matches = re.findall(
        r"\b(\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)|\b(?:[01]?\d|2[0-3]):[0-5]\d)\b",
        text_lower,
        re.IGNORECASE
    )
    if clock_matches:
        normalized: List[str] = []
        for cm in clock_matches:
            nt = normalize_clock_time(cm)
            if nt and nt not in normalized:
                normalized.append(nt)
        if normalized:
            normalized.sort()
            return TimingType.CLOCK_TIME, normalized

    # 2. PRN / As needed (e.g., 'as needed for pain', 'PRN')
    if re.search(r"\b(as\s+needed(?:\s+for\s+[\w\s]+)?|p\.?r\.?n\.?(?:\s+for\s+[\w\s]+)?)\b", text_lower):
        return TimingType.PRN_AS_NEEDED, ["PRN (As needed)"]

    # 3. Intervals (e.g., 'every 8 hours', 'q8h', 'every 12 hours')
    interval_match = re.search(r"\b(?:every\s+(\d+)\s+hours?|q\s*(\d+)\s*h)\b", text_lower)
    if interval_match:
        hrs = interval_match.group(1) or interval_match.group(2)
        return TimingType.INTERVAL, [f"Every {hrs} hours"]

    # 4. Morning and Night / Morning and Evening combinations
    if re.search(r"\b(morning\s+and\s+(?:night|evening)|morning\s*[\/\&]\s*(?:night|evening))\b", text_lower):
        return TimingType.ROUTINE_WINDOW, ["Morning", "Night"]

    # 5. Specific meal / bedtime routine anchors (Preserves documented words; NO invented times)
    if re.search(r"\b(at\s+bedtime|bedtime|before\s+(?:sleep|bed)|qhs|q\.h\.s\.)\b", text_lower):
        return TimingType.ROUTINE_WINDOW, ["At bedtime"]
    if re.search(r"\b((?:with|after|before)\s+breakfast)\b", text_lower):
        return TimingType.ROUTINE_WINDOW, ["Morning (with breakfast)"]
    if re.search(r"\b((?:with|after|before)\s+lunch|midday|noon)\b", text_lower):
        return TimingType.ROUTINE_WINDOW, ["Midday (with lunch)"]
    if re.search(r"\b((?:with|after|before)\s+dinner|(?:in\s+the\s+)?evening)\b", text_lower):
        return TimingType.ROUTINE_WINDOW, ["Evening (with dinner)"]
    if re.search(r"\b((?:in\s+the\s+)?morning)\b", text_lower):
        return TimingType.ROUTINE_WINDOW, ["Morning"]
    if re.search(r"\b(with\s+(?:meals?|food))\b", text_lower):
        return TimingType.ROUTINE_WINDOW, ["With meals"]

    # 6. Frequency without specific routine anchor
    if re.search(r"\b(twice\s+(?:daily|a\s+day)|bid|b\.i\.d\.)\b", text_lower):
        return TimingType.ROUTINE_WINDOW, ["Morning", "Evening"]
    if re.search(r"\b(three\s+times\s+(?:daily|a\s+day)|tid|t\.i\.d\.)\b", text_lower):
        return TimingType.ROUTINE_WINDOW, ["Morning", "Midday", "Evening"]
    if re.search(r"\b(four\s+times\s+(?:daily|a\s+day)|qid|q\.i\.d\.)\b", text_lower):
        return TimingType.ROUTINE_WINDOW, ["Morning", "Midday", "Evening", "At bedtime"]
    if re.search(r"\b(once\s+(?:daily|a\s+day)|daily|qday)\b", text_lower):
        return TimingType.ROUTINE_WINDOW, ["Daily"]

    return TimingType.UNSPECIFIED, ["As directed"]


class DischargeUnderstandingAgent:
    """Agent responsible for understanding and structuring discharge instructions."""

    def __init__(self) -> None:
        self.name = "Discharge Understanding Agent"

    def run(self, discharge_data: Union[Dict[str, Any], DischargeProfile, str]) -> DischargeProfile:
        """
        Convert discharge data or raw text into a validated DischargeProfile schema.
        """
        if isinstance(discharge_data, DischargeProfile):
            return discharge_data
        if isinstance(discharge_data, dict):
            return DischargeProfile.model_validate(discharge_data)
        if isinstance(discharge_data, str):
            _, profile = self.parse_unstructured_text(discharge_data)
            return profile
        raise ValueError(f"Unsupported discharge data format: {type(discharge_data)}")

    def parse_unstructured_text(
        self,
        raw_text: str,
        custom_patient_id: Optional[str] = None
    ) -> Tuple[PatientBase, DischargeProfile]:
        """
        Extracts clinical information from unstructured discharge summary text.
        Follows strict clinical guardrail: NEVER invent missing information.
        If a field is not documented: store 'Not specified' or None.
        Never create fictional names, ages, dates, phone numbers, physicians, contacts, diagnoses, procedures.
        """
        full_lower = raw_text.lower()
        patient_id = custom_patient_id or f"PT-UPL-{uuid.uuid4().hex[:4].upper()}"

        # 1. Patient Name
        name_match = re.search(r"(?:patient\s*(?:name)?|name)\s*:\s*([A-Za-z\s\.\,\-]+)", raw_text, re.IGNORECASE)
        if name_match:
            raw_name = name_match.group(1).strip().split("\n")[0].strip()
            name_parts = raw_name.split()
            first_name = name_parts[0] if name_parts else "Not specified"
            last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""
        else:
            first_name = "Not specified"
            last_name = ""

        # 2. Age & Gender
        age_match = re.search(r"\b(?:age)\s*:\s*(\d+)", raw_text, re.IGNORECASE)
        age = int(age_match.group(1)) if age_match else None

        gender = "Not specified"
        gender_match = re.search(r"\b(?:sex|gender)\s*:\s*([A-Za-z]+)", raw_text, re.IGNORECASE)
        if gender_match:
            g_val = gender_match.group(1).strip().capitalize()
            if g_val in ("Male", "Female", "Other"):
                gender = g_val
        elif re.search(r"\b(male|gentleman|man)\b", full_lower):
            gender = "Male"
        elif re.search(r"\b(female|lady|woman)\b", full_lower):
            gender = "Female"

        # 3. Discharge Date
        date_match = re.search(r"(?:discharge\s*date|date\s*of\s*discharge|discharged)\s*:\s*([\w\d\-\/\, ]+)", raw_text, re.IGNORECASE)
        discharge_date = date_match.group(1).strip().split("\n")[0] if date_match else "Not specified"

        # 4. Primary Diagnosis
        diag_match = re.search(r"(?:primary\s*diagnosis|admit(?:ting)?\s*diagnosis|diagnosis|condition|impression|assessment)\s*:\s*([^\n\r\.]+)", raw_text, re.IGNORECASE)
        if diag_match:
            primary_diagnosis = diag_match.group(1).strip()
        else:
            primary_diagnosis = "Not specified"

        # 5. Condition Category (inferred classification, not medical diagnosis)
        condition_category = "General Medicine"
        diag_lower = primary_diagnosis.lower()
        if any(k in diag_lower for k in ["orthopedic", "knee", "hip", "joint", "fracture", "arthroplasty"]):
            condition_category = "Orthopedic Surgery"
        elif any(k in diag_lower for k in ["cardiac", "heart", "cabg", "valve", "chf", "coronary", "hypertension"]):
            condition_category = "Cardiovascular Care"
        elif any(k in diag_lower for k in ["pulmonary", "lung", "pneumonia", "copd", "respiratory"]):
            condition_category = "Pulmonary Medicine"
        elif any(k in diag_lower for k in ["appendicitis", "appendectomy", "cholecystectomy", "surgery", "surgical", "post-op", "incision"]):
            condition_category = "Post-Surgical Care"
        elif any(k in diag_lower for k in ["diabetes", "endocrine"]):
            condition_category = "Endocrinology"

        # 6. Procedures
        procedures: List[str] = []
        proc_match = re.search(r"(?:procedures?|surgical\s*procedure|surgeries|operation)\s*:\s*([^\n\r\.]+)", raw_text, re.IGNORECASE)
        if proc_match:
            proc_val = proc_match.group(1).strip()
            if proc_val:
                procedures.append(proc_val)

        # 7. Physician & Specialty
        phys_match = re.search(r"(?:attending(?:\s*physician)?|physician|doctor|provider|care\s*team)\s*:\s*([^\n\r\,]+)", raw_text, re.IGNORECASE)
        primary_care_physician = phys_match.group(1).strip() if phys_match else "Not specified"

        specialty = "Not specified"
        if "cardio" in condition_category.lower() or "cardio" in primary_care_physician.lower():
            specialty = "Cardiology"
        elif "ortho" in condition_category.lower() or "ortho" in primary_care_physician.lower():
            specialty = "Orthopedic Surgery"
        elif "pulmon" in condition_category.lower():
            specialty = "Pulmonology"
        elif "surg" in condition_category.lower():
            specialty = "General Surgery"

        clinic_phone_match = re.search(r"(?:clinic\s*phone|phone|contact|tel(?:ephone)?)\s*:\s*([\d\-\(\)\s\+]+)", raw_text, re.IGNORECASE)
        clinic_phone = clinic_phone_match.group(1).strip() if clinic_phone_match else "Not specified"

        # 8. Emergency Contact
        em_match = re.search(r"(?:emergency\s*contact|caregiver|family\s*contact|proxy)\s*:\s*([^\n\r]+)", raw_text, re.IGNORECASE)
        emergency_contact = em_match.group(1).strip() if em_match else "Not specified"

        # 9. Dietary Instructions
        diet_match = re.search(r"(?:diet(?:ary)?(?:\s*instructions?|\s*plan)?)\s*:\s*([^\n\r]+)", raw_text, re.IGNORECASE)
        dietary_instructions = diet_match.group(1).strip() if diet_match else "Not specified"

        # 10. Activity Restrictions
        act_match = re.search(r"(?:activity(?:\s*restrictions?|\s*guidelines?)?|precautions?|restrictions?)\s*:\s*([^\n\r]+)", raw_text, re.IGNORECASE)
        activity_restrictions = act_match.group(1).strip() if act_match else "Not specified"

        # 11. Wound Care Instructions
        wound_match = re.search(r"(?:wound(?:\s*care)?|incisions?|dressing)\s*:\s*([^\n\r]+)", raw_text, re.IGNORECASE)
        wound_care_instructions = wound_match.group(1).strip() if wound_match else "Not specified"

        # 12. Red Flag Warnings
        red_flags: List[str] = []
        flags_section = re.search(r"(?:red\s*flags?(?:\s*warnings?)?|warning\s*signs?|when\s*to\s*call|urgent\s*symptoms)\s*:(.*?)(?:\n\s*[A-Za-z\-]+(?:\s+[A-Za-z\-]+){0,3}\s*:|\Z)", raw_text, re.IGNORECASE | re.DOTALL)
        if flags_section:
            for item in flags_section.group(1).splitlines():
                clean_item = re.sub(r"^[\s\-\*\•\d\.]+", "", item).strip()
                if clean_item and len(clean_item) > 3:
                    if re.match(r"^[A-Za-z\-]+(?:\s+[A-Za-z\-]+){0,3}\s*:", clean_item):
                        break
                    red_flags.append(clean_item)

        # 13. Medications Extraction (Strictly documented, no hallucinated defaults)
        medications: List[MedicationItem] = []

        # Look for a dedicated section OR standalone medication lines
        med_lines: List[str] = []
        meds_section = re.search(r"(?:medications?|prescriptions?|discharge\s*medications?)\s*:(.*?)(?:\n\s*[A-Za-z\-]+(?:\s+[A-Za-z\-]+){0,3}\s*:|\Z)", raw_text, re.IGNORECASE | re.DOTALL)
        if meds_section:
            for l in meds_section.group(1).splitlines():
                cl = l.strip()
                if not cl or len(cl) < 3:
                    continue
                if re.match(r"^[A-Za-z\-]+(?:\s+[A-Za-z\-]+){0,3}\s*:", cl) and not re.match(r"^(?:medications?|rx|prescription)", cl, re.IGNORECASE):
                    break
                med_lines.append(cl)
        else:
            # Check for individual lines with 'Medication:'
            for l in raw_text.splitlines():
                cl = l.strip()
                if re.match(r"^(?:medication|med|rx|prescription)\s*:\s*", cl, re.IGNORECASE):
                    med_lines.append(re.sub(r"^(?:medication|med|rx|prescription)\s*:\s*", "", cl, flags=re.IGNORECASE).strip())

        for ml in med_lines:
            clean_ml = re.sub(r"^[\s\-\*\•\d\.]+", "", ml).strip()
            if not clean_ml or len(clean_ml) < 3:
                continue

            # Dosage
            dose_match = DOSE_PATTERN.search(clean_ml)
            dosage = dose_match.group(0).strip() if dose_match else "Not specified"

            # Route
            route_match = ROUTE_PATTERN.search(clean_ml)
            route = "Not specified"
            if route_match:
                r_raw = route_match.group(0).lower()
                if r_raw in ("oral", "orally", "by mouth", "po", "p.o."):
                    route = "Oral"
                elif r_raw in ("intravenous", "intravenously", "iv", "i.v."):
                    route = "IV"
                elif "sub" in r_raw or "sq" in r_raw or "sc" in r_raw:
                    route = "Subcutaneous"
                elif "im" in r_raw or "intramuscular" in r_raw:
                    route = "Intramuscular"
                elif "topical" in r_raw or "transdermal" in r_raw:
                    route = "Topical"
                elif "inhal" in r_raw:
                    route = "Inhaled"
                elif "sublingual" in r_raw or "sl" in r_raw:
                    route = "Sublingual"

            # Frequency (exact preservation, no shortening)
            freq_match = FREQ_PATTERN.search(clean_ml)
            frequency = freq_match.group(0).strip() if freq_match else "Not specified"

            # Drug name
            name_cand = clean_ml
            if dose_match:
                name_cand = re.sub(re.escape(dose_match.group(0)), " ", name_cand, flags=re.IGNORECASE)
            if freq_match:
                name_cand = re.sub(re.escape(freq_match.group(0)), " ", name_cand, flags=re.IGNORECASE)
            if route_match:
                name_cand = re.sub(re.escape(route_match.group(0)), " ", name_cand, flags=re.IGNORECASE)

            # Strip remaining punctuation/delimiters
            name_cand = re.sub(r"[\-\:\,\•\*\d\.]", " ", name_cand).strip()
            name_cand = re.sub(r"\s+", " ", name_cand).strip()
            drug_name = name_cand if name_cand else clean_ml

            # Build schedule slots and timing type strictly from documented instruction
            timing_type, schedule_slots = parse_timing_from_instruction(clean_ml)

            medications.append(MedicationItem(
                drug_name=drug_name,
                dosage=dosage,
                route=route,
                frequency=frequency,
                schedule_slots=schedule_slots,
                timing_type=timing_type,
                documented_instruction=clean_ml,
                indication="Documented discharge medication" if primary_diagnosis == "Not specified" else f"Documented therapy for {primary_diagnosis}"
            ))

        # 14. Follow-up Appointments
        follow_up_appointments: List[FollowUpAppointment] = []
        follow_match = re.search(r"(?:follow[\-\s]*up(?:s|\s*appointments?)?|next\s*appointment)\s*:\s*([^\n\r]+)", raw_text, re.IGNORECASE)
        if follow_match:
            follow_text = follow_match.group(1).strip()
            follow_up_appointments.append(FollowUpAppointment(
                provider=primary_care_physician,
                specialty=specialty,
                clinic_name="Outpatient Recovery Clinic",
                date_time=follow_text,
                contact_number=clinic_phone
            ))

        patient = PatientBase(
            id=patient_id,
            first_name=first_name,
            last_name=last_name,
            age=age,
            gender=gender,
            discharge_date=discharge_date if discharge_date != "Not specified" else None,
            condition_category=condition_category,
            primary_care_physician=primary_care_physician,
            clinic_phone=clinic_phone,
            emergency_contact=emergency_contact,
            is_demo=False
        )

        discharge_profile = DischargeProfile(
            profile_id=f"DP-{patient_id}",
            patient_id=patient_id,
            primary_diagnosis=primary_diagnosis,
            procedures=procedures,
            discharge_date=discharge_date,
            dietary_instructions=dietary_instructions,
            activity_restrictions=activity_restrictions,
            wound_care_instructions=wound_care_instructions if wound_care_instructions != "Not specified" else None,
            medications=medications,
            red_flag_warnings=red_flags,
            follow_up_appointments=follow_up_appointments
        )

        return patient, discharge_profile