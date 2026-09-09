import { Injectable, EnvironmentInjector, runInInjectionContext, inject } from '@angular/core';
import {
  Firestore, collection, addDoc, deleteDoc, doc,
  collectionData, Timestamp, orderBy, query,
} from '@angular/fire/firestore';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface HealthSnapshotAtUpload {
  weight: number;
  bpSys: number;
  bpDia: number;
  kicks: number;
  mood: number;
}

export interface SnapshotPhotoRecord {
  id?: string;
  imageUrl: string;
  cloudinaryPublicId: string;
  type: 'bump' | 'ultrasound' | 'milestone';
  week: number;
  caption: string;
  createdAt?: any;
  healthSnapshot?: HealthSnapshotAtUpload;
}

// Enforced client-side since Cloudinary's max-file-size setting isn't
// exposed for this preset in the current console UI.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable({ providedIn: 'root' })
export class PhotoService {
  private envInjector = inject(EnvironmentInjector);

  constructor(private firestore: Firestore) {}

  private photosCol(uid: string) {
    return collection(this.firestore, `users/${uid}/snapshots`);
  }

  getPhotos$(uid: string): Observable<SnapshotPhotoRecord[]> {
    return runInInjectionContext(this.envInjector, () => {
      const q = query(this.photosCol(uid), orderBy('createdAt', 'desc'));
      return collectionData(q, { idField: 'id' }) as Observable<SnapshotPhotoRecord[]>;
    });
  }

  /** Opens the native camera on device, or the browser's own capture
   *  UI on web (Capacitor's built-in fallback) — same call either way. */
  async capturePhoto(): Promise<string | null> {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      quality: 80,
    });
    return photo.dataUrl ?? null;
  }

  async pickFromGallery(): Promise<string | null> {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos,
      quality: 80,
    });
    return photo.dataUrl ?? null;
  }

  private dataUrlSizeBytes(dataUrl: string): number {
    const base64 = dataUrl.split(',')[1] ?? '';
    return Math.round((base64.length * 3) / 4);
  }

    async uploadPhoto(
    uid: string,
    dataUrl: string,
    meta: {
      type: 'bump' | 'ultrasound' | 'milestone';
      week: number;
      caption: string;
      healthSnapshot?: HealthSnapshotAtUpload;
    }
  ): Promise<void> {
    if (this.dataUrlSizeBytes(dataUrl) > MAX_FILE_SIZE_BYTES) {
      throw new Error('Photo is too large. Please choose a photo under 10MB.');
    }

    const formData = new FormData();
    formData.append('file', dataUrl);
    formData.append('upload_preset', environment.cloudinary.uploadPreset);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${environment.cloudinary.cloudName}/image/upload`;
    const response = await fetch(uploadUrl, { method: 'POST', body: formData });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Upload failed: ${errText || response.statusText}`);
    }

    const result = await response.json();

    await runInInjectionContext(this.envInjector, () =>
      addDoc(this.photosCol(uid), {
        imageUrl: result.secure_url,
        cloudinaryPublicId: result.public_id,
        type: meta.type,
        week: meta.week,
        caption: meta.caption,
        healthSnapshot: meta.healthSnapshot ?? null,
        createdAt: Timestamp.now(),
      })
    );
  }

  /** IMPORTANT, HONEST LIMITATION: this only removes the Firestore
   *  record — the photo disappears from the gallery immediately, but
   *  the actual file remains stored on Cloudinary. Real deletion
   *  requires a SIGNED request (needs the API secret), which can't
   *  safely run from client-side code without exposing that secret.
   *  Once momscare-admin is deployed publicly, we can add a proper
   *  signed-delete API route there and call it from here instead. For
   *  now, deleted photos quietly continue counting against the free
   *  Cloudinary quota (25 GB combined storage/bandwidth) — worth
   *  keeping an eye on if users delete a lot of photos over time. */
    async deletePhoto(uid: string, photoId: string): Promise<void> {
    await runInInjectionContext(this.envInjector, () =>
      deleteDoc(doc(this.firestore, `users/${uid}/snapshots/${photoId}`))
    );
  }
}