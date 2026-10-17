import { Injectable } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, setDoc, updateDoc, serverTimestamp,
} from '@angular/fire/firestore';
import { Observable, of, firstValueFrom } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { RequestColor, RequestForm, RequestOption, RequestStatus, buildRequestDoc } from '../shared/appointment-request';

/** A patient's appointment request (users/{uid}/appointmentRequests/{id}).
 *  The app writes it once ('pending') and may withdraw it while pending;
 *  the dashboard server sets 'scheduled' (with appointmentId) or
 *  'declined' (with adminNote). firestore.rules enforces the same. */
export interface AppointmentRequestRecord {
  id: string;
  userId: string;
  type: string;
  options: RequestOption[];
  reason: string;
  notes?: string;
  icon?: string;
  accentColor?: RequestColor;
  status: RequestStatus;
  createdAt?: any;
  withdrawnAt?: any;
  adminNote?: string;
  appointmentId?: string;
}

@Injectable({ providedIn: 'root' })
export class AppointmentRequestsService {
  constructor(private firestore: Firestore, private auth: AuthService) {}

  private col(uid: string) {
    return collection(this.firestore, `users/${uid}/appointmentRequests`);
  }

  /** A new document id, made once when the form opens: sending the same
   *  form twice writes the same document, and the rules refuse the second
   *  write, so a double tap can't create two requests. */
  newRequestId(uid: string): string {
    return doc(this.col(uid)).id;
  }

  /** The patient's requests, newest first (live). Sorted here rather than
   *  in a query, so a request just sent offline (no server time yet) shows
   *  at the top straight away. */
  getRequests$(): Observable<AppointmentRequestRecord[]> {
    return this.auth.user$.pipe(
      switchMap(user => {
        if (!user) return of([]);
        return (collectionData(this.col(user.uid), { idField: 'id' }) as Observable<AppointmentRequestRecord[]>)
          .pipe(map(list => [...list].sort((a, b) => millis(b.createdAt) - millis(a.createdAt))));
      }),
    );
  }

  /** Writes one request under the id from newRequestId(). */
  async submit(id: string, form: RequestForm): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) throw new Error('Not authenticated');
    await setDoc(doc(this.col(user.uid), id), {
      ...buildRequestDoc(user.uid, form),
      createdAt: serverTimestamp(),
    });
  }

  /** Withdraws a pending request (writes only status and withdrawnAt). */
  async withdraw(id: string): Promise<void> {
    const user = await firstValueFrom(this.auth.user$);
    if (!user) throw new Error('Not authenticated');
    await updateDoc(doc(this.col(user.uid), id), { status: 'withdrawn', withdrawnAt: serverTimestamp() });
  }
}

/** A Firestore Timestamp in ms; a pending server time counts as now. */
function millis(t: any): number {
  return typeof t?.toMillis === 'function' ? t.toMillis() : Date.now();
}
