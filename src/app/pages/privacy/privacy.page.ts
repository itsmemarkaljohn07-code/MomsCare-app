// privacy.page.ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.page.html',
  styleUrls: ['./privacy.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class PrivacyPage implements OnInit {
  animReady  = false;
  fromSignup = false;

  constructor(private router: Router, private location: Location) {}

  ngOnInit(): void {
    const nav = this.router.getCurrentNavigation();
    this.fromSignup = nav?.extras?.state?.['fromSignup'] === true;
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }

  goBack(): void {
    this.location.back();
  }
}