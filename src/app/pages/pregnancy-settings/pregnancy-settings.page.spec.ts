import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PregnancySettingsPage } from './pregnancy-settings.page';

describe('PregnancySettingsPage', () => {
  let component: PregnancySettingsPage;
  let fixture: ComponentFixture<PregnancySettingsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PregnancySettingsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
