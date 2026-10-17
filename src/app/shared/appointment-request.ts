// appointment-request.ts
// The rules for a patient's appointment REQUEST (users/{uid}/appointmentRequests):
// the allowed values, the half-hour time slots, the form checks and the exact
// document the app writes. No Angular and no Firebase here, so every rule can
// be tested on its own. firestore.rules enforces the same lists and limits.

/** Appointment names a patient can request: the dashboard's appointment
 *  form list without "Booking Appointment" (the clinic's own first visit).
 *  Older requests with any name still display as stored. */
export const REQUEST_TYPES = [
  'Prenatal Checkup', 'Nuchal Scan', 'Anomaly Scan',
  'Glucose Tolerance Test', 'Group B Strep Test', 'Ultrasound', 'Blood Test',
  'Postpartum Checkup', 'Other',
] as const;

/** Card icons and their names, the same as the dashboard's form. */
export const REQUEST_ICONS: readonly { value: string; label: string }[] = [
  { value: '🩺', label: 'Stethoscope' },
  { value: '🔬', label: 'Microscope' },
  { value: '🩸', label: 'Blood Test' },
  { value: '🥗', label: 'Nutrition' },
  { value: '👩‍⚕️', label: 'Provider' },
  { value: '💊', label: 'Medication' },
  { value: '🫀', label: 'Cardiology' },
  { value: '🧬', label: 'Genetics' },
];

export const REQUEST_COLORS = ['green', 'pink', 'purple', 'blue', 'orange'] as const;
export type RequestColor = typeof REQUEST_COLORS[number];

export const DEFAULT_REQUEST_ICON = '🩺';
export const DEFAULT_REQUEST_COLOR: RequestColor = 'purple';

export const REQUEST_REASON_MAX = 300;
export const REQUEST_NOTES_MAX = 500;
export const REQUEST_OPTIONS_MAX = 2;

/** First and last half-hour mark offered in the time pickers. */
const FIRST_SLOT_MINUTES = 7 * 60;
const LAST_SLOT_MINUTES = 19 * 60;

export type RequestStatus = 'pending' | 'scheduled' | 'declined' | 'withdrawn';

export interface RequestOption {
  /** yyyy-MM-dd, local. */
  date: string;
  /** "HH:mm", 24-hour, on a half hour. */
  from: string;
  to: string;
}

/** What the patient fills in. Empty strings mean "not chosen yet". */
export interface RequestForm {
  type: string;
  options: RequestOption[];
  reason: string;
  notes: string;
  icon: string;
  accentColor: string;
}

export type RequestFormErrors = Partial<Record<
  'type' | 'reason' | 'notes' | 'icon' | 'accentColor' | 'option0' | 'option1', string>>;

/** "07:00", "07:30", ... "19:00". */
export function halfHourSlots(): string[] {
  const out: string[] = [];
  for (let m = FIRST_SLOT_MINUTES; m <= LAST_SLOT_MINUTES; m += 30) out.push(minutesToHhmm(m));
  return out;
}

/** Start times: every slot except the last (a window needs an end). */
export function fromSlots(): string[] {
  return halfHourSlots().slice(0, -1);
}

/** End times after `from` (all of them while `from` is empty). */
export function toSlots(from: string): string[] {
  const all = halfHourSlots().slice(1);
  return from ? all.filter(t => t > from) : all;
}

/** "13:30" -> "1:30 PM". */
export function formatSlot(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function emptyOption(): RequestOption {
  return { date: '', from: '', to: '' };
}

/** Local calendar date as yyyy-MM-dd. */
export function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function minutesToHhmm(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function isBlank(o: RequestOption): boolean {
  return !o.date && !o.from && !o.to;
}

/** One option's problem, or '' if it's fine. Dates before today and start
 *  times already past today are refused. */
function optionError(o: RequestOption, now: Date): string {
  if (!o.date) return 'Choose a date.';
  if (!o.from || !o.to) return 'Choose a start and an end time.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return 'Choose a date.';
  if (!halfHourSlots().includes(o.from) || !halfHourSlots().includes(o.to)) return 'Choose times from the list.';
  if (o.to <= o.from) return 'The end time must be later than the start time.';
  const today = localYmd(now);
  if (o.date < today) return 'Choose today or a later date.';
  if (o.date === today && o.from <= minutesToHhmm(now.getHours() * 60 + now.getMinutes())) {
    return 'That time has already passed today.';
  }
  return '';
}

/** Every field's problem; an empty object means the form can be sent. The
 *  second option is optional, but once started it must be complete. */
export function validateRequestForm(f: RequestForm, now: Date = new Date()): RequestFormErrors {
  const e: RequestFormErrors = {};
  if (!(REQUEST_TYPES as readonly string[]).includes(f.type)) e.type = 'Choose the kind of appointment.';
  const first = f.options[0] ?? emptyOption();
  const firstError = optionError(first, now);
  if (firstError) e.option0 = firstError;
  const second = f.options[1];
  if (second && !isBlank(second)) {
    const secondError = optionError(second, now);
    if (secondError) e.option1 = secondError;
  }
  const reason = f.reason.trim();
  if (!reason) e.reason = 'Tell the clinic why you need this appointment.';
  else if (reason.length > REQUEST_REASON_MAX) e.reason = `Keep the reason under ${REQUEST_REASON_MAX} characters.`;
  if (f.notes.trim().length > REQUEST_NOTES_MAX) e.notes = `Keep the notes under ${REQUEST_NOTES_MAX} characters.`;
  if (!REQUEST_ICONS.some(i => i.value === f.icon)) e.icon = 'Choose an icon.';
  if (!(REQUEST_COLORS as readonly string[]).includes(f.accentColor)) e.accentColor = 'Choose a colour.';
  return e;
}

/** The document fields the app writes (createdAt is added by the service as
 *  a server timestamp). Only call with a form that passed validation. */
export function buildRequestDoc(uid: string, f: RequestForm) {
  const options = f.options
    .filter(o => !isBlank(o))
    .slice(0, REQUEST_OPTIONS_MAX)
    .map(o => ({ date: o.date, from: o.from, to: o.to }));
  const notes = f.notes.trim();
  return {
    userId: uid,
    type: f.type,
    options,
    reason: f.reason.trim(),
    ...(notes ? { notes } : {}),
    icon: f.icon,
    accentColor: f.accentColor as RequestColor,
    status: 'pending' as const,
  };
}
