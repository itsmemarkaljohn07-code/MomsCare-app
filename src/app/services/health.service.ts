// health.service.ts
import { Injectable } from '@angular/core';
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

/**
 * Single source of truth for pregnancy health data, shared identically
 * between the Homepage's Health Snapshot and the Snapshot Page's Health
 * Tracker. Both pages read the same `users/{uid}/health/current`
 * document and write through the same saveHealth() method, so an update
 * on either page is instantly reflected on the other.
 */
@Injectable({ providedIn: 'root' })
export class HealthService {
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
        return docData(this.currentDocRef(user.uid)) as Observable<HealthData | null>;
      })
    );
  }

  /** Real-time stream of recent health log entries, most recent first. */
  getHistory$(max = 8): Observable<HealthLogEntry[]> {
    return this.auth.user$.pipe(
      switchMap(user => {
        if (!user) return of([]);
        const q = query(this.historyCol(user.uid), orderBy('loggedAt', 'desc'), limit(max));
        return collectionData(q, { idField: 'id' }) as Observable<HealthLogEntry[]>;
      })
    );
  }

  /** Updates the shared "current" snapshot and appends a history entry. */
  async saveHealth(uid: string, data: HealthData): Promise<void> {
    const payload = { ...data, updatedAt: Timestamp.now() };
    await setDoc(this.currentDocRef(uid), payload);
    await addDoc(this.historyCol(uid), { ...payload, loggedAt: Timestamp.now() });
  }
}