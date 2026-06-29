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
    // Trigger fade-out after 3s, then navigate to welcome
    setTimeout(() => {
      this.splashDone = true;
      setTimeout(() => {
        this.router.navigate(['/welcome'], { replaceUrl: true });
      }, 700); // 700ms fade-out animation before navigating
    }, 3000); // 3s splash display time
  }
}