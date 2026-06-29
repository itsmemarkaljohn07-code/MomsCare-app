// welcome.page.ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-welcome',
  templateUrl: './welcome.page.html',
  styleUrls: ['./welcome.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class WelcomePage implements OnInit {
  animReady = false;

  constructor(private router: Router) {}

  ngOnInit(): void {
    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });
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