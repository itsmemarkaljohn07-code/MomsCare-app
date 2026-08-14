// privacy.page.ts
import { Component, OnInit , OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.page.html',
  styleUrls: ['../../shared/legal.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class PrivacyPage implements OnInit, OnDestroy {

  darkMode = false;
  private themeSub!: Subscription;
  animReady  = false;
  fromSignup = false;

  constructor(private router: Router, private location: Location, private theme: ThemeService) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    const nav = this.router.getCurrentNavigation();
    this.fromSignup = nav?.extras?.state?.['fromSignup'] === true;
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }

  goBack(): void {
    this.location.back();
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}