// app-settings.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Location, CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';

// The one place the contact address for data and deletion requests lives.
const SUPPORT_EMAIL = 'momscare.noreply@gmail.com';

/**
 * Every control on this page does something real. The earlier version
 * had language, date format, app lock, email/push/sound and analytics
 * toggles that saved nothing and affected nothing, plus alerts promising
 * an emailed data export and "cleared" cache that never happened. Those
 * were removed rather than left looking functional.
 */
@Component({
  selector: 'app-app-settings',
  templateUrl: './app-settings.page.html',
  styleUrls: ['./app-settings.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class AppSettingsPage implements OnInit, OnDestroy {
  animReady = false;
  darkMode  = false;
  private themeSub!: Subscription;

  readonly supportEmail = SUPPORT_EMAIL;

  private accountEmail = '';
  private accountUsername = '';
  maskedEmail = '';

  confirmingReset = false;
  isSendingReset  = false;

  toastMessage = '';
  toastKind: 'success' | 'error' = 'success';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private location: Location,
    private router: Router,
    private theme: ThemeService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
    this.loadAccount();
  }

  /** Reads the signed-in user's own email and username, used to send the
   *  password reset link and to fill in the request emails. */
  private async loadAccount(): Promise<void> {
    try {
      const profile = await this.authService.getProfile();
      this.accountEmail    = profile?.email ?? '';
      this.accountUsername = profile?.username ?? '';
      this.maskedEmail     = this.maskEmail(this.accountEmail);
    } catch (err) {
      console.error('Failed to load account details:', err);
    }
  }

  /** "maria@gmail.com" -> "m***@gmail.com" */
  private maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at < 1) return '';
    return `${email[0]}***${email.slice(at)}`;
  }

  // ── Change password: sends Firebase's own reset link to the account email ──

  startReset(): void {
    if (!this.accountEmail) {
      this.showToast("We couldn't find your account email. Please try again in a moment.", 'error');
      return;
    }
    this.confirmingReset = true;
  }

  cancelReset(): void {
    if (this.isSendingReset) return;
    this.confirmingReset = false;
  }

  async sendReset(): Promise<void> {
    if (this.isSendingReset || !this.accountEmail) return;
    this.isSendingReset = true;
    try {
      await this.authService.resetPassword(this.accountEmail);
      this.confirmingReset = false;
      this.showToast(`Reset link sent to ${this.maskedEmail}. Check your inbox and spam folder.`, 'success');
    } catch (err: any) {
      this.showToast(err?.message || "Couldn't send the reset link. Please check your connection and try again.", 'error');
    } finally {
      this.isSendingReset = false;
    }
  }

  // ── Data and deletion requests: an email to the MomCare team ──

  requestMyData(): void {
    this.openMail(
      'MomCare data request',
      'I would like a copy of the personal data MomCare holds about me.',
    );
  }

  requestAccountDeletion(): void {
    this.openMail(
      'MomCare account deletion request',
      'I would like to request deletion of my MomCare account and my personal data.',
    );
  }

  private openMail(subject: string, request: string): void {
    const body = [
      request,
      '',
      `Account email: ${this.accountEmail || '(please type your account email)'}`,
      `Username: ${this.accountUsername || '(please type your username)'}`,
    ].join('\n');
    window.location.href =
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  goToPrivacy(): void {
    this.router.navigate(['/privacy']);
  }

  private showToast(message: string, kind: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastKind = kind;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastMessage = ''), 4500);
  }

  goBack(): void { this.location.back(); }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }
}