import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  shieldCheckmarkOutline,
  documentTextOutline,
  lockClosedOutline,
  mailOutline,
  chevronForwardOutline,
  checkmarkCircleOutline,
  informationCircleOutline
} from 'ionicons/icons';
import { ThemeService } from '../services/theme';

@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon],
  templateUrl: './legal.page.html',
  styleUrls: ['./legal.page.scss']
})
export class LegalPage implements OnInit, OnDestroy {
  isDark = false;
  bodyVisible = false;

  private themeSub?: Subscription;

  constructor(
    private router: Router,
    private themeService: ThemeService // ⚠️ adjust to match your actual ThemeService API
  ) {
    addIcons({
      arrowBackOutline,
      shieldCheckmarkOutline,
      documentTextOutline,
      lockClosedOutline,
      mailOutline,
      chevronForwardOutline,
      checkmarkCircleOutline,
      informationCircleOutline
    });
  }

  ngOnInit() {
    // ⚠️ Adjust this if your ThemeService exposes a different observable name
    this.themeSub = this.themeService.isDark$?.subscribe((dark: boolean) => {
      this.isDark = dark;
    });

    setTimeout(() => (this.bodyVisible = true), 50);
  }

  ngOnDestroy() {
    this.themeSub?.unsubscribe();
  }

  goBack() {
    this.router.navigate(['/home']); // change to wherever "back" should go
  }

  onAgree() {
    // e.g. mark terms as accepted in Firestore/localStorage, then navigate
    this.router.navigate(['/home']);
  }
}