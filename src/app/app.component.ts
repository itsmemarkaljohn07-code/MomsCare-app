import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonApp, IonRouterOutlet, ToastController } from '@ionic/angular/standalone';
import { AuthService, UserProfile } from './services/auth.service';
import { ReminderSchedulerService } from './services/reminder-scheduler.service';
import { AppointmentsService } from './services/appointments.service';
import { AppointmentRemindersService } from './services/appointment-reminders.service';
import { ChecklistRemindersService } from './services/checklist-reminders.service';
import { PushNotificationsService } from './services/push-notifications.service';
import { authGuard } from './guards/auth.guard';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor(
    authService: AuthService,
    reminders: ReminderSchedulerService,
    private router: Router,
    private toastCtrl: ToastController,
    private appointments: AppointmentsService,
    private appointmentReminders: AppointmentRemindersService,
    private checklistReminders: ChecklistRemindersService,
    private push: PushNotificationsService,
  ) {
    // First, before anything else: the push tap listener must exist early
    // so a tap that cold-started the app is still handled.
    void this.push.init().catch(err => console.error('Push setup failed:', err));

    // The "had a user" flag matters: the sign-in stream also emits null when
    // the app first starts and nobody is signed in yet. Only a real
    // sign-out (a user who WAS here, then isn't) should cancel reminders.
    let hadUser = false;

    authService.user$.subscribe(async fbUser => {
      try {
        if (fbUser) {
          hadUser = true;
          // Re-establish this patient's reminders every time she signs in or
          // the app opens (covers reinstalling or clearing app data). This
          // never shows the permission dialog; that only happens when she
          // saves the settings herself.
          const profile = await authService.getProfile();
          // Appointment reminders too, so they're set without opening the
          // Appointments page. Runs on its own; a failure there can't stop
          // the reminder sync below.
          void this.syncAppointmentReminders(fbUser.uid, profile);
          void this.syncChecklistReminders(fbUser.uid, profile);
          void this.syncPush(fbUser.uid, profile);
          await reminders.sync(profile, { requestPermission: false });
        } else if (hadUser) {
          hadUser = false;
          // The session ended without the patient signing out (account
          // suspended, token revoked): leave the protected page for Login.
          // An explicit logout navigates on its own, and public pages such
          // as signup and forgot-password are left alone.
          if (!authService.consumeExplicitSignOut() && this.onProtectedRoute()) {
            void this.showSessionEnded();
          }
          // Signed out: don't leave her reminders firing for the next person
          // who uses this phone.
          void this.checklistReminders.cancelAll()
            .catch(err => console.error('Checklist reminder cancel failed:', err));
          await reminders.cancelAll();
        }
      } catch (err) {
        console.error('Reminder sync failed:', err);
      }
    });
  }

  /** Daily Checklist reminders from today's saved checklist, replacing any
   *  scheduled before (including another account's). Only if notifications
   *  are already allowed; never asks here. */
  private async syncChecklistReminders(uid: string, profile: UserProfile | null): Promise<void> {
    try {
      const enabled = profile?.notificationPrefs?.checklistReminders !== false;
      const state = enabled
        ? await this.checklistReminders.loadState(uid)
        : { anyUnchecked: false, vitaminUnchecked: false };
      await this.checklistReminders.sync(state, { enabled, requestPermission: false });
    } catch (err) {
      console.error('Checklist reminder sync failed:', err);
    }
  }

  /** Stores this phone's push token for the signed-in patient, only if
   *  notifications are already allowed (never asks here). "Updates from my
   *  care team" switched off removes it instead. */
  private async syncPush(uid: string, profile: UserProfile | null): Promise<void> {
    try {
      if (profile?.notificationPrefs?.clinicUpdates === false) {
        await this.push.unregister(uid);
      } else {
        await this.push.register(uid, false);
      }
    } catch (err) {
      console.error('Push registration failed:', err);
    }
  }

  /** One-time read of the patient's appointments (not a live listener),
   *  then the same gating as the Appointments page: the "Appointment
   *  Reminders" switch off cancels them, otherwise they're scheduled, but
   *  only if notifications are already allowed (never asks here). */
  private async syncAppointmentReminders(uid: string, profile: UserProfile | null): Promise<void> {
    try {
      this.appointmentReminders.setUid(uid);
      if (profile?.notificationPrefs?.appointmentReminders === false) {
        await this.appointmentReminders.cancelAllReminders();
        return;
      }
      const records = await this.appointments.getAppointmentsOnce(uid);
      await this.appointmentReminders.syncReminders(records, { requestPermission: false });
    } catch (err) {
      console.error('Appointment reminder sync failed:', err);
    }
  }

  /** True when the current page is behind authGuard. */
  private onProtectedRoute(): boolean {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route.routeConfig?.canActivate?.includes(authGuard) ?? false;
  }

  private async showSessionEnded(): Promise<void> {
    await this.router.navigate(['/login'], { replaceUrl: true });
    const toast = await this.toastCtrl.create({
      message: 'Your session has ended. Please sign in again.',
      duration: 4000,
      position: 'bottom',
    });
    await toast.present();
  }
}
