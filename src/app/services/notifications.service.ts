// notifications.service.ts
import { Injectable } from '@angular/core';
import {
  Firestore, collection, collectionData, collectionSnapshots, doc, getDocs, updateDoc, addDoc, query,
  orderBy, limit, startAfter, where, Timestamp, runTransaction,
  type DocumentData, type QueryDocumentSnapshot,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { Observable, of, map } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { NOTIFICATION_PAGE_SIZE } from '../shared/notification-feed';

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

/** One page of the bell, and the cursor for the page after it. */
export interface NotificationPage {
  /** Whose notifications these are (null when signed out). */
  uid: string | null;
  items: AppNotification[];
  /** The last document of this page (startAfter it for the next page). */
  last: QueryDocumentSnapshot<DocumentData> | null;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  constructor(private firestore: Firestore, private auth: AuthService) {}

  private col(uid: string) {
    return collection(this.firestore, `users/${uid}/notifications`);
  }

  /** The newest page, live: new entries arrive at once and read state
   *  stays current. Ordered by the real Firestore timestamp, not the
   *  display string. */
  newestPage$(): Observable<NotificationPage> {
    return this.auth.user$.pipe(
      switchMap(user => {
        if (!user) return of<NotificationPage>({ uid: null, items: [], last: null });
        const q = query(this.col(user.uid), orderBy('createdAt', 'desc'), limit(NOTIFICATION_PAGE_SIZE));
        return collectionSnapshots(q).pipe(map(snaps => toPage(user.uid, snaps)));
      })
    );
  }

  /** The page after `after` ("Load more"), read once. */
  async olderPage(uid: string, after: QueryDocumentSnapshot<DocumentData>): Promise<NotificationPage> {
    const q = query(this.col(uid), orderBy('createdAt', 'desc'), startAfter(after), limit(NOTIFICATION_PAGE_SIZE));
    const snap = await getDocs(q);
    return toPage(uid, snap.docs);
  }

  /** Ids of every unread entry, live, whether or not its page is loaded,
   *  so the badge count and "mark all read" never depend on paging. */
  unreadIds$(): Observable<string[]> {
    return this.auth.user$.pipe(
      switchMap(user => {
        if (!user) return of([]);
        const q = query(this.col(user.uid), where('read', '==', false));
        return (collectionData(q, { idField: 'id' }) as Observable<{ id: string }[]>).pipe(map(list => list.map(n => n.id)));
      })
    );
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

function toPage(uid: string, snaps: QueryDocumentSnapshot<DocumentData>[]): NotificationPage {
  return {
    uid,
    items: snaps.map(s => ({ ...(s.data() as Omit<AppNotification, 'id'>), id: s.id })),
    last: snaps.length ? snaps[snaps.length - 1] : null,
  };
}