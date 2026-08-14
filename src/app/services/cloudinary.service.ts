// services/cloudinary.service.ts
import { Injectable } from '@angular/core';

// ⚠️ Replace these with your actual Cloudinary values from Step 2 and Step 3
const CLOUDINARY_CLOUD_NAME    = 'c0okqdac';
const CLOUDINARY_UPLOAD_PRESET = 'momscare_uploads';

export interface CloudinaryUploadResult {
  secure_url: string;   // the hosted HTTPS URL — store this in Firestore
  public_id:  string;   // Cloudinary's internal ID, useful if you ever want to delete/replace the image
}

@Injectable({ providedIn: 'root' })
export class CloudinaryService {

  private readonly uploadUrl =
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

  /**
   * Uploads a File (from an <input type="file"> or camera capture) to Cloudinary
   * and returns the resulting hosted URL. This is a plain HTTPS POST — no
   * Cloudinary SDK needed, no secret key involved (unsigned preset only).
   */
  async uploadImage(file: File): Promise<CloudinaryUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    // Safety timeout: if the request hangs for any reason (bad network,
    // browser quirk, etc.), fail clearly after 30s instead of leaving
    // the UI stuck in a loading state indefinitely.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(this.uploadUrl, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Cloudinary upload failed: ${errText}`);
      }

      const data = await response.json();
      return {
        secure_url: data.secure_url,
        public_id:  data.public_id,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Upload timed out. Please check your connection and try again.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}