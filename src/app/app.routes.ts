import { Routes } from '@angular/router';

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
    loadComponent: () =>
      import('./pages/home/home.page').then(m => m.HomePage),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./pages/profile/profile.page').then(m => m.ProfilePage),
  },
  {
    path: 'insights',
    loadComponent: () =>
      import('./pages/insights/insights.page').then(m => m.InsightsPage),
  },
  {
    path: 'appointments',
    loadComponent: () =>
      import('./pages/appointment/appointment.page').then(m => m.AppointmentsPage),
  },
  {
    path: 'snapshot',
    loadComponent: () =>
      import('./pages/snapshot/snapshot.page').then(m => m.SnapshotPage),
  },
  {
    path: 'avatar',
    loadComponent: () =>
      import('./pages/avatar/avatar.page').then(m => m.AvatarPage),
  },
  {
    path: 'terms',
    loadComponent: () =>
      import('./pages/terms/terms.page').then(m => m.TermsPage),
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('./pages/privacy/privacy.page').then(m => m.PrivacyPage),
  },
  {
    // Catch-all: redirect unknown paths back to splash
    path: '**',
    redirectTo: 'splash',
  },
];