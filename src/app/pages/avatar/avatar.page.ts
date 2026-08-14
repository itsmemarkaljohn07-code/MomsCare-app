// avatar.page.ts
import { Component, OnInit , OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme';
import { Subscription } from 'rxjs';

export interface AvatarAnimal {
  id: string;
  name: string;
  emoji: string;
}

export interface AvatarConfig {
  emoji: string;
  bgColor: string;
  animalId: string;
  animalName: string;
}

@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.page.html',
  styleUrls: ['./avatar.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class AvatarPage implements OnInit, OnDestroy {

  darkMode = false;
  private themeSub!: Subscription;

  animReady = false;

  currentUser = { firstName: 'Maria' };

  // ── Color palette ──
  colors: string[] = [
    '#e07eb8', // pink
    '#b57fd4', // purple
    '#7acfcf', // mint
    '#f0a050', // orange
    '#5b8fd4', // blue
    '#d44b7a', // rose
    '#5bba8a', // green
    '#9b6fc4', // violet
    '#e05580', // coral
    '#6dbfbf', // teal
  ];

  // ── Animal list ──
  animals: AvatarAnimal[] = [
    { id: 'bear',       name: 'Bear',       emoji: '🐻' },
    { id: 'bunny',      name: 'Bunny',      emoji: '🐰' },
    { id: 'cat',        name: 'Cat',        emoji: '🐱' },
    { id: 'dog',        name: 'Dog',        emoji: '🐶' },
    { id: 'fox',        name: 'Fox',        emoji: '🦊' },
    { id: 'panda',      name: 'Panda',      emoji: '🐼' },
    { id: 'koala',      name: 'Koala',      emoji: '🐨' },
    { id: 'hedgehog',   name: 'Hedgehog',   emoji: '🦔' },
    { id: 'penguin',    name: 'Penguin',    emoji: '🐧' },
    { id: 'chick',      name: 'Chick',      emoji: '🐥' },
    { id: 'owl',        name: 'Owl',        emoji: '🦉' },
    { id: 'deer',       name: 'Deer',       emoji: '🦌' },
    { id: 'monkey',     name: 'Monkey',     emoji: '🐵' },
    { id: 'frog',       name: 'Frog',       emoji: '🐸' },
    { id: 'unicorn',    name: 'Unicorn',    emoji: '🦄' },
    { id: 'butterfly',  name: 'Butterfly',  emoji: '🦋' },
  ];

  selectedColor  = '#e07eb8';
  selectedAnimal: AvatarAnimal = this.animals[0];

  constructor(private router: Router, private location: Location, private theme: ThemeService) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    this.loadSaved();
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }

  private loadSaved(): void {
    try {
      const saved = localStorage.getItem('momscare_avatar');
      if (saved) {
        const config: AvatarConfig = JSON.parse(saved);
        this.selectedColor  = config.bgColor;
        const found = this.animals.find(a => a.id === config.animalId);
        if (found) this.selectedAnimal = found;
      }
    } catch {}
  }

  selectColor(color: string): void {
    this.selectedColor = color;
  }

  selectAnimal(animal: AvatarAnimal): void {
    this.selectedAnimal = animal;
  }

  saveAndGoBack(): void {
    const config: AvatarConfig = {
      emoji:      this.selectedAnimal.emoji,
      bgColor:    this.selectedColor,
      animalId:   this.selectedAnimal.id,
      animalName: this.selectedAnimal.name,
    };
    try {
      localStorage.setItem('momscare_avatar', JSON.stringify(config));
    } catch {}
    this.location.back();
  }

  goBack(): void {
    this.location.back();
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}