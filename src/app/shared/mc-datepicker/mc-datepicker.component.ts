// mc-datepicker.component.ts
import {
  ChangeDetectorRef, Component, ElementRef, HostBinding, Input, NgZone, OnDestroy,
  ViewChild, forwardRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Platform } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { formatLocalDate } from '../date-utils';
import {
  CalendarDay, MONTH_NAMES, WEEKDAY_NAMES, addDays, addMonths, daysInMonth, formatDisplay,
  monthGrid, parseYmd, shiftMonth, weekday, ymd,
} from './calendar';

let nextId = 0;

/** Above Ionic's own back handlers (router 0, overlays 100), so Android Back
 *  closes the open sheet instead of leaving the page. */
const BACK_BUTTON_PRIORITY = 150;

/**
 * MomCare date picker: a field that looks like the text inputs and opens a
 * calendar in a bottom sheet. Replaces <input type="date">, whose Android
 * dialog can't be styled. Plain HTML/CSS (no ion-datetime, no popover), and
 * a ControlValueAccessor whose value is the same yyyy-MM-dd string the date
 * input used, so [(ngModel)], saving and date-utils are unchanged.
 *
 * Like mc-dropdown, the open sheet is moved into document.body so nothing
 * clips it, and carries its own light/dark colours (from body.dark).
 */
@Component({
  selector: 'mc-datepicker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mc-datepicker.component.html',
  styleUrls: ['./mc-datepicker.component.scss'],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => McDatepickerComponent), multi: true }],
})
export class McDatepickerComponent implements ControlValueAccessor, OnDestroy {
  /** Sheet title and accessible name, e.g. "Expected Due Date". */
  @Input() label = '';
  @Input() placeholder = 'mm/dd/yyyy';
  /** Earliest / latest pickable date (yyyy-MM-dd); unset means no limit. */
  @Input() min = '';
  @Input() max = '';
  /** Show a "Clear" button that empties the value (only where a field may
   *  be left empty, e.g. LMP). */
  @Input() clearable = false;

  @ViewChild('trigger') private trigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('sheet') private sheetRef?: ElementRef<HTMLElement>;

  readonly id = `mc-datepicker-${++nextId}`;
  readonly monthNames = MONTH_NAMES;
  readonly weekdays = WEEKDAY_NAMES.map(name => ({ short: name[0], long: name }));

  /** yyyy-MM-dd, '' when empty. Kept as given even if it isn't a valid date. */
  value = '';
  disabled = false;
  open = false;
  dark = false;
  /** 'days' = the calendar; 'months' = pick a month of viewYear. */
  view: 'days' | 'months' = 'days';
  viewYear = 0;
  viewMonth = 0;
  /** The date with keyboard focus in the grid. */
  activeValue = '';
  /** Today's yyyy-MM-dd, taken when the sheet opens. */
  today = '';
  weeks: CalendarDay[][] = [];

  @HostBinding('class.mc-datepicker--disabled') get disabledClass(): boolean { return this.disabled; }

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private backSub?: Subscription;
  private sheetEl?: HTMLElement;
  private sheetHome?: { parent: Node; next: Node | null };

  constructor(private platform: Platform, private cdr: ChangeDetectorRef, private zone: NgZone) {}

  /** What the closed field shows: MM/DD/YYYY, as the native input did. */
  get display(): string {
    return formatDisplay(this.value);
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
    this.today = formatLocalDate(new Date());
    // Start on the selected date's month, or today's.
    this.activeValue = parseYmd(this.value) ? this.value : this.today;
    const start = parseYmd(this.activeValue)!;
    this.view = 'days';
    this.showMonth(start.y, start.m);
    this.open = true;
    // Render now, then move the sheet into document.body so nothing clips it.
    this.cdr.detectChanges();
    if (this.sheetRef) this.attachSheet(this.sheetRef.nativeElement);
    // Ionic may call this outside Angular's zone; run it inside so the
    // sheet really disappears. Not calling processNextHandler means Back
    // stops here and doesn't also leave the page.
    this.backSub = this.platform.backButton.subscribeWithPriority(BACK_BUTTON_PRIORITY, () =>
      this.zone.run(() => this.close(true)));
    setTimeout(() => this.focusActive());
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

  /** Selects a day and closes. Changing the month never changes the value;
   *  only this does. */
  pick(day: CalendarDay): void {
    if (day.disabled) return;
    if (day.value !== this.value) {
      this.value = day.value;
      this.onChange(this.value);
    }
    this.close(true);
  }

  /** Empties the value (clearable fields only) and closes. */
  clear(): void {
    if (!this.clearable) return;
    if (this.value !== '') {
      this.value = '';
      this.onChange(this.value);
    }
    this.close(true);
  }

  // -- Month / year navigation (view only) --------------------------------

  /** ‹ / ›: a month in the calendar, a year in the month picker. */
  step(n: number): void {
    if (this.view === 'months') {
      this.viewYear += n;
      return;
    }
    const t = shiftMonth(this.viewYear, this.viewMonth, n);
    this.showMonth(t.y, t.m);
    // Keep keyboard focus on the same day number in the new month.
    const active = parseYmd(this.activeValue);
    if (active) this.activeValue = ymd(t.y, t.m, Math.min(active.d, daysInMonth(t.y, t.m)));
  }

  toggleView(): void {
    this.view = this.view === 'days' ? 'months' : 'days';
    if (this.view === 'days') setTimeout(() => this.focusActive());
  }

  chooseMonth(m: number): void {
    this.showMonth(this.viewYear, m);
    const active = parseYmd(this.activeValue);
    this.activeValue = ymd(this.viewYear, m, Math.min(active?.d ?? 1, daysInMonth(this.viewYear, m)));
    this.view = 'days';
    setTimeout(() => this.focusActive());
  }

  isSelectedMonth(m: number): boolean {
    const p = parseYmd(this.value);
    return !!p && p.y === this.viewYear && p.m === m;
  }

  get headingLabel(): string {
    return this.view === 'days'
      ? `${MONTH_NAMES[this.viewMonth]} ${this.viewYear}, choose month and year`
      : `${this.viewYear}, back to the calendar`;
  }

  private showMonth(y: number, m: number): void {
    this.viewYear = y;
    this.viewMonth = m;
    this.weeks = monthGrid(y, m, this.min, this.max);
  }

  // -- Keyboard -----------------------------------------------------------

  onTriggerKeydown(event: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      this.openSheet();
    }
  }

  onSheetKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close(true);
    }
  }

  onGridKeydown(event: KeyboardEvent): void {
    let next = this.activeValue;
    switch (event.key) {
      case 'ArrowLeft':  next = addDays(next, -1); break;
      case 'ArrowRight': next = addDays(next, 1); break;
      case 'ArrowUp':    next = addDays(next, -7); break;
      case 'ArrowDown':  next = addDays(next, 7); break;
      case 'Home':       next = addDays(next, -weekday(next)); break;
      case 'End':        next = addDays(next, 6 - weekday(next)); break;
      case 'PageUp':     next = addMonths(next, -1); break;
      case 'PageDown':   next = addMonths(next, 1); break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        for (const week of this.weeks) {
          const day = week.find(d => d.value === this.activeValue);
          if (day) this.pick(day);
        }
        return;
      }
      default: return;
    }
    event.preventDefault();
    this.activeValue = next;
    const p = parseYmd(next)!;
    if (p.y !== this.viewYear || p.m !== this.viewMonth) this.showMonth(p.y, p.m);
    this.cdr.detectChanges();
    this.focusActive();
  }

  cellId(value: string): string {
    return `${this.id}-${value}`;
  }

  private focusActive(): void {
    document.getElementById(this.cellId(this.activeValue))?.focus();
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

  ngOnDestroy(): void {
    this.backSub?.unsubscribe();
    this.sheetEl?.remove();
  }
}
