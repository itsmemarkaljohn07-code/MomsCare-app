// welcome.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-welcome',
  templateUrl: './welcome.page.html',
  styleUrls: ['./welcome.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class WelcomePage implements OnInit, OnDestroy {
  animReady = false;
  darkMode  = false;
  private themeSub!: Subscription;

  constructor(private router: Router, private theme: ThemeService) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }

  onCreateAccount(): void {
    this.router.navigate(['/signup']);
  }

  onLogin(): void {
    this.router.navigate(['/login']);
  }

  onTerms(): void {
    this.router.navigate(['/terms']);
  }

  onPrivacy(): void {
    this.router.navigate(['/privacy']);
  }
}