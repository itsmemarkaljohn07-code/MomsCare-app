// notifications.service.ts
import { Injectable } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, updateDoc, addDoc, query, orderBy, Timestamp,
  runTransaction,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { Observable, of, map } from 'rxjs';
import { switchMap } from 'rxjs/operators';

export interface AppNotification {
  id: string;
  icon: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  route?: string;
  createdAt?: any;
  /** Set on entries from the clinic dashboard (e.g. 'appointment_missed'). */
  type?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  constructor(private firestore: Firestore, private auth: AuthService) {}

  private col(uid: string) {
    return collection(this.firestore, `users/${uid}/notifications`);
  }

  notifications$(): Observable<AppNotification[]> {
    return this.auth.user$.pipe(
      switchMap(user => {
        if (!user) return of([]);
        // Ordered by the real Firestore timestamp, not the display
        // string, so ordering is always chronologically correct.
        const q = query(this.col(user.uid), orderBy('createdAt', 'desc'));
        return collectionData(q, { idField: 'id' }) as Observable<AppNotification[]>;
      })
    );
  }

  unreadCount$(): Observable<number> {
    return this.notifications$().pipe(map(list => list.filter(n => !n.read).length));
  }

  async markRead(uid: string, id: string): Promise<void> {
    await updateDoc(doc(this.firestore, `users/${uid}/notifications/${id}`), { read: true });
  }

  async markAllRead(uid: string, ids: string[]): Promise<void> {
    await Promise.all(
      ids.map(id => updateDoc(doc(this.firestore, `users/${uid}/notifications/${id}`), { read: true }))
    );
  }

  /** Creates a new in-app notification for the given user. Used for
   *  system-generated reminders (e.g. the daily checklist reminder) as
   *  well as any future app-generated alerts. */
  async createNotification(
    uid: string,
    data: { icon: string; title: string; message: string; route?: string }
  ): Promise<void> {
    await addDoc(this.col(uid), {
      icon: data.icon,
      title: data.title,
      message: data.message,
      time: new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      }),
      read: false,
      route: data.route || null,
      createdAt: Timestamp.now(),
    });
  }

  /** Creates the notification with this exact id, dated `at`, only if it
   *  doesn't exist yet: an existing one (and whether it was read) is left
   *  untouched, so calling this again never duplicates or resets it. */
  async createIfMissing(
    uid: string,
    id: string,
    data: { icon: string; title: string; message: string; route?: string },
    at: Date,
  ): Promise<void> {
    const ref = doc(this.firestore, `users/${uid}/notifications/${id}`);
    await runTransaction(this.firestore, async tx => {
      if ((await tx.get(ref)).exists()) return;
      tx.set(ref, {
        icon: data.icon,
        title: data.title,
        message: data.message,
        time: at.toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        }),
        read: false,
        route: data.route || null,
        createdAt: Timestamp.fromDate(at),
      });
    });
  }
}