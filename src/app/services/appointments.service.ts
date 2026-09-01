import { Injectable } from '@angular/core';
import {
  Firestore, collection, collectionData, addDoc, doc,
  updateDoc, deleteDoc, query, orderBy, Timestamp,
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
  status: 'upcoming' | 'completed' | 'cancelled';
  createdAt?: any;
}

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

  async addAppointment(appt: Omit<AppointmentRecord, 'id' | 'createdAt'>): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) throw new Error('Not authenticated');
    await addDoc(this.col(user.uid), { ...appt, createdAt: Timestamp.now() });
  }

  async updateAppointment(id: string, changes: Partial<AppointmentRecord>): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) throw new Error('Not authenticated');
    await updateDoc(doc(this.firestore, `users/${user.uid}/appointments/${id}`), changes as any);
  }

  cancelAppointment(id: string): Promise<void> {
    return this.updateAppointment(id, { status: 'cancelled' });
  }

  async deleteAppointment(id: string): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) throw new Error('Not authenticated');
    await deleteDoc(doc(this.firestore, `users/${user.uid}/appointments/${id}`));
  }
}