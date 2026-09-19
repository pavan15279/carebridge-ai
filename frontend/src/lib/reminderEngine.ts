/**
 * CareBridge AI: Frontend Reminder Engine
 * 
 * Provides periodic in-browser checking of scheduled recovery care tasks,
 * evaluates due status against the current time, dispatches in-app toasts,
 * and sends browser notifications via the Web Notifications API.
 * 
 * Strict Clinical Safety Directive:
 * - Reminders are operational check-ins and recovery coordination only.
 * - Medication reminders remind the patient to confirm/record completion;
 *   the system NEVER assumes medication was taken without patient confirmation.
 * - Never diagnoses, never prescribes, never invents medical advice.
 */

import { CareTask, TaskCategory, TaskStatus, TimingType } from './types';

export type ReminderStatus = 'DUE' | 'UPCOMING' | 'COMPLETED' | 'MISSED' | 'SNOOZED' | 'AVAILABLE_AS_NEEDED';

export interface TaskReminder {
  task_id: string;
  patient_id: string;
  title: string;
  description: string;
  category: TaskCategory;
  scheduled_time: string;
  timing_type?: TimingType;
  documented_instruction?: string;
  status: ReminderStatus;
  is_medication: boolean;
  is_demo?: boolean;
}

export interface ActiveToastNotification {
  id: string;
  task_id: string;
  title: string;
  message: string;
  scheduled_time: string;
  category: TaskCategory;
  timing_type?: TimingType;
  documented_instruction?: string;
  is_medication: boolean;
  timestamp: number;
  is_demo?: boolean;
}

/**
 * Contextual routine window bounds (24-hour hour markers).
 * These are operational reminder windows, NOT fabricated prescription times.
 * - Morning / Breakfast: 07:00 - 11:59
 * - Midday / Lunch:       12:00 - 16:59
 * - Evening / Dinner:     17:00 - 20:59
 * - Bedtime / Night:      21:00 - 23:59
 */
export const ROUTINE_WINDOWS = {
  MORNING_START: 7,
  MIDDAY_START: 12,
  EVENING_START: 17,
  BEDTIME_START: 21,
};

/**
 * Evaluates whether a care task is due, upcoming, or PRN available based on
 * its timing type and documented instruction anchor.
 * Never fabricates clock times when only an instruction anchor is present.
 */
export function calculateTaskDueStatus(
  scheduledTime: string,
  taskStatus: TaskStatus,
  referenceDate?: Date,
  timingType?: TimingType,
  category?: TaskCategory
): ReminderStatus {
  if (taskStatus === 'COMPLETED') return 'COMPLETED';
  if (taskStatus === 'MISSED') return 'MISSED';
  if (taskStatus === 'SNOOZED') return 'SNOOZED';

  const timeStr = (scheduledTime || '').trim().toLowerCase();

  // D. PRN / As needed: Never generates an automatic overdue alarm
  if (
    timingType === 'PRN_AS_NEEDED' ||
    timeStr.includes('prn') ||
    timeStr.includes('as needed')
  ) {
    return 'AVAILABLE_AS_NEEDED';
  }

  const now = referenceDate || new Date();
  const currentHour = now.getHours();
  const currentMinutes = currentHour * 60 + now.getMinutes();

  // A. Explicit CLOCK_TIME (e.g. "17:00", "09:00", "21:30")
  const clockMatch = scheduledTime.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (timingType === 'CLOCK_TIME' || clockMatch) {
    if (clockMatch) {
      const taskHours = parseInt(clockMatch[1], 10);
      const taskMinutes = parseInt(clockMatch[2], 10);
      const scheduledTotalMinutes = taskHours * 60 + taskMinutes;
      if (currentMinutes >= scheduledTotalMinutes) {
        return 'DUE';
      }
      return 'UPCOMING';
    }
  }

  // B. ROUTINE_WINDOW (Contextual reminder windows)
  if (timeStr.includes('breakfast') || timeStr.includes('morning')) {
    return currentHour >= ROUTINE_WINDOWS.MORNING_START ? 'DUE' : 'UPCOMING';
  }
  if (timeStr.includes('lunch') || timeStr.includes('midday') || timeStr.includes('noon')) {
    return currentHour >= ROUTINE_WINDOWS.MIDDAY_START ? 'DUE' : 'UPCOMING';
  }
  if (timeStr.includes('dinner') || timeStr.includes('evening')) {
    return currentHour >= ROUTINE_WINDOWS.EVENING_START ? 'DUE' : 'UPCOMING';
  }
  if (timeStr.includes('bedtime') || timeStr.includes('night') || timeStr.includes('sleep') || timeStr.includes('qhs')) {
    return currentHour >= ROUTINE_WINDOWS.BEDTIME_START ? 'DUE' : 'UPCOMING';
  }
  if (timeStr.includes('with meals') || timeStr.includes('with food')) {
    return currentHour >= ROUTINE_WINDOWS.MORNING_START ? 'DUE' : 'UPCOMING';
  }
  if (timeStr.includes('daily') || timeStr.includes('directed')) {
    return currentHour >= 8 ? 'DUE' : 'UPCOMING';
  }

  // C. INTERVAL (e.g. "Every 8 hours", "Every 12 hours")
  if (timingType === 'INTERVAL' || timeStr.includes('every')) {
    return currentHour >= 8 ? 'DUE' : 'UPCOMING';
  }

  // Default fallback for pending tasks
  return currentHour >= 9 ? 'DUE' : 'UPCOMING';
}

/**
 * Requests permission for HTML5 Web Notifications API in a non-intrusive way.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return 'denied';
  }
}

/**
 * Safely dispatches a native browser notification if permission is granted.
 */
export function sendBrowserNotification(
  title: string,
  body: string,
  tag?: string
): boolean {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  ) {
    return false;
  }

  try {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: tag || 'carebridge-reminder',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Formats non-diagnostic reminder content strictly grounded in documented discharge instructions.
 * Clinical Safety Rule: Never assumes the patient took the medication. Firing only means the task is due.
 */
export function formatReminderContent(
  task: CareTask,
  isDemo = false
): { title: string; message: string; badgeLabel: string } {
  const isMedication = task.category === 'MEDICATION';
  const prefix = isDemo ? '[DEMO TEST REMINDER] ' : '';
  const documentedText = task.documented_instruction || task.description || task.title;

  if (isMedication) {
    return {
      title: `${prefix}Scheduled Medication Check-In: ${task.title}`,
      message: `Documented instruction: "${documentedText}". Scheduled: ${task.scheduled_time}. Please confirm whether you have taken this medication as prescribed by your physician.`,
      badgeLabel: 'Confirm & Record',
    };
  }

  if (task.category === 'VITAL_CHECK') {
    return {
      title: `${prefix}Scheduled Vital Check: ${task.title}`,
      message: `Documented instruction: "${documentedText}". Scheduled: ${task.scheduled_time}. Please record your available vitals so your recovery team has up-to-date telemetry.`,
      badgeLabel: 'Record Vitals',
    };
  }

  return {
    title: `${prefix}Recovery Task Due: ${task.title}`,
    message: `Documented instruction: "${documentedText}". Scheduled: ${task.scheduled_time}.`,
    badgeLabel: 'Mark Done',
  };
}
