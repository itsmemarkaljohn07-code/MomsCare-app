// profile-edit.page.ts
import { Component, OnInit , OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-profile-edit',
  templateUrl: './profile-edit.page.html',
  styleUrls: ['./profile-edit.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ProfileEditPage implements OnInit, OnDestroy {

  darkMode = false;
  private themeSub!: Subscription;
  animReady = false;
  editMode  = false;
  showToast = false;

  bloodTypes = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];

  form = {
    firstName: 'Maria', lastName: 'Santos',
    email: 'maria@email.com', phone: '+63 912 345 6789',
    dob: '1995-06-15', address: 'Barangay San Juaquin, Philippines',
    pregnancyWeek: 20, dueDate: '2025-09-15',
    firstTimeMom: 'yes', bloodType: 'B+',
    doctorName: 'Dr. Ana Reyes', clinic: 'St. Luke\'s Medical Center',
    emergencyContact: 'Juan Santos · Husband · +63 917 000 0000',
  };

  get selectedAvatar() {
    try { const s = localStorage.getItem('momscare_avatar'); if (s) return JSON.parse(s); } catch {}
    return { emoji: '🐻', bgColor: '#e07eb8' };
  }

  constructor(private router: Router, private location: Location, private theme: ThemeService) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    this.loadSaved();
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }

  private loadSaved(): void {
    try { const s = localStorage.getItem('momscare_profile'); if (s) this.form = { ...this.form, ...JSON.parse(s) }; } catch {}
  }

  saveProfile(): void {
    try { localStorage.setItem('momscare_profile', JSON.stringify(this.form)); } catch {}
    this.editMode = false;
    this.showToast = true;
    setTimeout(() => (this.showToast = false), 2500);
  }

  navigate(r: string): void { this.router.navigate([r]); }
  goBack(): void { this.location.back(); }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}