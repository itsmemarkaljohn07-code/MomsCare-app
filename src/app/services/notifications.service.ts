import { Injectable } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, updateDoc, query, orderBy,
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
        const q = query(this.col(user.uid), orderBy('time', 'desc'));
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
}