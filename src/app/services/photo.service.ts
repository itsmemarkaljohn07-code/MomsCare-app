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
/** Cloudinary upload and gallery-record limits, so nothing hangs. */
const UPLOAD_TIMEOUT_MS = 60000;
const SAVE_TIMEOUT_MS = 15000;

/** Why Camera.getPhoto() didn't return a photo. */
export type PickerProblem = 'cancelled' | 'no-camera' | 'denied' | 'unknown';

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

  /** Sorts a Camera.getPhoto() rejection, using the plugin's own messages
   *  (@capacitor/camera 8: "User cancelled photos app", "Device doesn't have
   *  a camera available", "Unable to resolve camera activity", "User denied
   *  access to camera"). The app declares no camera or media permission:
   *  the plugin then uses the phone's camera app and Android's photo
   *  picker, which need none, so "denied" only happens if one is added. */
  static classifyPickerError(err: any): PickerProblem {
    const text = String(err?.message ?? err ?? '').toLowerCase();
    if (text.includes('cancel')) return 'cancelled';
    if (text.includes("doesn't have a camera") || text.includes('no camera') || text.includes('unable to resolve camera')) return 'no-camera';
    if (text.includes('denied') || text.includes('permission')) return 'denied';
    return 'unknown';
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
  ): Promise<'saved' | 'queued'> {
    if (this.dataUrlSizeBytes(dataUrl) > MAX_FILE_SIZE_BYTES) {
      throw new Error('Photo is too large. Please choose a photo under 10MB.');
    }

    const formData = new FormData();
    formData.append('file', dataUrl);
    formData.append('upload_preset', environment.cloudinary.uploadPreset);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${environment.cloudinary.cloudName}/image/upload`;
    let response: Response;
    try {
      response = await fetch(uploadUrl, { method: 'POST', body: formData, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
    } catch (err: any) {
      // A timeout or no connection, never a server answer.
      throw new Error(err?.name === 'TimeoutError'
        ? 'The upload took too long. Please check your connection and try again.'
        : 'No internet connection. Please check your connection and try again.');
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Upload failed: ${errText || response.statusText}`);
    }

    const result = await response.json();

    // The photo is on Cloudinary now; if the gallery record can't reach
    // Firestore in time (offline), Firestore keeps it and sends it later.
    const saved = runInInjectionContext(this.envInjector, () =>
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), SAVE_TIMEOUT_MS); });
    try {
      const outcome = await Promise.race([saved.then(() => 'saved' as const), timeout]);
      if (outcome === 'timeout') {
        saved.catch(err => console.error('[PhotoService] queued gallery record failed:', err));
        return 'queued';
      }
      return 'saved';
    } finally {
      clearTimeout(timer);
    }
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