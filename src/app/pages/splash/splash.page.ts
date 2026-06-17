// splash.page.ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class SplashPage implements OnInit {
  splashDone = false;

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Trigger fade-out after 3 s, then navigate to login
    setTimeout(() => {
      this.splashDone = true;
      setTimeout(() => this.router.navigate(['/login'], { replaceUrl: true }), 700);
    }, 3000);
  }
}