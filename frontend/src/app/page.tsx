'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Stethoscope,
  User,
  Heart,
  Pill,
  Thermometer,
  ChevronRight,
  RefreshCw,
  ArrowRight,
  Info,
  Sparkles,
  Wifi,
  WifiOff,
  PhoneCall,
  ListTodo,
  AlertOctagon,
  Calendar,
  Check,
  Upload,
  Send,
  X,
  FileUp,
  FileCheck2,
  Sliders,
  Clock3,
  UserPlus,
  LogOut,
  Lock,
  Mail,
  Bell,
  BellRing,
  BellOff
} from 'lucide-react';

import {
  ActiveToastNotification,
  calculateTaskDueStatus,
  requestNotificationPermission,
  sendBrowserNotification,
  formatReminderContent,
} from '../lib/reminderEngine';

import {
  PatientBase,
  DischargeProfile,
  CareTask,
  RiskLevel,
  RiskAssessment,
  SbarNote,
  SymptomReport,
  RecoveryEvent,
  RecoveryState,
  CreatePatientRequest
} from '../lib/types';
import {
  SYNTHETIC_PATIENTS,
  SYNTHETIC_DISCHARGE_PROFILES,
  SYNTHETIC_CARE_TASKS,
  SYNTHETIC_MILESTONES,
  DEMO_TRIAGE_PATIENTS
} from '../lib/synthetic-data';

// Configurable API base URL with fallback to local backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

interface EscalationTicketData {
  ticket_id: string;
  patient_id: string;
  patient_name: string;
  risk_level: RiskLevel;
  triggered_rule: string;
  draft_sbar: {
    disclaimer: string;
    situation: string;
    background: string;
    assessment: string;
    recommendation: string;
    generated_at: string;
  };
  status: string;
  assigned_clinician?: string | null;
  clinician_action_notes?: string | null;
}

interface FollowUpResponseData {
  reply: string;
  risk_level: RiskLevel;
  suggested_action: string;
  disclaimer: string;
}

interface WorkflowResult {
  patient_id: string;
  patient_name: string;
  primary_diagnosis: string;
  discharge_profile: DischargeProfile;
  recovery_plan?: {
    patient_id: string;
    generated_for_diagnosis?: string;
    duration_days: number;
    current_phase: number | string;
    milestones?: Array<{ day?: number; title?: string; description?: string } | string>;
    phases?: Array<{
      phase_number: number;
      name: string;
      day_start: number;
      day_end: number;
      milestones: string[];
    }>;
  };
  monitoring?: {
    total_tasks: number;
    completed: number;
    completed_count?: number;
    pending: number;
    missed: number;
    skipped: number;
    adherence_percentage: number;
    active_tasks?: CareTask[];
  };
  symptom_report?: SymptomReport | null;
  risk_assessment?: RiskAssessment | null;
  escalation_ticket?: EscalationTicketData | null;
  followup_response?: FollowUpResponseData | null;
  workflow_route?: string | null;
  recovery_state?: RecoveryState | null;
  status?: string;
}

// Demo & dynamic patients list for patient selector
export interface PatientOption {
  id: string;
  name: string;
  condition: string;
  age?: number;
  gender?: string;
  is_demo?: boolean;
}

const DEFAULT_PATIENT_OPTIONS: PatientOption[] = [
  { id: 'PT-CABG-001', name: 'James Harrison', condition: 'CABG x3 (Triple Bypass)', age: 71, gender: 'Male', is_demo: true },
  { id: 'PT-TKA-002', name: 'Elena Rostova', condition: 'Right Total Knee Arthroplasty', age: 66, gender: 'Female', is_demo: true },
  { id: 'PT-CHF-003', name: 'Marcus Vance', condition: 'Heart Failure Exacerbation', age: 68, gender: 'Male', is_demo: true },
  { id: 'PT-PNA-004', name: 'Sarah Chen', condition: 'Community-Acquired Pneumonia', age: 54, gender: 'Female', is_demo: true },
];

export default function DashboardPage() {
  // Authentication & Demo Session State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authPatientId, setAuthPatientId] = useState<string>('');
  const [authPatientName, setAuthPatientName] = useState<string>('');
  const [authSessionToken, setAuthSessionToken] = useState<string>('');
  const [authChecked, setAuthChecked] = useState<boolean>(false);

  // Login Form State
  const [loginMode, setLoginMode] = useState<'demo' | 'email'>('demo');
  const [loginPatientId, setLoginPatientId] = useState<string>('PT-CABG-001');
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('CareBridge@123');
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Signup State
  const [showSignup, setShowSignup] = useState<boolean>(false);
  const [signupFullName, setSignupFullName] = useState<string>('');
  const [signupEmail, setSignupEmail] = useState<string>('');
  const [signupPassword, setSignupPassword] = useState<string>('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState<string>('');
  const [signupLoading, setSignupLoading] = useState<boolean>(false);
  const [signupError, setSignupError] = useState<string | null>(null);

  // ── Reminder Engine State ──────────────────────────────────────────────────
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [activeToasts, setActiveToasts] = useState<ActiveToastNotification[]>([]);
  const [notifiedTaskIds, setNotifiedTaskIds] = useState<string[]>([]);
  const [demoReminderCountdown, setDemoReminderCountdown] = useState<number | null>(null);

  const [selectedPatientId, setSelectedPatientId] = useState<string>('PT-CABG-001');
  const [patientOptions, setPatientOptions] = useState<PatientOption[]>(DEFAULT_PATIENT_OPTIONS);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeScenario, setActiveScenario] = useState<string>('routine');
  
  // Interactive simulation mode: 'scenarios' | 'custom_input'
  const [simulationMode, setSimulationMode] = useState<'scenarios' | 'custom_input'>('scenarios');

  // Real-time custom telemetry input fields
  const [customSymptom, setCustomSymptom] = useState<string>('');
  const [customSeverity, setCustomSeverity] = useState<number>(3);
  const [customTemp, setCustomTemp] = useState<string>('');
  const [customSysBP, setCustomSysBP] = useState<string>('');
  const [customDiaBP, setCustomDiaBP] = useState<string>('');
  const [customHeartRate, setCustomHeartRate] = useState<string>('');
  const [customSpo2, setCustomSpo2] = useState<string>('');
  const [customWeightGain, setCustomWeightGain] = useState<string>('');

  // Upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [uploadText, setUploadText] = useState<string>('');
  const [uploadLoading, setUploadLoading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Add New Patient Modal state
  const [isAddPatientModalOpen, setIsAddPatientModalOpen] = useState<boolean>(false);
  const [newPatientName, setNewPatientName] = useState<string>('');
  const [newPatientAge, setNewPatientAge] = useState<string>('');
  const [newPatientGender, setNewPatientGender] = useState<string>('Male');
  const [newPatientContact, setNewPatientContact] = useState<string>('');
  const [newPatientEmergencyContact, setNewPatientEmergencyContact] = useState<string>('');
  const [newPatientDischargeDate, setNewPatientDischargeDate] = useState<string>('');
  const [newPatientDiagnosis, setNewPatientDiagnosis] = useState<string>('');
  const [newPatientProcedure, setNewPatientProcedure] = useState<string>('');
  const [newPatientCareTeam, setNewPatientCareTeam] = useState<string>('');
  const [newPatientDischargeText, setNewPatientDischargeText] = useState<string>('');
  const [createPatientLoading, setCreatePatientLoading] = useState<boolean>(false);
  const [createPatientError, setCreatePatientError] = useState<string | null>(null);

  // Dynamic patient maps for local offline & instant switching access
  const [customPatientsMap, setCustomPatientsMap] = useState<Record<string, PatientBase>>({});
  const [customProfilesMap, setCustomProfilesMap] = useState<Record<string, DischargeProfile>>({});

  // Clinical review verification state
  const [clinicianName, setClinicianName] = useState<string>('Dr. Evelyn Reed, MD (Cardiothoracic Surgery)');
  const [reviewNotes, setReviewNotes] = useState<string>('Evaluated patient telemetry; authorized continued home recovery monitoring.');
  const [reviewLoading, setReviewLoading] = useState<boolean>(false);
  const [reviewSuccessMessage, setReviewSuccessMessage] = useState<string | null>(null);

  // Recovery timeline events
  const [timelineEvents, setTimelineEvents] = useState<RecoveryEvent[]>([]);

  // Patient & workflow state initialized from selected patient's dataset
  const [patient, setPatient] = useState<PatientBase>(
    () => SYNTHETIC_PATIENTS['PT-CABG-001']
  );
  const [tasks, setTasks] = useState<CareTask[]>(
    () => SYNTHETIC_CARE_TASKS['PT-CABG-001'] || []
  );
  const [workflowState, setWorkflowState] = useState<WorkflowResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Active discharge profile derived from live workflow or custom profile or selected patient's synthetic profile
  const activeProfile: DischargeProfile =
    workflowState?.discharge_profile ||
    customProfilesMap[selectedPatientId] ||
    SYNTHETIC_DISCHARGE_PROFILES[selectedPatientId] || {
      profile_id: `DP-${selectedPatientId}`,
      patient_id: selectedPatientId,
      primary_diagnosis: patient.condition_category || 'Post-Discharge Recovery',
      procedures: [],
      discharge_date: patient.discharge_date || '2026-09-18',
      dietary_instructions: 'Standard recovery nutrition with oral fluid hydration as tolerated.',
      activity_restrictions: 'Gentle resting and light activity as tolerated. Avoid strenuous physical exertion.',
      wound_care_instructions: 'Not specified in available discharge information.',
      medications: [],
      red_flag_warnings: [
        'Core body temperature of 101.5°F (38.6°C) or higher',
        'Severe chest pain, crushing pressure, or difficulty breathing',
        'Sudden unilateral calf pain, swelling, or redness',
        'Severe dizziness, persistent nausea, or sudden loss of consciousness'
      ],
      follow_up_appointments: []
    };

  // Fetch chronological timeline from backend
  const fetchTimeline = useCallback(async (patientId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/patients/${patientId}/timeline`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(authSessionToken ? { Authorization: `Bearer ${authSessionToken}` } : {}),
        },
      });
      if (res.ok) {
        const data: RecoveryEvent[] = await res.json();
        setTimelineEvents(data);
      }
    } catch {
      // Offline fallback
    }
  }, [authSessionToken]);

  // Fetch patient list from backend to include any dynamically uploaded patients
  const fetchPatientList = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/patients`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data: PatientBase[] = await res.json();
        const map: Record<string, PatientBase> = {};
        const formatted: PatientOption[] = data.map((p) => {
          map[p.id] = p;
          const isDemo =
            p.is_demo !== undefined
              ? p.is_demo
              : p.id.startsWith('PT-CABG') ||
                p.id.startsWith('PT-TKA') ||
                p.id.startsWith('PT-CHF') ||
                p.id.startsWith('PT-PNA');
          return {
            id: p.id,
            name: `${p.first_name} ${p.last_name}`.trim(),
            condition: p.condition_category || 'Post-Discharge',
            age: p.age,
            gender: p.gender,
            is_demo: isDemo,
          };
        });
        setPatientOptions(formatted);
        setCustomPatientsMap((prev) => ({ ...map, ...prev }));
      }
    } catch {
      // Retain default demo list
    }
  }, []);

  // Check backend health on mount
  const checkBackendHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        setBackendOnline(true);
        setApiError(null);
      } else {
        setBackendOnline(false);
      }
    } catch {
      setBackendOnline(false);
    }
  }, []);

  // Restore authenticated session from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('carebridge_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.session_token && parsed.patient_id) {
          setAuthSessionToken(parsed.session_token);
          setAuthPatientId(parsed.patient_id);
          setAuthPatientName(parsed.patient_name || parsed.patient_id);
          setSelectedPatientId(parsed.patient_id);
          setIsAuthenticated(true);
        }
      }
    } catch {
      // Ignore sessionStorage parsing error
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkBackendHealth();
    fetchPatientList();
  }, [checkBackendHealth, fetchPatientList]);

  useEffect(() => {
    if (isAuthenticated && selectedPatientId) {
      fetchTimeline(selectedPatientId);
    }
  }, [isAuthenticated, selectedPatientId, fetchTimeline]);

  // Execute workflow via API or robust local fallback
  const runSimulationScenario = useCallback(
    async (scenarioKey: 'routine' | 'mild' | 'fever' | 'chest_pain', targetPatientId?: string) => {
      const patientId = targetPatientId || selectedPatientId;
      const currentPatient = SYNTHETIC_PATIENTS[patientId] || SYNTHETIC_PATIENTS['PT-CABG-001'];
      const currentProfile = SYNTHETIC_DISCHARGE_PROFILES[patientId] || SYNTHETIC_DISCHARGE_PROFILES['PT-CABG-001'];

      setActiveScenario(scenarioKey);
      setLoading(true);
      setApiError(null);

      // Build patient-appropriate payload based on scenario
      let symptomReport: SymptomReport | null = null;
      if (scenarioKey === 'mild') {
        let mildDesc = 'Mild incisional discomfort when moving; no redness or unusual swelling.';
        let mildLocation = 'surgical site';
        if (patientId === 'PT-TKA-002') {
          mildDesc = 'Mild right knee stiffness and soreness after morning physical therapy; dressing dry and intact.';
          mildLocation = 'right knee';
        } else if (patientId === 'PT-CHF-003') {
          mildDesc = 'Mild fatigue and leg heaviness after walking; no shortness of breath, ankles comfortable.';
          mildLocation = 'lower extremities';
        } else if (patientId === 'PT-PNA-004') {
          mildDesc = 'Mild throat irritation and occasional dry cough; breathing comfortable at rest.';
          mildLocation = 'upper respiratory';
        } else if (patientId === 'PT-CABG-001') {
          mildDesc = 'Mild chest incision soreness when taking deep breaths; no redness or fluid noted.';
          mildLocation = 'sternal incision';
        }

        symptomReport = {
          patient_id: patientId,
          symptom_description: mildDesc,
          severity_score: 3,
          measured_temp: 98.6,
          systolic_bp: 124,
          diastolic_bp: 78,
          heart_rate: 72,
          spo2: 98,
          anatomical_location: mildLocation,
        };
      } else if (scenarioKey === 'fever') {
        symptomReport = {
          patient_id: patientId,
          symptom_description: 'Patient reports feeling chilled and feverish; measured temperature elevated.',
          severity_score: 6,
          measured_temp: 101.8,
          systolic_bp: 128,
          diastolic_bp: 82,
          heart_rate: 96,
          spo2: 97,
          anatomical_location: patientId === 'PT-TKA-002' ? 'right knee' : patientId === 'PT-CABG-001' ? 'chest incision' : 'core body',
        };
      } else if (scenarioKey === 'chest_pain') {
        symptomReport = {
          patient_id: patientId,
          symptom_description: 'Severe crushing chest pain radiating to the jaw and left arm; onset 15 minutes ago.',
          severity_score: 9,
          measured_temp: 98.7,
          systolic_bp: 168,
          diastolic_bp: 98,
          heart_rate: 110,
          spo2: 94,
          anatomical_location: 'substernal chest',
        };
      }

      // Try calling live backend API first
      let success = false;
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/workflow/${patientId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(authSessionToken ? { Authorization: `Bearer ${authSessionToken}` } : {}),
          },
          body: symptomReport ? JSON.stringify(symptomReport) : undefined,
        });

        if (response.ok) {
          const data: WorkflowResult = await response.json();
          setWorkflowState(data);

          // Update tasks from live monitoring agent if tasks returned
          if (data.monitoring?.active_tasks && data.monitoring.active_tasks.length > 0) {
            setTasks(data.monitoring.active_tasks);
          } else {
            setTasks(SYNTHETIC_CARE_TASKS[patientId] || []);
          }

          setBackendOnline(true);
          success = true;
        } else {
          setBackendOnline(false);
          setApiError(`Backend returned status ${response.status}. Using patient-specific synthetic fallback.`);
        }
      } catch (err: unknown) {
        setBackendOnline(false);
        const message = err instanceof Error ? err.message : 'Network error';
        setApiError(`Backend unreachable at ${API_BASE_URL} (${message}). Operating in offline mode.`);
      }

      // If backend was offline, provide patient-grounded deterministic local fallback
      if (!success) {
        // Fallback tasks for selected patient
        setTasks(SYNTHETIC_CARE_TASKS[patientId] || []);

        let fallbackResult: WorkflowResult;

        if (scenarioKey === 'chest_pain') {
          fallbackResult = {
            patient_id: patientId,
            patient_name: `${currentPatient.first_name} ${currentPatient.last_name}`,
            primary_diagnosis: currentProfile.primary_diagnosis,
            discharge_profile: currentProfile,
            workflow_route: 'ESCALATION_COORDINATION_AGENT',
            status: 'COMPLETED',
            symptom_report: symptomReport,
            risk_assessment: {
              patient_id: patientId,
              risk_level: 'CRITICAL',
              deterministic_rule_triggered: 'RULE-SYMP-CHEST ("chest pain")',
              clinical_reasoning:
                'Reported severe chest pain is a deterministic high-priority safety trigger requiring immediate emergency evaluation. The system does not determine the underlying medical cause.',
              immediate_patient_directive:
                'EMERGENCY DIRECTIVE: Call 911 immediately or proceed to the nearest emergency department. Stop all physical activity. Do not drive yourself.',
              care_team_action_required: true,
              sbar: {
                situation: 'Triggered Safety Rule RULE-SYMP-CHEST: acute chest distress reported.',
                background: `Patient ${patientId} (${currentPatient.first_name} ${currentPatient.last_name}), post-discharge Day 2 for ${currentProfile.primary_diagnosis}.`,
                assessment: 'Deterministic high-priority safety trigger breached. Urgent in-person emergency evaluation required.',
                recommendation: 'Immediate 911 dispatch and on-call clinical notification.',
              },
            },
            escalation_ticket: {
              ticket_id: `ESC-${Date.now().toString().slice(-6)}`,
              patient_id: patientId,
              patient_name: `${currentPatient.first_name} ${currentPatient.last_name}`,
              risk_level: 'CRITICAL',
              triggered_rule: 'RULE-SYMP-CHEST (Chest Pain)',
              status: 'OPEN',
              assigned_clinician: 'On-Call Surgical Fellow',
              draft_sbar: {
                disclaimer:
                  '⚠️ AI-GENERATED DRAFT — REQUIRES HEALTHCARE PROFESSIONAL CLINICAL REVIEW AND VALIDATION BEFORE ACTION',
                situation: 'Triggered Safety Rule RULE-SYMP-CHEST: acute chest distress reported.',
                background: `Patient ${patientId} (${currentPatient.first_name} ${currentPatient.last_name}), ${currentPatient.age}yo ${currentPatient.gender} on post-discharge Day 2.`,
                assessment: 'Deterministic safety trigger requiring immediate emergency evaluation. The system does not determine the underlying medical cause.',
                recommendation: 'Dispatch 911 emergency services; alert on-call clinical team.',
                generated_at: new Date().toISOString(),
              },
            },
          };
        } else if (scenarioKey === 'fever') {
          fallbackResult = {
            patient_id: patientId,
            patient_name: `${currentPatient.first_name} ${currentPatient.last_name}`,
            primary_diagnosis: currentProfile.primary_diagnosis,
            discharge_profile: currentProfile,
            workflow_route: 'ESCALATION_COORDINATION_AGENT',
            status: 'COMPLETED',
            symptom_report: symptomReport,
            risk_assessment: {
              patient_id: patientId,
              risk_level: 'HIGH',
              deterministic_rule_triggered: 'RULE-VITAL-TEMP (101.8°F >= 101.5°F)',
              clinical_reasoning:
                'Reported temperature exceeds the deterministic safety threshold. This is a high-priority safety trigger requiring prompt clinical evaluation. The system does not determine the underlying medical cause.',
              immediate_patient_directive:
                'Alerting your surgical care team now. Please rest quietly while your care team is notified for clinical triage evaluation.',
              care_team_action_required: true,
              sbar: {
                situation: 'Triggered Safety Rule RULE-VITAL-TEMP: core temperature 101.8°F.',
                background: `Patient ${patientId} (${currentPatient.first_name} ${currentPatient.last_name}), post-discharge Day 2 for ${currentProfile.primary_diagnosis}.`,
                assessment: 'Deterministic temperature safety threshold breached. Urgent in-person or telephone triage evaluation required by care team.',
                recommendation: 'Triage nurse or on-call clinician should contact patient promptly for clinical evaluation.',
              },
            },
            escalation_ticket: {
              ticket_id: `ESC-${Date.now().toString().slice(-6)}`,
              patient_id: patientId,
              patient_name: `${currentPatient.first_name} ${currentPatient.last_name}`,
              risk_level: 'HIGH',
              triggered_rule: 'RULE-VITAL-TEMP (101.8°F)',
              status: 'OPEN',
              assigned_clinician: 'Triage Nurse Sarah',
              draft_sbar: {
                disclaimer:
                  '⚠️ AI-GENERATED DRAFT — REQUIRES HEALTHCARE PROFESSIONAL CLINICAL REVIEW AND VALIDATION BEFORE ACTION',
                situation: 'Triggered Safety Rule RULE-VITAL-TEMP: core temp measured 101.8°F.',
                background: `Patient ${patientId} (${currentPatient.first_name} ${currentPatient.last_name}), ${currentPatient.age}yo ${currentPatient.gender} on post-discharge Day 2.`,
                assessment: 'Reported temperature exceeds the deterministic safety threshold. High-priority safety trigger requiring clinical evaluation. The system does not determine the underlying medical cause.',
                recommendation: 'Clinical triage review required. Clinician to contact patient and determine clinical management plan.',
                generated_at: new Date().toISOString(),
              },
            },
          };
        } else if (scenarioKey === 'mild') {
          fallbackResult = {
            patient_id: patientId,
            patient_name: `${currentPatient.first_name} ${currentPatient.last_name}`,
            primary_diagnosis: currentProfile.primary_diagnosis,
            discharge_profile: currentProfile,
            workflow_route: 'FOLLOW_UP_AGENT',
            status: 'COMPLETED',
            symptom_report: symptomReport,
            risk_assessment: {
              patient_id: patientId,
              risk_level: 'LOW',
              deterministic_rule_triggered: undefined,
              clinical_reasoning:
                'No deterministic safety thresholds violated. Reported mild discomfort is consistent with expected healing trajectory.',
              immediate_patient_directive:
                `Continue resting and adhering to prescribed discharge guidelines: '${currentProfile.activity_restrictions}'. If discomfort increases, report it promptly.`,
              care_team_action_required: false,
            },
            followup_response: {
              reply:
                `Hello ${currentPatient.first_name}, based on your discharge instructions for ${currentProfile.primary_diagnosis}, please keep in mind: '${currentProfile.activity_restrictions}'. For dietary management, continue adhering to: '${currentProfile.dietary_instructions}'. If you have ongoing concerns, please contact ${currentPatient.primary_care_physician} at ${currentPatient.clinic_phone}.`,
              risk_level: 'LOW',
              suggested_action: 'Complete your scheduled daily care tasks and monitor your resting vitals.',
              disclaimer:
                'CareBridge AI is a clinical decision-support prototype and does not replace licensed healthcare professionals.',
            },
          };
        } else {
          // Routine check-in
          fallbackResult = {
            patient_id: patientId,
            patient_name: `${currentPatient.first_name} ${currentPatient.last_name}`,
            primary_diagnosis: currentProfile.primary_diagnosis,
            discharge_profile: currentProfile,
            workflow_route: 'FOLLOW_UP_AGENT',
            status: 'COMPLETED',
            risk_assessment: {
              patient_id: patientId,
              risk_level: 'LOW',
              deterministic_rule_triggered: undefined,
              clinical_reasoning:
                'Routine daily recovery monitoring: Vitals nominal, task adherence at baseline. No safety rule deviations detected.',
              immediate_patient_directive:
                `Continue following your discharge care plan and activity guidelines: '${currentProfile.activity_restrictions}'.`,
              care_team_action_required: false,
            },
            followup_response: {
              reply:
                `Good day ${currentPatient.first_name}. Your recovery tracking is logged on schedule for ${currentProfile.primary_diagnosis}. Please continue following your discharge instructions and scheduled medications.`,
              risk_level: 'LOW',
              suggested_action: 'Review today\'s scheduled care tasks and resting vitals log.',
              disclaimer:
                'CareBridge AI is a clinical decision-support prototype and does not replace licensed healthcare professionals.',
            },
          };
        }

        setWorkflowState(fallbackResult);
      }

      setLoading(false);
    },
    [selectedPatientId]
  );

  // Sample discharge text template for instant 1-click testing
  const SAMPLE_DISCHARGE_TEXT = `DISCHARGE SUMMARY
Patient: Robert Miller
Age: 62
Gender: Male
Date of Admission: 2026-09-12
Date of Discharge: 2026-09-17
Attending Physician: Dr. Sarah Jenkins, MD
Primary Diagnosis: Acute Appendicitis s/p Laparoscopic Appendectomy
Procedure: Laparoscopic Appendectomy
Allergies: Penicillin (severe hives)
Discharge Medications:
1. Acetaminophen 650 mg PO Q6H PRN pain
2. Ciprofloxacin 500 mg PO BID x 5 days
Activity Restrictions: No lifting over 10 lbs for 2 weeks. Ambulate 15 minutes daily.
Dietary Instructions: Low residue diet for 48 hours, advance as tolerated. Hydrate 2L daily.
Wound Care: Keep laparoscopic port dressings clean and dry. Remove sterile strips after 7 days.
Red Flag Warning Signs: Fever >= 101.5 F, persistent nausea, worsening right lower quadrant pain.
Follow-Up: Outpatient clinic appointment in 10 days with Dr. Jenkins at (555) 234-5678.`;

  // Handle patient selection change: completely reset state and trigger fresh workflow
  const handleSelectPatient = useCallback(
    (newPatientId: string) => {
      setSelectedPatientId(newPatientId);
      const foundOption = patientOptions.find((p) => p.id === newPatientId);
      const nextPatient =
        SYNTHETIC_PATIENTS[newPatientId] ||
        customPatientsMap[newPatientId] || {
          id: newPatientId,
          first_name: foundOption?.name.split(' ')[0] || 'Patient',
          last_name: foundOption?.name.split(' ').slice(1).join(' ') || 'User',
          age: foundOption?.age,
          gender: foundOption?.gender || 'Not specified',
          discharge_date: '2026-09-18',
          condition_category: foundOption?.condition || 'Post-Discharge Recovery',
          primary_care_physician: 'Not specified',
          clinic_phone: 'Not specified',
          emergency_contact: 'Not specified',
          is_demo: false,
        };
      setPatient(nextPatient);
      setTasks(SYNTHETIC_CARE_TASKS[newPatientId] || []);
      setWorkflowState(null);
      setActiveScenario('routine');
      runSimulationScenario('routine', newPatientId);
      fetchTimeline(newPatientId);
    },
    [runSimulationScenario, patientOptions, customPatientsMap, fetchTimeline]
  );

  // Initialize on mount
  useEffect(() => {
    runSimulationScenario('routine', selectedPatientId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time task action state transition ('complete', 'snooze', 'miss')
  const handleTaskAction = async (taskId: string, action: 'complete' | 'snooze' | 'miss') => {
    // 1. Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => {
        if (t.task_id === taskId) {
          let nextStatus: CareTask['status'] = 'COMPLETED';
          if (action === 'snooze') nextStatus = 'SNOOZED';
          else if (action === 'miss') nextStatus = 'MISSED';
          else if (t.status === 'COMPLETED') nextStatus = 'PENDING';
          return { ...t, status: nextStatus };
        }
        return t;
      })
    );

    // 2. Call backend if online
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/patients/${selectedPatientId}/tasks/${taskId}/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ notes: `Action '${action}' executed by patient via dashboard` }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.recovery_state?.active_tasks) {
          setTasks(data.recovery_state.active_tasks);
        }
        fetchTimeline(selectedPatientId);
      }
    } catch {
      // Local fallback event logging
      const localEvent: RecoveryEvent = {
        event_id: `evt_${Date.now().toString().slice(-6)}`,
        run_id: `run_local_${Date.now().toString().slice(-4)}`,
        patient_id: selectedPatientId,
        event_type:
          action === 'complete'
            ? 'TASK_COMPLETED'
            : action === 'snooze'
            ? 'TASK_SNOOZED'
            : 'TASK_MISSED',
        task_id: taskId,
        status: action.toUpperCase(),
        value: `Task ${taskId} marked as ${action}`,
        source: 'PATIENT',
        timestamp: new Date().toISOString(),
      };
      setTimelineEvents((prev) => [localEvent, ...prev]);
    }
  };

  // Human Clinical Review verification loop
  const handleClinicalReview = async () => {
    const ticketId =
      workflowState?.escalation_ticket?.ticket_id || `TICK-${selectedPatientId}-REV`;
    setReviewLoading(true);
    setReviewSuccessMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/escalations/${ticketId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatientId,
          clinician_name: clinicianName,
          action_notes: reviewNotes,
        }),
      });
      if (res.ok) {
        setReviewSuccessMessage(
          `Clinical review completed by ${clinicianName}. Escalation marked RESOLVED.`
        );
        setWorkflowState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            workflow_route: 'VERIFIED_AND_RESOLVED',
            risk_assessment: prev.risk_assessment
              ? {
                  ...prev.risk_assessment,
                  risk_level: 'MODERATE',
                  clinical_reasoning: `Clinical Review Completed: ${reviewNotes} (Verified by ${clinicianName})`,
                  care_team_action_required: false,
                }
              : null,
            escalation_ticket: prev.escalation_ticket
              ? {
                  ...prev.escalation_ticket,
                  status: 'RESOLVED',
                  assigned_clinician: clinicianName,
                  clinician_action_notes: reviewNotes,
                }
              : null,
          };
        });
        fetchTimeline(selectedPatientId);
      }
    } catch {
      // Local fallback
      setReviewSuccessMessage(`Simulated verification completed by ${clinicianName}.`);
      setWorkflowState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workflow_route: 'VERIFIED_AND_RESOLVED',
          risk_assessment: prev.risk_assessment
            ? {
                ...prev.risk_assessment,
                risk_level: 'MODERATE',
                care_team_action_required: false,
              }
            : null,
          escalation_ticket: prev.escalation_ticket
            ? {
                ...prev.escalation_ticket,
                status: 'RESOLVED',
                assigned_clinician: clinicianName,
              }
            : null,
        };
      });
    } finally {
      setReviewLoading(false);
    }
  };

  // ── Reminder Engine Effects & Handlers ──────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      sendBrowserNotification(
        'CareBridge AI Reminders Enabled',
        'You will receive browser notifications when your scheduled recovery tasks become due.'
      );
    }
  };

  const handleTriggerDemoReminder = () => {
    if (demoReminderCountdown !== null) return;
    setDemoReminderCountdown(60);
  };

  // Demo 1-minute reminder countdown effect (Requirement 15)
  useEffect(() => {
    if (demoReminderCountdown === null) return;

    if (demoReminderCountdown > 0) {
      const timer = setTimeout(() => {
        setDemoReminderCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (demoReminderCountdown === 0) {
      const targetTask = tasks.find((t) => t.status === 'PENDING') || tasks[0] || {
        task_id: 'TASK-DEMO-01',
        patient_id: selectedPatientId,
        day_number: 2,
        category: 'CHECK_IN' as const,
        title: 'Daily Recovery Check-In',
        description: 'Verify recovery status and record today’s health updates.',
        scheduled_time: 'Now',
        status: 'PENDING' as const,
      };

      const content = formatReminderContent(targetTask, true);
      const newToast: ActiveToastNotification = {
        id: `toast_demo_${Date.now()}`,
        task_id: targetTask.task_id,
        title: content.title,
        message: content.message,
        scheduled_time: targetTask.scheduled_time,
        category: targetTask.category,
        is_medication: targetTask.category === 'MEDICATION',
        timestamp: Date.now(),
        is_demo: true,
      };

      setActiveToasts((prev) => [newToast, ...prev.slice(0, 4)]);
      sendBrowserNotification(content.title, content.message, `demo-${targetTask.task_id}`);
      setDemoReminderCountdown(null);
    }
  }, [demoReminderCountdown, tasks, selectedPatientId]);

  // Periodic Reminder Engine Interval (runs every 15 seconds)
  useEffect(() => {
    if (!isAuthenticated || tasks.length === 0) return;

    const checkReminders = () => {
      const now = new Date();
      tasks.forEach((task) => {
        // Requirement 10: If task is COMPLETED, do not remind
        if (task.status === 'COMPLETED') return;

        const dueStatus = calculateTaskDueStatus(
          task.scheduled_time,
          task.status,
          now,
          task.timing_type,
          task.category
        );
        if (dueStatus === 'DUE' && !notifiedTaskIds.includes(task.task_id)) {
          setNotifiedTaskIds((prev) => [...prev, task.task_id]);

          const content = formatReminderContent(task, false);
          const newToast: ActiveToastNotification = {
            id: `toast_${task.task_id}_${Date.now()}`,
            task_id: task.task_id,
            title: content.title,
            message: content.message,
            scheduled_time: task.scheduled_time,
            category: task.category,
            timing_type: task.timing_type,
            documented_instruction: task.documented_instruction,
            is_medication: task.category === 'MEDICATION',
            timestamp: Date.now(),
            is_demo: false,
          };

          setActiveToasts((prev) => [newToast, ...prev.slice(0, 4)]);
          sendBrowserNotification(content.title, content.message, task.task_id);
        }
      });
    };

    checkReminders();
    const interval = setInterval(checkReminders, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, tasks, notifiedTaskIds]);

  const handleDismissToast = (id: string) => {
    setActiveToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleCompleteFromToast = async (taskId: string, toastId: string) => {
    handleDismissToast(toastId);
    await handleTaskAction(taskId, 'complete');
  };

  // Upload unstructured discharge summary paperwork
  const handleUploadDischarge = async () => {
    if (!uploadText.trim()) {
      setUploadError('Please paste clinical discharge paperwork text.');
      return;
    }
    setUploadLoading(true);
    setUploadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/patients/upload-discharge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          filename: 'uploaded_discharge.txt',
          content: uploadText,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newPatient: PatientBase = data.patient;
        const newProfile: DischargeProfile = data.discharge_profile;
        const newPlan = data.recovery_plan;
        const newTasks: CareTask[] = data.recovery_state?.active_tasks || [];

        const opt: PatientOption = {
          id: newPatient.id,
          name: `${newPatient.first_name} ${newPatient.last_name}`,
          condition: newProfile.primary_diagnosis.split(' ')[0],
          age: newPatient.age,
          gender: newPatient.gender,
        };
        setPatientOptions((prev) => [opt, ...prev]);
        setSelectedPatientId(newPatient.id);
        setPatient(newPatient);
        setTasks(newTasks);

        setWorkflowState({
          patient_id: newPatient.id,
          patient_name: `${newPatient.first_name} ${newPatient.last_name}`,
          primary_diagnosis: newProfile.primary_diagnosis,
          discharge_profile: newProfile,
          recovery_plan: newPlan,
          workflow_route: 'INITIALIZED',
          status: 'COMPLETED',
          recovery_state: data.recovery_state,
        });

        setIsUploadModalOpen(false);
        setUploadText('');
        setCustomPatientsMap((prev) => ({ ...prev, [newPatient.id]: newPatient }));
        setCustomProfilesMap((prev) => ({ ...prev, [newPatient.id]: newProfile }));
        fetchTimeline(newPatient.id);
      } else {
        const err = await res.json();
        setUploadError(err.detail || 'Failed to process discharge document.');
      }
    } catch {
      setUploadError('Could not reach backend upload service.');
    } finally {
      setUploadLoading(false);
    }
  };

  // File reader for discharge summary upload in modal (supports .pdf, .txt, .text)
  const handleSummaryFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCreatePatientError(null);

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

    if (isPdf) {
      try {
        const buffer = await file.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Content = btoa(binary);

        const res = await fetch(`${API_BASE_URL}/api/v1/documents/extract-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            content_base64: base64Content,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text && data.text.trim()) {
            setNewPatientDischargeText(data.text);
          } else {
            setCreatePatientError(
              'Unable to extract text from this PDF. Please upload a text-based PDF or TXT discharge summary.'
            );
          }
        } else {
          const err = await res.json().catch(() => ({}));
          setCreatePatientError(
            err.detail || 'Unable to extract text from this PDF. Please upload a text-based PDF or TXT discharge summary.'
          );
        }
      } catch {
        setCreatePatientError(
          'Unable to extract text from this PDF. Please upload a text-based PDF or TXT discharge summary.'
        );
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text === 'string') {
          setNewPatientDischargeText(text);
        }
      };
      reader.readAsText(file);
    }
  };

  // File reader for unstructured paperwork modal (supports .pdf, .txt, .text)
  const handlePaperworkFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

    if (isPdf) {
      try {
        const buffer = await file.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Content = btoa(binary);

        const res = await fetch(`${API_BASE_URL}/api/v1/documents/extract-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            content_base64: base64Content,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text && data.text.trim()) {
            setUploadText(data.text);
          } else {
            setUploadError(
              'Unable to extract text from this PDF. Please upload a text-based PDF or TXT discharge summary.'
            );
          }
        } else {
          const err = await res.json().catch(() => ({}));
          setUploadError(
            err.detail || 'Unable to extract text from this PDF. Please upload a text-based PDF or TXT discharge summary.'
          );
        }
      } catch {
        setUploadError(
          'Unable to extract text from this PDF. Please upload a text-based PDF or TXT discharge summary.'
        );
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text === 'string') {
          setUploadText(text);
        }
      };
      reader.readAsText(file);
    }
  };

  // Dynamic Patient Creation Handler
  const handleCreatePatient = async (withDischargeSummary: boolean) => {
    if (!newPatientName.trim()) {
      setCreatePatientError('Patient Full Name is required.');
      return;
    }

    setCreatePatientLoading(true);
    setCreatePatientError(null);

    const payload: CreatePatientRequest = {
      name: newPatientName.trim(),
      age: newPatientAge ? parseInt(newPatientAge, 10) : undefined,
      gender: newPatientGender || 'Not specified',
      contact: newPatientContact.trim() || 'Not specified',
      emergency_contact: newPatientEmergencyContact.trim() || 'Not specified',
      discharge_date: newPatientDischargeDate.trim() || new Date().toISOString().split('T')[0],
      primary_diagnosis: newPatientDiagnosis.trim() || 'General Post-Discharge Recovery',
      condition_category: newPatientDiagnosis.trim() || 'General Post-Discharge Recovery',
      procedure: newPatientProcedure.trim() || undefined,
      physician_care_team: newPatientCareTeam.trim() || 'Not specified',
      discharge_summary_text: withDischargeSummary && newPatientDischargeText.trim() ? newPatientDischargeText.trim() : undefined,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/patients/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const createdPatient: PatientBase = data.patient;
        const createdProfile: DischargeProfile = data.discharge_profile;
        const createdPlan = data.recovery_plan;
        const createdTasks: CareTask[] = data.recovery_state?.active_tasks || [];

        const newOpt: PatientOption = {
          id: createdPatient.id,
          name: `${createdPatient.first_name} ${createdPatient.last_name}`.trim(),
          condition: createdProfile.primary_diagnosis.split(' ')[0],
          age: createdPatient.age,
          gender: createdPatient.gender,
          is_demo: false,
        };

        setPatientOptions((prev) => {
          const filtered = prev.filter((p) => p.id !== createdPatient.id);
          return [...filtered, newOpt];
        });

        setCustomPatientsMap((prev) => ({ ...prev, [createdPatient.id]: createdPatient }));
        setCustomProfilesMap((prev) => ({ ...prev, [createdPatient.id]: createdProfile }));

        // Immediately select the newly created patient
        setSelectedPatientId(createdPatient.id);
        setPatient(createdPatient);
        setTasks(createdTasks);
        setWorkflowState({
          patient_id: createdPatient.id,
          patient_name: `${createdPatient.first_name} ${createdPatient.last_name}`.trim(),
          primary_diagnosis: createdProfile.primary_diagnosis,
          discharge_profile: createdProfile,
          recovery_plan: createdPlan,
          monitoring: data.monitoring,
          workflow_route: 'INITIALIZED',
          recovery_state: data.recovery_state,
          status: 'COMPLETED',
        });

        setActiveScenario('routine');
        setIsAddPatientModalOpen(false);

        // Reset form inputs
        setNewPatientName('');
        setNewPatientAge('');
        setNewPatientGender('Male');
        setNewPatientContact('');
        setNewPatientEmergencyContact('');
        setNewPatientDischargeDate('');
        setNewPatientDiagnosis('');
        setNewPatientProcedure('');
        setNewPatientCareTeam('');
        setNewPatientDischargeText('');

        fetchTimeline(createdPatient.id);
      } else {
        const err = await res.json().catch(() => ({}));
        setCreatePatientError(err.detail || `Server error ${res.status}`);
      }
    } catch {
      // Local fallback in offline mode
      const fallbackId = `PT-USER-${Date.now().toString(16).slice(-6).toUpperCase()}`;
      const nameParts = newPatientName.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || 'Patient';
      const fallbackPatient: PatientBase = {
        id: fallbackId,
        first_name: firstName,
        last_name: lastName,
        age: newPatientAge ? parseInt(newPatientAge, 10) : undefined,
        gender: newPatientGender || 'Not specified',
        discharge_date: newPatientDischargeDate.trim() || new Date().toISOString().split('T')[0],
        condition_category: newPatientDiagnosis.trim() || 'Post-Discharge Recovery',
        primary_care_physician: newPatientCareTeam.trim() || 'Not specified',
        clinic_phone: newPatientContact.trim() || 'Not specified',
        emergency_contact: newPatientEmergencyContact.trim() || 'Not specified',
        is_demo: false,
      };
      const fallbackTasks: CareTask[] = [
        {
          task_id: `TASK-${fallbackId}-01`,
          patient_id: fallbackId,
          day_number: 2,
          category: 'VITAL_CHECK',
          title: 'Morning Resting Vitals & Temperature Check',
          description: 'Measure and record morning resting temperature, pulse, and blood pressure.',
          scheduled_time: '09:00',
          status: 'PENDING',
        },
        {
          task_id: `TASK-${fallbackId}-02`,
          patient_id: fallbackId,
          day_number: 2,
          category: 'HYDRATION_DIET',
          title: 'Hydration & Rest Protocol',
          description: 'Maintain regular oral hydration and take scheduled rest periods.',
          scheduled_time: '13:00',
          status: 'PENDING',
        },
        {
          task_id: `TASK-${fallbackId}-03`,
          patient_id: fallbackId,
          day_number: 2,
          category: 'CHECK_IN',
          title: 'Evening Recovery Status & Symptom Log',
          description: 'Log evening recovery comfort and record any new symptoms or concerns.',
          scheduled_time: '19:00',
          status: 'PENDING',
        },
      ];
      const fallbackOpt: PatientOption = {
        id: fallbackId,
        name: `${firstName} ${lastName}`.trim(),
        condition: fallbackPatient.condition_category || 'Post-Discharge',
        age: fallbackPatient.age,
        gender: fallbackPatient.gender,
        is_demo: false,
      };
      setPatientOptions((prev) => [...prev, fallbackOpt]);
      setCustomPatientsMap((prev) => ({ ...prev, [fallbackId]: fallbackPatient }));
      setSelectedPatientId(fallbackId);
      setPatient(fallbackPatient);
      setTasks(fallbackTasks);
      setIsAddPatientModalOpen(false);
    } finally {
      setCreatePatientLoading(false);
    }
  };

  // ── Login / Logout ────────────────────────────────────────────────────────
  const DEMO_CREDENTIALS: Record<string, string> = {
    'PT-CABG-001': 'CareBridge@123',
    'PT-TKA-002': 'CareBridge@123',
    'PT-CHF-003': 'CareBridge@123',
    'PT-PNA-004': 'CareBridge@123',
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupLoading(true);
    setSignupError(null);

    if (!signupFullName.trim()) {
      setSignupError('Full name is required');
      setSignupLoading(false);
      return;
    }
    if (!signupEmail.trim() || !signupEmail.includes('@')) {
      setSignupError('A valid email address is required');
      setSignupLoading(false);
      return;
    }
    if (signupPassword.length < 8) {
      setSignupError('Password must be at least 8 characters');
      setSignupLoading(false);
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      setSignupError('Passwords do not match');
      setSignupLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          full_name: signupFullName.trim(),
          email: signupEmail.trim(),
          password: signupPassword,
          confirm_password: signupConfirmPassword,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const token: string = data.session_token || '';
        const name: string = data.patient_name || signupFullName.trim();
        const pid: string = data.patient_id;

        sessionStorage.setItem(
          'carebridge_session',
          JSON.stringify({ session_token: token, patient_id: pid, patient_name: name })
        );
        setAuthSessionToken(token);
        setAuthPatientId(pid);
        setAuthPatientName(name);
        setSelectedPatientId(pid);
        setIsAuthenticated(true);
        await fetchPatientList();
        setSignupLoading(false);
        return;
      } else {
        const err = await res.json().catch(() => ({}));
        setSignupError(err.detail || `Signup failed (HTTP ${res.status})`);
        setSignupLoading(false);
      }
    } catch {
      setSignupError('Signup requires a connected backend server. Please check your backend connection.');
      setSignupLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    const isEmail = loginMode === 'email';
    const payload = isEmail
      ? { email: loginEmail.trim(), password: loginPassword }
      : { patient_id: loginPatientId.trim(), password: loginPassword };

    // 1. Try live backend authentication
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        const token: string = data.session_token || '';
        const name: string = data.patient_name || (isEmail ? loginEmail : loginPatientId);
        const pid: string = data.patient_id || (isEmail ? 'PT-USER-AUTH' : loginPatientId);
        sessionStorage.setItem(
          'carebridge_session',
          JSON.stringify({ session_token: token, patient_id: pid, patient_name: name })
        );
        setAuthSessionToken(token);
        setAuthPatientId(pid);
        setAuthPatientName(name);
        setSelectedPatientId(pid);
        setIsAuthenticated(true);
        await fetchPatientList();
        setLoginLoading(false);
        return;
      } else {
        const err = await res.json().catch(() => ({}));
        if (isEmail) {
          setLoginError(err.detail || 'Invalid email or password.');
          setLoginLoading(false);
          return;
        }
        // Fall through to client-side check on 401/404 for demo accounts
        if (res.status !== 401 && res.status !== 404) {
          setLoginError(err.detail || `Login failed (HTTP ${res.status})`);
          setLoginLoading(false);
          return;
        }
      }
    } catch {
      if (isEmail) {
        setLoginError('Email login requires a connected backend server. Switch to Demo Account to test offline.');
        setLoginLoading(false);
        return;
      }
      // Backend unreachable — fall through to client-side credential check for demo accounts
    }

    // 2. Client-side demo credential fallback (offline / backend down)
    const expectedPw = DEMO_CREDENTIALS[loginPatientId.trim()];
    if (!expectedPw) {
      setLoginError(`Patient ID '${loginPatientId.trim()}' not found. Use a demo account or check your ID.`);
      setLoginLoading(false);
      return;
    }
    if (loginPassword !== expectedPw) {
      setLoginError('Incorrect password. Demo password: CareBridge@123');
      setLoginLoading(false);
      return;
    }

    const offlineToken = `cb_offline_${Date.now().toString(16)}`;
    const offlineName =
      DEFAULT_PATIENT_OPTIONS.find((p) => p.id === loginPatientId.trim())?.name || loginPatientId.trim();

    sessionStorage.setItem(
      'carebridge_session',
      JSON.stringify({
        session_token: offlineToken,
        patient_id: loginPatientId.trim(),
        patient_name: offlineName,
      })
    );
    setAuthSessionToken(offlineToken);
    setAuthPatientId(loginPatientId.trim());
    setAuthPatientName(offlineName);
    setSelectedPatientId(loginPatientId.trim());
    setIsAuthenticated(true);
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    // Invalidate session on backend (best effort)
    if (authSessionToken) {
      try {
        await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authSessionToken}`, Accept: 'application/json' },
        });
      } catch {
        // Ignore network errors on logout
      }
    }
    sessionStorage.removeItem('carebridge_session');
    setIsAuthenticated(false);
    setAuthSessionToken('');
    setAuthPatientId('');
    setAuthPatientName('');
    setWorkflowState(null);
    setLoginPassword('CareBridge@123');
    setLoginError(null);
  };
  // ── End Login / Logout ────────────────────────────────────────────────────

  // Submit real-time live telemetry & evaluate through safety engine
  const handleCustomSymptomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !customSymptom.trim() &&
      !customTemp &&
      !customSysBP &&
      !customHeartRate &&
      !customSpo2 &&
      !customWeightGain
    ) {
      setApiError('Please enter a symptom description or at least one vital sign reading.');
      return;
    }

    setLoading(true);
    setApiError(null);

    const symptomReport: SymptomReport = {
      patient_id: selectedPatientId,
      symptom_description: customSymptom.trim() || 'Patient self-reported routine vitals log',
      severity_score: Number(customSeverity) || 3,
      measured_temp: customTemp ? parseFloat(customTemp) : undefined,
      systolic_bp: customSysBP ? parseInt(customSysBP, 10) : undefined,
      diastolic_bp: customDiaBP ? parseInt(customDiaBP, 10) : undefined,
      heart_rate: customHeartRate ? parseInt(customHeartRate, 10) : undefined,
      spo2: customSpo2 ? parseFloat(customSpo2) : undefined,
      weight_gain_24h_lbs: customWeightGain ? parseFloat(customWeightGain) : undefined,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/workflow/${selectedPatientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(symptomReport),
      });

      if (response.ok) {
        const data: WorkflowResult = await response.json();
        setWorkflowState(data);
        if (data.monitoring?.active_tasks && data.monitoring.active_tasks.length > 0) {
          setTasks(data.monitoring.active_tasks);
        }
        setBackendOnline(true);
        fetchTimeline(selectedPatientId);
      } else {
        setApiError(`Workflow evaluation returned HTTP ${response.status}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error';
      setApiError(`Could not submit custom telemetry: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // Compute adherence stats
  const completedTasksCount = tasks.filter((t) => t.status === 'COMPLETED').length;
  const snoozedTasksCount = tasks.filter((t) => t.status === 'SNOOZED').length;
  const missedTasksCount = tasks.filter((t) => t.status === 'MISSED').length;
  const pendingTasksCount = tasks.filter(
    (t) => t.status !== 'COMPLETED' && t.status !== 'SNOOZED' && t.status !== 'MISSED'
  ).length;
  const adherencePercent =
    tasks.length > 0 ? Math.round((completedTasksCount / tasks.length) * 100) : 100;

  // Active risk level
  const activeRiskLevel: RiskLevel = workflowState?.risk_assessment?.risk_level || 'LOW';

  // Dynamic milestones resolution: prefer live recovery_plan milestones, else synthetic patient milestones
  const activeMilestones: Array<{ title: string; description: string }> = (() => {
    // 1. Check if recovery_plan has a milestones array
    const planMilestones = workflowState?.recovery_plan?.milestones;
    if (Array.isArray(planMilestones) && planMilestones.length > 0) {
      return planMilestones.slice(0, 3).map((m: unknown) => {
        if (typeof m === 'string') {
          return { title: 'Recovery Milestone', description: m };
        }
        if (m && typeof m === 'object') {
          const obj = m as Record<string, unknown>;
          return {
            title: String(obj.title || (obj.day ? `Day ${obj.day} Milestone` : 'Recovery Milestone')),
            description: String(obj.description || ''),
          };
        }
        return { title: 'Recovery Milestone', description: String(m) };
      });
    }

    // 2. Check if recovery_plan has phases with milestones
    const phaseMilestones = workflowState?.recovery_plan?.phases?.[0]?.milestones;
    if (Array.isArray(phaseMilestones) && phaseMilestones.length > 0) {
      return phaseMilestones.slice(0, 3).map((m: unknown) => {
        if (typeof m === 'string') {
          return { title: 'Phase 1 Milestone', description: m };
        }
        if (m && typeof m === 'object') {
          const obj = m as Record<string, unknown>;
          return {
            title: String(obj.title || 'Phase 1 Milestone'),
            description: String(obj.description || ''),
          };
        }
        return { title: 'Phase 1 Milestone', description: String(m) };
      });
    }

    // 3. Fallback to patient-specific synthetic milestones
    return SYNTHETIC_MILESTONES[selectedPatientId] || SYNTHETIC_MILESTONES['PT-CABG-001'];
  })();

  // Badge styles based on risk level
  const getRiskBadgeStyles = (level: RiskLevel) => {
    switch (level) {
      case 'CRITICAL':
        return {
          container: 'bg-rose-50 border-rose-400 text-rose-900 ring-2 ring-rose-300',
          badge: 'bg-rose-600 text-white font-bold',
          icon: <AlertOctagon className="w-6 h-6 text-rose-600 animate-pulse" />,
          title: 'CRITICAL RISK DETECTED',
        };
      case 'HIGH':
        return {
          container: 'bg-orange-50 border-orange-300 text-orange-900',
          badge: 'bg-orange-600 text-white font-semibold',
          icon: <AlertTriangle className="w-6 h-6 text-orange-600" />,
          title: 'HIGH RISK ALERT',
        };
      case 'MODERATE':
        return {
          container: 'bg-amber-50 border-amber-300 text-amber-900',
          badge: 'bg-amber-600 text-white font-semibold',
          icon: <AlertCircle className="w-6 h-6 text-amber-600" />,
          title: 'MODERATE RISK FLAGGED',
        };
      case 'LOW':
      default:
        return {
          container: 'bg-emerald-50 border-emerald-300 text-emerald-900',
          badge: 'bg-emerald-600 text-white font-semibold',
          icon: <ShieldCheck className="w-6 h-6 text-emerald-600" />,
          title: 'ROUTINE RECOVERY (LOW RISK)',
        };
    }
  };

  const riskStyles = getRiskBadgeStyles(activeRiskLevel);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* ── Auth Gate ───────────────────────────────────────────────────── */}
      {!authChecked ? (
        <div className="flex-1 flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-teal-600 flex items-center justify-center shadow-lg">
              <Activity className="w-7 h-7 text-white animate-pulse" />
            </div>
            <p className="text-slate-300 text-sm font-medium">Initialising CareBridge AI…</p>
          </div>
        </div>
      ) : !isAuthenticated ? (
        /* ── LOGIN PAGE ─────────────────────────────────────────────────── */
        <div className="flex-1 min-h-screen bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 flex flex-col items-center justify-center px-4 relative overflow-hidden">
          {/* Background decorative glows */}
          <div className="absolute top-[-80px] left-[-80px] w-[340px] h-[340px] rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-[-60px] right-[-60px] w-[280px] h-[280px] rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
          {/* Top clinical safety banner */}
          <div className="w-full max-w-md mb-6 flex items-center space-x-2 bg-amber-500/10 border border-amber-400/20 rounded-lg px-4 py-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-200/80 font-mono leading-snug">
              <strong className="text-amber-300">Clinical Decision-Support Prototype.</strong> AI agents cannot diagnose or prescribe.
            </p>
          </div>
          {/* Login card */}
          <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            {/* Card header */}
            <div className="bg-gradient-to-r from-teal-600/80 to-cyan-600/80 px-7 py-6 flex items-center space-x-4">
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shadow-inner">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">CareBridge AI</h1>
                <p className="text-teal-200 text-xs mt-0.5">Agentic Care Coordination · Patient Portal</p>
              </div>
            </div>
            {!showSignup ? (
              <form onSubmit={handleLogin} className="px-7 py-6 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-slate-300 text-sm font-semibold">Sign In to Your Recovery Portal</p>
                  <button
                    type="button"
                    onClick={() => { setShowSignup(true); setSignupError(null); }}
                    className="text-xs text-teal-400 hover:text-teal-300 transition font-medium cursor-pointer"
                  >
                    Need an account?
                  </button>
                </div>

                {/* Login Mode Toggle */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-white/5 border border-white/10 rounded-lg">
                  <button
                    type="button"
                    onClick={() => { setLoginMode('demo'); setLoginError(null); }}
                    className={`py-1.5 text-xs font-semibold rounded transition cursor-pointer ${
                      loginMode === 'demo'
                        ? 'bg-teal-500 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Demo Patient
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLoginMode('email'); setLoginError(null); }}
                    className={`py-1.5 text-xs font-semibold rounded transition cursor-pointer ${
                      loginMode === 'email'
                        ? 'bg-teal-500 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Email Account
                  </button>
                </div>

                {loginMode === 'demo' ? (
                  /* Patient ID selector */
                  <div>
                    <label htmlFor="login-patient-id" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Patient ID</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select
                        id="login-patient-id"
                        value={loginPatientId}
                        onChange={(e) => { setLoginPatientId(e.target.value); setLoginError(null); }}
                        className="w-full pl-9 pr-4 py-2.5 border border-white/15 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/60 transition appearance-none cursor-pointer"
                        style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                      >
                        <option value="PT-CABG-001" style={{ background: '#1e293b' }}>PT-CABG-001 — James Harrison (Cardiac)</option>
                        <option value="PT-TKA-002" style={{ background: '#1e293b' }}>PT-TKA-002 — Elena Rostova (Knee)</option>
                        <option value="PT-CHF-003" style={{ background: '#1e293b' }}>PT-CHF-003 — Marcus Vance (Heart Failure)</option>
                        <option value="PT-PNA-004" style={{ background: '#1e293b' }}>PT-PNA-004 — Sarah Chen (Pneumonia)</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  /* Email input */
                  <div>
                    <label htmlFor="login-email" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="login-email"
                        type="email"
                        value={loginEmail}
                        onChange={(e) => { setLoginEmail(e.target.value); setLoginError(null); }}
                        placeholder="patient@example.com"
                        autoComplete="email"
                        required
                        className="w-full pl-9 pr-4 py-2.5 border border-white/15 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/60 transition"
                        style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                      />
                    </div>
                  </div>
                )}

                {/* Password */}
                <div>
                  <label htmlFor="login-password" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="login-password"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => { setLoginPassword(e.target.value); setLoginError(null); }}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      className="w-full pl-9 pr-4 py-2.5 border border-white/15 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/60 transition"
                      style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                    />
                  </div>
                </div>

                {/* Error */}
                {loginError && (
                  <div className="flex items-start space-x-2 bg-rose-500/10 border border-rose-400/30 rounded-lg px-3.5 py-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-300 leading-snug">{loginError}</p>
                  </div>
                )}

                {/* Submit */}
                <button
                  id="login-submit-btn"
                  type="submit"
                  disabled={loginLoading}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-colors shadow-lg cursor-pointer"
                >
                  {loginLoading ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /><span>Authenticating…</span></>
                  ) : (
                    <><LogOut className="w-4 h-4 rotate-180" /><span>Sign In</span></>
                  )}
                </button>

                {/* Demo hint / signup link */}
                {loginMode === 'demo' ? (
                  <div className="bg-teal-500/8 border border-teal-400/20 rounded-lg px-4 py-2.5">
                    <p className="text-xs text-teal-300 font-semibold mb-0.5">🔑 Demo Password (all accounts)</p>
                    <p className="font-mono text-teal-200 text-xs tracking-wider">CareBridge@123</p>
                  </div>
                ) : (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => { setShowSignup(true); setSignupError(null); }}
                      className="text-xs text-slate-400 hover:text-teal-300 transition cursor-pointer"
                    >
                      New patient? <span className="text-teal-400 font-semibold underline underline-offset-2">Create an account</span>
                    </button>
                  </div>
                )}
              </form>
            ) : (
              /* SIGN UP FORM */
              <form onSubmit={handleSignup} className="px-7 py-6 space-y-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-slate-300 text-sm font-semibold">Create Patient Account</p>
                  <button
                    type="button"
                    onClick={() => { setShowSignup(false); setLoginError(null); }}
                    className="text-xs text-teal-400 hover:text-teal-300 transition font-medium cursor-pointer"
                  >
                    Back to Sign In
                  </button>
                </div>

                {/* Full Name */}
                <div>
                  <label htmlFor="signup-name" className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="signup-name"
                      type="text"
                      value={signupFullName}
                      onChange={(e) => { setSignupFullName(e.target.value); setSignupError(null); }}
                      placeholder="e.g. Eleanor Vance"
                      required
                      className="w-full pl-9 pr-4 py-2 border border-white/15 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/60 transition"
                      style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="signup-email" className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="signup-email"
                      type="email"
                      value={signupEmail}
                      onChange={(e) => { setSignupEmail(e.target.value); setSignupError(null); }}
                      placeholder="e.g. eleanor@example.com"
                      required
                      className="w-full pl-9 pr-4 py-2 border border-white/15 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/60 transition"
                      style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="signup-password" className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="signup-password"
                      type="password"
                      value={signupPassword}
                      onChange={(e) => { setSignupPassword(e.target.value); setSignupError(null); }}
                      placeholder="Minimum 8 characters"
                      required
                      autoComplete="new-password"
                      className="w-full pl-9 pr-4 py-2 border border-white/15 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/60 transition"
                      style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                    />
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="signup-confirm-password" className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="signup-confirm-password"
                      type="password"
                      value={signupConfirmPassword}
                      onChange={(e) => { setSignupConfirmPassword(e.target.value); setSignupError(null); }}
                      placeholder="Repeat password"
                      required
                      autoComplete="new-password"
                      className="w-full pl-9 pr-4 py-2 border border-white/15 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/60 transition"
                      style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                    />
                  </div>
                </div>

                {/* Error */}
                {signupError && (
                  <div className="flex items-start space-x-2 bg-rose-500/10 border border-rose-400/30 rounded-lg px-3.5 py-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-300 leading-snug">{signupError}</p>
                  </div>
                )}

                {/* Submit */}
                <button
                  id="signup-submit-btn"
                  type="submit"
                  disabled={signupLoading}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-colors shadow-lg cursor-pointer"
                >
                  {signupLoading ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /><span>Registering…</span></>
                  ) : (
                    <><UserPlus className="w-4 h-4" /><span>Create Account</span></>
                  )}
                </button>

                <div className="text-center pt-0.5">
                  <button
                    type="button"
                    onClick={() => { setShowSignup(false); setLoginError(null); }}
                    className="text-xs text-slate-400 hover:text-teal-300 transition cursor-pointer"
                  >
                    Already registered? <span className="text-teal-400 font-semibold underline underline-offset-2">Sign In</span>
                  </button>
                </div>
              </form>
            )}
            <div className="px-7 pb-5 text-center">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                CareBridge AI is a <strong className="text-slate-400">clinical decision-support prototype</strong> and does not replace professional clinical care.
              </p>
            </div>
          </div>
        </div>
      ) : (
      /* ── AUTHENTICATED DASHBOARD ─────────────────────────────────────── */
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* 0. Top Mandatory Clinical Guardrail Banner */}
      <div className="bg-slate-900 text-slate-100 text-xs px-4 py-2 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2 max-w-5xl">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-mono text-slate-300">
            <strong className="text-white">CLINICAL SAFETY DIRECTIVE:</strong> Prototype CareBridge AI agent system. Deterministic clinical safety rules strictly supersede AI reasoning. AI agents cannot diagnose or prescribe.
          </span>
        </div>
        <div className="hidden md:flex items-center space-x-3 text-slate-400">
          <span>Version 1.0.0-MVP</span>
          <span>•</span>
          <span className="font-mono text-teal-400">Precedence Locked</span>
          <span>•</span>
          <span className="flex items-center space-x-1.5 font-mono text-emerald-400 text-[11px] px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Reminder Engine: Active</span>
          </span>
        </div>
      </div>

      {/* 1. Header Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Product Identity */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-teal-600 text-white flex items-center justify-center shadow-sm">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">CareBridge AI</h1>
                <span className="px-2 py-0.5 text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200 rounded-full">
                  Decision Support
                </span>
              </div>
              <p className="text-xs text-slate-500">Agentic Care Coordination & Post-Discharge Monitoring</p>
            </div>
          </div>

          {/* Patient Selector & Backend Status */}
          <div className="flex items-center space-x-3">
            {/* [ + Add New Patient ] Button */}
            <button
              type="button"
              onClick={() => setIsAddPatientModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              title="Onboard a new real or de-identified patient"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add New Patient</span>
              <span className="sm:hidden">+ Patient</span>
            </button>

            {/* Upload Discharge Summary Button */}
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 rounded-lg text-xs font-semibold transition-colors shadow-xs"
              title="Upload raw clinical discharge paperwork to synthesize care plan and tasks"
            >
              <Upload className="w-3.5 h-3.5 text-teal-600" />
              <span className="hidden sm:inline">Upload Paperwork</span>
              <span className="sm:hidden">Upload</span>
            </button>

            {/* Patient Selector */}
            <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <User className="w-4 h-4 text-slate-500" />
              <label htmlFor="patient-select" className="text-xs font-medium text-slate-600 sr-only">
                Select Patient:
              </label>
              <select
                id="patient-select"
                value={selectedPatientId}
                onChange={(e) => handleSelectPatient(e.target.value)}
                className="text-xs font-semibold text-slate-800 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer max-w-[140px] sm:max-w-[200px] truncate"
              >
                <optgroup label="DEMO PATIENTS">
                  {patientOptions
                    .filter((p) => p.is_demo !== false)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id}) — {p.condition.split(' ')[0]}
                      </option>
                    ))}
                </optgroup>
                {patientOptions.some((p) => p.is_demo === false) && (
                  <optgroup label="USER PATIENTS">
                    {patientOptions
                      .filter((p) => p.is_demo === false)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.id}) — {p.condition.split(' ')[0]}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Connection / Backend Status */}
            <div className="flex items-center space-x-2">
              {backendOnline === true ? (
                <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-medium">
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Backend Online (Port 8000)</span>
                  <span className="sm:hidden">Online</span>
                </div>
              ) : backendOnline === false ? (
                <div
                  className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-medium cursor-pointer"
                  onClick={checkBackendHealth}
                  title="Backend offline. Click to test connection again. Using synthetic fallback."
                >
                  <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                  <span className="hidden sm:inline">Offline (Synthetic Mode)</span>
                  <span className="sm:hidden">Offline</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking...</span>
                </div>
              )}
            </div>

            {/* Logged-in patient badge + Logout */}
            {isAuthenticated && (
              <div className="flex items-center space-x-2">
                <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-full text-xs font-medium">
                  <User className="w-3.5 h-3.5 text-teal-600" />
                  <span className="max-w-[120px] truncate">{authPatientName}</span>
                </div>
                <button
                  id="logout-btn"
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 rounded-full text-xs font-medium transition-colors cursor-pointer"
                  title="Sign out of CareBridge AI"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Upload Paperwork Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-teal-100 text-teal-700 rounded-lg">
                  <FileUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Upload Clinical Discharge Paperwork</h3>
                  <p className="text-[11px] text-slate-500">Ingest unstructured EHR summary into structured RecoveryState</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Safety notice banner */}
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900 flex items-start space-x-2">
                <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Clinical Guardrail Guarantee:</strong> CareBridge AI structures patient instructions and Day 2 recovery tasks without hallucination. It will not diagnose medical conditions or alter prescribed regimens.
                </p>
              </div>

              {/* Template quick-load button */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">Unstructured Summary Text:</span>
                <div className="flex items-center space-x-2">
                  <label className="text-teal-700 hover:text-teal-800 font-semibold underline text-[11px] cursor-pointer">
                    <span>Upload File (.pdf, .txt)</span>
                    <input
                      type="file"
                      accept=".pdf,.txt,.text,application/pdf,text/plain"
                      onChange={handlePaperworkFileUpload}
                      className="sr-only"
                    />
                  </label>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => setUploadText(SAMPLE_DISCHARGE_TEXT)}
                    className="text-teal-700 hover:text-teal-800 font-semibold underline text-[11px]"
                  >
                    Load Sample Appendectomy Summary
                  </button>
                </div>
              </div>

              <textarea
                rows={9}
                value={uploadText}
                onChange={(e) => setUploadText(e.target.value)}
                placeholder="Paste discharge summary text here (including diagnosis, medications, precautions, red flags)..."
                className="w-full text-xs font-mono p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 bg-slate-50/50 resize-none"
              />

              {uploadError && (
                <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded text-xs">
                  {uploadError}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUploadDischarge}
                disabled={uploadLoading || !uploadText.trim()}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white flex items-center space-x-1.5 disabled:opacity-50 shadow-sm"
              >
                {uploadLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Synthesizing Plan...</span>
                  </>
                ) : (
                  <>
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>Ingest &amp; Generate Recovery Plan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Patient Modal */}
      {isAddPatientModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full border border-slate-200 shadow-xl overflow-hidden my-8 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-teal-100 text-teal-700 rounded-lg">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Add New Patient — Dynamic Onboarding</h3>
                  <p className="text-[11px] text-slate-500">Create real or authorized patient record with isolated recovery state</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddPatientModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Mandatory Privacy & Clinical Notice */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start space-x-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <p className="font-semibold text-amber-950">
                    Use authorized or de-identified patient information for this demonstration.
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    CareBridge AI maintains strict patient isolation in this prototype session. Do not input unnecessary sensitive personal health identifiers.
                  </p>
                </div>
              </div>

              {/* Patient Basic Information */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>Patient Identity &amp; Demographics</span>
                </h4>

                {/* Patient Name (Required) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Patient Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newPatientName}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    placeholder="e.g. Ravi Kumar"
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 bg-white"
                  />
                </div>

                {/* 2-column demographics grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Age (Years)</label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={newPatientAge}
                      onChange={(e) => setNewPatientAge(e.target.value)}
                      placeholder="e.g. 62"
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Sex / Gender</label>
                    <select
                      value={newPatientGender}
                      onChange={(e) => setNewPatientGender(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 bg-white"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                      <option value="Not specified">Not specified</option>
                    </select>
                  </div>
                </div>

                {/* Contact numbers */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Patient / Caregiver Contact</label>
                    <input
                      type="text"
                      value={newPatientContact}
                      onChange={(e) => setNewPatientContact(e.target.value)}
                      placeholder="e.g. 555-0144 or Not specified"
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Emergency Contact</label>
                    <input
                      type="text"
                      value={newPatientEmergencyContact}
                      onChange={(e) => setNewPatientEmergencyContact(e.target.value)}
                      placeholder="e.g. Spouse / Family - 555-0199"
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Clinical & Discharge Context */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                  <Stethoscope className="w-3.5 h-3.5 text-slate-500" />
                  <span>Clinical Discharge Context (Optional)</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Discharge Date</label>
                    <input
                      type="date"
                      value={newPatientDischargeDate}
                      onChange={(e) => setNewPatientDischargeDate(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Attending Physician / Care Team</label>
                    <input
                      type="text"
                      value={newPatientCareTeam}
                      onChange={(e) => setNewPatientCareTeam(e.target.value)}
                      placeholder="e.g. Dr. Angela Thorne, MD (Orthopedics)"
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Primary Diagnosis</label>
                    <input
                      type="text"
                      value={newPatientDiagnosis}
                      onChange={(e) => setNewPatientDiagnosis(e.target.value)}
                      placeholder="e.g. Total Knee Replacement Recovery"
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Procedure</label>
                    <input
                      type="text"
                      value={newPatientProcedure}
                      onChange={(e) => setNewPatientProcedure(e.target.value)}
                      placeholder="e.g. Right Total Knee Arthroplasty"
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-900 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Optional Discharge Summary Upload Section */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    <span>Discharge Summary Document (Optional)</span>
                  </h4>
                  <div className="flex items-center space-x-2">
                    <label className="text-teal-700 hover:text-teal-800 font-semibold underline text-[11px] cursor-pointer">
                      <span>Upload File (.pdf, .txt)</span>
                      <input
                        type="file"
                        accept=".pdf,.txt,.text,application/pdf,text/plain"
                        onChange={handleSummaryFileUpload}
                        className="sr-only"
                      />
                    </label>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() =>
                        setNewPatientDischargeText(
                          `DISCHARGE SUMMARY\nPatient: ${newPatientName || 'Ravi Kumar'}\nAge: ${newPatientAge || '62'}\nGender: ${newPatientGender || 'Male'}\nPrimary Diagnosis: ${newPatientDiagnosis || 'Total Knee Arthroplasty'}\nAttending: ${newPatientCareTeam || 'Dr. Angela Thorne, MD'}\nDischarge Medications:\n- Acetaminophen 650mg PO Q6H PRN pain\n- Enoxaparin 40mg SubQ daily x 10 days\nActivity: Weight-bearing as tolerated with walker. Ankle pumps TID.\nRed Flags: Fever >= 101.5 F, sudden calf swelling or redness.`
                        )
                      }
                      className="text-teal-700 hover:text-teal-800 font-semibold underline text-[11px] cursor-pointer"
                    >
                      Fill Sample Knee Summary
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500">
                  If uploaded, the <strong>Discharge Understanding</strong> &amp; <strong>Recovery Planning</strong> agents will parse medications, restrictions, and milestones. If omitted, safe generic tracking tasks are initialized without fabricating medications.
                </p>

                <textarea
                  rows={4}
                  value={newPatientDischargeText}
                  onChange={(e) => setNewPatientDischargeText(e.target.value)}
                  placeholder="Optional: Paste clinical discharge summary text here..."
                  className="w-full text-xs font-mono p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 bg-slate-50/50 resize-none"
                />
              </div>

              {/* Error Alert */}
              {createPatientError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{createPatientError}</span>
                </div>
              )}
            </div>

            {/* Modal Footer with Dual Actions */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsAddPatientModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>

              {/* Button A: Create Patient (basic info) */}
              <button
                type="button"
                onClick={() => handleCreatePatient(false)}
                disabled={createPatientLoading || !newPatientName.trim()}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white flex items-center space-x-1.5 disabled:opacity-50 shadow-xs cursor-pointer"
                title="Create patient profile with safe generic tracking tasks"
              >
                {createPatientLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Create Patient</span>
                  </>
                )}
              </button>

              {/* Button B: Create Patient + Upload Discharge Summary */}
              <button
                type="button"
                onClick={() => handleCreatePatient(true)}
                disabled={createPatientLoading || !newPatientName.trim() || !newPatientDischargeText.trim()}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white flex items-center space-x-1.5 disabled:opacity-50 shadow-xs cursor-pointer"
                title="Create patient and synthesize care plan from uploaded summary"
              >
                {createPatientLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Synthesizing Workflow...</span>
                  </>
                ) : (
                  <>
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>Create Patient + Upload Summary</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1 w-full">
        {/* API Error Notification if Backend is Unreachable */}
        {apiError && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-lg text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{apiError}</span>
            </div>
            <button
              onClick={() => setApiError(null)}
              className="text-amber-700 hover:text-amber-900 font-semibold text-xs ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 2. Patient Overview Banner Card */}
        <section aria-label="Patient Overview" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {/* Patient Name & ID */}
            <div className="pr-2">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Patient Name</p>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">{patient.first_name} {patient.last_name}</h2>
              <span className="inline-block mt-1 font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                {patient.id}
              </span>
            </div>

            {/* Demographics */}
            <div className="sm:pl-4 pr-2 pt-2 sm:pt-0">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Demographics</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">
                {patient.age ? `${patient.age} yrs • ` : ''}{patient.gender || 'Not specified'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Discharged: {patient.discharge_date || 'Not specified'}</p>
            </div>

            {/* Condition / Procedure */}
            <div className="sm:pl-4 pr-2 pt-2 sm:pt-0 col-span-2 sm:col-span-1 lg:col-span-2">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Procedure / Primary Diagnosis</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5 leading-snug">
                {activeProfile.primary_diagnosis || patient.condition_category || 'Post-Discharge Recovery'}
              </p>
              <p className="text-xs text-teal-700 font-medium mt-1">
                Day 2 of 30 • Phase 1: Acute Recovery
              </p>
            </div>

            {/* Primary Physician */}
            <div className="sm:pl-4 pr-2 pt-2 sm:pt-0">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Primary Physician</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{patient.primary_care_physician || 'Not specified'}</p>
              <p className="text-xs text-slate-500 mt-1 flex items-center space-x-1">
                <PhoneCall className="w-3 h-3 text-slate-400" />
                <span>Clinic: {patient.clinic_phone || 'Not specified'}</span>
              </p>
            </div>

            {/* Emergency Contact */}
            <div className="sm:pl-4 pt-2 sm:pt-0">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Emergency Contact</p>
              <p className="text-xs font-semibold text-slate-800 mt-0.5">{patient.emergency_contact || 'Not specified'}</p>
              <p className="text-xs text-slate-400 mt-1">Designated Caregiver</p>
            </div>
          </div>
        </section>

        {/* 3. Agent Workflow Visualization (The 6 AI Agents + Deterministic Safety Engine) */}
        <section aria-label="Agent Workflow" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-teal-600" />
                <span>CareBridge Multi-Agent Orchestration Topology</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Central Orchestrator oversees 6 specialized AI agents with a non-AI Deterministic Safety Engine enforcing clinical boundaries.
              </p>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200 font-mono">
                Workflow: {workflowState?.workflow_route || 'INITIALIZED'}
              </span>
            </div>
          </div>

          {/* Topology Pipeline Grid */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
            {/* 1. Discharge Understanding Agent */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-teal-100 text-teal-800 rounded">AI AGENT</span>
                  <span className="text-[10px] text-emerald-600 font-bold">● Active</span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 mt-2">1. Discharge Understanding</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-tight">
                  Structures EHR discharge notes, meds & red-flag rules.
                </p>
              </div>
              <div className="mt-2 text-[10px] font-mono text-slate-600 bg-white p-1 rounded border border-slate-100">
                Validated Profile
              </div>
            </div>

            {/* 2. Recovery Planning Agent */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-teal-100 text-teal-800 rounded">AI AGENT</span>
                  <span className="text-[10px] text-emerald-600 font-bold">● Active</span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 mt-2">2. Recovery Planning</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-tight">
                  Synthesizes 4-phase 30-day roadmap and daily tasks.
                </p>
              </div>
              <div className="mt-2 text-[10px] font-mono text-slate-600 bg-white p-1 rounded border border-slate-100">
                Phase 1 Active
              </div>
            </div>

            {/* 3. Monitoring Agent */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-teal-100 text-teal-800 rounded">AI AGENT</span>
                  <span className="text-[10px] text-emerald-600 font-bold">● Active</span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 mt-2">3. Monitoring Agent</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-tight">
                  Tracks adherence, logs telemetry & missed items.
                </p>
              </div>
              <div className="mt-2 text-[10px] font-mono text-slate-600 bg-white p-1 rounded border border-slate-100">
                {adherencePercent}% Adherence
              </div>
            </div>

            {/* 4. DETERMINISTIC SAFETY ENGINE (NON-AI RULE ENGINE) */}
            <div
              className={`p-3 rounded-lg border-2 flex flex-col justify-between transition-colors ${
                workflowState?.risk_assessment?.deterministic_rule_triggered
                  ? 'bg-rose-50 border-rose-500 text-rose-900'
                  : 'bg-slate-900 border-slate-800 text-white'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      workflowState?.risk_assessment?.deterministic_rule_triggered
                        ? 'bg-rose-200 text-rose-900'
                        : 'bg-amber-400 text-slate-900'
                    }`}
                  >
                    NON-AI ENGINE
                  </span>
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <h4
                  className={`text-xs font-bold mt-2 ${
                    workflowState?.risk_assessment?.deterministic_rule_triggered ? 'text-rose-900' : 'text-white'
                  }`}
                >
                  4. Deterministic Safety Engine
                </h4>
                <p
                  className={`text-[11px] mt-1 leading-tight ${
                    workflowState?.risk_assessment?.deterministic_rule_triggered ? 'text-rose-700' : 'text-slate-300'
                  }`}
                >
                  Deterministic rule evaluations. Absolute clinical precedence.
                </p>
              </div>
              <div
                className={`mt-2 text-[10px] font-mono p-1 rounded border ${
                  workflowState?.risk_assessment?.deterministic_rule_triggered
                    ? 'bg-rose-100 border-rose-300 text-rose-900 font-bold'
                    : 'bg-slate-800 border-slate-700 text-amber-300'
                }`}
              >
                {workflowState?.risk_assessment?.deterministic_rule_triggered
                  ? 'FLAG TRIGGERED'
                  : 'Rules Nominal'}
              </div>
            </div>

            {/* 5. Risk & Reasoning Agent */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-teal-100 text-teal-800 rounded">AI AGENT</span>
                  <span className="text-[10px] text-emerald-600 font-bold">● Active</span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 mt-2">5. Risk & Reasoning</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-tight">
                  Grounded synthesis bounded by Safety Engine outputs.
                </p>
              </div>
              <div className="mt-2 text-[10px] font-mono text-slate-600 bg-white p-1 rounded border border-slate-100">
                Risk: {activeRiskLevel}
              </div>
            </div>

            {/* 6. Follow-Up Agent (Low / Moderate Route) */}
            <div
              className={`p-3 rounded-lg border flex flex-col justify-between transition-colors ${
                activeRiskLevel === 'LOW' || activeRiskLevel === 'MODERATE'
                  ? 'bg-teal-50/70 border-teal-300'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-teal-100 text-teal-800 rounded">AI AGENT</span>
                  {activeRiskLevel === 'LOW' || activeRiskLevel === 'MODERATE' ? (
                    <span className="text-[10px] text-teal-700 font-bold">● Routed</span>
                  ) : (
                    <span className="text-[10px] text-slate-400">Idle</span>
                  )}
                </div>
                <h4 className="text-xs font-bold text-slate-900 mt-2">6. Follow-Up Agent</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-tight">
                  Empathetic reassurance & non-diagnostic clarification.
                </p>
              </div>
              <div className="mt-2 text-[10px] font-mono text-slate-600 bg-white p-1 rounded border border-slate-100">
                Low/Mod Path
              </div>
            </div>

            {/* 7. Escalation & Coordination Agent (High / Critical Route) */}
            <div
              className={`p-3 rounded-lg border flex flex-col justify-between transition-colors ${
                activeRiskLevel === 'HIGH' || activeRiskLevel === 'CRITICAL'
                  ? 'bg-rose-50 border-rose-400 ring-1 ring-rose-300'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded">AI AGENT</span>
                  {activeRiskLevel === 'HIGH' || activeRiskLevel === 'CRITICAL' ? (
                    <span className="text-[10px] text-rose-700 font-bold">● Routed</span>
                  ) : (
                    <span className="text-[10px] text-slate-400">Standby</span>
                  )}
                </div>
                <h4 className="text-xs font-bold text-slate-900 mt-2">7. Escalation Agent</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-tight">
                  Drafts SBAR notes & dispatches clinical review tickets.
                </p>
              </div>
              <div className="mt-2 text-[10px] font-mono text-slate-600 bg-white p-1 rounded border border-slate-100">
                High/Crit Path
              </div>
            </div>
          </div>
        </section>

        {/* 4. Symptom Simulation Demo Controls & Real-Time Telemetry Input */}
        <section aria-label="Symptom Simulation Controls" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center space-x-2">
                <Stethoscope className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">Interactive Patient Telemetry &amp; Event Simulation</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                  Live Event Trigger
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Trigger automated scenarios or submit live clinical vitals for {patient.first_name} {patient.last_name} through the Deterministic Safety Engine.
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg self-start md:self-auto">
              <button
                type="button"
                onClick={() => setSimulationMode('scenarios')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  simulationMode === 'scenarios'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Quick Demo Scenarios
              </button>
              <button
                type="button"
                onClick={() => setSimulationMode('custom_input')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  simulationMode === 'custom_input'
                    ? 'bg-white text-teal-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Real-Time Patient Input
              </button>
            </div>
          </div>

          {simulationMode === 'scenarios' ? (
            /* Scenario Button Strip */
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => runSimulationScenario('routine')}
                disabled={loading}
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm ${
                  activeScenario === 'routine'
                    ? 'bg-slate-900 text-white ring-2 ring-slate-400'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>1. Routine (No Symptoms)</span>
              </button>

              <button
                type="button"
                onClick={() => runSimulationScenario('mild')}
                disabled={loading}
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm ${
                  activeScenario === 'mild'
                    ? 'bg-teal-700 text-white ring-2 ring-teal-400'
                    : 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200'
                }`}
              >
                <Info className="w-3.5 h-3.5 text-teal-500" />
                <span>2. Mild Expected Symptom</span>
              </button>

              <button
                type="button"
                onClick={() => runSimulationScenario('fever')}
                disabled={loading}
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm ${
                  activeScenario === 'fever'
                    ? 'bg-orange-600 text-white ring-2 ring-orange-400'
                    : 'bg-orange-50 text-orange-800 hover:bg-orange-100 border border-orange-200'
                }`}
              >
                <Thermometer className="w-3.5 h-3.5 text-orange-500" />
                <span>3. High-Risk Fever (101.8°F)</span>
              </button>

              <button
                type="button"
                onClick={() => runSimulationScenario('chest_pain')}
                disabled={loading}
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm ${
                  activeScenario === 'chest_pain'
                    ? 'bg-rose-600 text-white ring-2 ring-rose-400 animate-pulse'
                    : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                }`}
              >
                <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                <span>4. Critical Chest Pain</span>
              </button>
            </div>
          ) : (
            /* Live Custom Telemetry Input Form */
            <form onSubmit={handleCustomSymptomSubmit} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-700 mb-1">
                    Symptom Description
                  </label>
                  <input
                    type="text"
                    value={customSymptom}
                    onChange={(e) => setCustomSymptom(e.target.value)}
                    placeholder="e.g. Mild shortness of breath or wound redness"
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-700 mb-1">
                    Pain / Severity (1-10)
                  </label>
                  <select
                    value={customSeverity}
                    onChange={(e) => setCustomSeverity(Number(e.target.value))}
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <option key={num} value={num}>
                        {num} {num <= 3 ? '(Mild)' : num <= 6 ? '(Moderate)' : num <= 8 ? '(Severe)' : '(Emergency)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-700 mb-1">
                    Core Temp (°F)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={customTemp}
                    onChange={(e) => setCustomTemp(e.target.value)}
                    placeholder="98.6"
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-700 mb-1">
                    BP (Sys / Dia)
                  </label>
                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      value={customSysBP}
                      onChange={(e) => setCustomSysBP(e.target.value)}
                      placeholder="120"
                      className="w-1/2 text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                    />
                    <span className="text-slate-400">/</span>
                    <input
                      type="number"
                      value={customDiaBP}
                      onChange={(e) => setCustomDiaBP(e.target.value)}
                      placeholder="80"
                      className="w-1/2 text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-700 mb-1">
                    SpO2 / HR / Weight
                  </label>
                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      value={customSpo2}
                      onChange={(e) => setCustomSpo2(e.target.value)}
                      placeholder="SpO2 %"
                      title="Oxygen saturation %"
                      className="w-1/2 text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                    />
                    <input
                      type="number"
                      value={customHeartRate}
                      onChange={(e) => setCustomHeartRate(e.target.value)}
                      placeholder="HR bpm"
                      title="Heart rate bpm"
                      className="w-1/2 text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 gap-2">
                <p className="text-[11px] text-slate-500">
                  Clinical safety triggers: Temp ≥ 101.5°F triggers HIGH fever rule. &quot;Chest pain&quot; or SpO2 ≤ 90% triggers CRITICAL emergency protocol.
                </p>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-all disabled:opacity-50 self-end sm:self-auto shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Live Telemetry &amp; Evaluate</span>
                </button>
              </div>
            </form>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center space-x-2 text-xs text-teal-700">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>
                Orchestrating workflow across agents (POST {API_BASE_URL}/api/v1/workflow/{selectedPatientId})...
              </span>
            </div>
          )}
        </section>

        {/* 5. Main Split Dashboard: Left (Recovery & Tasks) / Right (Safety Engine & Agent Outputs) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: Recovery Progress, Today's Care Tasks, Medications (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* 30-Day Recovery Timeline & Progress Indicator */}
            <section aria-label="Recovery Progress" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-teal-600" />
                    <span>30-Day Recovery Roadmap</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Phase 1 of 4: Acute Post-Discharge Recovery (Days 1–7)
                  </p>
                </div>
                <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                  Day 2 / 30
                </span>
              </div>

              {/* Progress Bar */}
              <div className="mt-3">
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-teal-600 h-2.5 rounded-full" style={{ width: '7%' }} />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 mt-1.5 font-medium">
                  <span className="text-teal-700 font-bold">Phase 1: Acute (Days 1-7)</span>
                  <span>Phase 2: Subacute (Days 8-14)</span>
                  <span>Phase 3: Active (Days 15-21)</span>
                  <span>Phase 4: Independence (Days 22-30)</span>
                </div>
              </div>

              {/* Patient-Specific Phase Milestones */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                  Active Clinical Milestones (Phase 1):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {activeMilestones.map((ms, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <p className="font-semibold text-slate-800">{ms.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{ms.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Today's Reminders Section (Requirements 3, 4, 14, 15) ──────── */}
            <section aria-label="Today's Reminders" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2.5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <BellRing className="w-4 h-4 text-teal-600" />
                    <span>Today&apos;s Recovery Reminders</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Active recovery check-ins &amp; scheduled task alerts for {patient.first_name} {patient.last_name}.
                  </p>
                </div>

                {/* Controls & Engine Status Indicator */}
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {/* Indicator Badge (Requirement 14) */}
                  <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Reminder Engine: Active</span>
                  </span>

                  {/* Browser Notification Permission Button (Requirement 6) */}
                  {notificationPermission !== 'granted' ? (
                    <button
                      type="button"
                      onClick={handleEnableNotifications}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white flex items-center space-x-1 transition shadow-sm cursor-pointer"
                      title="Enable browser notifications for due recovery tasks"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>Enable Reminders</span>
                    </button>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium flex items-center space-x-1">
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>Browser Alerts On</span>
                    </span>
                  )}

                  {/* Demo 1-minute reminder capability (Requirement 15) */}
                  <button
                    type="button"
                    onClick={handleTriggerDemoReminder}
                    disabled={demoReminderCountdown !== null}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100 flex items-center space-x-1 transition cursor-pointer disabled:opacity-50"
                    title="Test the in-app and browser notification loop in 1 minute (Demo mode)"
                  >
                    <Clock3 className="w-3.5 h-3.5 text-teal-600" />
                    <span>
                      {demoReminderCountdown !== null
                        ? `⏱ Demo in ${demoReminderCountdown}s`
                        : '⏱ Remind in 1 min (Demo)'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Reminders Items List */}
              <div className="mt-3 space-y-2.5">
                {tasks.length > 0 ? (
                  tasks.map((task) => {
                    const dueStatus = calculateTaskDueStatus(
                      task.scheduled_time,
                      task.status,
                      undefined,
                      task.timing_type,
                      task.category
                    );
                    const isDone = task.status === 'COMPLETED';
                    const isDue = dueStatus === 'DUE' && !isDone && task.status !== 'MISSED';
                    const isUpcoming = dueStatus === 'UPCOMING' && !isDone && task.status !== 'MISSED' && task.status !== 'SNOOZED';
                    const isPRN = dueStatus === 'AVAILABLE_AS_NEEDED' && !isDone && task.status !== 'MISSED';
                    const isMissed = task.status === 'MISSED';
                    const isSnoozed = task.status === 'SNOOZED';
                    const isMed = task.category === 'MEDICATION';

                    return (
                      <div
                        key={`reminder-${task.task_id}`}
                        className={`p-3 rounded-lg border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                          isDue
                            ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-400/50 shadow-sm'
                            : isDone
                            ? 'bg-emerald-50/40 border-emerald-200 text-slate-700'
                            : isMissed
                            ? 'bg-rose-50/40 border-rose-200 text-slate-700'
                            : isSnoozed
                            ? 'bg-amber-50/40 border-amber-200 text-slate-800'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        {/* Task information */}
                        <div className="flex items-start space-x-2.5 flex-1 min-w-0">
                          <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                            isDone
                              ? 'bg-emerald-600 text-white'
                              : isDue
                              ? 'bg-amber-500 text-white animate-pulse'
                              : isMissed
                              ? 'bg-rose-500 text-white'
                              : isPRN
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-200 text-slate-600'
                          }`}>
                            {isDone ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : isDue ? (
                              <BellRing className="w-3.5 h-3.5" />
                            ) : (
                              <Clock className="w-3.5 h-3.5" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`text-xs font-bold ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                                {task.title}
                              </span>

                              {/* Status Badges */}
                              {isDue && (
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full flex items-center space-x-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                                  <span>DUE NOW</span>
                                </span>
                              )}
                              {isUpcoming && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-full">
                                  UPCOMING
                                </span>
                              )}
                              {isPRN && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 rounded-full">
                                  AVAILABLE AS NEEDED
                                </span>
                              )}
                              {isDone && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full">
                                  COMPLETED
                                </span>
                              )}
                              {isMissed && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-200 rounded-full">
                                  MISSED
                                </span>
                              )}
                              {isSnoozed && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full">
                                  SNOOZED
                                </span>
                              )}

                              {task.timing_type && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-teal-50 text-teal-700 border border-teal-200 rounded">
                                  {task.timing_type}
                                </span>
                              )}

                              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-200/70 text-slate-700 rounded">
                                {task.category}
                              </span>
                            </div>

                            <p className={`text-xs mt-0.5 ${isDone ? 'text-slate-400' : 'text-slate-600'}`}>
                              {task.description}
                            </p>

                            {/* Grounded documented instruction verbatim */}
                            {task.documented_instruction && (
                              <p className="text-[11px] text-teal-800/90 font-medium mt-1">
                                Documented instruction: &quot;{task.documented_instruction}&quot;
                              </p>
                            )}

                            {/* Safe medication reminder notice */}
                            {isMed && (
                              <p className="text-[11px] text-amber-700/90 font-medium mt-1">
                                ℹ️ Please take medication exactly as prescribed by your physician, then confirm completion below.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Action buttons & Scheduled Time */}
                        <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                          <span className="text-xs font-mono text-slate-500 flex items-center space-x-1 mr-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{task.scheduled_time}</span>
                          </span>

                          <button
                            type="button"
                            onClick={() => handleTaskAction(task.task_id, isDone ? 'miss' : 'complete')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors shadow-sm cursor-pointer flex items-center space-x-1 ${
                              isDone
                                ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                                : isDue
                                ? 'bg-teal-600 hover:bg-teal-700 text-white border-teal-600'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {isDone ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Completed</span>
                              </>
                            ) : (
                              <>
                                <span>✓ {isMed ? 'Confirm & Record' : 'Mark Done'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-500 italic py-2">No care tasks scheduled for today.</p>
                )}
              </div>
            </section>

            {/* Today's Care Tasks & Adherence Checklist */}
            <section aria-label="Today's Care Tasks" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <ListTodo className="w-4 h-4 text-teal-600" />
                    <span>Today&apos;s Care Tasks (Day 2)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Monitoring Agent tracks daily task completion and flags non-adherence for {patient.first_name} {patient.last_name}.
                  </p>
                </div>
                {/* Adherence Counter & Status Breakdown */}
                <div className="flex flex-wrap items-center gap-1.5 justify-end">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium">
                    ✓ {completedTasksCount} Done
                  </span>
                  {snoozedTasksCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-medium">
                      ⏱ {snoozedTasksCount} Snoozed
                    </span>
                  )}
                  {missedTasksCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-medium">
                      ✗ {missedTasksCount} Missed
                    </span>
                  )}
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                      adherencePercent >= 80
                        ? 'bg-emerald-100 text-emerald-800'
                        : adherencePercent >= 50
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {adherencePercent}% ({completedTasksCount}/{tasks.length})
                  </span>
                </div>
              </div>

              {/* Task Checklist Items with Real-Time Actions */}
              <div className="mt-3 space-y-2.5">
                {tasks.length > 0 ? (
                  tasks.map((task) => {
                    const isDone = task.status === 'COMPLETED';
                    const isSnoozed = task.status === 'SNOOZED';
                    const isMissed = task.status === 'MISSED';

                    return (
                      <div
                        key={task.task_id}
                        className={`p-3 rounded-lg border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                          isDone
                            ? 'bg-emerald-50/50 border-emerald-200 text-slate-700'
                            : isSnoozed
                            ? 'bg-amber-50/50 border-amber-200 text-slate-800'
                            : isMissed
                            ? 'bg-rose-50/40 border-rose-200 text-slate-700'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-900'
                        }`}
                      >
                        {/* Task info */}
                        <div className="flex items-start space-x-2.5 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleTaskAction(task.task_id, isDone ? 'miss' : 'complete')}
                            className={`w-5 h-5 rounded mt-0.5 flex items-center justify-center shrink-0 transition-colors ${
                              isDone
                                ? 'bg-emerald-600 text-white'
                                : isSnoozed
                                ? 'bg-amber-500 text-white'
                                : isMissed
                                ? 'bg-rose-500 text-white'
                                : 'border border-slate-300 bg-white hover:border-slate-400'
                            }`}
                            aria-label={`Toggle ${task.title}`}
                          >
                            {isDone && <Check className="w-3.5 h-3.5" />}
                            {isSnoozed && <Clock3 className="w-3 h-3" />}
                            {isMissed && <X className="w-3.5 h-3.5" />}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`text-xs font-bold ${
                                  isDone
                                    ? 'line-through text-slate-500'
                                    : isMissed
                                    ? 'text-rose-900'
                                    : 'text-slate-900'
                                }`}
                              >
                                {task.title}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-200/70 text-slate-700 rounded">
                                {task.category}
                              </span>
                              {isSnoozed && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded">
                                  SNOOZED
                                </span>
                              )}
                              {isMissed && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 bg-rose-100 text-rose-800 rounded">
                                  MISSED
                                </span>
                              )}
                            </div>
                            <p className={`text-xs mt-0.5 ${isDone ? 'text-slate-400' : 'text-slate-600'}`}>
                              {task.description}
                            </p>
                          </div>
                        </div>

                        {/* Action buttons & time */}
                        <div className="flex items-center space-x-1 shrink-0 self-end sm:self-center">
                          <span className="text-[11px] font-mono text-slate-400 mr-2 flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{task.scheduled_time}</span>
                          </span>

                          <button
                            type="button"
                            onClick={() => handleTaskAction(task.task_id, 'complete')}
                            className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${
                              isDone
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                            }`}
                            title="Mark completed"
                          >
                            ✓ Done
                          </button>

                          <button
                            type="button"
                            onClick={() => handleTaskAction(task.task_id, 'snooze')}
                            className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${
                              isSnoozed
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                            }`}
                            title="Snooze task"
                          >
                            ⏱ Snooze
                          </button>

                          <button
                            type="button"
                            onClick={() => handleTaskAction(task.task_id, 'miss')}
                            className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${
                              isMissed
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-50'
                            }`}
                            title="Mark missed"
                          >
                            ✗ Miss
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-500 italic py-2">No care tasks scheduled for today.</p>
                )}
              </div>
            </section>

            {/* Prescribed Medications & Restrictions Summary */}
            <section aria-label="Prescribed Discharge Regimen" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Pill className="w-4 h-4 text-teal-600" />
                <span>Prescribed Discharge Regimen &amp; Precautions</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Extracted directly by the Discharge Understanding Agent for {patient.first_name} {patient.last_name}.
              </p>

              {/* Dynamic Medications List */}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeProfile.medications && activeProfile.medications.length > 0 ? (
                  activeProfile.medications.map((med, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{med.drug_name}</span>
                        <span className="text-[10px] font-mono text-slate-500">{med.dosage}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">{med.frequency} • {med.route}</p>
                      <p className="text-[10px] text-slate-400 italic mt-0.5">{med.indication}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">No medications listed in discharge profile.</p>
                )}
              </div>

              {/* Dynamic Red-Flag Rules Tagged in Profile */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-700 mb-1.5 flex items-center space-x-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  <span>Monitored Red-Flag Thresholds:</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {activeProfile.red_flag_warnings && activeProfile.red_flag_warnings.length > 0 ? (
                    activeProfile.red_flag_warnings.map((warn, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2 py-0.5 bg-rose-50 text-rose-800 rounded border border-rose-200"
                      >
                        {warn}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500 italic">Standard clinical red-flags monitored.</span>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: Deterministic Safety Engine & Agent Outputs (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* 1. Safety & Risk Status Card */}
            <section
              aria-label="Clinical Risk & Safety Engine Panel"
              className={`rounded-xl p-5 border shadow-sm transition-all ${riskStyles.container}`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
                <div className="flex items-center space-x-2">
                  {riskStyles.icon}
                  <div>
                    <h3 className="text-sm font-bold tracking-tight">{riskStyles.title}</h3>
                    <p className="text-xs opacity-75">Deterministic Precedence Enforced</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded text-xs font-mono tracking-wider ${riskStyles.badge}`}>
                  {activeRiskLevel}
                </span>
              </div>

              {/* Triggered Rule Details */}
              <div className="mt-3 space-y-2 text-xs">
                {workflowState?.risk_assessment?.deterministic_rule_triggered ? (
                  <div className="p-3 bg-white/90 rounded-lg border border-rose-300 text-rose-900">
                    <p className="text-[11px] uppercase font-mono font-bold text-rose-700">
                      Deterministic Safety Rule Triggered:
                    </p>
                    <p className="text-xs font-bold mt-0.5 font-mono">
                      {workflowState.risk_assessment.deterministic_rule_triggered}
                    </p>
                    <p className="text-[11px] text-rose-700 mt-1">
                      Violations lock the risk floor to at least HIGH and route to the Escalation Agent. AI cannot soften this flag.
                    </p>
                  </div>
                ) : (
                  <div className="p-2.5 bg-white/70 rounded-lg border border-emerald-200 text-emerald-900">
                    <span className="text-[11px] font-semibold text-emerald-800">
                      ✓ Deterministic Safety Engine: All parameters nominal.
                    </span>
                  </div>
                )}

                {/* Clinical Reasoning */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mt-2">
                    Clinical Reasoning:
                  </p>
                  <p className="text-xs text-slate-800 leading-relaxed mt-0.5">
                    {workflowState?.risk_assessment?.clinical_reasoning ||
                      'Vitals within normal limits. Recovery proceeding as expected.'}
                  </p>
                </div>

                {/* Immediate Directive */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mt-2">
                    Immediate Patient Directive:
                  </p>
                  <p className="text-xs font-semibold text-slate-900 bg-white/80 p-2 rounded border border-slate-200 mt-0.5">
                    {workflowState?.risk_assessment?.immediate_patient_directive ||
                      'Continue with daily tasks and prescribed rest.'}
                  </p>
                </div>

                {/* Care Team Action Required */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200/50 mt-3">
                  <span className="text-xs font-medium text-slate-600">Care-Team Action Required:</span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      workflowState?.risk_assessment?.care_team_action_required
                        ? 'bg-rose-600 text-white'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {workflowState?.risk_assessment?.care_team_action_required ? 'YES (Immediate)' : 'NO (Routine)'}
                  </span>
                </div>
              </div>
            </section>

            {/* 2. DYNAMIC ROUTE OUTPUT: Follow-Up Agent OR Escalation Coordination Agent */}
            {activeRiskLevel === 'HIGH' || activeRiskLevel === 'CRITICAL' ? (
              /* ESCALATION AGENT OUTPUT: TICKET & DRAFT SBAR NOTE */
              <section
                aria-label="Escalation Coordination Agent Output"
                className="bg-white border-2 border-rose-400 rounded-xl p-5 shadow-sm space-y-4"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-rose-100 text-rose-700 rounded-lg">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-rose-900">
                        Human Clinical Review Required
                      </h4>
                      <p className="text-xs text-rose-700">
                        Generated by Escalation &amp; Coordination Agent
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-xs font-bold rounded ${
                      workflowState?.escalation_ticket?.status === 'RESOLVED'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rose-600 text-white'
                    }`}
                  >
                    {workflowState?.escalation_ticket?.status === 'RESOLVED'
                      ? 'RESOLVED & VERIFIED'
                      : 'TICKET OPEN'}
                  </span>
                </div>

                {/* Ticket Details */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono">
                  <div>
                    <span className="text-slate-400">Ticket ID:</span>{' '}
                    <span className="font-bold text-slate-800">
                      {workflowState?.escalation_ticket?.ticket_id || 'ESC-2026-ALERT'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Routing:</span>{' '}
                    <span className="font-bold text-rose-700">Clinical Triage Board</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Patient:</span>{' '}
                    <span className="text-slate-800">{patient.first_name} {patient.last_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Priority:</span>{' '}
                    <span className="font-bold text-rose-600">{activeRiskLevel}</span>
                  </div>
                </div>

                {/* Mandatory SBAR Watermark */}
                <div className="bg-rose-100 border border-rose-300 text-rose-950 p-2.5 rounded-lg text-xs font-bold text-center">
                  ⚠️ AI-GENERATED DRAFT — REQUIRES HEALTHCARE PROFESSIONAL CLINICAL REVIEW AND VALIDATION BEFORE ACTION
                </div>

                {/* Draft SBAR Clinical Note */}
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                    <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                      S — Situation:
                    </p>
                    <p className="text-slate-700 mt-0.5">
                      {workflowState?.escalation_ticket?.draft_sbar?.situation ||
                        workflowState?.risk_assessment?.sbar?.situation ||
                        'Acute safety rule threshold exceeded requiring nurse triage.'}
                    </p>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                    <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                      B — Background:
                    </p>
                    <p className="text-slate-700 mt-0.5">
                      {workflowState?.escalation_ticket?.draft_sbar?.background ||
                        workflowState?.risk_assessment?.sbar?.background ||
                        `Patient ${patient.id} (${patient.first_name} ${patient.last_name}), ${patient.age}yo on Day 2 post-discharge for ${activeProfile.primary_diagnosis}.`}
                    </p>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                    <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                      A — Assessment:
                    </p>
                    <p className="text-slate-700 mt-0.5">
                      {workflowState?.escalation_ticket?.draft_sbar?.assessment ||
                        workflowState?.risk_assessment?.sbar?.assessment ||
                        'Risk reasoning flags acute parameter deviation. Deterministic safety rule enforces prompt clinical review.'}
                    </p>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                    <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                      R — Recommendation:
                    </p>
                    <p className="text-slate-700 mt-0.5">
                      {workflowState?.escalation_ticket?.draft_sbar?.recommendation ||
                        workflowState?.risk_assessment?.sbar?.recommendation ||
                        'Contact patient immediately for telephone triage or emergency services dispatch.'}
                    </p>
                  </div>
                </div>

                {/* Human Clinical Review & Verification Loop */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 uppercase tracking-wide text-[11px] flex items-center space-x-1.5">
                      <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
                      <span>Human Clinical Verification Loop</span>
                    </span>
                    {workflowState?.escalation_ticket?.status === 'RESOLVED' ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                        ✓ REVIEW VERIFIED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-bold text-[10px]">
                        PENDING SIGN-OFF
                      </span>
                    )}
                  </div>

                  {workflowState?.escalation_ticket?.status === 'RESOLVED' ? (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-900 space-y-1">
                      <p className="font-bold text-xs flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          Reviewed by{' '}
                          {workflowState.escalation_ticket.assigned_clinician || clinicianName}
                        </span>
                      </p>
                      <p className="text-[11px] text-emerald-800">
                        {workflowState.escalation_ticket.clinician_action_notes || reviewNotes}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-medium uppercase mb-0.5">
                            Attending Clinician
                          </label>
                          <input
                            type="text"
                            value={clinicianName}
                            onChange={(e) => setClinicianName(e.target.value)}
                            className="w-full text-xs p-1.5 rounded border border-slate-200 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-medium uppercase mb-0.5">
                            Verification Action Notes
                          </label>
                          <input
                            type="text"
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            className="w-full text-xs p-1.5 rounded border border-slate-200 bg-white"
                          />
                        </div>
                      </div>

                      {reviewSuccessMessage && (
                        <p className="text-[11px] text-emerald-700 font-medium">{reviewSuccessMessage}</p>
                      )}

                      <button
                        type="button"
                        onClick={handleClinicalReview}
                        disabled={reviewLoading}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50 shadow-xs"
                      >
                        {reviewLoading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Verifying Clinical SBAR...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark Reviewed (Simulated Clinical Verification)</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 italic">
                  Note: The AI escalation agent generated this structured draft. Only licensed clinical staff may resolve tickets or authorize medical interventions.
                </div>
              </section>
            ) : (
              /* FOLLOW-UP AGENT OUTPUT: PATIENT COMPANION GUIDANCE */
              <section
                aria-label="Follow-Up Agent Output"
                className="bg-white border border-teal-200 rounded-xl p-5 shadow-sm space-y-3"
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-teal-50 text-teal-700 rounded-lg">
                      <Heart className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Follow-Up Agent Guidance
                      </h4>
                      <p className="text-xs text-slate-500">
                        Empathetic Recovery Companion (Non-Diagnostic)
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-teal-100 text-teal-800 text-xs font-semibold rounded">
                    ROUTINE CHECK-IN
                  </span>
                </div>

                {/* Patient Conversational Reply */}
                <div className="p-3 bg-teal-50/50 rounded-lg border border-teal-100 text-xs text-slate-800 leading-relaxed">
                  <p className="font-semibold text-teal-900 mb-1">Message to Patient:</p>
                  <p>
                    {workflowState?.followup_response?.reply ||
                      `Hello ${patient.first_name}, everything looks on track today. Please continue observing your activity guidelines: '${activeProfile.activity_restrictions}'.`}
                  </p>
                </div>

                {/* Suggested Action */}
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                    <span className="text-slate-700 font-medium">
                      {workflowState?.followup_response?.suggested_action ||
                        'Review today\'s scheduled care tasks and resting vitals log.'}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>

                {/* Mandatory Disclaimer */}
                <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-100">
                  {workflowState?.followup_response?.disclaimer ||
                    'CareBridge AI is a clinical decision-support prototype and does not replace licensed medical advice.'}
                </p>
              </section>
            )}

            {/* 3. Care Team Triage Snapshot Preview */}
            <section aria-label="Clinical Triage Board" className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                  <Activity className="w-3.5 h-3.5 text-teal-600" />
                  <span>Clinical Triage Board Snapshot</span>
                </h4>
                <span className="text-[10px] text-slate-500 font-mono">4 Active Cohort</span>
              </div>
              <div className="space-y-1.5 text-xs">
                {DEMO_TRIAGE_PATIENTS.map((p) => {
                  const isCurrent = p.patient_id === selectedPatientId;
                  return (
                    <div
                      key={p.patient_id}
                      onClick={() => handleSelectPatient(p.patient_id)}
                      className={`p-2 rounded flex items-center justify-between cursor-pointer transition-colors ${
                        isCurrent
                          ? 'bg-slate-100 font-semibold border border-slate-300'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            p.risk_level === 'HIGH'
                              ? 'bg-orange-500'
                              : p.risk_level === 'MODERATE'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                        />
                        <span className="truncate">{p.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">({p.procedure.split(' ')[0]})</span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                          p.risk_level === 'HIGH'
                            ? 'bg-orange-100 text-orange-800'
                            : p.risk_level === 'MODERATE'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {p.risk_level}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        {/* 6. Recovery Activity Timeline & Audit Trail */}
        <section aria-label="Recovery Activity Timeline" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <Clock3 className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">Recovery Activity Timeline &amp; State Transitions</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                  Event-Driven Loop
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Chronological recovery telemetry, task lifecycle transitions, safety flags, and clinical reviews for {patient.first_name} {patient.last_name}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchTimeline(selectedPatientId)}
              className="self-start sm:self-auto flex items-center space-x-1 px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded border border-slate-200 font-medium transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh Timeline</span>
            </button>
          </div>

          <div className="mt-4 space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {timelineEvents && timelineEvents.length > 0 ? (
              timelineEvents.map((evt) => {
                const isTask = evt.event_type.startsWith('TASK_');
                const isVital =
                  evt.event_type === 'VITAL_RECORDED' || evt.event_type === 'SYMPTOM_REPORTED';
                const isSafety = evt.event_type === 'SAFETY_TRIGGERED';
                const isEscalation = evt.event_type === 'ESCALATION_CREATED';
                const isReview = evt.event_type === 'CLINICAL_REVIEW_COMPLETED';

                const badgeBg = isReview
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : isEscalation
                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                  : isSafety
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : isVital
                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                  : 'bg-teal-100 text-teal-800 border-teal-300';

                const icon = isReview ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : isEscalation ? (
                  <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : isSafety ? (
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                ) : isVital ? (
                  <Activity className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                ) : (
                  <Check className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                );

                const timeStr = evt.timestamp
                  ? new Date(evt.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : 'Just now';

                return (
                  <div
                    key={evt.event_id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start space-x-3 text-xs hover:bg-slate-100/60 transition-colors"
                  >
                    {icon}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${badgeBg}`}
                          >
                            {evt.event_type}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {evt.run_id}
                          </span>
                          {evt.source && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded font-medium">
                              {evt.source}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono shrink-0">
                          {timeStr}
                        </span>
                      </div>
                      <p className="text-slate-800 mt-1 font-medium leading-snug">
                        {String(evt.value || evt.event_type)}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-6 text-center text-xs text-slate-400 italic bg-slate-50 rounded-lg border border-dashed border-slate-200">
                No chronological recovery events recorded yet. Complete a task or submit vitals above to initiate the event loop.
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-8 py-4 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            CareBridge AI — Agentic Post-Discharge Clinical Decision-Support Prototype.
          </p>
          <p className="font-mono text-slate-400 text-[11px]">
            Zero-Diagnostic Hallucination Architecture • Bounded by Deterministic Safety Rules
          </p>
        </div>
      </footer>

      {/* ── Active Floating Reminder Toasts (Requirement 5) ───────────────── */}
      {activeToasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 space-y-2.5 max-w-sm w-full pointer-events-none">
          {activeToasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto p-4 rounded-xl border shadow-2xl backdrop-blur-md transition-all flex items-start space-x-3 ${
                toast.is_demo
                  ? 'bg-indigo-950/95 border-indigo-500/50 text-indigo-100'
                  : toast.is_medication
                  ? 'bg-amber-950/95 border-amber-500/50 text-amber-100'
                  : 'bg-slate-900/95 border-teal-500/50 text-slate-100'
              }`}
            >
              <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                toast.is_demo ? 'bg-indigo-600 text-white' : 'bg-teal-600 text-white animate-bounce'
              }`}>
                <BellRing className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white truncate">{toast.title}</span>
                  <button
                    onClick={() => handleDismissToast(toast.id)}
                    className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                    aria-label="Dismiss reminder"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-snug">{toast.message}</p>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-slate-400 flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{toast.scheduled_time}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCompleteFromToast(toast.task_id, toast.id)}
                    className="px-2.5 py-1 text-xs font-semibold rounded bg-teal-500 hover:bg-teal-400 text-white shadow transition cursor-pointer"
                  >
                    ✓ {toast.is_medication ? 'Confirm & Record' : 'Mark Done'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    )}
  </div>
  );
}
