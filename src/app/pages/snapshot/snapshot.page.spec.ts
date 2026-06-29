import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SnapshotPage } from './snapshot.page';

describe('SnapshotPage', () => {
  let component: SnapshotPage;
  let fixture: ComponentFixture<SnapshotPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SnapshotPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
