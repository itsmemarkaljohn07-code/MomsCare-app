// health.service.ts
import { Injectable, EnvironmentInjector, runInInjectionContext, inject } from '@angular/core';
import {
  Firestore, doc, docData, setDoc,
  collection, addDoc, query, orderBy, limit, collectionData, Timestamp,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

export interface HealthData {
  weight: number;
  bpSys: number;
  bpDia: number;
  kicks: number;
  mood: number;
  updatedAt?: any;
}

export interface HealthLogEntry extends HealthData {
  id?: string;
  loggedAt?: any;
}

/** Weight and blood pressure measured at the clinic
 *  (users/{uid}/clinicReadings). Written by the dashboard server only;
 *  the patient can read her own. measuredOn is a Manila calendar day. */
export interface ClinicReading {
  id?: string;
  weightKg: number | null;
  bpSys: number | null;
  bpDia: number | null;
  note: string;
  measuredOn: string;
  enteredByUid?: string;
  enteredByName?: string;
  enteredAt?: any;
  updatedAt?: any;
}

/**
 * Single source of truth for pregnancy health data, shared identically
 * between the Homepage's Health Snapshot and the Snapshot Page's Health
 * Tracker. Both pages read the same `users/{uid}/health/current`
 * document and write through the same saveHealth() method, so an update
 * on either page is instantly reflected on the other.
 */
@Injectable({ providedIn: 'root' })
export class HealthService {
  private envInjector = inject(EnvironmentInjector);

  constructor(private firestore: Firestore, private auth: AuthService) {}

  private currentDocRef(uid: string) {
    return doc(this.firestore, `users/${uid}/health/current`);
  }

  private historyCol(uid: string) {
    return collection(this.firestore, `users/${uid}/healthLogs`);
  }

  /** Real-time stream of the signed-in user's current health snapshot. */
  getCurrentHealth$(): Observable<HealthData | null> {
    return this.auth.user$.pipe(
      switchMap(user => {
        if (!user) return of(null);
        return runInInjectionContext(this.envInjector, () =>
          docData(this.currentDocRef(user.uid))
        ) as Observable<HealthData | null>;
      })
    );
  }

  /** Real-time stream of recent health log entries, most recent first. */
  getHistory$(max = 8): Observable<HealthLogEntry[]> {
    return this.auth.user$.pipe(
      switchMap(user => {
        if (!user) return of([]);
        return runInInjectionContext(this.envInjector, () => {
          const q = query(this.historyCol(user.uid), orderBy('loggedAt', 'desc'), limit(max));
          return collectionData(q, { idField: 'id' });
        }) as Observable<HealthLogEntry[]>;
      })
    );
  }

  /** Real-time stream of every health log entry (the Health Tracker graph). */
  getAllHistory$(): Observable<HealthLogEntry[]> {
    return this.auth.user$.pipe(
      switchMap(user => {
        if (!user) return of([]);
        return runInInjectionContext(this.envInjector, () =>
          collectionData(this.historyCol(user.uid), { idField: 'id' })
        ) as Observable<HealthLogEntry[]>;
      })
    );
  }

  /** Real-time stream of the clinic's readings for the signed-in user. */
  getClinicReadings$(): Observable<ClinicReading[]> {
    return this.auth.user$.pipe(
      switchMap(user => {
        if (!user) return of([]);
        return runInInjectionContext(this.envInjector, () =>
          collectionData(collection(this.firestore, `users/${user.uid}/clinicReadings`), { idField: 'id' })
        ) as Observable<ClinicReading[]>;
      })
    );
  }

  /** Updates the shared "current" snapshot and appends a history entry. */
  async saveHealth(uid: string, data: HealthData): Promise<void> {
    const payload = { ...data, updatedAt: Timestamp.now() };
    await runInInjectionContext(this.envInjector, () =>
      setDoc(this.currentDocRef(uid), payload)
    );
    await runInInjectionContext(this.envInjector, () =>
      addDoc(this.historyCol(uid), { ...payload, loggedAt: Timestamp.now() })
    );
  }
}