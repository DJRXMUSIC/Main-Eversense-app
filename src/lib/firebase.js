import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Firebase web API keys are safe to expose client-side — they only identify
// the project. Access control is enforced by Firestore Security Rules.
const firebaseConfig = {
  apiKey: 'AIzaSyCOGMZ6s0ykaxvHJ3MTxl_nHN_uw0jY7f4',
  authDomain: 'supercharged-app-84a60.firebaseapp.com',
  projectId: 'supercharged-app-84a60',
  storageBucket: 'supercharged-app-84a60.firebasestorage.app',
  messagingSenderId: '1067594783739',
  appId: '1:1067594783739:web:7bbd3f0f0515780d81895e',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const USER_ID = 'user-primary';
