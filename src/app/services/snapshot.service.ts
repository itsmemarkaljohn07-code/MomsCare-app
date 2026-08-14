// services/snapshot.service.ts
import { Injectable, EnvironmentInjector, runInInjectionContext, inject } from '@angular/core';
import {
  Firestore, collection, addDoc, deleteDoc, doc,
  query, where, orderBy, getDocs
} from '@angular/fire/firestore';

export interface SnapshotPhoto {
  id: string;
  imageUrl: string;   // Cloudinary secure_url — NOT a base64 data URL
  week: number;
  date: string;        // ISO string
  caption: string;
  type: 'bump' | 'ultrasound' | 'milestone';
}

@Injectable({ providedIn: 'root' })
export class SnapshotService {
  private firestore = inject(Firestore);
  private envInjector = inject(EnvironmentInjector);

  private collectionRef() {
    return collection(this.firestore, 'snapshotPhotos');
  }

  async addPhoto(uid: string, photo: Omit<SnapshotPhoto, 'id'>): Promise<void> {
    await runInInjectionContext(this.envInjector, () =>
      addDoc(this.collectionRef(), { uid, ...photo })
    );
  }

  async getPhotos(uid: string): Promise<SnapshotPhoto[]> {
    const snap = await runInInjectionContext(this.envInjector, () =>
      getDocs(query(
        this.collectionRef(),
        where('uid', '==', uid),
        orderBy('date', 'desc')
      ))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as SnapshotPhoto));
  }

  async deletePhoto(photoId: string): Promise<void> {
    await runInInjectionContext(this.envInjector, () =>
      deleteDoc(doc(this.firestore, 'snapshotPhotos', photoId))
    );
  }
}