import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
import { AuthService, UserProfile } from '../../services/auth.service';
import { ProfileStoreService } from '../../services/profile-store.service';
import { parseStoredDate } from '../../shared/date-utils';
import { pregnancyStatus } from '../../shared/pregnancy-status';
import { isMissedAppointment } from '../../shared/appointment-status';
import {
  AppointmentsService,
  AppointmentRecord,
  AppointmentCancellation,
  CANCELLATION_REASON_MAX,
} from '../../services/appointments.service';
import { AppointmentRemindersService } from '../../services/appointment-reminders.service';
import { AppointmentRequestsService, AppointmentRequestRecord } from '../../services/appointment-requests.service';
import { SaveFeedbackService } from '../../services/save-feedback.service';
import { McDropdownComponent, McDropdownOption } from '../../shared/mc-dropdown/mc-dropdown.component';
import { McDatepickerComponent } from '../../shared/mc-datepicker/mc-datepicker.component';
import {
  DEFAULT_REQUEST_COLOR, DEFAULT_REQUEST_ICON, REQUEST_COLORS, REQUEST_ICONS, REQUEST_NOTES_MAX,
  REQUEST_OPTIONS_MAX, REQUEST_REASON_MAX, REQUEST_TYPES, RequestForm, RequestFormErrors, RequestOption,
  emptyOption, formatSlot, fromSlots, localYmd, toSlots, validateRequestForm,
} from '../../shared/appointment-request';
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
  imports: [IonicModule, CommonModule, FormsModule, McDropdownComponent, McDatepickerComponent],
})
export class AppointmentsPage implements OnInit, OnDestroy {

  animReady = false;
  darkMode = false;
  private themeSub!: Subscription;
  private apptSub!: Subscription;
  private userSub!: Subscription;
  private profileSub?: Subscription;
  private requestsSub?: Subscription;
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
  // null until the saved switch has loaded: nothing is scheduled or
  // cancelled on a guess.
  private remindersEnabled: boolean | null = null;
  private latestRecords: AppointmentRecord[] = [];
  private missedTimer: any;

  private applyReminders(): void {
    if (this.remindersEnabled === null) return;
    if (this.remindersEnabled) {
      this.appointmentReminders.syncReminders(this.latestRecords);
    } else {
      this.appointmentReminders.cancelAllReminders();
    }
  }

  private async loadReminderPreference(): Promise<void> {
    try {
      const profile = await this.profileStore.whenLoaded();
      const enabled = profile?.notificationPrefs?.appointmentReminders !== false;
      if (enabled !== this.remindersEnabled) {
        this.remindersEnabled = enabled;
        this.applyReminders();
      }
    } catch (err: any) {
      // Not loaded: keep the reminders as they are (AppComponent syncs
      // them once the profile loads).
      console.error('Failed to load reminder preference:', err?.reason ?? err);
    }
  }

  /** Runs every time this page becomes active (Ionic keeps it alive in the
   *  background), so flipping the switch in Pregnancy Settings takes
   *  effect as soon as the user comes back here. */
  ionViewWillEnter(): void {
    this.loadReminderPreference();
  }

  private applyRecords(records: AppointmentRecord[]): void {
    this.latestRecords = records;
    this.splitRecords();
    // Recompute reminders whenever the appointment list changes — from
    // this device, the admin dashboard, or anywhere else.
    this.applyReminders();
  }

  /** Upcoming until 3 hours after the start time; after that a still-
   *  upcoming appointment shows in Past as Missed (isMissedAppointment). */
  private splitRecords(): void {
    const now = new Date();
    this.upcomingAppointments = this.latestRecords
      .filter(r => r.status === 'upcoming' && !isMissedAppointment(r, now))
      .map(r => this.toDisplay(r));
    this.pastAppointments = this.latestRecords
      .filter(r => r.status !== 'upcoming' || isMissedAppointment(r, now))
      .map(r => ({ ...this.toDisplay(r), status: isMissedAppointment(r, now) ? 'missed' as const : r.status }))
      .reverse();
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

  // ── Appointment requests ──────────────────────────────
  // The patient ASKS for an appointment (users/{uid}/appointmentRequests);
  // only the clinic creates appointments. One document id per form open,
  // so a double tap or a retry can never create two requests.

  readonly requestTypeOptions: McDropdownOption[] = REQUEST_TYPES.map(t => ({ value: t, label: t }));
  readonly requestFromOptions: McDropdownOption[] = fromSlots().map(t => ({ value: t, label: formatSlot(t) }));
  readonly requestIcons = REQUEST_ICONS;
  readonly requestColors = REQUEST_COLORS;
  readonly requestReasonMax = REQUEST_REASON_MAX;
  readonly requestNotesMax = REQUEST_NOTES_MAX;
  readonly requestOptionsMax = REQUEST_OPTIONS_MAX;

  requests: AppointmentRequestRecord[] = [];
  requestFormOpen = false;
  requestForm: RequestForm = this.blankRequestForm();
  requestErrors: RequestFormErrors = {};
  /** Set after the first "Send" so errors show only once she has tried. */
  requestTried = false;
  requestSaving = false;
  /** Request with a withdraw in flight. */
  withdrawingId: string | null = null;
  /** Request whose details are open in "My requests". */
  expandedRequestId: string | null = null;
  private requestId: string | null = null;

  get todayYmd(): string {
    return localYmd(new Date());
  }

  private blankRequestForm(): RequestForm {
    return {
      type: '', options: [emptyOption()], reason: '', notes: '',
      icon: DEFAULT_REQUEST_ICON, accentColor: DEFAULT_REQUEST_COLOR,
    };
  }

  toOptionsFor(option: RequestOption): McDropdownOption[] {
    return toSlots(option.from).map(t => ({ value: t, label: formatSlot(t) }));
  }

  /** A new start time can leave the end time before it; clear it then. */
  onFromChange(option: RequestOption): void {
    if (option.to && option.to <= option.from) option.to = '';
    this.revalidateRequest();
  }

  openRequestForm(): void {
    if (!this.currentUid) return;
    this.requestForm = this.blankRequestForm();
    this.requestErrors = {};
    this.requestTried = false;
    this.requestId = this.requestsService.newRequestId(this.currentUid);
    this.requestFormOpen = true;
  }

  closeRequestForm(): void {
    if (this.requestSaving) return;
    this.requestFormOpen = false;
    this.requestId = null;
  }

  addRequestOption(): void {
    if (this.requestForm.options.length < REQUEST_OPTIONS_MAX) this.requestForm.options.push(emptyOption());
  }

  removeRequestOption(index: number): void {
    if (index > 0) this.requestForm.options.splice(index, 1);
    this.revalidateRequest();
  }

  /** Re-checks while she edits, once she has tried to send. */
  revalidateRequest(): void {
    if (this.requestTried) this.requestErrors = validateRequestForm(this.requestForm);
  }

  async sendRequest(): Promise<void> {
    if (this.requestSaving || !this.requestId) return;
    this.requestTried = true;
    this.requestErrors = validateRequestForm(this.requestForm);
    if (Object.keys(this.requestErrors).length > 0) return;
    this.requestSaving = true;
    try {
      const id = this.requestId;
      const form = this.requestForm;
      const result = await this.feedback.save(() => this.requestsService.submit(id, form));
      // Saved, or kept on the phone until it is back online: either way
      // this request is done; the next form gets a new id.
      if (result.outcome !== 'failed') {
        this.requestFormOpen = false;
        this.requestId = null;
      }
    } finally {
      this.requestSaving = false;
    }
  }

  async withdrawRequest(req: AppointmentRequestRecord): Promise<void> {
    if (this.withdrawingId || req.status !== 'pending') return;
    this.withdrawingId = req.id;
    try {
      await this.feedback.save(() => this.requestsService.withdraw(req.id));
    } finally {
      this.withdrawingId = null;
    }
  }

  toggleRequest(id: string): void {
    this.expandedRequestId = this.expandedRequestId === id ? null : id;
  }

  /** "Scheduled": shows the appointment the clinic made from the request. */
  openScheduledAppointment(req: AppointmentRequestRecord): void {
    if (!req.appointmentId) return;
    const upcoming = this.upcomingAppointments.findIndex(a => a.id === req.appointmentId);
    if (upcoming >= 0) {
      this.setTab('upcoming');
      this.expandedCard = upcoming;
      return;
    }
    const past = this.pastAppointments.findIndex(a => a.id === req.appointmentId);
    if (past >= 0) {
      this.setTab('past');
      this.expandedPast = past;
    }
  }

  /** "Tue, Nov 3 · 9:00 AM – 10:30 AM" */
  formatRequestOption(o: RequestOption): string {
    const d = new Date(o.date + 'T00:00:00');
    const day = isNaN(d.getTime()) ? o.date : `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
    return `${day} · ${formatSlot(o.from)} – ${formatSlot(o.to)}`;
  }

  constructor(
    private router: Router,
    private theme: ThemeService,
    private authService: AuthService,
    private appointmentsService: AppointmentsService,
    private appointmentReminders: AppointmentRemindersService,
    private profileStore: ProfileStoreService,
    private requestsService: AppointmentRequestsService,
    private feedback: SaveFeedbackService,
  ) {}

  /** The shared formula (shared/pregnancy-status.ts), the same one Home
   *  uses, from the live profile, so a due date edited anywhere shows up
   *  here at once. */
  private applyProfileDueDate(profile: UserProfile | null): void {
    this.dueDate = parseStoredDate(profile?.dueDate);
    this.pregnancyWeek = pregnancyStatus(this.dueDate).week;
  }

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe((val: boolean) => (this.darkMode = val));

    this.userSub = this.authService.user$.subscribe(fbUser => {
      this.currentUid = fbUser?.uid ?? null;
      this.appointmentReminders.setUid(this.currentUid);
    });

    this.apptSub = this.appointmentsService.getAppointments$()
      .subscribe((records: AppointmentRecord[]) => this.applyRecords(records));

    this.profileSub = this.profileStore.profile$.subscribe(profile => this.applyProfileDueDate(profile));

    this.requestsSub = this.requestsService.getRequests$().subscribe({
      next: list => (this.requests = list),
      error: err => console.error('Failed to load appointment requests:', err?.code ?? err),
    });

    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });

    // Moves an appointment to Past once its 3 hours are up, without
    // reopening the page (display only; reminders aren't rescheduled).
    this.missedTimer = setInterval(() => this.splitRecords(), 60000);
  }

  ngOnDestroy(): void {
    clearInterval(this.missedTimer);
    this.themeSub?.unsubscribe();
    this.apptSub?.unsubscribe();
    this.userSub?.unsubscribe();
    this.profileSub?.unsubscribe();
    this.requestsSub?.unsubscribe();
  }

  navigate(route: string, tab?: string): void {
    this.router.navigate([route], {
      queryParams: tab ? { tab } : {},
    });
  }
}