import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'splash',
    pathMatch: 'full',
  },
  {
    path: 'splash',
    loadComponent: () =>
      import('./pages/splash/splash.page').then(m => m.SplashPage),
  },
  {
    path: 'welcome',
    loadComponent: () =>
      import('./pages/welcome/welcome.page').then(m => m.WelcomePage),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.page').then(m => m.LoginPage),
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./pages/signup/signup.page').then(m => m.SignupPage),
  },
  {
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/home/home.page').then(m => m.HomePage),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/profile/profile.page').then(m => m.ProfilePage),
  },
  {
    path: 'insights',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/insights/insights.page').then(m => m.InsightsPage),
  },
  {
    path: 'appointments',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/appointment/appointment.page').then(m => m.AppointmentsPage),
  },
  {
    path: 'profile-edit',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/profile-edit/profile-edit.page').then(m => m.ProfileEditPage),
  },
  {
    path: 'pregnancy-settings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/pregnancy-settings/pregnancy-settings.page').then(m => m.PregnancySettingsPage),
  },
  {
    path: 'records',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/records/records.page').then(m => m.RecordsPage),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/app-settings/app-settings.page').then(m => m.AppSettingsPage),
  },
  {
    path: 'app-settings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/app-settings/app-settings.page').then(m => m.AppSettingsPage),
  },
  {
    path: 'reports',
    loadComponent: () =>
      import('./pages/reports/reports.page').then(m => m.ReportsPage),
  },
  {
    path: 'snapshot',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/snapshot/snapshot.page').then(m => m.SnapshotPage),
  },
  {
    path: 'avatar',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/avatar/avatar.page').then(m => m.AvatarPage),
  },
  {
    // No authGuard — must be reachable during signup, before the user
    // has an account. Guarding this route was the cause of the
    // "redirects back to Login" bug when tapping Terms & Conditions
    // mid-signup.
    path: 'terms',
    loadComponent: () =>
      import('./pages/terms/terms.page').then(m => m.TermsPage),
  },
  {
    // Same reasoning as 'terms' above.
    path: 'privacy',
    loadComponent: () =>
      import('./pages/privacy/privacy.page').then(m => m.PrivacyPage),
  },
  {
    path: 'legal',
    loadComponent: () =>
      import('./shared/legal.page').then(m => m.LegalPage),
  },
  {
    // Catch-all: redirect unknown paths back to splash
    // MUST stay last — anything placed after this is unreachable
    path: '**',
    redirectTo: 'splash',
  },
];