import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy, limit, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail
} from "firebase/auth";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

function validateOwnerFirebaseConfig(cfg) {
  const missing = [];
  if (!cfg.apiKey || cfg.apiKey.includes('your_')) missing.push('VITE_FIREBASE_API_KEY');
  if (!cfg.projectId || cfg.projectId.includes('your_')) missing.push('VITE_FIREBASE_PROJECT_ID');
  if (!cfg.authDomain || cfg.authDomain.includes('your_')) missing.push('VITE_FIREBASE_AUTH_DOMAIN');
  if (!cfg.appId || cfg.appId.includes('your_')) missing.push('VITE_FIREBASE_APP_ID');

  if (missing.length > 0) {
    console.warn(
      `🚨 [Owner Portal] Missing or unconfigured credentials in surya-tex-owner/.env:\n` +
      missing.map((v) => `   - ${v}`).join('\n') +
      `\nPlease paste your Firebase Web App keys into surya-tex-owner/.env.`
    );
  }
}
validateOwnerFirebaseConfig(firebaseConfig);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Connect to local emulators only when explicitly enabled in local development
if (typeof window !== "undefined" && import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true") {
  try {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  } catch (e) {
    // Ignore already connected warnings
  }
}

export {
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  limit,
  ref,
  uploadBytes,
  getDownloadURL,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  httpsCallable
};

export default app;
