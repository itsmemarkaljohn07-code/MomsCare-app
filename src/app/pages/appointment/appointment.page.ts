import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
import { AuthService } from '../../services/auth.service';
import {
  AppointmentsService,
  AppointmentRecord,
  AppointmentCancellation,
  CANCELLATION_REASON_MAX,
} from '../../services/appointments.service';
import { AppointmentRemindersService } from '../../services/appointment-reminders.service';
import { Subscription } from 'rxjs';

export interface Appointment {
  date: string;
  day: string;
  time: string;
  label: string;
  type: string;
  doctor: string;
  location?: string;
  notes?: string;
  icon: string;
  accentColor: 'green' | 'pink' | 'purple' | 'blue' | 'orange';
  advice?: string[];
  files?: string[];
  id?: string;
  doctorApproval?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  status: AppointmentRecord['status'];
  /** Cancellation request state, if the patient has ever asked. */
  cancellationState?: AppointmentCancellation['state'];
  declineReason?: string;
}

/** How long a request/withdraw may take before the spinner stops. Firestore
 *  keeps an offline write queued and sends it once the phone reconnects. */
const CANCELLATION_WRITE_TIMEOUT_MS = 15000;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

@Component({
  selector: 'app-appointments',
  templateUrl: './appointment.page.html',
  styleUrls:  ['./appointment.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class AppointmentsPage implements OnInit, OnDestroy {

  animReady = false;
  darkMode = false;
  private themeSub!: Subscription;
  private apptSub!: Subscription;
  private userSub!: Subscription;
  private currentUid: string | null = null;

  /** Computed from the user's real stored due date (same source and
   *  formula as the Homepage), not hardcoded — stays in sync with the
   *  rest of the app automatically. */
  pregnancyWeek = 0;
  private dueDate: Date | null = null;

  activeTab: 'upcoming' | 'past' = 'upcoming';
  expandedCard: number | null = null;
  expandedPast: number | null = null;

  navActiveTab = 'appts';

  upcomingAppointments: Appointment[] = [];
  pastAppointments: Appointment[] = [];

  /** Already real-time — driven by upcomingAppointments.length, which
   *  is populated from Firestore via applyRecords(). Updates
   *  automatically as appointments are added, cancelled, or their
   *  dates pass. */
  get upcomingCount(): number {
    return this.upcomingAppointments.length;
  }

    private toDisplay(rec: AppointmentRecord): Appointment {
    const d = new Date(rec.date + 'T00:00:00');
    return {
      id: rec.id,
      label: rec.label,
      type: rec.type,
      doctor: rec.doctor,
      date: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
      day: DAYS[d.getDay()],
      time: rec.time,
      location: rec.location,
      notes: rec.notes,
      icon: rec.icon,
      accentColor: rec.accentColor,
      advice: rec.advice || [],
      files: rec.files || [],
      doctorApproval: (rec as any).doctorApproval,
      rejectionReason: (rec as any).rejectionReason,
      status: rec.status,
      cancellationState: rec.cancellation?.state,
      declineReason: rec.cancellation?.declineReason,
    };
  }

  // Reminders follow the "Appointment Reminders" switch in Pregnancy
  // Settings (notificationPrefs.appointmentReminders). Unset means on.
  private remindersEnabled = true;
  private latestRecords: AppointmentRecord[] = [];

  private applyReminders(): void {
    if (this.remindersEnabled) {
      this.appointmentReminders.syncReminders(this.latestRecords);
    } else {
      this.appointmentReminders.cancelAllReminders();
    }
  }

  private async loadReminderPreference(): Promise<void> {
    try {
      const profile = await this.authService.getProfile();
      const enabled = profile?.notificationPrefs?.appointmentReminders !== false;
      if (enabled !== this.remindersEnabled) {
        this.remindersEnabled = enabled;
        this.applyReminders();
      }
    } catch (err) {
      console.error('Failed to load reminder preference:', err);
    }
  }

  /** Runs every time this page becomes active (Ionic keeps it alive in the
   *  background), so flipping the switch in Pregnancy Settings takes
   *  effect as soon as the user comes back here. */
  ionViewWillEnter(): void {
    this.loadReminderPreference();
  }

  private applyRecords(records: AppointmentRecord[]): void {
    const todayIso = new Date().toISOString().slice(0, 10);
    this.upcomingAppointments = records
      .filter(r => r.status === 'upcoming' && r.date >= todayIso)
      .map(r => this.toDisplay(r));
    this.pastAppointments = records
      .filter(r => r.status !== 'upcoming' || r.date < todayIso)
      .map(r => this.toDisplay(r))
      .reverse();

    // Recompute reminders whenever the appointment list changes — from
    // this device, the admin dashboard, or anywhere else.
    this.latestRecords = records;
    this.applyReminders();
  }

  toggleCard(index: number): void {
    this.expandedCard = this.expandedCard === index ? null : index;
  }

  togglePast(index: number): void {
    this.expandedPast = this.expandedPast === index ? null : index;
  }

  setTab(tab: 'upcoming' | 'past'): void {
    this.activeTab = tab;
    this.expandedCard = null;
    this.expandedPast = null;
  }

  // ── Cancellation requests ─────────────────────────────
  // Patients no longer cancel directly: they ask, and the clinic approves
  // or declines in the dashboard. The appointment stays booked (and keeps
  // its reminders) until it is approved.

  readonly cancelReasonMax = CANCELLATION_REASON_MAX;
  /** Appointment whose "Request cancellation" confirmation is open. */
  confirmingCancelId: string | null = null;
  cancelReason = '';
  /** Appointment with a request/withdraw in flight. */
  busyCancelId: string | null = null;
  /** Result message shown on one card. */
  cancelMessage: { id: string; kind: 'success' | 'error'; text: string } | null = null;

  openCancelRequest(id?: string): void {
    if (!id) return;
    this.confirmingCancelId = id;
    this.cancelReason = '';
    this.cancelMessage = null;
  }

  closeCancelRequest(): void {
    this.confirmingCancelId = null;
    this.cancelReason = '';
  }

  async sendCancelRequest(appt: Appointment): Promise<void> {
    if (!appt.id || this.busyCancelId) return;
    await this.runCancellationWrite(
      appt.id,
      () => this.appointmentsService.requestCancellation(appt.id!, this.cancelReason),
      'Request sent. The clinic will review it; your appointment stays booked until then.',
      "We couldn't send your request. Please try again.",
    );
  }

  async withdrawCancelRequest(appt: Appointment): Promise<void> {
    if (!appt.id || this.busyCancelId) return;
    await this.runCancellationWrite(
      appt.id,
      () => this.appointmentsService.withdrawCancellationRequest(appt.id!),
      'Request withdrawn. Your appointment stays booked.',
      "We couldn't withdraw your request. Please try again.",
    );
  }

  /** Runs one write with a timeout, so the button never stays on
   *  "Sending..." forever (e.g. offline, where Firestore holds the write
   *  until it reconnects). */
  private async runCancellationWrite(
    id: string,
    write: () => Promise<void>,
    successText: string,
    errorText: string,
  ): Promise<void> {
    this.busyCancelId = id;
    this.cancelMessage = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<'timeout'>(resolve => {
        timer = setTimeout(() => resolve('timeout'), CANCELLATION_WRITE_TIMEOUT_MS);
      });
      const pending = write();
      // If it finishes (or fails) after the timeout, still log a failure.
      pending.catch(err => console.error('Cancellation request failed after timeout:', err));
      const outcome = await Promise.race([pending.then(() => 'done' as const), timeout]);
      this.closeCancelRequest();
      this.cancelMessage = outcome === 'done'
        ? { id, kind: 'success', text: successText }
        : { id, kind: 'error', text: "You seem to be offline. It will be sent to the clinic when you're back online." };
    } catch (err) {
      console.error('Cancellation request failed:', err);
      this.cancelMessage = { id, kind: 'error', text: errorText };
    } finally {
      clearTimeout(timer);
      this.busyCancelId = null;
    }
  }

  constructor(
    private router: Router,
    private theme: ThemeService,
    private authService: AuthService,
    private appointmentsService: AppointmentsService,
    private appointmentReminders: AppointmentRemindersService,
  ) {}

  /** Same formula as Home's recomputePregnancyFromDueDate() — reads the
   *  same stored dueDate via the same shared AuthService, so this stays
   *  in sync with the rest of the app rather than being a second,
   *  separate calculation. */
  private recomputePregnancyWeek(): void {
    if (!this.dueDate) return;
    const TOTAL_PREGNANCY_DAYS = 280;
    const msPerDay = 24 * 60 * 60 * 1000;
    const now = new Date();
    const daysUntilDue = Math.round((this.dueDate.getTime() - now.getTime()) / msPerDay);
    const daysElapsed = Math.max(0, Math.min(TOTAL_PREGNANCY_DAYS, TOTAL_PREGNANCY_DAYS - daysUntilDue));
    this.pregnancyWeek = Math.min(40, Math.floor(daysElapsed / 7));
  }

  private async loadPregnancyWeek(): Promise<void> {
    try {
      const profile = await this.authService.getProfile();
      if (profile?.dueDate) {
        this.dueDate = new Date(profile.dueDate);
        this.recomputePregnancyWeek();
      }
    } catch (err) {
      console.error('Failed to load pregnancy week:', err);
    }
  }

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe((val: boolean) => (this.darkMode = val));

    this.userSub = this.authService.user$.subscribe(fbUser => {
      this.currentUid = fbUser?.uid ?? null;
      this.appointmentReminders.setUid(this.currentUid);
    });

    this.apptSub = this.appointmentsService.getAppointments$()
      .subscribe((records: AppointmentRecord[]) => this.applyRecords(records));

    this.loadPregnancyWeek();

    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    this.apptSub?.unsubscribe();
    this.userSub?.unsubscribe();
  }

  navigate(route: string, tab?: string): void {
    this.router.navigate([route], {
      queryParams: tab ? { tab } : {},
    });
  }
}