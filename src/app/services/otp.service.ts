// services/otp.service.ts
import { Injectable } from '@angular/core';
import emailjs from '@emailjs/browser';

const EMAILJS_SERVICE_ID  = 'service_6y9mdix';
const EMAILJS_TEMPLATE_ID = 'template_re07dou';
const EMAILJS_PUBLIC_KEY  = 'JJ2acNuoI-gnZChfe';

const OTP_TTL_SECONDS = 60;

interface PendingOtp {
  code: string;
  expiresAt: number;
}

@Injectable({ providedIn: 'root' })
export class OtpService {
  // In-memory store — no Firestore write needed since the OTP only needs
  // to live for 60s within this same signup session on this same device.
  // (Persisting it to Firestore pre-auth was causing silent hangs due to
  // security rules requiring an authenticated user that doesn't exist yet.)
  private pending = new Map<string, PendingOtp>();

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Generates a 6-digit OTP and emails it via EmailJS.
   * Throws if the email fails to send.
   */
  async sendOtp(email: string, name?: string): Promise<void> {
    const key = email.trim().toLowerCase();
    const code = this.generateCode();
    const expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;

    this.pending.set(key, { code, expiresAt });

    console.log('[OtpService] Sending OTP to', key, '-> code:', code);

    try {
      const result = await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          email:    email,      // matches {{email}} in the "To Email" field
          to_name:  name || 'there',
          passcode: code,       // matches {{passcode}} in the template body
        },
        { publicKey: EMAILJS_PUBLIC_KEY }
      );
      console.log('[OtpService] EmailJS response:', result.status, result.text);
    } catch (err) {
      console.error('[OtpService] EmailJS send failed:', err);
      this.pending.delete(key);
      throw err;
    }
  }

  /**
   * Verifies a submitted code against the in-memory OTP for this email.
   */
  verifyOtp(email: string, submittedCode: string): 'valid' | 'invalid' | 'expired' | 'not_found' {
    const key = email.trim().toLowerCase();
    const entry = this.pending.get(key);

    if (!entry) return 'not_found';

    if (Date.now() > entry.expiresAt) {
      this.pending.delete(key);
      return 'expired';
    }

    if (entry.code !== submittedCode) {
      return 'invalid';
    }

    this.pending.delete(key);
    return 'valid';
  }
}