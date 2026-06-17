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
    loadComponent: () => import('./pages/profile/profile.page').then( m => m.ProfilePage)
  },
  {
    path: 'insights',
    loadComponent: () => import('./pages/insights/insights.page').then(m => m.InsightsPage)
  },
  {
  path: 'appointments',
  loadComponent: () =>
    import('./pages/appointment/appointment.page')
      .then(m => m.AppointmentsPage)
  }
];