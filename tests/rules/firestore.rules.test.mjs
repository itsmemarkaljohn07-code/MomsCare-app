// Firestore security-rules tests. Run with `npm run test:rules`.
//
// Runs only against the local emulator under the fake project
// "demo-momscare" — the "demo-" prefix makes the emulator refuse to talk
// to any real Firebase project, so nothing here can touch production.

import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc, collection, doc, getDoc, getDocs, setDoc, updateDoc, Timestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-momscare';

const PATIENT_A = 'patientA';
const PATIENT_B = 'patientB';
const ADMIN = 'adminUid';
const DOC_ASSIGNED = { uid: 'docAssignedUid', doctorId: 'doc1', doctorName: 'Dr. Assigned' };
const DOC_OTHER = { uid: 'docOtherUid', doctorId: 'doc2', doctorName: 'Dr. Other' };

const APPT = `users/${PATIENT_A}/appointments/appt1`;
const COMMENTS = `users/${PATIENT_A}/snapshots/photo1/comments`;

let env;

// Contexts. Doctors carry the same custom claims the dashboard sets in
// api/doctors/create-with-login: { doctorId, doctorName }.
const signedOut = () => env.unauthenticatedContext().firestore();
const patientA = () => env.authenticatedContext(PATIENT_A, { email: 'a@example.com' }).firestore();
const admin = () => env.authenticatedContext(ADMIN, { email: 'admin@example.com' }).firestore();
const doctor = (d) => env.authenticatedContext(d.uid, { doctorId: d.doctorId, doctorName: d.doctorName }).firestore();

const comment = (overrides) => ({
  userId: PATIENT_A,
  snapshotId: 'photo1',
  message: 'Hello',
  parentCommentId: null,
  createdAt: Timestamp.now(),
  ...overrides,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `users/${PATIENT_A}`), {
      uid: PATIENT_A, username: 'patienta', email: 'a@example.com',
      fullName: 'Patient A', avatar: 'old.png',
      assignedDoctorNames: [DOC_ASSIGNED.doctorName],
    });
    await setDoc(doc(db, `users/${PATIENT_B}`), {
      uid: PATIENT_B, username: 'patientb', email: 'b@example.com',
      fullName: 'Patient B', assignedDoctorNames: [],
    });
    await setDoc(doc(db, 'usernames/patienta'), { email: 'a@example.com', uid: PATIENT_A });
    await setDoc(doc(db, APPT), { status: 'upcoming', doctor: DOC_ASSIGNED.doctorName, date: '2026-10-20' });
    await setDoc(doc(db, `users/${PATIENT_A}/snapshots/photo1`), { url: 'x.jpg' });
    await setDoc(doc(db, `${COMMENTS}/c1`), comment({ authorRole: 'user', authorName: 'Patient A' }));
    await setDoc(doc(db, `users/${PATIENT_A}/clinicalNotes/n1`), { text: 'note', createdAt: Timestamp.now() });
    await setDoc(doc(db, `admins/${ADMIN}`), { role: 'admin' });
    await setDoc(doc(db, 'admins/otherAdmin'), { role: 'admin' });
    await setDoc(doc(db, `doctors/${DOC_ASSIGNED.doctorId}`), {
      name: DOC_ASSIGNED.doctorName, authUid: DOC_ASSIGNED.uid, loginEmail: 'doc@example.com',
    });
    await setDoc(doc(db, `doctors/${DOC_OTHER.doctorId}`), {
      name: DOC_OTHER.doctorName, authUid: DOC_OTHER.uid, loginEmail: 'other@example.com',
    });
    await setDoc(doc(db, 'insights/article1'), { title: 'Week 12' });
  });
});

describe('signed-out user', () => {
  test('cannot read /users/{any}', async () => {
    await assertFails(getDoc(doc(signedOut(), `users/${PATIENT_A}`)));
  });
  test('can get /usernames/{name}', async () => {
    await assertSucceeds(getDoc(doc(signedOut(), 'usernames/patienta')));
  });
  test('cannot list /usernames', async () => {
    await assertFails(getDocs(collection(signedOut(), 'usernames')));
  });
});

describe('patient A: profiles', () => {
  test('can read own profile', async () => {
    await assertSucceeds(getDoc(doc(patientA(), `users/${PATIENT_A}`)));
  });
  test("cannot read patient B's profile", async () => {
    await assertFails(getDoc(doc(patientA(), `users/${PATIENT_B}`)));
  });
  test('can update avatar', async () => {
    await assertSucceeds(updateDoc(doc(patientA(), `users/${PATIENT_A}`), { avatar: 'new.png' }));
  });
  test('cannot update assignedDoctorNames', async () => {
    await assertFails(updateDoc(doc(patientA(), `users/${PATIENT_A}`), { assignedDoctorNames: ['Dr. Other'] }));
  });
  test('cannot update email', async () => {
    await assertFails(updateDoc(doc(patientA(), `users/${PATIENT_A}`), { email: 'evil@example.com' }));
  });
});

describe('patient A: comments', () => {
  test("can post as authorRole 'user'", async () => {
    await assertSucceeds(addDoc(collection(patientA(), COMMENTS), comment({ authorRole: 'user', authorName: 'Patient A' })));
  });
  test("cannot post as authorRole 'doctor'", async () => {
    await assertFails(addDoc(collection(patientA(), COMMENTS), comment({ authorRole: 'doctor', authorName: DOC_ASSIGNED.doctorName })));
  });
});

describe('patient A: appointments', () => {
  test("can cancel an 'upcoming' appointment", async () => {
    await assertSucceeds(updateDoc(doc(patientA(), APPT), { status: 'cancelled' }));
  });
  test("cannot set status 'completed'", async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), { status: 'completed' }));
  });
});

describe('patient A: staff collections', () => {
  test('cannot read /doctors', async () => {
    await assertFails(getDoc(doc(patientA(), `doctors/${DOC_ASSIGNED.doctorId}`)));
  });
});

describe('assigned vs unassigned doctor', () => {
  test('assigned doctor can read the appointment', async () => {
    await assertSucceeds(getDoc(doc(doctor(DOC_ASSIGNED), APPT)));
  });
  test('unassigned doctor cannot read the appointment', async () => {
    await assertFails(getDoc(doc(doctor(DOC_OTHER), APPT)));
  });
  test('assigned doctor can read comments', async () => {
    await assertSucceeds(getDocs(collection(doctor(DOC_ASSIGNED), COMMENTS)));
  });
  test('unassigned doctor cannot read comments', async () => {
    await assertFails(getDocs(collection(doctor(DOC_OTHER), COMMENTS)));
  });
  test("assigned doctor can post as 'doctor' under their own name", async () => {
    await assertSucceeds(addDoc(collection(doctor(DOC_ASSIGNED), COMMENTS),
      comment({ authorRole: 'doctor', authorName: DOC_ASSIGNED.doctorName })));
  });
  test("unassigned doctor cannot post as 'doctor'", async () => {
    await assertFails(addDoc(collection(doctor(DOC_OTHER), COMMENTS),
      comment({ authorRole: 'doctor', authorName: DOC_OTHER.doctorName })));
  });
});

describe('admin', () => {
  test('can read comments', async () => {
    await assertSucceeds(getDocs(collection(admin(), COMMENTS)));
  });
  test("can post as 'admin'", async () => {
    await assertSucceeds(addDoc(collection(admin(), COMMENTS),
      comment({ authorRole: 'admin', authorName: 'admin@example.com', authorUid: ADMIN })));
  });
});

describe('doctors collection', () => {
  test("a doctor cannot read another doctor's doctors/{id}", async () => {
    await assertFails(getDoc(doc(doctor(DOC_ASSIGNED), `doctors/${DOC_OTHER.doctorId}`)));
  });
  test('a doctor can update their own photoUrl', async () => {
    await assertSucceeds(updateDoc(doc(doctor(DOC_ASSIGNED), `doctors/${DOC_ASSIGNED.doctorId}`), { photoUrl: 'new.jpg' }));
  });
  test('a doctor cannot update their own loginEmail', async () => {
    await assertFails(updateDoc(doc(doctor(DOC_ASSIGNED), `doctors/${DOC_ASSIGNED.doctorId}`), { loginEmail: 'evil@example.com' }));
  });
  test('a doctor cannot update their own authUid', async () => {
    await assertFails(updateDoc(doc(doctor(DOC_ASSIGNED), `doctors/${DOC_ASSIGNED.doctorId}`), { authUid: 'someoneElse' }));
  });
});

describe('clinicalNotes', () => {
  test('a patient cannot read their own clinicalNotes', async () => {
    await assertFails(getDocs(collection(patientA(), `users/${PATIENT_A}/clinicalNotes`)));
  });
  test("an unassigned doctor cannot list a patient's clinicalNotes", async () => {
    await assertFails(getDocs(collection(doctor(DOC_OTHER), `users/${PATIENT_A}/clinicalNotes`)));
  });
});

describe('admins and insights', () => {
  test('a patient cannot read /admins/{any}', async () => {
    await assertFails(getDoc(doc(patientA(), `admins/${ADMIN}`)));
  });
  test('a signed-out user cannot read /insights', async () => {
    await assertFails(getDoc(doc(signedOut(), 'insights/article1')));
  });
  test('a signed-in user can read /insights', async () => {
    await assertSucceeds(getDoc(doc(patientA(), 'insights/article1')));
  });
});

// Not part of the requested cases. Each test below asserts something a
// momscare-admin browser component does through the CLIENT SDK, so a
// failure here means that dashboard screen would be denied by these rules.
describe('dashboard compatibility (client-SDK reads/writes in momscare-admin)', () => {
  test('doctor-sidebar / doctor-profile-form: doctor reads own doctors/{id}', async () => {
    await assertSucceeds(getDoc(doc(doctor(DOC_ASSIGNED), `doctors/${DOC_ASSIGNED.doctorId}`)));
  });
  test('doctor-profile-form: doctor updates own photoUrl/title', async () => {
    await assertSucceeds(updateDoc(doc(doctor(DOC_ASSIGNED), `doctors/${DOC_ASSIGNED.doctorId}`), { title: 'OB-GYN' }));
  });
  test('doctor-view-live: admin reads doctors/{id}', async () => {
    await assertSucceeds(getDoc(doc(admin(), `doctors/${DOC_ASSIGNED.doctorId}`)));
  });
  test('patient-view-live: admin reads users/{patient}', async () => {
    await assertSucceeds(getDoc(doc(admin(), `users/${PATIENT_A}`)));
  });
  test("admin-view-live: admin reads another admin's admins/{uid}", async () => {
    await assertSucceeds(getDoc(doc(admin(), 'admins/otherAdmin')));
  });
  test('clinical-notes-panel: admin lists users/{patient}/clinicalNotes', async () => {
    await assertSucceeds(getDocs(collection(admin(), `users/${PATIENT_A}/clinicalNotes`)));
  });
  test('clinical-notes-panel: assigned doctor lists users/{patient}/clinicalNotes', async () => {
    await assertSucceeds(getDocs(collection(doctor(DOC_ASSIGNED), `users/${PATIENT_A}/clinicalNotes`)));
  });
});
