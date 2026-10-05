// avatar.page.ts
import { Component, OnInit , OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme';
import { AuthService, AvatarSelection } from '../../services/auth.service';
import { Subscription } from 'rxjs';

export interface AvatarAnimal {
  id: string;
  name: string;
  emoji: string;
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

  // Real first name, loaded from the signed-in user's own profile in
  // ngOnInit -- 'there' is only a placeholder until that resolves,
  // never a hardcoded person's name.
  currentUser = { firstName: 'there' };

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
  isSaving = false;

  constructor(private router: Router, private location: Location, private theme: ThemeService, private authService: AuthService) {}

  ngOnInit(): void {
    this.themeSub = this.theme.isDark$.subscribe(val => (this.darkMode = val));
    this.loadSaved();
    requestAnimationFrame(() => setTimeout(() => (this.animReady = true), 80));
  }

  /** Loads the current avatar (and name) from the signed-in user's own
   *  Firestore profile -- the SAME users/{uid} document every other
   *  page already reads via AuthService, not a device-local value
   *  that would be shared by whoever happens to be signed in on this
   *  device. If the profile hasn't been fetched yet or has no avatar
   *  saved, the existing component defaults above are left as-is. */
  private async loadSaved(): Promise<void> {
    try {
      const profile = await this.authService.getProfile();
      if (profile?.fullName) {
        this.currentUser.firstName = profile.fullName.split(' ')[0] || 'there';
      }
      const saved = profile?.avatar;
      if (saved) {
        this.selectedColor = saved.bgColor;
        const found = this.animals.find(a => a.id === saved.animalId);
        if (found) this.selectedAnimal = found;
      }
    } catch (err) {
      console.error('Failed to load avatar from profile:', err);
    }
  }

  selectColor(color: string): void {
    this.selectedColor = color;
  }

  selectAnimal(animal: AvatarAnimal): void {
    this.selectedAnimal = animal;
  }

  /** Saves to the signed-in user's own profile document, keyed by
   *  their Firebase Auth UID via AuthService -- this is what makes
   *  the avatar belong to the account rather than to the device. If
   *  the save fails (e.g. a network blip), the user stays on this
   *  page rather than navigating back to a Profile page that would
   *  then show their OLD avatar, silently implying nothing happened
   *  when something actually did fail. */
  async saveAndGoBack(): Promise<void> {
    if (this.isSaving) return;
    const config: AvatarSelection = {
      emoji:      this.selectedAnimal.emoji,
      bgColor:    this.selectedColor,
      animalId:   this.selectedAnimal.id,
      animalName: this.selectedAnimal.name,
    };
    this.isSaving = true;
    try {
      await this.authService.updateProfile({ avatar: config });
      this.location.back();
    } catch (err) {
      console.error('Failed to save avatar:', err);
    } finally {
      this.isSaving = false;
    }
  }

  goBack(): void {
    this.location.back();
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}