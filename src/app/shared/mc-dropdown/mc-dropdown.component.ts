// mc-dropdown.component.ts
import {
  ChangeDetectorRef, Component, ElementRef, HostBinding, Input, NgZone, OnDestroy,
  ViewChild, forwardRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Platform } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';

export interface McDropdownOption {
  value: string;
  label: string;
}

let nextId = 0;

/** Above Ionic's own back handlers (router 0, overlays 100), so Android Back
 *  closes the open sheet instead of leaving the page. */
const BACK_BUTTON_PRIORITY = 150;

/**
 * MomCare dropdown: a field that looks like the text inputs and opens a
 * bottom sheet of options. Plain HTML/CSS (no ion-select, no popover), and a
 * ControlValueAccessor, so [(ngModel)] and [disabled] work as on a <select>.
 *
 * While open, the sheet is moved into document.body so nothing (ion-content,
 * page transforms) can clip it; it is put back when it closes. Because it
 * then sits outside the page, it carries its own light/dark colours, chosen
 * from the app's theme (body.dark) when it opens.
 */
@Component({
  selector: 'mc-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mc-dropdown.component.html',
  styleUrls: ['./mc-dropdown.component.scss'],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => McDropdownComponent), multi: true }],
})
export class McDropdownComponent implements ControlValueAccessor, OnDestroy {
  @Input() options: McDropdownOption[] = [];
  /** Sheet title and accessible name, e.g. "Blood Type". */
  @Input() label = '';
  @Input() placeholder = 'Select';
  /** If set, an extra first row that clears the value to '' (e.g. "Not set"). */
  @Input() clearLabel = '';

  @ViewChild('trigger') private trigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('sheet') private sheetRef?: ElementRef<HTMLElement>;

  readonly id = `mc-dropdown-${++nextId}`;
  value = '';
  disabled = false;
  open = false;
  dark = false;
  /** Row with keyboard focus while open (index into rows). */
  activeIndex = 0;

  @HostBinding('class.mc-dropdown--disabled') get disabledClass(): boolean { return this.disabled; }

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private backSub?: Subscription;
  private sheetEl?: HTMLElement;
  private sheetHome?: { parent: Node; next: Node | null };

  constructor(private platform: Platform, private cdr: ChangeDetectorRef, private zone: NgZone) {}

  /** The rows shown in the sheet: the optional "clear" row, then the options. */
  get rows(): McDropdownOption[] {
    return this.clearLabel ? [{ value: '', label: this.clearLabel }, ...this.options] : this.options;
  }

  get selectedLabel(): string {
    return this.options.find(o => o.value === this.value)?.label ?? '';
  }

  // -- ControlValueAccessor ---------------------------------------------

  writeValue(value: unknown): void {
    this.value = value == null ? '' : String(value);
    this.cdr.markForCheck();
  }
  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (isDisabled) this.close(false);
    this.cdr.markForCheck();
  }

  // -- Open / close -------------------------------------------------------

  toggle(): void {
    if (this.open) this.close(true);
    else this.openSheet();
  }

  openSheet(): void {
    if (this.disabled || this.open) return;
    this.dark = document.body.classList.contains('dark');
    const selected = this.rows.findIndex(r => r.value === this.value);
    this.activeIndex = selected >= 0 ? selected : 0;
    this.open = true;
    // Render now, then move the sheet into document.body so nothing clips it.
    this.cdr.detectChanges();
    if (this.sheetRef) this.attachSheet(this.sheetRef.nativeElement);
    // Ionic may call this outside Angular's zone; run it inside so the
    // sheet really disappears. Not calling processNextHandler means Back
    // stops here and doesn't also leave the page.
    this.backSub = this.platform.backButton.subscribeWithPriority(BACK_BUTTON_PRIORITY, () =>
      this.zone.run(() => this.close(true)));
    // Focus the selected row once the sheet is in the DOM.
    setTimeout(() => this.focusRow(this.activeIndex));
  }

  close(returnFocus: boolean): void {
    if (!this.open) return;
    this.backSub?.unsubscribe();
    this.backSub = undefined;
    // Put the sheet back first, so Angular removes it from where it rendered it.
    this.detachSheet();
    this.open = false;
    this.onTouched();
    this.cdr.detectChanges();
    if (returnFocus) setTimeout(() => this.trigger?.nativeElement.focus());
  }

  choose(row: McDropdownOption): void {
    if (row.value !== this.value) {
      this.value = row.value;
      this.onChange(this.value);
    }
    this.close(true);
  }

  // -- Keyboard -----------------------------------------------------------

  onTriggerKeydown(event: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      this.openSheet();
    }
  }

  onListKeydown(event: KeyboardEvent): void {
    const last = this.rows.length - 1;
    switch (event.key) {
      case 'ArrowDown': this.activeIndex = Math.min(last, this.activeIndex + 1); break;
      case 'ArrowUp':   this.activeIndex = Math.max(0, this.activeIndex - 1); break;
      case 'Home':      this.activeIndex = 0; break;
      case 'End':       this.activeIndex = last; break;
      case 'Enter':
      case ' ':         this.choose(this.rows[this.activeIndex]); event.preventDefault(); return;
      case 'Escape':    this.close(true); event.preventDefault(); return;
      case 'Tab':       this.close(true); return;
      default: return;
    }
    event.preventDefault();
    this.focusRow(this.activeIndex);
  }

  optionId(index: number): string {
    return `${this.id}-option-${index}`;
  }

  // -- Portal: keep the sheet in document.body while it is open -----------

  private attachSheet(el: HTMLElement): void {
    if (this.sheetEl === el) return;
    this.sheetEl = el;
    this.sheetHome = { parent: el.parentNode as Node, next: el.nextSibling };
    document.body.appendChild(el);
  }

  private detachSheet(): void {
    const el = this.sheetEl;
    if (!el) return;
    // Put it back where Angular rendered it, so Angular removes it cleanly.
    const home = this.sheetHome;
    try {
      if (home?.parent) home.parent.insertBefore(el, home.next && home.next.parentNode === home.parent ? home.next : null);
      else el.remove();
    } catch {
      el.remove();
    }
    this.sheetEl = undefined;
    this.sheetHome = undefined;
  }

  private focusRow(index: number): void {
    const el = document.getElementById(this.optionId(index));
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
  }

  ngOnDestroy(): void {
    this.backSub?.unsubscribe();
    this.sheetEl?.remove();
  }
}
