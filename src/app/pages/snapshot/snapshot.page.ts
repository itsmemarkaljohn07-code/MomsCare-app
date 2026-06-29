// snapshot.page.ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-snapshot',
  templateUrl: './snapshot.page.html',
  styleUrls: ['./snapshot.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class SnapshotPage implements OnInit {
  animReady     = false;
  pregnancyWeek = 20;

  constructor(private router: Router) {}

  ngOnInit(): void {
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }

  navigate(route: string): void {
    this.router.navigate([route]);
  }
}