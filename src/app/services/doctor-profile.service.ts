// doctor-profile.service.ts
import { Injectable, EnvironmentInjector, runInInjectionContext, inject } from '@angular/core';
import {
  Firestore, doc, getDoc, collection, query, where, limit, getDocs,
} from '@angular/fire/firestore';

export interface DoctorProfile {
  name: string;
  photoUrl?: string;
  specialty?: string;
}

/**
 * Looks up a doctor's profile (photo + specialty) to show alongside
 * their Snapshot comments. Reads the SAME "doctors" Firestore
 * collection the admin dashboard already manages -- no duplicate
 * doctor/profile data is created here, only read.
 *
 * IMPORTANT: this app has never read the "doctors" collection before
 * now. Whether authorUid is actually populated when a doctor posts a
 * comment depends on the admin dashboard's server-side write route,
 * which isn't part of this codebase, so it could not be confirmed
 * here. If it isn't set, this falls back to a name-based lookup. If
 * Firestore security rules don't currently allow a patient to read
 * "doctors" documents, every lookup below will fail silently (caught,
 * not thrown) and callers will simply get null -- which is exactly
 * the graceful "no photo / no specialty available" case this feature
 * is required to handle anyway.
 */
@Injectable({ providedIn: 'root' })
export class DoctorProfileService {
  private firestore = inject(Firestore);
  private envInjector = inject(EnvironmentInjector);

  // In-memory only -- avoids re-fetching the same doctor once per
  // comment when they've posted several on the same photo.
  private cache = new Map<string, DoctorProfile | null>();

  async getDoctorProfile(authorUid: string | undefined, authorName: string): Promise<DoctorProfile | null> {
    const cacheKey = authorUid || `name:${authorName}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    const result = await runInInjectionContext(this.envInjector, () => this.lookup(authorUid, authorName));
    this.cache.set(cacheKey, result);
    return result;
  }

  private async lookup(authorUid: string | undefined, authorName: string): Promise<DoctorProfile | null> {
    if (authorUid) {
      try {
        const snap = await getDoc(doc(this.firestore, 'doctors', authorUid));
        if (snap.exists()) {
          const data = snap.data() as any;
          return { name: data.name ?? authorName, photoUrl: data.photoUrl ?? undefined, specialty: data.specialty ?? undefined };
        }
      } catch {
        // Falls through to the name-based lookup below.
      }
    }

    try {
      const q = query(collection(this.firestore, 'doctors'), where('name', '==', authorName), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data() as any;
        return { name: data.name ?? authorName, photoUrl: data.photoUrl ?? undefined, specialty: data.specialty ?? undefined };
      }
    } catch {
      // No match, or the read itself was denied -- degrade to no
      // profile rather than throwing.
    }

    return null;
  }
}