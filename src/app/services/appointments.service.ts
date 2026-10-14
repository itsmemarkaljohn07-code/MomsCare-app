import { Injectable } from '@angular/core';
import {
  Firestore, collection, collectionData, addDoc, doc, getDocs,
  updateDoc, deleteDoc, query, orderBy, serverTimestamp, Timestamp,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { Observable, of, firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

export interface AppointmentRecord {
  id?: string;
  label: string;
  type: string;
  doctor: string;
  date: string;
  time: string;
  location?: string;
  notes?: string;
  icon: string;
  accentColor: 'green' | 'pink' | 'purple' | 'blue' | 'orange';
  advice?: string[];
  files?: string[];
  status: 'upcoming' | 'completed' | 'cancelled' | 'missed';
  createdAt?: any;
  /** A patient's cancellation request. The app writes only 'requested' and
   *  'withdrawn'; the dashboard server writes 'approved'/'declined' and the
   *  decision fields, and sets status 'cancelled' on approval. */
  cancellation?: AppointmentCancellation;
}

export interface AppointmentCancellation {
  state: 'requested' | 'withdrawn' | 'declined' | 'approved';
  reason?: string;
  requestedAt?: any;
  decidedAt?: any;
  decidedBy?: string;
  declineReason?: string;
}

/** Same limit firestore.rules enforces on `cancellation.reason`. */
export const CANCELLATION_REASON_MAX = 300;

@Injectable({ providedIn: 'root' })
export class AppointmentsService {
  constructor(private firestore: Firestore, private auth: AuthService) {}

  private col(uid: string) {
    return collection(this.firestore, `users/${uid}/appointments`);
  }

  getAppointments$(): Observable<AppointmentRecord[]> {
    return this.auth.user$.pipe(
      switchMap(user => {
        if (!user) return of([]);
        const q = query(this.col(user.uid), orderBy('date', 'asc'));
        return collectionData(q, { idField: 'id' }) as Observable<AppointmentRecord[]>;
      })
    );
  }

  /** One-time read (no live listener), for scheduling reminders at app start. */
  async getAppointmentsOnce(uid: string): Promise<AppointmentRecord[]> {
    const snap = await getDocs(query(this.col(uid), orderBy('date', 'asc')));
    return snap.docs.map(d => ({ ...(d.data() as AppointmentRecord), id: d.id }));
  }

  async addAppointment(appt: Omit<AppointmentRecord, 'id' | 'createdAt'>): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) throw new Error('Not authenticated');
    await addDoc(this.col(user.uid), { ...appt, createdAt: Timestamp.now() });
  }

  /** Asks the clinic to cancel an upcoming appointment. Writes ONLY the
   *  `cancellation` field; the appointment stays booked (status is never
   *  written from the app) until the clinic approves in the dashboard.
   *  firestore.rules enforces the same shape and the allowed transitions. */
  async requestCancellation(id: string, reason?: string): Promise<void> {
    const trimmed = (reason ?? '').trim().slice(0, CANCELLATION_REASON_MAX);
    await this.writeCancellation(id, {
      state: 'requested',
      ...(trimmed ? { reason: trimmed } : {}),
      requestedAt: serverTimestamp(),
    });
  }

  /** Withdraws a pending cancellation request (only valid while 'requested'). */
  async withdrawCancellationRequest(id: string): Promise<void> {
    await this.writeCancellation(id, { state: 'withdrawn', requestedAt: serverTimestamp() });
  }

  private async writeCancellation(id: string, cancellation: Record<string, unknown>): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) throw new Error('Not authenticated');
    await updateDoc(doc(this.firestore, `users/${user.uid}/appointments/${id}`), { cancellation });
  }

  async deleteAppointment(id: string): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) throw new Error('Not authenticated');
    await deleteDoc(doc(this.firestore, `users/${user.uid}/appointments/${id}`));
  }
}