// appointments.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

export interface Appointment {
  date: string;
  day: string;
  time: string;
  label: string;
  type: string;
  doctor: string;
  location?: string;
  notes?: string;
  icon: string;
  isVideo: boolean;
  accentColor: 'green' | 'pink' | 'purple' | 'blue' | 'orange';
  advice?: string[];
  files?: string[];
}

@Component({
  selector: 'app-appointments',
  templateUrl: './appointment.page.html',
  styleUrls:  ['./appointment.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class AppointmentsPage implements OnInit, OnDestroy {

  animReady = false;
  darkMode = false;
  private themeSub!: Subscription;

  pregnancyWeek = 20;

  activeTab: 'upcoming' | 'past' = 'upcoming';
  expandedCard: number | null = null;
  expandedPast: number | null = null;

  // ── Bottom nav active state ──────────────────
  // Kept separate from `activeTab` above, since that property already
  // drives the Upcoming/Past tab switcher on this page.
  navActiveTab = 'appts';

  // ── Modal State ──────────────────────────────
  showModal = false;
  selectedIcon = '🩺';
  selectedColor: 'green' | 'pink' | 'purple' | 'blue' | 'orange' = 'green';
  iconOptions = ['🩺', '🔬', '🩸', '🥗', '👩‍⚕️', '💊', '🫀', '🧬'];
  colorOptions: Array<'green' | 'pink' | 'purple' | 'blue' | 'orange'> = ['green', 'pink', 'purple', 'blue', 'orange'];

  newAppt = {
    name: '',
    type: '',
    doctor: '',
    date: '',
    time: '',
    location: '',
    notes: '',
    isVideo: false,
  };

  // ── Upcoming Appointments ────────────────────
  upcomingAppointments: Appointment[] = [
    {
      date: 'May 10',
      day: 'Sat',
      time: '8:00 – 8:30 AM',
      label: 'Prenatal Checkup',
      type: 'Obstetrics',
      doctor: 'Dr. Reyes',
      location: 'St. Luke\'s Medical Center, Rm 204',
      notes: 'Bring your previous lab results and insurance card.',
      icon: '🩺',
      isVideo: false,
      accentColor: 'green',
      advice: [
        'Drink plenty of water before the appointment',
        'Prepare a list of questions for Dr. Reyes',
        'Avoid caffeine 2 hours before',
      ],
    },
    {
      date: 'May 18',
      day: 'Sun',
      time: '10:00 – 11:00 AM',
      label: 'Anatomy Ultrasound',
      type: 'Radiology',
      doctor: 'St. Luke\'s Radiology Dept.',
      location: 'St. Luke\'s Medical Center, Ground Floor',
      notes: 'Drink 32 oz of water 1 hour before and do not empty your bladder.',
      icon: '🔬',
      isVideo: false,
      accentColor: 'purple',
      advice: [
        'Full bladder required — drink water 1 hr before',
        'Wear loose, comfortable clothing',
      ],
    },
    {
      date: 'Jun 3',
      day: 'Tue',
      time: '7:30 – 8:00 AM',
      label: 'Blood Work & Labs',
      type: 'Laboratory',
      doctor: 'Dr. Santos',
      location: 'HealthPath Diagnostics, Branch 3',
      notes: 'Fasting required for 8 hours before the test.',
      icon: '🩸',
      isVideo: false,
      accentColor: 'pink',
      advice: [
        'Fast for at least 8 hours beforehand',
        'Stay hydrated with water only',
        'Bring referral slip from Dr. Reyes',
      ],
    },
    {
      date: 'Jun 15',
      day: 'Sun',
      time: '2:00 – 2:30 PM',
      label: 'Nutrition Consultation',
      type: 'Dietitian',
      doctor: 'Dr. Lim',
      location: 'Video Call',
      notes: 'Keep a 3-day food diary to share during the session.',
      icon: '🥗',
      isVideo: true,
      accentColor: 'blue',
      advice: [
        'Track your meals 3 days prior',
        'Prepare questions about your diet',
      ],
    },
  ];

  get upcomingCount(): number {
    return this.upcomingAppointments.length;
  }

  // ── Past Appointments ────────────────────────
  pastAppointments: Appointment[] = [
    {
      date: 'Apr 22',
      day: 'Tue',
      time: '9:00 – 9:30 AM',
      label: 'Prenatal Checkup',
      type: 'Obstetrics',
      doctor: 'Dr. Priya Garh',
      location: 'St. Luke\'s Medical Center',
      icon: '🩺',
      isVideo: false,
      accentColor: 'green',
      advice: [
        'Drink 4 liters of water a day',
        'No smoking',
        'Sleep for 8 hours a day',
      ],
      files: ['Discharge Summary', 'Lab Results'],
    },
    {
      date: 'Apr 5',
      day: 'Sat',
      time: '8:00 – 8:30 AM',
      label: 'First Trimester Scan',
      type: 'Radiology',
      doctor: 'Dr. Santos',
      location: 'HealthPath Diagnostics',
      icon: '🔬',
      isVideo: false,
      accentColor: 'purple',
      advice: ['Continue prenatal vitamins', 'Mild exercise recommended'],
      files: ['Ultrasound Report'],
    },
    {
      date: 'Mar 18',
      day: 'Tue',
      time: '10:00 – 10:30 AM',
      label: 'OB-GYN Consultation',
      type: 'OB-GYN',
      doctor: 'Dr. Reyes',
      location: 'St. Luke\'s Medical Center',
      icon: '👩‍⚕️',
      isVideo: false,
      accentColor: 'pink',
      advice: ['Take iron supplements daily', 'Rest adequately'],
      files: ['Consultation Notes'],
    },
  ];

  // ── Card Toggle ──────────────────────────────
  toggleCard(index: number): void {
    this.expandedCard = this.expandedCard === index ? null : index;
  }

  togglePast(index: number): void {
    this.expandedPast = this.expandedPast === index ? null : index;
  }

  // ── Tab ──────────────────────────────────────
  setTab(tab: 'upcoming' | 'past'): void {
    this.activeTab = tab;
    this.expandedCard = null;
    this.expandedPast = null;
  }

  // ── Modal ────────────────────────────────────
  addAppointment(): void {
    this.openModal();
  }

  openModal(): void {
    this.showModal = true;
    // default date to today
    const today = new Date().toISOString().split('T')[0];
    this.newAppt.date = today;
  }

  closeModal(): void {
    this.showModal = false;
    this.resetForm();
  }

  resetForm(): void {
    this.newAppt = { name: '', type: '', doctor: '', date: '', time: '', location: '', notes: '', isVideo: false };
    this.selectedIcon = '🩺';
    this.selectedColor = 'green';
  }

  selectIcon(icon: string): void {
    this.selectedIcon = icon;
  }

  selectColor(color: 'green' | 'pink' | 'purple' | 'blue' | 'orange'): void {
    this.selectedColor = color;
  }

  submitAppointment(): void {
    if (!this.newAppt.name || !this.newAppt.type || !this.newAppt.doctor || !this.newAppt.date || !this.newAppt.time) {
      return;
    }

    const d = new Date(this.newAppt.date + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const [h, m] = this.newAppt.time.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;

    const appt: Appointment = {
      label: this.newAppt.name,
      type: this.newAppt.type,
      doctor: this.newAppt.doctor,
      date: `${months[d.getMonth()]} ${d.getDate()}`,
      day: days[d.getDay()],
      time: `${hour}:${m.toString().padStart(2, '0')} ${suffix}`,
      location: this.newAppt.location || undefined,
      notes: this.newAppt.notes || undefined,
      icon: this.selectedIcon,
      isVideo: this.newAppt.isVideo,
      accentColor: this.selectedColor,
      advice: [],
    };

    this.upcomingAppointments.unshift(appt);
    this.closeModal();
    this.setTab('upcoming');
  }

  constructor(private router: Router, private theme: ThemeService) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe((val: boolean) => (this.darkMode = val));
    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });
  }

  ngOnDestroy(): void {
    this.themeSub.unsubscribe();
  }

  navigate(route: string, tab?: string): void {
    this.router.navigate([route], {
      queryParams: tab ? { tab } : {},
    });
  }
}