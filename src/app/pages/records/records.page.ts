// records.page.ts
import { Component, OnInit , OnDestroy } from '@angular/core';
import { Location, DatePipe } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

export interface MedicalRecord {
  id: string; name: string; type: string;
  date: string; notes: string; fileName: string;
}

@Component({
  selector: 'app-records',
  templateUrl: './records.page.html',
  styleUrls: ['./records.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  providers: [DatePipe],
})
export class RecordsPage implements OnInit, OnDestroy {

  darkMode = false;
  private themeSub!: Subscription;
  animReady   = false;
  showUpload  = false;
  activeFilter = 'all';

  docTypes = [
    { value: 'lab',        label: '🧪 Laboratory Results' },
    { value: 'ultrasound', label: '🔬 Ultrasound' },
    { value: 'prescription', label: '💊 Prescription' },
    { value: 'checkup',    label: '🩺 Checkup Report' },
    { value: 'other',      label: '📄 Other Document' },
  ];

  filters = [
    { value: 'all', label: 'All' },
    { value: 'lab', label: 'Lab' },
    { value: 'ultrasound', label: 'Ultrasound' },
    { value: 'prescription', label: 'Rx' },
    { value: 'checkup', label: 'Checkup' },
  ];

  records: MedicalRecord[] = [
    { id: '1', name: 'Complete Blood Count', type: 'lab', date: '2026-05-10', notes: 'Normal results. Hemoglobin slightly low.', fileName: '' },
    { id: '2', name: 'Anatomy Scan Week 20', type: 'ultrasound', date: '2026-05-18', notes: 'All organs developing normally.', fileName: '' },
    { id: '3', name: 'Prenatal Vitamins Prescription', type: 'prescription', date: '2026-04-20', notes: 'Ferrous sulfate 300mg + Folic acid 5mg', fileName: '' },
  ];

  draft = { name: '', type: 'lab', date: new Date().toISOString().split('T')[0], notes: '', fileName: '' };

  get filteredRecords(): MedicalRecord[] {
    return this.activeFilter === 'all' ? this.records : this.records.filter(r => r.type === this.activeFilter);
  }

  typeIcon(t: string): string {
    const m: Record<string,string> = { lab: '🧪', ultrasound: '🔬', prescription: '💊', checkup: '🩺', other: '📄' };
    return m[t] || '📄';
  }
  typeLabel(t: string): string {
    return this.docTypes.find(d => d.value === t)?.label.replace(/^.{2}/,'').trim() || t;
  }

  openUpload(): void { this.draft = { name:'', type:'lab', date: new Date().toISOString().split('T')[0], notes:'', fileName:'' }; this.showUpload = true; }
  closeUpload(): void { this.showUpload = false; }

  pickFile(): void {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*,.pdf,.doc,.docx';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.draft.fileName = file.name;
    };
    input.click();
  }

  addRecord(): void {
    if (!this.draft.name) return;
    this.records = [{ ...this.draft, id: Date.now().toString() }, ...this.records];
    this.saveRecords(); this.closeUpload();
  }

  deleteRecord(id: string): void {
    this.records = this.records.filter(r => r.id !== id);
    this.saveRecords();
  }

  private saveRecords(): void { try { localStorage.setItem('momscare_records', JSON.stringify(this.records)); } catch {} }

  constructor(private location: Location, private theme: ThemeService) {}
  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    try { const s = localStorage.getItem('momscare_records'); if (s) this.records = JSON.parse(s); } catch {}
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }
  goBack(): void { this.location.back(); }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}