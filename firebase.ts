import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// TODO: Add your Firebase config here.
// Get this from: Firebase Console > Project Settings > General > Your apps > SDK setup and configuration
const firebaseConfig = {
  apiKey: "AIzaSyAPPC4iXYhSGH5_wUghb2Wts7fGPmqtBPE",
  authDomain: "pingstudio-backend.firebaseapp.com",
  projectId: "pingstudio-backend",
  storageBucket: "pingstudio-backend.firebasestorage.app",
  messagingSenderId: "13328994180",
  appId: "1:13328994180:web:065fbf49194fed95a2d7d1",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
