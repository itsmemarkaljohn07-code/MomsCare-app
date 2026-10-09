// comment.service.ts
import { Injectable, EnvironmentInjector, runInInjectionContext, inject } from '@angular/core';
import {
  Firestore, collection, addDoc, query, orderBy, collectionData, Timestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface SnapshotComment {
  id?: string;
  userId: string;
  snapshotId: string;
  // The dashboard writes 'doctor' for doctors and 'admin' for admins;
  // the patient app writes 'user'. (Previously typed without 'doctor'.)
  authorRole: 'admin' | 'doctor' | 'user';
  authorName: string;
  authorUid?: string;
  // Optional, written onto the comment by the dashboard when staff
  // post it, so the patient app can show a specialty/photo without
  // reading the doctors collection (which holds login emails and
  // must stay unreadable to patients).
  authorSpecialty?: string;
  authorPhotoUrl?: string;
  message: string;
  parentCommentId: string | null;
  createdAt?: any;
}

@Injectable({ providedIn: 'root' })
export class CommentService {
  private envInjector = inject(EnvironmentInjector);

  constructor(private firestore: Firestore) {}

  private commentsCol(uid: string, photoId: string) {
    return collection(this.firestore, `users/${uid}/snapshots/${photoId}/comments`);
  }

  /** Real-time — new admin comments appear instantly without needing
   *  to reopen the photo. */
  getComments$(uid: string, photoId: string): Observable<SnapshotComment[]> {
    return runInInjectionContext(this.envInjector, () => {
      const q = query(this.commentsCol(uid, photoId), orderBy('createdAt', 'asc'));
      return collectionData(q, { idField: 'id' }) as Observable<SnapshotComment[]>;
    });
  }

  async postReply(
    uid: string,
    photoId: string,
    authorName: string,
    message: string,
    parentCommentId: string
  ): Promise<void> {
    await runInInjectionContext(this.envInjector, () =>
      addDoc(this.commentsCol(uid, photoId), {
        userId: uid,
        snapshotId: photoId,
        authorRole: 'user',
        authorName,
        message,
        parentCommentId,
        createdAt: Timestamp.now(),
      })
    );
  }
}