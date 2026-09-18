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
  Check
} from 'lucide-react';

import {
  PatientBase,
  DischargeProfile,
  CareTask,
  RiskLevel,
  RiskAssessment,
  SbarNote,
  SymptomReport
} from '../lib/types';
import {
  DEMO_PATIENT,
  DEMO_DISCHARGE_PROFILE,
  DEMO_CARE_TASKS,
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
    generated_for_diagnosis: string;
    duration_days: number;
    current_phase: number;
    phases: Array<{
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
    pending: number;
    missed: number;
    skipped: number;
    adherence_percentage: number;
    active_tasks: CareTask[];
  };
  symptom_report?: SymptomReport | null;
  risk_assessment?: RiskAssessment | null;
  escalation_ticket?: EscalationTicketData | null;
  followup_response?: FollowUpResponseData | null;
  workflow_route?: string | null;
  status?: string;
}

// Demo patients list for patient selector
const PATIENT_OPTIONS: Array<{ id: string; name: string; condition: string; age: number; gender: string }> = [
  { id: 'PT-CABG-001', name: 'James Harrison', condition: 'CABG x3 (Triple Bypass)', age: 71, gender: 'Male' },
  { id: 'PT-TKA-002', name: 'Elena Rostova', condition: 'Right Total Knee Arthroplasty', age: 64, gender: 'Female' },
  { id: 'PT-CHF-003', name: 'Marcus Vance', condition: 'Heart Failure Exacerbation', age: 68, gender: 'Male' },
  { id: 'PT-PNA-004', name: 'Sarah Chen', condition: 'Community-Acquired Pneumonia', age: 52, gender: 'Female' },
];

export default function DashboardPage() {
  const [selectedPatientId, setSelectedPatientId] = useState<string>('PT-CABG-001');
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeScenario, setActiveScenario] = useState<string>('routine');
  
  // Patient & workflow state
  const [patient, setPatient] = useState<PatientBase>(DEMO_PATIENT);
  const [tasks, setTasks] = useState<CareTask[]>(DEMO_CARE_TASKS);
  const [workflowState, setWorkflowState] = useState<WorkflowResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

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

  useEffect(() => {
    checkBackendHealth();
  }, [checkBackendHealth]);

  // Execute workflow via API or robust local fallback
  const runSimulationScenario = useCallback(
    async (scenarioKey: 'routine' | 'mild' | 'fever' | 'chest_pain') => {
      setActiveScenario(scenarioKey);
      setLoading(true);
      setApiError(null);

      // Build payload based on scenario
      let symptomReport: SymptomReport | null = null;
      if (scenarioKey === 'mild') {
        symptomReport = {
          patient_id: selectedPatientId,
          symptom_description: 'Mild incision soreness when taking deep breaths; no redness or fluid noted.',
          severity_score: 3,
          measured_temp: 98.6,
          systolic_bp: 124,
          diastolic_bp: 78,
          heart_rate: 72,
          spo2: 98,
          anatomical_location: 'sternal incision',
        };
      } else if (scenarioKey === 'fever') {
        symptomReport = {
          patient_id: selectedPatientId,
          symptom_description: 'Patient reports feeling chilled and feverish; chest incision feels increasingly hot.',
          severity_score: 6,
          measured_temp: 101.8,
          systolic_bp: 128,
          diastolic_bp: 82,
          heart_rate: 96,
          spo2: 97,
          anatomical_location: 'chest incision',
        };
      } else if (scenarioKey === 'chest_pain') {
        symptomReport = {
          patient_id: selectedPatientId,
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
        const response = await fetch(`${API_BASE_URL}/api/v1/workflow/${selectedPatientId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: symptomReport ? JSON.stringify(symptomReport) : JSON.stringify({}),
        });

        if (response.ok) {
          const data: WorkflowResult = await response.json();
          setWorkflowState(data);
          setBackendOnline(true);
          success = true;
        } else {
          setBackendOnline(false);
          setApiError(`Backend returned status ${response.status}. Using high-fidelity synthetic fallback.`);
        }
      } catch (err: unknown) {
        setBackendOnline(false);
        const message = err instanceof Error ? err.message : 'Network error';
        setApiError(`Backend unreachable at ${API_BASE_URL} (${message}). Operating in offline mode.`);
      }

      // If backend was offline, provide deterministic local fallback matching backend agents
      if (!success) {
        let fallbackResult: WorkflowResult;

        if (scenarioKey === 'chest_pain') {
          fallbackResult = {
            patient_id: selectedPatientId,
            patient_name: patient.first_name + ' ' + patient.last_name,
            primary_diagnosis: DEMO_DISCHARGE_PROFILE.primary_diagnosis,
            discharge_profile: DEMO_DISCHARGE_PROFILE,
            workflow_route: 'ESCALATION_COORDINATION_AGENT',
            status: 'COMPLETED',
            symptom_report: symptomReport,
            risk_assessment: {
              patient_id: selectedPatientId,
              risk_level: 'CRITICAL',
              deterministic_rule_triggered: 'RULE-SYMP-CHEST ("chest pain")',
              clinical_reasoning:
                'Reported severe chest pain is a deterministic high-priority safety trigger requiring immediate emergency evaluation. The system does not determine the underlying medical cause.',
              immediate_patient_directive:
                'EMERGENCY DIRECTIVE: Call 911 immediately or proceed to the nearest emergency department. Stop all physical activity. Do not drive yourself.',
              care_team_action_required: true,
              sbar: {
                situation: 'Triggered Safety Rule RULE-SYMP-CHEST: acute chest distress reported.',
                background: `Patient ${selectedPatientId} (${patient.first_name} ${patient.last_name}), post-op Day 2 CABG x3.`,
                assessment: 'Deterministic high-priority safety trigger breached. Urgent in-person emergency evaluation required.',
                recommendation: 'Immediate 911 dispatch and on-call cardiothoracic surgical notification.',
              },
            },
            escalation_ticket: {
              ticket_id: `ESC-${Date.now().toString().slice(-6)}`,
              patient_id: selectedPatientId,
              patient_name: `${patient.first_name} ${patient.last_name}`,
              risk_level: 'CRITICAL',
              triggered_rule: 'RULE-SYMP-CHEST (Chest Pain)',
              status: 'OPEN',
              assigned_clinician: 'On-Call Surgical Fellow',
              draft_sbar: {
                disclaimer:
                  '⚠️ AI-GENERATED DRAFT — REQUIRES HEALTHCARE PROFESSIONAL CLINICAL REVIEW AND VALIDATION BEFORE ACTION',
                situation: 'Triggered Safety Rule RULE-SYMP-CHEST: acute chest distress reported.',
                background: `Patient ${selectedPatientId}, 71yo M post-CABG x3 on post-op day 2.`,
                assessment: 'Deterministic safety trigger requiring immediate emergency evaluation. The system does not determine the underlying medical cause.',
                recommendation: 'Dispatch 911 emergency services; alert cardiothoracic surgery on-call.',
                generated_at: new Date().toISOString(),
              },
            },
          };
        } else if (scenarioKey === 'fever') {
          fallbackResult = {
            patient_id: selectedPatientId,
            patient_name: patient.first_name + ' ' + patient.last_name,
            primary_diagnosis: DEMO_DISCHARGE_PROFILE.primary_diagnosis,
            discharge_profile: DEMO_DISCHARGE_PROFILE,
            workflow_route: 'ESCALATION_COORDINATION_AGENT',
            status: 'COMPLETED',
            symptom_report: symptomReport,
            risk_assessment: {
              patient_id: selectedPatientId,
              risk_level: 'HIGH',
              deterministic_rule_triggered: 'RULE-VITAL-TEMP (101.8°F >= 101.5°F)',
              clinical_reasoning:
                'Reported temperature exceeds the deterministic safety threshold. This is a high-priority safety trigger requiring prompt clinical evaluation. The system does not determine the underlying medical cause.',
              immediate_patient_directive:
                'Alerting your surgical care team now. Please rest quietly while your care team is notified for clinical triage evaluation.',
              care_team_action_required: true,
              sbar: {
                situation: 'Triggered Safety Rule RULE-VITAL-TEMP: core temperature 101.8°F.',
                background: `Patient ${selectedPatientId} (${patient.first_name} ${patient.last_name}), post-op Day 2 CABG x3.`,
                assessment: 'Deterministic temperature safety threshold breached. Urgent in-person or telephone triage evaluation required by surgical team.',
                recommendation: 'Cardiothoracic triage nurse or on-call clinician should contact patient promptly for clinical evaluation.',
              },
            },
            escalation_ticket: {
              ticket_id: `ESC-${Date.now().toString().slice(-6)}`,
              patient_id: selectedPatientId,
              patient_name: `${patient.first_name} ${patient.last_name}`,
              risk_level: 'HIGH',
              triggered_rule: 'RULE-VITAL-TEMP (101.8°F)',
              status: 'OPEN',
              assigned_clinician: 'Triage Nurse Sarah',
              draft_sbar: {
                disclaimer:
                  '⚠️ AI-GENERATED DRAFT — REQUIRES HEALTHCARE PROFESSIONAL CLINICAL REVIEW AND VALIDATION BEFORE ACTION',
                situation: 'Triggered Safety Rule RULE-VITAL-TEMP: core temp measured 101.8°F.',
                background: `Patient ${selectedPatientId}, 71yo M post-CABG x3 on post-op day 2. Incision warmth noted.`,
                assessment: 'Reported temperature exceeds the deterministic safety threshold. High-priority safety trigger requiring clinical evaluation. The system does not determine the underlying medical cause.',
                recommendation: 'Clinical triage review required. Clinician to contact patient and determine clinical management plan.',
                generated_at: new Date().toISOString(),
              },
            },
          };
        } else if (scenarioKey === 'mild') {
          fallbackResult = {
            patient_id: selectedPatientId,
            patient_name: patient.first_name + ' ' + patient.last_name,
            primary_diagnosis: DEMO_DISCHARGE_PROFILE.primary_diagnosis,
            discharge_profile: DEMO_DISCHARGE_PROFILE,
            workflow_route: 'FOLLOW_UP_AGENT',
            status: 'COMPLETED',
            symptom_report: symptomReport,
            risk_assessment: {
              patient_id: selectedPatientId,
              risk_level: 'LOW',
              deterministic_rule_triggered: undefined,
              clinical_reasoning:
                'No deterministic safety thresholds violated. Mild incisional soreness (severity 3/10) with normal vitals (temp 98.6°F, SpO2 98%) is consistent with expected healing after median sternotomy.',
              immediate_patient_directive:
                'Continue resting and adhering to sternal precautions. Use your cough pillow for sternal splinting. If pain intensifies, log it immediately.',
              care_team_action_required: false,
            },
            followup_response: {
              reply:
                `Hello ${patient.first_name}, mild soreness around your incision when breathing deeply is very common during days 2–7 of your CABG recovery. Your temperature of 98.6°F and oxygen of 98% are reassuring. Please continue hugging your cough pillow during deep breaths and avoid lifting anything over 10 lbs.`,
              risk_level: 'LOW',
              suggested_action: 'Complete your afternoon incentive spirometer breathing exercise (10 deep breaths).',
              disclaimer:
                'CareBridge AI is a clinical decision-support prototype and does not replace licensed healthcare professionals.',
            },
          };
        } else {
          // Routine check-in
          fallbackResult = {
            patient_id: selectedPatientId,
            patient_name: patient.first_name + ' ' + patient.last_name,
            primary_diagnosis: DEMO_DISCHARGE_PROFILE.primary_diagnosis,
            discharge_profile: DEMO_DISCHARGE_PROFILE,
            workflow_route: 'FOLLOW_UP_AGENT',
            status: 'COMPLETED',
            risk_assessment: {
              patient_id: selectedPatientId,
              risk_level: 'LOW',
              deterministic_rule_triggered: undefined,
              clinical_reasoning:
                'Routine daily recovery monitoring: Vitals nominal, task adherence at baseline. No safety rule deviations detected.',
              immediate_patient_directive:
                'Continue with scheduled medications and incentive spirometry as ordered in your discharge plan.',
              care_team_action_required: false,
            },
            followup_response: {
              reply:
                `Good day ${patient.first_name}. Your morning vitals and medication adherence are logged on schedule. Your recovery is proceeding according to Phase 1 (Immediate Acute Post-Op). Keep up the gentle walking and rest.`,
              risk_level: 'LOW',
              suggested_action: 'Perform your afternoon incision check and spirometry.',
              disclaimer:
                'CareBridge AI is a clinical decision-support prototype and does not replace licensed healthcare professionals.',
            },
          };
        }

        setWorkflowState(fallbackResult);
      }

      setLoading(false);
    },
    [selectedPatientId, patient.first_name, patient.last_name]
  );

  // Run routine scenario on mount or patient change
  useEffect(() => {
    // Update active patient details
    const found = PATIENT_OPTIONS.find((p) => p.id === selectedPatientId);
    if (found) {
      setPatient({
        ...DEMO_PATIENT,
        id: found.id,
        first_name: found.name.split(' ')[0],
        last_name: found.name.split(' ')[1] || '',
        age: found.age,
        gender: found.gender,
        condition_category: found.condition,
      });
    }
    runSimulationScenario('routine');
  }, [selectedPatientId, runSimulationScenario]);

  // Toggle care task status
  const handleToggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.task_id === taskId) {
          const nextStatus = t.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
          return { ...t, status: nextStatus };
        }
        return t;
      })
    );
  };

  // Compute adherence stats
  const completedTasksCount = tasks.filter((t) => t.status === 'COMPLETED').length;
  const adherencePercent = Math.round((completedTasksCount / tasks.length) * 100);

  // Active risk level
  const activeRiskLevel: RiskLevel = workflowState?.risk_assessment?.risk_level || 'LOW';

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
          <div className="flex items-center space-x-4">
            {/* Patient Selector */}
            <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <User className="w-4 h-4 text-slate-500" />
              <label htmlFor="patient-select" className="text-xs font-medium text-slate-600 sr-only">
                Select Patient:
              </label>
              <select
                id="patient-select"
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="text-xs font-semibold text-slate-800 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer"
              >
                {PATIENT_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id}) — {p.condition.split(' ')[0]}
                  </option>
                ))}
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
          </div>
        </div>
      </header>

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
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{patient.age} yrs • {patient.gender}</p>
              <p className="text-xs text-slate-500 mt-1">Discharged: {patient.discharge_date}</p>
            </div>

            {/* Condition / Procedure */}
            <div className="sm:pl-4 pr-2 pt-2 sm:pt-0 col-span-2 sm:col-span-1 lg:col-span-2">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Procedure / Primary Diagnosis</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">
                {patient.id === 'PT-CABG-001'
                  ? 'Triple-vessel CAD post-CABG x3'
                  : patient.condition_category}
              </p>
              <p className="text-xs text-teal-700 font-medium mt-1">
                Day 2 of 30 • Phase 1: Acute Recovery
              </p>
            </div>

            {/* Primary Physician */}
            <div className="sm:pl-4 pr-2 pt-2 sm:pt-0">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Primary Physician</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{patient.primary_care_physician}</p>
              <p className="text-xs text-slate-500 mt-1 flex items-center space-x-1">
                <PhoneCall className="w-3 h-3 text-slate-400" />
                <span>Clinic: {patient.clinic_phone}</span>
              </p>
            </div>

            {/* Emergency Contact */}
            <div className="sm:pl-4 pt-2 sm:pt-0">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Emergency Contact</p>
              <p className="text-xs font-semibold text-slate-800 mt-0.5">{patient.emergency_contact}</p>
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

        {/* 4. Symptom Simulation Demo Controls */}
        <section aria-label="Symptom Simulation Controls" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Stethoscope className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">Interactive Symptom & Event Simulation</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                  Demo Trigger
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Select a clinical scenario to trigger the agentic workflow and evaluate safety engine bounds in real-time.
              </p>
            </div>

            {/* Scenario Button Strip */}
            <div className="flex flex-wrap items-center gap-2">
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
                <span>2. Mild Incision Soreness</span>
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
          </div>

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
                    Phase 1 of 4: Immediate Acute Post-Op (Days 1–7)
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

              {/* Phase Milestones */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                  Active Clinical Milestones (Phase 1):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                    <p className="font-semibold text-slate-800">Sternal Precautions</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">No lifting &gt;10 lbs. Hug pillow when coughing.</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                    <p className="font-semibold text-slate-800">Pulmonary Hygiene</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Incentive spirometer 10x/hr while awake.</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                    <p className="font-semibold text-slate-800">Daily Telemetry</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Record dry weight, BP, HR & temp every morning.</p>
                  </div>
                </div>
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
                    Monitoring Agent tracks daily task completion and flags non-adherence.
                  </p>
                </div>
                {/* Adherence Counter */}
                <div className="text-right">
                  <span className="text-xs text-slate-500">Adherence Score: </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
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

              {/* Task Checklist Items */}
              <div className="mt-3 space-y-2.5">
                {tasks.map((task) => {
                  const isDone = task.status === 'COMPLETED';
                  return (
                    <div
                      key={task.task_id}
                      onClick={() => handleToggleTask(task.task_id)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer flex items-start space-x-3 ${
                        isDone
                          ? 'bg-emerald-50/50 border-emerald-200 text-slate-700'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-900'
                      }`}
                    >
                      {/* Interactive Checkbox */}
                      <button
                        type="button"
                        className={`w-5 h-5 rounded mt-0.5 flex items-center justify-center shrink-0 transition-colors ${
                          isDone
                            ? 'bg-emerald-600 text-white'
                            : 'border border-slate-300 bg-white hover:border-slate-400'
                        }`}
                        aria-label={isDone ? `Mark ${task.title} as pending` : `Mark ${task.title} as completed`}
                      >
                        {isDone && <Check className="w-3.5 h-3.5" />}
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span
                              className={`text-xs font-bold ${
                                isDone ? 'line-through text-slate-500' : 'text-slate-900'
                              }`}
                            >
                              {task.title}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-200/70 text-slate-700 rounded">
                              {task.category}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400 flex items-center space-x-1 shrink-0">
                            <Clock className="w-3 h-3" />
                            <span>{task.scheduled_time}</span>
                          </span>
                        </div>
                        <p className={`text-xs mt-0.5 ${isDone ? 'text-slate-400' : 'text-slate-600'}`}>
                          {task.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Prescribed Medications & Restrictions Summary */}
            <section aria-label="Prescribed Discharge Regimen" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Pill className="w-4 h-4 text-teal-600" />
                <span>Prescribed Discharge Regimen &amp; Precautions</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Extracted directly by the Discharge Understanding Agent.
              </p>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DEMO_DISCHARGE_PROFILE.medications.map((med, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{med.drug_name}</span>
                      <span className="text-[10px] font-mono text-slate-500">{med.dosage}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">{med.frequency} • {med.route}</p>
                    <p className="text-[10px] text-slate-400 italic mt-0.5">{med.indication}</p>
                  </div>
                ))}
              </div>

              {/* Red-Flag Rules Tagged in Profile */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-700 mb-1.5 flex items-center space-x-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  <span>Monitored Red-Flag Thresholds:</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {DEMO_DISCHARGE_PROFILE.red_flag_warnings.map((warn, i) => (
                    <span
                      key={i}
                      className="text-[11px] px-2 py-0.5 bg-rose-50 text-rose-800 rounded border border-rose-200"
                    >
                      {warn}
                    </span>
                  ))}
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
                  <span className="px-2 py-0.5 bg-rose-600 text-white text-xs font-bold rounded">
                    TICKET OPEN
                  </span>
                </div>

                {/* Ticket Details */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono">
                  <div>
                    <span className="text-slate-400">Ticket ID:</span>{' '}
                    <span className="font-bold text-slate-800">
                      {workflowState?.escalation_ticket?.ticket_id || 'ESC-2026-0916'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Routing:</span>{' '}
                    <span className="font-bold text-rose-700">Surgical Triage Board</span>
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
                        `Patient ${patient.id}, ${patient.age}yo post-CABG x3 on post-op day 2.`}
                    </p>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                    <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                      A — Assessment:
                    </p>
                    <p className="text-slate-700 mt-0.5">
                      {workflowState?.escalation_ticket?.draft_sbar?.assessment ||
                        workflowState?.risk_assessment?.sbar?.assessment ||
                        'Risk reasoning flags complication risk. Deterministic safety rule enforces clinical review.'}
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

                <div className="text-[11px] text-slate-500 italic">
                  Note: The AI escalation agent generated this structured note. Only licensed clinical staff may resolve or execute medical directives.
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
                      `Hello ${patient.first_name}, everything looks on track today. Please remember to observe sternal precautions and continue taking your scheduled medications.`}
                  </p>
                </div>

                {/* Suggested Action */}
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                    <span className="text-slate-700 font-medium">
                      {workflowState?.followup_response?.suggested_action ||
                        'Review afternoon care tasks and resting vitals log.'}
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
                      onClick={() => setSelectedPatientId(p.patient_id)}
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
    </div>
  );
}
