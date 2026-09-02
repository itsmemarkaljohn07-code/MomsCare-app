// splash.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class SplashPage implements OnInit, OnDestroy {
  splashDone = false;
  darkMode   = false;
  private themeSub!: Subscription;

  constructor(
    private router: Router,
    private theme: ThemeService
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));

    // Trigger fade-out after 3s, then navigate to welcome
    setTimeout(() => {
      this.splashDone = true;
      setTimeout(() => {
        this.router.navigate(['/welcome'], { replaceUrl: true });
      }, 700); // 700ms fade-out animation before navigating
    }, 3000); // 3s splash display time
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}