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
  addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, Timestamp,
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

// Exactly what AuthService writes to users/{uid} at registration.
const registration = (uid) => ({
  uid,
  fullName: 'New Patient',
  username: 'newpatient',
  email: 'a@example.com',
  mobile: '09171234567',
  dueDate: '2027-04-01',
  weeksPregnant: 12,
  lmpDate: '2026-06-25',
  firstTimeMom: true,
  clinicName: 'Clinic',
  createdAt: new Date().toISOString(),
  setupComplete: true,
});

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
    for (const uid of [PATIENT_A, PATIENT_B]) {
      await setDoc(doc(db, `users/${uid}/snapshots/photo-${uid}`), { url: 'y.jpg' });
      await setDoc(doc(db, `users/${uid}/healthLogs/log1`), { weight: 60, loggedAt: Timestamp.now() });
      await setDoc(doc(db, `users/${uid}/notifications/n1`), { title: 'Reminder', message: 'Checkup', read: false });
    }
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
  test('can set tutorialSeen', async () => {
    await assertSucceeds(updateDoc(doc(patientA(), `users/${PATIENT_A}`), { tutorialSeen: true }));
  });
  test('cannot set assignedDoctorNames together with tutorialSeen', async () => {
    await assertFails(updateDoc(doc(patientA(), `users/${PATIENT_A}`),
      { tutorialSeen: true, assignedDoctorNames: ['Dr. Other'] }));
  });
  test('cannot set an unknown field together with tutorialSeen', async () => {
    await assertFails(updateDoc(doc(patientA(), `users/${PATIENT_A}`), { tutorialSeen: true, role: 'admin' }));
  });
  test('cannot change username together with tutorialSeen', async () => {
    await assertFails(updateDoc(doc(patientA(), `users/${PATIENT_A}`), { tutorialSeen: true, username: 'other' }));
  });
  test("cannot set tutorialSeen on patient B's profile", async () => {
    await assertFails(updateDoc(doc(patientA(), `users/${PATIENT_B}`), { tutorialSeen: true }));
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

describe('patient A: appointment cancellation requests', () => {
  // The patient only asks; the clinic decides from the dashboard server.
  const request = (extra = {}) => ({ cancellation: { state: 'requested', requestedAt: serverTimestamp(), ...extra } });
  const withdraw = () => ({ cancellation: { state: 'withdrawn', requestedAt: serverTimestamp() } });
  const seed = (path, data) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), path), data));
  const APPT_DONE = `users/${PATIENT_A}/appointments/done`;
  const APPT_CANCELLED = `users/${PATIENT_A}/appointments/cancelled`;
  const withState = (state) => seed(APPT, {
    status: 'upcoming', doctor: DOC_ASSIGNED.doctorName, date: '2026-10-20',
    cancellation: { state, requestedAt: Timestamp.now() },
  });

  test('can request cancellation of an upcoming appointment', async () => {
    await assertSucceeds(updateDoc(doc(patientA(), APPT), request()));
  });
  test('can request with a reason', async () => {
    await assertSucceeds(updateDoc(doc(patientA(), APPT), request({ reason: 'Feeling unwell' })));
  });

  test("cannot change status to 'cancelled' directly", async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), { status: 'cancelled' }));
  });
  test("cannot set status 'completed'", async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), { status: 'completed' }));
  });
  test('cannot change status together with a valid request', async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), { ...request(), status: 'cancelled' }));
  });

  test("cannot set state 'approved'", async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), { cancellation: { state: 'approved', requestedAt: serverTimestamp() } }));
  });
  test("cannot set state 'declined'", async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), { cancellation: { state: 'declined', requestedAt: serverTimestamp() } }));
  });

  test('cannot write decidedBy', async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), request({ decidedBy: PATIENT_A })));
  });
  test('cannot write decidedAt', async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), request({ decidedAt: serverTimestamp() })));
  });
  test('cannot write declineReason', async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), request({ declineReason: 'n/a' })));
  });

  test('cannot change another field alongside the request', async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), { ...request(), notes: 'changed' }));
  });
  test('cannot change the date alongside the request', async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), { ...request(), date: '2026-12-01' }));
  });

  test('requestedAt must be the server time', async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), { cancellation: { state: 'requested', requestedAt: Timestamp.now() } }));
  });
  test('requestedAt is required', async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), { cancellation: { state: 'requested' } }));
  });

  test('cannot request on a completed appointment', async () => {
    await seed(APPT_DONE, { status: 'completed', doctor: DOC_ASSIGNED.doctorName, date: '2026-09-01' });
    await assertFails(updateDoc(doc(patientA(), APPT_DONE), request()));
  });
  test('cannot request on a cancelled appointment', async () => {
    await seed(APPT_CANCELLED, { status: 'cancelled', doctor: DOC_ASSIGNED.doctorName, date: '2026-10-25' });
    await assertFails(updateDoc(doc(patientA(), APPT_CANCELLED), request()));
  });

  test("cannot request again while 'requested'", async () => {
    await withState('requested');
    await assertFails(updateDoc(doc(patientA(), APPT), request()));
  });
  test("can withdraw from 'requested'", async () => {
    await withState('requested');
    await assertSucceeds(updateDoc(doc(patientA(), APPT), withdraw()));
  });

  test('cannot withdraw when nothing was requested', async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), withdraw()));
  });
  test("cannot withdraw from 'declined'", async () => {
    await withState('declined');
    await assertFails(updateDoc(doc(patientA(), APPT), withdraw()));
  });
  test("cannot withdraw from 'withdrawn'", async () => {
    await withState('withdrawn');
    await assertFails(updateDoc(doc(patientA(), APPT), withdraw()));
  });

  test("can request again after 'declined'", async () => {
    await withState('declined');
    await assertSucceeds(updateDoc(doc(patientA(), APPT), request()));
  });
  test("can request again after 'withdrawn'", async () => {
    await withState('withdrawn');
    await assertSucceeds(updateDoc(doc(patientA(), APPT), request()));
  });
  test("cannot move 'approved' back to 'requested'", async () => {
    await withState('approved');
    await assertFails(updateDoc(doc(patientA(), APPT), request()));
  });

  test('reason of exactly 300 characters is allowed', async () => {
    await assertSucceeds(updateDoc(doc(patientA(), APPT), request({ reason: 'x'.repeat(300) })));
  });
  test('reason over 300 characters fails', async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), request({ reason: 'x'.repeat(301) })));
  });
  test('reason must be a string', async () => {
    await assertFails(updateDoc(doc(patientA(), APPT), request({ reason: 42 })));
  });
});

describe("patient B cannot touch patient A's appointment", () => {
  const patientB = () => env.authenticatedContext(PATIENT_B, { email: 'b@example.com' }).firestore();
  const request = { cancellation: { state: 'requested', requestedAt: serverTimestamp() } };

  test('A can request (the matching allowed case)', async () => {
    await assertSucceeds(updateDoc(doc(patientA(), APPT), request));
  });
  test('B cannot request', async () => {
    await assertFails(updateDoc(doc(patientB(), APPT), request));
  });
  test('B cannot withdraw', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), APPT), {
      status: 'upcoming', doctor: DOC_ASSIGNED.doctorName, date: '2026-10-20',
      cancellation: { state: 'requested', requestedAt: Timestamp.now() },
    }));
    await assertFails(updateDoc(doc(patientB(), APPT), { cancellation: { state: 'withdrawn', requestedAt: serverTimestamp() } }));
  });
  test('B cannot change status', async () => {
    await assertFails(updateDoc(doc(patientB(), APPT), { status: 'cancelled' }));
  });
  test('B cannot read it', async () => {
    await assertFails(getDoc(doc(patientB(), APPT)));
  });
});

describe('push devices: users/{uid}/devices/{id}', () => {
  const DEVICE = `users/${PATIENT_A}/devices/install-1`;
  const patientB = () => env.authenticatedContext(PATIENT_B, { email: 'b@example.com' }).firestore();
  const device = (overrides = {}) => ({ token: 'fcm-token-abc', platform: 'android', updatedAt: serverTimestamp(), ...overrides });
  const seedDevice = () => env.withSecurityRulesDisabled(ctx =>
    setDoc(doc(ctx.firestore(), DEVICE), { token: 'old-token', platform: 'android', updatedAt: Timestamp.now() }));

  test('owner can create their device document', async () => {
    await assertSucceeds(setDoc(doc(patientA(), DEVICE), device()));
  });
  test('owner can update the token (refresh)', async () => {
    await seedDevice();
    await assertSucceeds(setDoc(doc(patientA(), DEVICE), device({ token: 'fcm-token-new' })));
  });
  test('owner can read and list their devices', async () => {
    await seedDevice();
    await assertSucceeds(getDoc(doc(patientA(), DEVICE)));
    await assertSucceeds(getDocs(collection(patientA(), `users/${PATIENT_A}/devices`)));
  });
  test('owner can delete their device document (sign-out)', async () => {
    await seedDevice();
    await assertSucceeds(deleteDoc(doc(patientA(), DEVICE)));
  });
  test('a token of exactly 4096 characters is allowed', async () => {
    await assertSucceeds(setDoc(doc(patientA(), DEVICE), device({ token: 't'.repeat(4096) })));
  });

  test('another patient cannot read it', async () => {
    await seedDevice();
    await assertFails(getDoc(doc(patientB(), DEVICE)));
  });
  test('another patient cannot list them', async () => {
    await assertFails(getDocs(collection(patientB(), `users/${PATIENT_A}/devices`)));
  });
  test('another patient cannot create one under A', async () => {
    await assertFails(setDoc(doc(patientB(), DEVICE), device()));
  });
  test('another patient cannot overwrite it', async () => {
    await seedDevice();
    await assertFails(setDoc(doc(patientB(), DEVICE), device({ token: 'stolen' })));
  });
  test('another patient cannot delete it', async () => {
    await seedDevice();
    await assertFails(deleteDoc(doc(patientB(), DEVICE)));
  });
  test('a signed-out user cannot read it', async () => {
    await seedDevice();
    await assertFails(getDoc(doc(signedOut(), DEVICE)));
  });
  test('an assigned doctor cannot read it', async () => {
    await seedDevice();
    await assertFails(getDoc(doc(doctor(DOC_ASSIGNED), DEVICE)));
  });
  test('an admin client cannot read it (dashboard uses the Admin SDK)', async () => {
    await seedDevice();
    await assertFails(getDoc(doc(admin(), DEVICE)));
  });

  test('an extra field is denied', async () => {
    await assertFails(setDoc(doc(patientA(), DEVICE), device({ uid: PATIENT_A })));
  });
  test('a missing field is denied', async () => {
    await assertFails(setDoc(doc(patientA(), DEVICE), { token: 'fcm-token-abc', platform: 'android' }));
  });
  test('a non-string token is denied', async () => {
    await assertFails(setDoc(doc(patientA(), DEVICE), device({ token: 12345 })));
  });
  test('an empty token is denied', async () => {
    await assertFails(setDoc(doc(patientA(), DEVICE), device({ token: '' })));
  });
  test('a token over 4096 characters is denied', async () => {
    await assertFails(setDoc(doc(patientA(), DEVICE), device({ token: 't'.repeat(4097) })));
  });
  test("a platform other than 'android' is denied", async () => {
    await assertFails(setDoc(doc(patientA(), DEVICE), device({ platform: 'ios' })));
  });
  test('updatedAt must be the server time', async () => {
    await assertFails(setDoc(doc(patientA(), DEVICE), device({ updatedAt: Timestamp.now() })));
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

// Every "cannot" below is paired with a "can" that differs only in the
// property under test, so a denial can't come from an unrelated mistake
// (wrong path, missing field, wrong auth context).

describe('signup: users/{uid}', () => {
  // The shared seed already has both profiles; a write to an existing
  // document would be an update, not the create being tested.
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), `users/${PATIENT_A}`));
      await deleteDoc(doc(ctx.firestore(), `users/${PATIENT_B}`));
    });
  });

  test('patient A can create users/{A} with exactly the registration payload', async () => {
    await assertSucceeds(setDoc(doc(patientA(), `users/${PATIENT_A}`), registration(PATIENT_A)));
  });
  test('creating users/{A} with an extra assignedDoctorNames field is denied', async () => {
    await assertFails(setDoc(doc(patientA(), `users/${PATIENT_A}`),
      { ...registration(PATIENT_A), assignedDoctorNames: ['Dr. Assigned'] }));
  });
  test('patient A cannot create users/{B}', async () => {
    await assertFails(setDoc(doc(patientA(), `users/${PATIENT_B}`), registration(PATIENT_B)));
  });
});

describe('signup: usernames/{name}', () => {
  const ownEntry = { uid: PATIENT_A, email: 'a@example.com' };

  test('patient A can create usernames/{name} with own uid and email', async () => {
    await assertSucceeds(setDoc(doc(patientA(), 'usernames/newname'), ownEntry));
  });
  test('…also when the stored email differs in letter case', async () => {
    await assertSucceeds(setDoc(doc(patientA(), 'usernames/newname'), { ...ownEntry, email: 'A@Example.COM' }));
  });
  test('…also when the auth token email differs in letter case', async () => {
    const db = env.authenticatedContext(PATIENT_A, { email: 'A@EXAMPLE.COM' }).firestore();
    await assertSucceeds(setDoc(doc(db, 'usernames/newname'), ownEntry));
  });
  test("a username with someone else's uid is denied", async () => {
    await assertFails(setDoc(doc(patientA(), 'usernames/newname'), { ...ownEntry, uid: PATIENT_B }));
  });
  test('a username with an extra field is denied', async () => {
    await assertFails(setDoc(doc(patientA(), 'usernames/newname'), { ...ownEntry, role: 'admin' }));
  });
  test('a username with uppercase letters is denied', async () => {
    await assertFails(setDoc(doc(patientA(), 'usernames/NewName'), ownEntry));
  });
  test('overwriting an existing username is denied (even with own uid/email)', async () => {
    await assertFails(setDoc(doc(patientA(), 'usernames/patienta'), ownEntry));
  });
});

describe('isolation between patients', () => {
  test('A can update own profile', async () => {
    await assertSucceeds(updateDoc(doc(patientA(), `users/${PATIENT_A}`), { fullName: 'Renamed' }));
  });
  test("A cannot update B's profile", async () => {
    await assertFails(updateDoc(doc(patientA(), `users/${PATIENT_B}`), { fullName: 'Renamed' }));
  });

  for (const sub of ['snapshots', 'healthLogs', 'notifications']) {
    test(`A can read own ${sub}`, async () => {
      await assertSucceeds(getDocs(collection(patientA(), `users/${PATIENT_A}/${sub}`)));
    });
    test(`A cannot read B's ${sub}`, async () => {
      await assertFails(getDocs(collection(patientA(), `users/${PATIENT_B}/${sub}`)));
    });
  }

  test("A can comment under own snapshot", async () => {
    await assertSucceeds(addDoc(collection(patientA(), `users/${PATIENT_A}/snapshots/photo-${PATIENT_A}/comments`),
      comment({ userId: PATIENT_A, authorRole: 'user', authorName: 'Patient A' })));
  });
  test("A cannot comment under B's snapshot", async () => {
    await assertFails(addDoc(collection(patientA(), `users/${PATIENT_B}/snapshots/photo-${PATIENT_B}/comments`),
      comment({ userId: PATIENT_B, authorRole: 'user', authorName: 'Patient A' })));
  });

  // No client may create or delete appointments, so the "can" partner
  // is the same patient reaching the same path with an allowed operation.
  test('A can get own appointment (path/context sanity for the two below)', async () => {
    await assertSucceeds(getDoc(doc(patientA(), APPT)));
  });
  test('A cannot create an appointment', async () => {
    await assertFails(addDoc(collection(patientA(), `users/${PATIENT_A}/appointments`),
      { status: 'upcoming', doctor: DOC_ASSIGNED.doctorName, date: '2026-11-01' }));
  });
  test('A cannot delete an appointment', async () => {
    await assertFails(deleteDoc(doc(patientA(), APPT)));
  });
});

describe('other write paths', () => {
  const NOTIF = `users/${PATIENT_A}/notifications/n1`;
  const LOGS = `users/${PATIENT_A}/healthLogs`;

  test('A can mark a notification read', async () => {
    await assertSucceeds(updateDoc(doc(patientA(), NOTIF), { read: true }));
  });
  test('A cannot change another field on a notification', async () => {
    await assertFails(updateDoc(doc(patientA(), NOTIF), { title: 'Edited' }));
  });
  test('A cannot change another field together with read', async () => {
    await assertFails(updateDoc(doc(patientA(), NOTIF), { read: true, title: 'Edited' }));
  });
  test('A can append a healthLog', async () => {
    await assertSucceeds(addDoc(collection(patientA(), LOGS), { weight: 61, loggedAt: Timestamp.now() }));
  });
  test('A cannot update a healthLog', async () => {
    await assertFails(updateDoc(doc(patientA(), `${LOGS}/log1`), { weight: 99 }));
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

describe('patient A: appointment requests', () => {
  const REQ = `users/${PATIENT_A}/appointmentRequests/req1`;
  const newRequest = (overrides = {}) => ({
    userId: PATIENT_A,
    type: 'Prenatal Checkup',
    options: [{ date: '2026-11-03', from: '09:00', to: '10:30' }],
    reason: 'Routine checkup',
    notes: 'Mornings are easier',
    icon: '🩺',
    accentColor: 'purple',
    status: 'pending',
    createdAt: serverTimestamp(),
    ...overrides,
  });
  const seed = (data) => env.withSecurityRulesDisabled(ctx =>
    setDoc(doc(ctx.firestore(), REQ), { ...newRequest(), createdAt: Timestamp.now(), ...data }));

  test('can create a valid request (one or two options, notes optional)', async () => {
    await assertSucceeds(setDoc(doc(patientA(), REQ), newRequest()));
    const { notes, ...noNotes } = newRequest({
      options: [{ date: '2026-11-03', from: '09:00', to: '10:30' }, { date: '2026-11-05', from: '14:00', to: '14:30' }],
      type: 'Other', icon: '👩‍⚕️',
    });
    await assertSucceeds(setDoc(doc(patientA(), `users/${PATIENT_A}/appointmentRequests/req2`), noNotes));
  });
  test("cannot create under patient B's account or with another userId", async () => {
    await assertFails(setDoc(doc(patientA(), `users/${PATIENT_B}/appointmentRequests/req1`), newRequest({ userId: PATIENT_B })));
    await assertFails(setDoc(doc(patientA(), REQ), newRequest({ userId: PATIENT_B })));
  });
  test('cannot create with a status other than pending', async () => {
    await assertFails(setDoc(doc(patientA(), REQ), newRequest({ status: 'scheduled' })));
  });
  test('cannot create with an extra or server-only field', async () => {
    await assertFails(setDoc(doc(patientA(), REQ), newRequest({ adminNote: 'ok' })));
    await assertFails(setDoc(doc(patientA(), REQ), newRequest({ appointmentId: 'appt1' })));
    await assertFails(setDoc(doc(patientA(), REQ), newRequest({ role: 'admin' })));
  });
  test('cannot create oversize, empty or malformed values', async () => {
    const slot = { date: '2026-11-03', from: '09:00', to: '10:00' };
    for (const bad of [
      { reason: 'x'.repeat(301) }, { reason: '' }, { notes: 'x'.repeat(501) },
      { options: [] }, { options: [slot, slot, slot] },
      { options: [{ ...slot, from: '10:00', to: '09:00' }] }, { options: [{ ...slot, from: '09:15' }] },
      { options: [{ ...slot, date: '03/11/2026' }] }, { options: [{ ...slot, extra: 1 }] },
      { type: 'Surgery' }, { icon: '🚀' }, { accentColor: 'red' }, { createdAt: Timestamp.now() },
    ]) {
      await assertFails(setDoc(doc(patientA(), REQ), newRequest(bad)));
    }
  });
  test('cannot write the same id twice', async () => {
    await assertSucceeds(setDoc(doc(patientA(), REQ), newRequest()));
    await assertFails(setDoc(doc(patientA(), REQ), newRequest({ reason: 'Changed' })));
  });
  test('can withdraw a pending request', async () => {
    await seed({});
    await assertSucceeds(updateDoc(doc(patientA(), REQ), { status: 'withdrawn', withdrawnAt: serverTimestamp() }));
  });
  test('forbidden transitions and edits', async () => {
    await seed({});
    await assertFails(updateDoc(doc(patientA(), REQ), { status: 'scheduled' }));
    await assertFails(updateDoc(doc(patientA(), REQ), { status: 'withdrawn', withdrawnAt: serverTimestamp(), reason: 'x' }));
    await assertFails(updateDoc(doc(patientA(), REQ), { status: 'withdrawn', withdrawnAt: Timestamp.now() }));
    await assertFails(updateDoc(doc(patientA(), REQ), { reason: 'Edited' }));
    await assertFails(deleteDoc(doc(patientA(), REQ)));
    for (const status of ['scheduled', 'declined', 'withdrawn']) {
      await seed({ status });
      await assertFails(updateDoc(doc(patientA(), REQ), { status: 'withdrawn', withdrawnAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(patientA(), REQ), { status: 'pending' }));
    }
  });
  test('the owner can read her own requests; patient B cannot', async () => {
    await seed({});
    await assertSucceeds(getDoc(doc(patientA(), REQ)));
    await assertSucceeds(getDocs(collection(patientA(), `users/${PATIENT_A}/appointmentRequests`)));
    const patientB = env.authenticatedContext(PATIENT_B, { email: 'b@example.com' }).firestore();
    await assertFails(getDoc(doc(patientB, REQ)));
    await assertFails(getDocs(collectionGroup(patientA(), 'appointmentRequests')));
  });
  test('an admin can read one request and all of them (collection group), but not write', async () => {
    await seed({});
    await assertSucceeds(getDoc(doc(admin(), REQ)));
    await assertSucceeds(getDocs(collectionGroup(admin(), 'appointmentRequests')));
    await assertFails(updateDoc(doc(admin(), REQ), { status: 'scheduled' }));
  });
  test('doctors cannot read requests, even for an assigned patient', async () => {
    await seed({});
    await assertFails(getDoc(doc(doctor(DOC_ASSIGNED), REQ)));
    await assertFails(getDocs(collection(doctor(DOC_ASSIGNED), `users/${PATIENT_A}/appointmentRequests`)));
    await assertFails(getDocs(collectionGroup(doctor(DOC_ASSIGNED), 'appointmentRequests')));
  });
});

describe('appointments: collection-group read (dashboard live cancellations)', () => {
  test('an admin can read all appointments at once', async () => {
    await assertSucceeds(getDocs(collectionGroup(admin(), 'appointments')));
  });
  test('an assigned doctor cannot', async () => {
    await assertFails(getDocs(collectionGroup(doctor(DOC_ASSIGNED), 'appointments')));
  });
  test('a patient cannot', async () => {
    await assertFails(getDocs(collectionGroup(patientA(), 'appointments')));
  });
  test('a signed-out user cannot', async () => {
    await assertFails(getDocs(collectionGroup(signedOut(), 'appointments')));
  });
});
