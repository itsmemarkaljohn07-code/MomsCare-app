// save-feedback.service.ts
import { Injectable } from '@angular/core';
import { Animation, ToastController, createAnimation } from '@ionic/angular/standalone';
import { checkmarkCircle, informationCircle } from 'ionicons/icons';

/** Toasts slide down a little while fading in, and drift up while fading
 *  out, instead of the default plain fade. Position 'top' only (all of
 *  these toasts are shown at the top). */
const TOAST_EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

function toastWrapper(baseEl: HTMLElement): HTMLElement {
  return (baseEl.shadowRoot ?? baseEl).querySelector('.toast-wrapper') as HTMLElement;
}

function toastEnterAnimation(baseEl: HTMLElement, opts?: { top?: string }): Animation {
  const top = opts?.top ?? '0px';
  const wrapper = toastWrapper(baseEl);
  wrapper.style.setProperty('transform', `translateY(${top})`);
  return createAnimation()
    .addElement(wrapper)
    .duration(420)
    .easing(TOAST_EASE_OUT)
    .fromTo('transform', `translateY(calc(${top} - 18px)) scale(0.97)`, `translateY(${top}) scale(1)`)
    .fromTo('opacity', 0.01, 1);
}

function toastLeaveAnimation(baseEl: HTMLElement): Animation {
  const wrapper = toastWrapper(baseEl);
  const current = wrapper.style.getPropertyValue('transform') || 'translateY(0px)';
  return createAnimation()
    .addElement(wrapper)
    .duration(260)
    .easing('cubic-bezier(0.4, 0, 1, 1)')
    .fromTo('transform', current, `${current} translateY(-12px) scale(0.97)`)
    .fromTo('opacity', 0.99, 0);
}

export type FeedbackKind = 'success' | 'error' | 'info';

/** What happened to a save. 'queued' = the write didn't finish in time
 *  (usually offline); Firestore keeps it and sends it when the phone is back
 *  online, as long as the app stays open. */
export type SaveOutcome = 'saved' | 'queued' | 'failed';

export interface SaveResult {
  outcome: SaveOutcome;
  /** The message shown, for an inline note next to the form. */
  message: string;
}

export const SAVE_SUCCESS_MESSAGE = 'Changes saved successfully.';
export const SAVE_QUEUED_MESSAGE =
  "Saved on this phone. It will sync when you're back online. Keep the app open until then.";
/** How long a save may take before it's treated as offline. */
const SAVE_TIMEOUT_MS = 15000;

/**
 * Shared save feedback for Profile Edit, Pregnancy Settings and App
 * Settings: one toast style, shown at the TOP of the screen so it never
 * covers the Save buttons at the bottom. Pages keep their own isSaving
 * flag (to disable the button and block double submits); save() reports
 * success only after the write has resolved.
 */
@Injectable({ providedIn: 'root' })
export class SaveFeedbackService {
  private current?: HTMLIonToastElement;

  constructor(private toastCtrl: ToastController) {}

  /** Runs one write with a timeout and shows the matching toast. Never throws.
   *  `successMessage` replaces the generic "Changes saved" text. */
  async save(write: () => Promise<unknown>, opts?: { successMessage?: string }): Promise<SaveResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = write();
    const timeout = new Promise<'timeout'>(resolve => {
      timer = setTimeout(() => resolve('timeout'), SAVE_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([pending.then(() => 'done' as const), timeout]);
      if (result === 'done') {
        const message = opts?.successMessage ?? SAVE_SUCCESS_MESSAGE;
        void this.show(message, 'success');
        return { outcome: 'saved', message };
      }
      // Still pending: offline (or very slow). If it fails later, say so.
      pending.catch(err => {
        console.error('[SaveFeedback] queued save failed:', err);
        void this.show(`Your earlier changes couldn't be saved: ${friendlyReason(err)}. Please try again.`, 'error');
      });
      void this.show(SAVE_QUEUED_MESSAGE, 'info');
      return { outcome: 'queued', message: SAVE_QUEUED_MESSAGE };
    } catch (err) {
      console.error('[SaveFeedback] save failed:', err);
      const message = `Couldn't save your changes: ${friendlyReason(err)}.`;
      void this.show(message, 'error');
      return { outcome: 'failed', message };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Shows one toast (replacing any still on screen). */
  async show(message: string, kind: FeedbackKind, durationMs = 4000): Promise<void> {
    try {
      await this.current?.dismiss();
      const toast = await this.toastCtrl.create({
        message,
        duration: kind === 'error' ? Math.max(durationMs, 6000) : durationMs,
        position: 'top',
        cssClass: ['momcare-toast', `momcare-toast--${kind}`],
        // Green with a check icon, like the dashboard's confirmations;
        // info is the same design in violet with an "i" icon.
        icon: kind === 'success' ? checkmarkCircle : kind === 'info' ? informationCircle : undefined,
        buttons: [{ text: 'OK', role: 'cancel' }],
        enterAnimation: toastEnterAnimation,
        leaveAnimation: toastLeaveAnimation,
      });
      this.current = toast;
      await toast.present();
    } catch (err) {
      console.error('[SaveFeedback] could not show the message:', err);
    }
  }
}

/** A short, human reason for a failed write. */
export function friendlyReason(err: any): string {
  switch (err?.code) {
    case 'permission-denied': return "you don't have permission to make this change";
    case 'unauthenticated':   return "you're signed out. Please sign in again";
    case 'unavailable':
    case 'deadline-exceeded': return 'the connection to the server was lost';
    case 'invalid-argument':  return "some of the details aren't valid";
    case 'resource-exhausted': return 'the server is busy right now';
  }
  const text = typeof err?.message === 'string' ? err.message.trim() : '';
  return text ? text.replace(/\.$/, '') : 'something went wrong';
}
