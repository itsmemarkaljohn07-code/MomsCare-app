import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ThemeService } from '../../services/theme';
import { AppointmentsService, AppointmentRecord } from '../../services/appointments.service';
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
  accentColor: 'green' | 'pink' | 'purple' | 'blue' | 'orange';
  advice?: string[];
  files?: string[];
  id?: string;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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
  private apptSub!: Subscription;

  pregnancyWeek = 20;

  activeTab: 'upcoming' | 'past' = 'upcoming';
  expandedCard: number | null = null;
  expandedPast: number | null = null;

  navActiveTab = 'appts';

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
  };

  upcomingAppointments: Appointment[] = [];
  pastAppointments: Appointment[] = [];

  get upcomingCount(): number {
    return this.upcomingAppointments.length;
  }

  private toDisplay(rec: AppointmentRecord): Appointment {
    const d = new Date(rec.date + 'T00:00:00');
    return {
      id: rec.id,
      label: rec.label,
      type: rec.type,
      doctor: rec.doctor,
      date: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
      day: DAYS[d.getDay()],
      time: rec.time,
      location: rec.location,
      notes: rec.notes,
      icon: rec.icon,
      accentColor: rec.accentColor,
      advice: rec.advice || [],
      files: rec.files || [],
    };
  }

  private applyRecords(records: AppointmentRecord[]): void {
    const todayIso = new Date().toISOString().slice(0, 10);
    this.upcomingAppointments = records
      .filter(r => r.status === 'upcoming' && r.date >= todayIso)
      .map(r => this.toDisplay(r));
    this.pastAppointments = records
      .filter(r => r.status !== 'upcoming' || r.date < todayIso)
      .map(r => this.toDisplay(r))
      .reverse();
  }

  toggleCard(index: number): void {
    this.expandedCard = this.expandedCard === index ? null : index;
  }

  togglePast(index: number): void {
    this.expandedPast = this.expandedPast === index ? null : index;
  }

  setTab(tab: 'upcoming' | 'past'): void {
    this.activeTab = tab;
    this.expandedCard = null;
    this.expandedPast = null;
  }

  addAppointment(): void {
    this.openModal();
  }

  openModal(): void {
    this.showModal = true;
    const today = new Date().toISOString().split('T')[0];
    this.newAppt.date = today;
  }

  closeModal(): void {
    this.showModal = false;
    this.resetForm();
  }

  resetForm(): void {
    this.newAppt = { name: '', type: '', doctor: '', date: '', time: '', location: '', notes: '' };
    this.selectedIcon = '🩺';
    this.selectedColor = 'green';
  }

  selectIcon(icon: string): void {
    this.selectedIcon = icon;
  }

  selectColor(color: 'green' | 'pink' | 'purple' | 'blue' | 'orange'): void {
    this.selectedColor = color;
  }

  async submitAppointment(): Promise<void> {
    if (!this.newAppt.name || !this.newAppt.type || !this.newAppt.doctor || !this.newAppt.date || !this.newAppt.time) {
      return;
    }

    const [h, m] = this.newAppt.time.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;

    const record: Omit<AppointmentRecord, 'id' | 'createdAt'> = {
      label: this.newAppt.name,
      type: this.newAppt.type,
      doctor: this.newAppt.doctor,
      date: this.newAppt.date,
      time: `${hour}:${m.toString().padStart(2, '0')} ${suffix}`,
      location: this.newAppt.location || undefined,
      notes: this.newAppt.notes || undefined,
      icon: this.selectedIcon,
      accentColor: this.selectedColor,
      advice: [],
      status: 'upcoming',
    };

    try {
      await this.appointmentsService.addAppointment(record);
    } catch (err) {
      console.error('Failed to save appointment:', err);
    }
    this.closeModal();
    this.setTab('upcoming');
  }

  async cancelAppointment(id?: string): Promise<void> {
    if (!id) return;
    try {
      await this.appointmentsService.cancelAppointment(id);
    } catch (err) {
      console.error('Failed to cancel appointment:', err);
    }
  }

  constructor(
    private router: Router,
    private theme: ThemeService,
    private appointmentsService: AppointmentsService,
  ) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe((val: boolean) => (this.darkMode = val));
    this.apptSub = this.appointmentsService.getAppointments$()
      .subscribe((records: AppointmentRecord[]) => this.applyRecords(records));

    requestAnimationFrame(() => {
      setTimeout(() => (this.animReady = true), 80);
    });
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    this.apptSub?.unsubscribe();
  }

  navigate(route: string, tab?: string): void {
    this.router.navigate([route], {
      queryParams: tab ? { tab } : {},
    });
  }
}