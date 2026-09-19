/**
 * CareBridge AI: Frontend Synthetic Demo Data
 * Multi-patient cohort definitions matching backend JSON datasets.
 */
import { TriagePatientItem, CareTask, DischargeProfile, PatientBase } from './types';

export const SYNTHETIC_PATIENTS: Record<string, PatientBase> = {
  "PT-CABG-001": {
    id: "PT-CABG-001",
    first_name: "James",
    last_name: "Harrison",
    age: 71,
    gender: "Male",
    discharge_date: "2026-09-16",
    condition_category: "Cardiac Surgery",
    primary_care_physician: "Dr. Sarah Jenkins, MD (Cardiothoracic Surgery)",
    clinic_phone: "555-0199",
    emergency_contact: "Martha Harrison (Spouse) - 555-0198"
  },
  "PT-TKA-002": {
    id: "PT-TKA-002",
    first_name: "Elena",
    last_name: "Rostova",
    age: 66,
    gender: "Female",
    discharge_date: "2026-09-17",
    condition_category: "Orthopedic Surgery",
    primary_care_physician: "Dr. David Thorne, MD (Orthopedic Surgery)",
    clinic_phone: "555-0244",
    emergency_contact: "Alex Rostova (Son) - 555-0245"
  },
  "PT-CHF-003": {
    id: "PT-CHF-003",
    first_name: "Marcus",
    last_name: "Vance",
    age: 68,
    gender: "Male",
    discharge_date: "2026-09-17",
    condition_category: "Cardiovascular / Heart Failure",
    primary_care_physician: "Dr. Angela Martinez, MD (Heart Failure Specialist)",
    clinic_phone: "555-0312",
    emergency_contact: "Clarissa Vance (Daughter) - 555-0315"
  },
  "PT-PNA-004": {
    id: "PT-PNA-004",
    first_name: "Sarah",
    last_name: "Chen",
    age: 54,
    gender: "Female",
    discharge_date: "2026-09-17",
    condition_category: "Pulmonary / Infectious Disease",
    primary_care_physician: "Dr. Robert Liu, MD (Pulmonology)",
    clinic_phone: "555-0450",
    emergency_contact: "Kevin Chen (Brother) - 555-0452"
  }
};

export const SYNTHETIC_DISCHARGE_PROFILES: Record<string, DischargeProfile> = {
  "PT-CABG-001": {
    profile_id: "DP-CABG-001",
    patient_id: "PT-CABG-001",
    primary_diagnosis: "Triple-vessel Coronary Artery Disease (CAD), post-CABG x3",
    procedures: ["Coronary Artery Bypass Graft x3 (LIMA-LAD, SVG-OM1, SVG-RCA)"],
    discharge_date: "2026-09-16",
    dietary_instructions: "Heart-healthy, low sodium (<2,000 mg/day). Fluid intake 1.5L-2.0L daily.",
    activity_restrictions: "Sternal precautions: No lifting > 10 lbs for 6 weeks. Use cough pillow.",
    wound_care_instructions: "Inspect chest and leg incisions daily. Wash gently with mild soap.",
    medications: [
      {
        drug_name: "Metoprolol Succinate",
        dosage: "50 mg",
        route: "Oral",
        frequency: "Once daily in morning",
        schedule_slots: ["08:00"],
        indication: "Blood pressure and heart rate control post-CABG",
        is_discontinued: false
      },
      {
        drug_name: "Aspirin (Enteric Coated)",
        dosage: "81 mg",
        route: "Oral",
        frequency: "Once daily with breakfast",
        schedule_slots: ["08:00"],
        indication: "Antiplatelet for graft patency",
        is_discontinued: false
      },
      {
        drug_name: "Clopidogrel (Plavix)",
        dosage: "75 mg",
        route: "Oral",
        frequency: "Once daily in evening",
        schedule_slots: ["20:00"],
        indication: "Secondary antiplatelet prevention",
        is_discontinued: false,
        warning: "Do not skip."
      },
      {
        drug_name: "Atorvastatin",
        dosage: "40 mg",
        route: "Oral",
        frequency: "Once daily at bedtime",
        schedule_slots: ["21:00"],
        indication: "Lipid control",
        is_discontinued: false
      }
    ],
    red_flag_warnings: [
      "Chest pain, pressure, or pain radiating to left arm or jaw",
      "Fever of 101.5°F (38.6°C) or higher",
      "Redness, heat, or persistent discharge from chest incision",
      "Clicking or shifting sensation in the breastbone (sternum)",
      "Shortness of breath not relieved by resting"
    ],
    follow_up_appointments: [
      {
        provider: "Dr. Sarah Jenkins",
        specialty: "Cardiothoracic Surgery",
        clinic_name: "Metro Heart & Vascular Center",
        date_time: "2026-09-30T10:30:00",
        contact_number: "555-0199"
      }
    ]
  },
  "PT-TKA-002": {
    profile_id: "DP-TKA-002",
    patient_id: "PT-TKA-002",
    primary_diagnosis: "Severe Right Knee Osteoarthritis, post-operative arthroplasty",
    procedures: ["Right Total Knee Arthroplasty (TKA)"],
    discharge_date: "2026-09-17",
    dietary_instructions: "Regular balanced diet, high protein for tissue healing, adequate fiber and hydration.",
    activity_restrictions: "Weight bearing as tolerated with rolling walker. Do not pivot or twist on operative knee. Avoid pillows directly under knee.",
    wound_care_instructions: "Keep waterproof dressing intact until clinic visit. Ice operative knee 20 minutes every 2 hours as needed for swelling.",
    medications: [
      {
        drug_name: "Enoxaparin (Lovenox)",
        dosage: "40 mg / 0.4 mL",
        route: "Subcutaneous Injection",
        frequency: "Once daily for 14 days",
        schedule_slots: ["09:00"],
        indication: "DVT / PE prophylaxis post joint arthroplasty",
        is_discontinued: false,
        warning: "Critical blood thinner. Do not miss doses. Rotate abdomen injection sites."
      },
      {
        drug_name: "Celecoxib (Celebrex)",
        dosage: "200 mg",
        route: "Oral",
        frequency: "Once daily in the morning with food",
        schedule_slots: ["08:00"],
        indication: "Anti-inflammatory pain control",
        is_discontinued: false
      },
      {
        drug_name: "Acetaminophen (Tylenol)",
        dosage: "500 mg",
        route: "Oral",
        frequency: "Every 6 hours as needed (Max 3,000 mg/24h)",
        schedule_slots: ["06:00", "12:00", "18:00", "22:00"],
        indication: "Baseline post-op analgesia",
        is_discontinued: false
      },
      {
        drug_name: "Oxycodone",
        dosage: "5 mg",
        route: "Oral",
        frequency: "Every 4-6 hours PRN severe breakthrough pain only",
        schedule_slots: [],
        indication: "Breakthrough post-surgical pain",
        is_discontinued: false,
        warning: "May cause drowsiness. Taper as pain improves."
      }
    ],
    red_flag_warnings: [
      "Calf pain, cramping, localized swelling, redness, or heat in either calf (warning sign of DVT)",
      "Sudden shortness of breath, rapid breathing, or sharp chest pain on inhalation",
      "Fever over 101.5°F, shaking chills, or foul-smelling drainage from knee dressing",
      "Sudden inability to bear weight or severe uncontrolled pain"
    ],
    follow_up_appointments: [
      {
        provider: "Dr. David Thorne",
        specialty: "Orthopedic Surgery",
        clinic_name: "Valley Joint Replacement Institute",
        date_time: "2026-10-01T09:00:00",
        contact_number: "555-0244"
      },
      {
        provider: "Summit Physical Therapy",
        specialty: "Physical Therapy",
        clinic_name: "Valley PT Clinic",
        date_time: "2026-09-22T13:30:00",
        contact_number: "555-0280"
      }
    ]
  },
  "PT-CHF-003": {
    profile_id: "DP-CHF-003",
    patient_id: "PT-CHF-003",
    primary_diagnosis: "Acute on Chronic Systolic Heart Failure Exacerbation (HFrEF, EF 30%)",
    procedures: ["Inpatient IV Diuresis and Guideline-Directed Medical Therapy (GDMT) optimization"],
    discharge_date: "2026-09-17",
    dietary_instructions: "Strict low sodium (<2,000 mg daily). Strict fluid restriction of 1.5 Liters (48 oz) per day.",
    activity_restrictions: "Pace daily activities. Rest when fatigued. No vigorous exertion.",
    wound_care_instructions: "No surgical wounds. Inspect lower legs and ankles daily for pitting edema.",
    medications: [
      {
        drug_name: "Furosemide (Lasix)",
        dosage: "40 mg",
        route: "Oral",
        frequency: "Twice daily (Morning and 2 PM)",
        schedule_slots: ["08:00", "14:00"],
        indication: "Loop diuretic for fluid control and edema prevention",
        is_discontinued: false,
        warning: "Do not skip. Weigh self daily."
      },
      {
        drug_name: "Sacubitril / Valsartan (Entresto)",
        dosage: "24/26 mg",
        route: "Oral",
        frequency: "Twice daily",
        schedule_slots: ["08:00", "20:00"],
        indication: "ARNI for heart failure neurohormonal blockade",
        is_discontinued: false
      },
      {
        drug_name: "Carvedilol (Coreg)",
        dosage: "12.5 mg",
        route: "Oral",
        frequency: "Twice daily with meals",
        schedule_slots: ["08:00", "18:00"],
        indication: "Beta blocker for cardiac remodeling",
        is_discontinued: false
      },
      {
        drug_name: "Potassium Chloride (Klor-Con)",
        dosage: "20 mEq",
        route: "Oral",
        frequency: "Once daily with morning Lasix",
        schedule_slots: ["08:00"],
        indication: "Electrolyte repletion due to diuretic loss",
        is_discontinued: false
      }
    ],
    red_flag_warnings: [
      "Weight gain of 3 lbs or more in a single day, or 5 lbs in one week",
      "Shortness of breath when lying flat requiring extra pillows (orthopnea)",
      "Waking up suddenly at night gasping for air (paroxysmal nocturnal dyspnea)",
      "New or worsening swelling in ankles, legs, or abdomen",
      "Dizziness, lightheadedness, or feeling faint when standing up",
      "Resting heart rate consistently above 110 or below 50 bpm"
    ],
    follow_up_appointments: [
      {
        provider: "Dr. Angela Martinez",
        specialty: "Heart Failure Clinic",
        clinic_name: "University Heart Center",
        date_time: "2026-09-24T11:00:00",
        contact_number: "555-0312"
      }
    ]
  },
  "PT-PNA-004": {
    profile_id: "DP-PNA-004",
    patient_id: "PT-PNA-004",
    primary_diagnosis: "Severe Right Lower Lobe Community-Acquired Pneumonia, resolved sepsis",
    procedures: ["Inpatient IV Ceftriaxone and Azithromycin therapy, transitioned to oral antibiotics"],
    discharge_date: "2026-09-17",
    dietary_instructions: "Well-balanced diet, generous oral hydration (at least 2 Liters of water daily to thin pulmonary secretions).",
    activity_restrictions: "Gradual return to activities. Daily rest periods. Avoid tobacco smoke and environmental irritants.",
    wound_care_instructions: "No surgical wounds. Monitor IV catheter puncture sites for phlebitis.",
    medications: [
      {
        drug_name: "Levofloxacin (Levaquin)",
        dosage: "750 mg",
        route: "Oral",
        frequency: "Once daily for 5 more days (Finish full course!)",
        schedule_slots: ["09:00"],
        indication: "Targeted oral antibiotic to eradicate residual pulmonary infection",
        is_discontinued: false,
        warning: "CRITICAL: Complete the full course even if feeling better."
      },
      {
        drug_name: "Albuterol HFA Inhaler",
        dosage: "90 mcg/actuation",
        route: "Inhaled",
        frequency: "1-2 puffs every 4-6 hours as needed for wheezing or tightness",
        schedule_slots: [],
        indication: "Bronchodilator for reactive airway symptoms",
        is_discontinued: false
      },
      {
        drug_name: "Guaifenesin (Mucinex)",
        dosage: "600 mg",
        route: "Oral",
        frequency: "Every 12 hours with full glass of water",
        schedule_slots: ["08:00", "20:00"],
        indication: "Expectorant to loosen bronchial mucus",
        is_discontinued: false
      }
    ],
    red_flag_warnings: [
      "Oxygen saturation (SpO2) dropping to 90% or lower on pulse oximeter",
      "Return of high fever (101.5°F / 38.6°C or higher) or severe rigors/shaking chills",
      "Coughing up significant amounts of bright red blood (hemoptysis)",
      "Sharp pleuritic chest pain that worsens when breathing deeply",
      "Confusion, disorientation, or extreme lethargy"
    ],
    follow_up_appointments: [
      {
        provider: "Dr. Robert Liu",
        specialty: "Pulmonology Outpatient Clinic",
        clinic_name: "Metro Chest & Allergy Specialists",
        date_time: "2026-09-29T14:30:00",
        contact_number: "555-0450"
      }
    ]
  }
};

export const SYNTHETIC_CARE_TASKS: Record<string, CareTask[]> = {
  "PT-CABG-001": [
    {
      task_id: "CABG-T-01",
      patient_id: "PT-CABG-001",
      day_number: 2,
      category: "MEDICATION",
      title: "Morning Cardioprotective Medications",
      description: "Take Metoprolol 50mg and Aspirin 81mg with breakfast.",
      scheduled_time: "Morning (with breakfast)",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "Take Metoprolol 50mg and Aspirin 81mg with breakfast.",
      status: "COMPLETED"
    },
    {
      task_id: "CABG-T-02",
      patient_id: "PT-CABG-001",
      day_number: 2,
      category: "VITAL_CHECK",
      title: "Morning Vitals & Dry Weight Log",
      description: "Record resting blood pressure, pulse, and dry morning weight.",
      scheduled_time: "Morning",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "Record resting blood pressure, pulse, and dry morning weight.",
      status: "COMPLETED"
    },
    {
      task_id: "CABG-T-03",
      patient_id: "PT-CABG-001",
      day_number: 2,
      category: "WOUND_CARE",
      title: "Sternal & Leg Incision Inspection",
      description: "Check incision for warmth, unusual redness, or drainage.",
      scheduled_time: "Daily",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "Check incision for warmth, unusual redness, or drainage.",
      status: "PENDING"
    },
    {
      task_id: "CABG-T-04",
      patient_id: "PT-CABG-001",
      day_number: 2,
      category: "PHYSICAL_THERAPY",
      title: "Incentive Spirometer Breathing Exercise",
      description: "10 slow, deep inhalations using incentive spirometer.",
      scheduled_time: "Daily as tolerated",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "10 slow, deep inhalations using incentive spirometer.",
      status: "PENDING"
    },
    {
      task_id: "CABG-T-05",
      patient_id: "PT-CABG-001",
      day_number: 2,
      category: "MEDICATION",
      title: "Evening Antiplatelet (Plavix 75mg)",
      description: "Take Clopidogrel 75mg. Essential for bypass graft protection.",
      scheduled_time: "Evening",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "Take Clopidogrel 75mg once daily.",
      status: "PENDING"
    }
  ],
  "PT-TKA-002": [
    {
      task_id: "TKA-T-01",
      patient_id: "PT-TKA-002",
      day_number: 2,
      category: "MEDICATION",
      title: "Morning Anti-inflammatory & Pain Regimen",
      description: "Take Celebrex 200mg with breakfast.",
      scheduled_time: "Morning (with breakfast)",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "Take Celebrex 200mg with breakfast.",
      status: "COMPLETED"
    },
    {
      task_id: "TKA-T-02",
      patient_id: "PT-TKA-002",
      day_number: 2,
      category: "MEDICATION",
      title: "Daily DVT Anticoagulant Injection (Lovenox)",
      description: "Inject 40mg Lovenox subcutaneously into abdomen skin fold. Alternate sides.",
      scheduled_time: "Morning",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "Inject 40mg Lovenox subcutaneously once daily.",
      status: "COMPLETED"
    },
    {
      task_id: "TKA-T-03",
      patient_id: "PT-TKA-002",
      day_number: 2,
      category: "PHYSICAL_THERAPY",
      title: "Home PT: Ankle Pumps & Quad Sets",
      description: "Perform 20 ankle pumps and 10 quad heel slides to maintain circulation.",
      scheduled_time: "Daily",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "Home PT: 20 ankle pumps and 10 quad heel slides.",
      status: "PENDING"
    },
    {
      task_id: "TKA-T-04",
      patient_id: "PT-TKA-002",
      day_number: 2,
      category: "WOUND_CARE",
      title: "Knee Dressing Check & Cryotherapy (Ice)",
      description: "Apply cold pack over knee dressing for 20 mins. Confirm dressing is dry.",
      scheduled_time: "PRN (As needed)",
      timing_type: "PRN_AS_NEEDED",
      documented_instruction: "Ice operative knee 20 minutes every 2 hours as needed for swelling.",
      status: "PENDING"
    }
  ],
  "PT-CHF-003": [
    {
      task_id: "CHF-T-01",
      patient_id: "PT-CHF-003",
      day_number: 2,
      category: "VITAL_CHECK",
      title: "Morning Dry Weight & Blood Pressure Log",
      description: "Weigh yourself first thing after urination, before breakfast. Record weight accurately.",
      scheduled_time: "Morning (before breakfast)",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "Weigh yourself first thing after urination, before breakfast.",
      status: "COMPLETED"
    },
    {
      task_id: "CHF-T-02",
      patient_id: "PT-CHF-003",
      day_number: 2,
      category: "MEDICATION",
      title: "Morning Diuretic & Heart Failure Meds",
      description: "Take Furosemide 40mg, Entresto, Carvedilol, and Potassium Chloride with breakfast.",
      scheduled_time: "Morning (with breakfast)",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "Take Furosemide 40mg, Entresto, Carvedilol, and Potassium Chloride with breakfast.",
      status: "COMPLETED"
    },
    {
      task_id: "CHF-T-03",
      patient_id: "PT-CHF-003",
      day_number: 2,
      category: "HYDRATION_DIET",
      title: "Fluid Intake Checkpoint (Limit 1.5L / 48 oz)",
      description: "Log total fluid consumed so far today. Remember soup and ice count toward your limit.",
      scheduled_time: "Daily with meals",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "Fluid intake limit 1.5L / 48 oz daily.",
      status: "PENDING"
    },
    {
      task_id: "CHF-T-04",
      patient_id: "PT-CHF-003",
      day_number: 2,
      category: "MEDICATION",
      title: "Afternoon Diuretic Dose (Furosemide 40mg)",
      description: "Take second dose of Lasix. Taking before 2 PM prevents disrupted sleep.",
      scheduled_time: "Midday (before 2 PM)",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "Take second dose of Lasix before 2 PM.",
      status: "PENDING"
    }
  ],
  "PT-PNA-004": [
    {
      task_id: "PNA-T-01",
      patient_id: "PT-PNA-004",
      day_number: 2,
      category: "MEDICATION",
      title: "Morning Antibiotic (Levofloxacin 750mg)",
      description: "Take 1 tablet with a full glass of water. Must be completed daily without skipping.",
      scheduled_time: "Daily with water",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "Take 1 tablet with a full glass of water daily.",
      status: "COMPLETED"
    },
    {
      task_id: "PNA-T-02",
      patient_id: "PT-PNA-004",
      day_number: 2,
      category: "VITAL_CHECK",
      title: "Resting Pulse Oximeter & Temp Check",
      description: "Measure SpO2 and body temperature. Oxygen should remain above 92%.",
      scheduled_time: "Morning",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "Measure SpO2 and body temperature daily.",
      status: "COMPLETED"
    },
    {
      task_id: "PNA-T-03",
      patient_id: "PT-PNA-004",
      day_number: 2,
      category: "CHECK_IN",
      title: "Midday Respiratory Symptom Check-in",
      description: "Check in regarding cough, sputum color, and ease of breathing.",
      scheduled_time: "Daily",
      timing_type: "ROUTINE_WINDOW",
      documented_instruction: "Check in regarding cough, sputum color, and ease of breathing.",
      status: "PENDING"
    }
  ]
};

export const SYNTHETIC_MILESTONES: Record<string, Array<{ title: string; description: string }>> = {
  "PT-CABG-001": [
    {
      title: "Sternal Precautions",
      description: "No lifting >10 lbs. Hug cough pillow during coughing and deep breathing."
    },
    {
      title: "Pulmonary Hygiene",
      description: "Incentive spirometer 10 slow, deep inhalations every hour while awake."
    },
    {
      title: "Resting Telemetry Log",
      description: "Record daily dry morning weight, resting BP, and pulse before morning medications."
    }
  ],
  "PT-TKA-002": [
    {
      title: "Weight-Bearing & Mobility",
      description: "Weight bearing as tolerated with front-wheeled walker. Avoid pivoting on operative knee."
    },
    {
      title: "Thromboembolic Prophylaxis",
      description: "Strict compliance with daily subcutaneous Lovenox injection and active ankle pump sets."
    },
    {
      title: "Edema Control & Extension",
      description: "Cold therapy 20 mins every 2 hours. Keep knee straight with no pillows directly underneath."
    }
  ],
  "PT-CHF-003": [
    {
      title: "Strict Fluid Restriction",
      description: "Cap total daily fluid consumption to 1.5L (48 oz). Track all liquids and soups."
    },
    {
      title: "Dry Weight Telemetry",
      description: "Log dry weight first thing each morning after urination. Flag any gain >= 3 lbs in 24h."
    },
    {
      title: "Medication Adherence",
      description: "Take loop diuretic before 2 PM and maintain twice-daily GDMT heart failure medications."
    }
  ],
  "PT-PNA-004": [
    {
      title: "Antibiotic Completion",
      description: "Complete full 5-day oral Levofloxacin course without skipping doses to clear infection."
    },
    {
      title: "Oxygenation Monitoring",
      description: "Check resting pulse oximeter twice daily. Confirm oxygen saturation consistently exceeds 92%."
    },
    {
      title: "Airway Clearance",
      description: "Maintain fluid intake > 2L daily and take Guaifenesin to facilitate bronchial mucus clearance."
    }
  ]
};

// Backwards-compatible legacy exports
export const DEMO_PATIENT: PatientBase = SYNTHETIC_PATIENTS["PT-CABG-001"];
export const DEMO_DISCHARGE_PROFILE: DischargeProfile = SYNTHETIC_DISCHARGE_PROFILES["PT-CABG-001"];
export const DEMO_CARE_TASKS: CareTask[] = SYNTHETIC_CARE_TASKS["PT-CABG-001"];

export const DEMO_TRIAGE_PATIENTS: TriagePatientItem[] = [
  {
    patient_id: "PT-CABG-001",
    name: "James Harrison",
    procedure: "CABG x3",
    discharge_date: "2026-09-16",
    days_post_op: 2,
    risk_level: "HIGH",
    status_alert: "Suspected Surgical Site Infection (Temp 101.8°F)",
    adherence_rate: 75.0,
    pending_escalation: true
  },
  {
    patient_id: "PT-CHF-003",
    name: "Marcus Vance",
    procedure: "Acute HFrEF Exacerbation",
    discharge_date: "2026-09-17",
    days_post_op: 1,
    risk_level: "MODERATE",
    status_alert: "Weight logged +1.5 lbs, monitoring fluid restriction",
    adherence_rate: 100.0,
    pending_escalation: false
  },
  {
    patient_id: "PT-TKA-002",
    name: "Elena Rostova",
    procedure: "Right TKA",
    discharge_date: "2026-09-17",
    days_post_op: 1,
    risk_level: "LOW",
    status_alert: "Adhering to Lovenox anticoagulant and ankle pump PT",
    adherence_rate: 100.0,
    pending_escalation: false
  },
  {
    patient_id: "PT-PNA-004",
    name: "Sarah Chen",
    procedure: "Community-Acquired Pneumonia",
    discharge_date: "2026-09-17",
    days_post_op: 1,
    risk_level: "LOW",
    status_alert: "Completed oral Levofloxacin dose 2/5, SpO2 96%",
    adherence_rate: 100.0,
    pending_escalation: false
  }
];
