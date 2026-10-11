import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { AuthService } from './services/auth.service';
import { ReminderSchedulerService } from './services/reminder-scheduler.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor(authService: AuthService, reminders: ReminderSchedulerService) {
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
          await reminders.sync(profile, { requestPermission: false });
        } else if (hadUser) {
          hadUser = false;
          // Signed out: don't leave her reminders firing for the next person
          // who uses this phone.
          await reminders.cancelAll();
        }
      } catch (err) {
        console.error('Reminder sync failed:', err);
      }
    });
  }
}