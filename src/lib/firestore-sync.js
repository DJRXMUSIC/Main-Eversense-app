import {
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
  collection,
} from 'firebase/firestore';
import { db, USER_ID } from './firebase';

// ── Collection refs ──────────────────────────────────────────────
function bolusCol() {
  return collection(db, 'users', USER_ID, 'bolusDoses');
}
function basalCol() {
  return collection(db, 'users', USER_ID, 'basalDoses');
}
function settingsDoc() {
  return doc(db, 'users', USER_ID, 'meta', 'settings');
}

// ── Push (fire-and-forget after local writes) ────────────────────

export function pushBolus(dose) {
  setDoc(doc(bolusCol(), dose.id), dose).catch((e) =>
    console.error('Firestore pushBolus:', e)
  );
}

export function pushBasal(dose) {
  setDoc(doc(basalCol(), dose.id), dose).catch((e) =>
    console.error('Firestore pushBasal:', e)
  );
}

export function pushBolusUpdate(id, updates) {
  setDoc(doc(bolusCol(), id), updates, { merge: true }).catch((e) =>
    console.error('Firestore pushBolusUpdate:', e)
  );
}

export function pushBasalUpdate(id, updates) {
  setDoc(doc(basalCol(), id), updates, { merge: true }).catch((e) =>
    console.error('Firestore pushBasalUpdate:', e)
  );
}

export function removeCloudBolus(id) {
  deleteDoc(doc(bolusCol(), id)).catch((e) =>
    console.error('Firestore removeCloudBolus:', e)
  );
}

export function removeCloudBasal(id) {
  deleteDoc(doc(basalCol(), id)).catch((e) =>
    console.error('Firestore removeCloudBasal:', e)
  );
}

export function pushSetting(key, value) {
  setDoc(settingsDoc(), { [key]: value }, { merge: true }).catch((e) =>
    console.error('Firestore pushSetting:', e)
  );
}

// ── Pull (on app load — returns cloud data to merge locally) ─────

export async function pullAllData() {
  try {
    const [bolusSnap, basalSnap, settingsSnap] = await Promise.all([
      getDocs(bolusCol()),
      getDocs(basalCol()),
      getDoc(settingsDoc()),
    ]);

    const bolusDoses = [];
    bolusSnap.forEach((d) => bolusDoses.push(d.data()));

    const basalDoses = [];
    basalSnap.forEach((d) => basalDoses.push(d.data()));

    const settings = settingsSnap.exists() ? settingsSnap.data() : {};

    return { bolusDoses, basalDoses, settings };
  } catch (e) {
    console.error('Firestore pullAllData:', e);
    return null;
  }
}
