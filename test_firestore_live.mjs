import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, addDoc, deleteDoc } from 'firebase/firestore';
import fs from 'fs';

function loadEnv() {
  const envContent = fs.readFileSync('.env', 'utf-8');
  const env = {};
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  return env;
}

const env = loadEnv();
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  try {
    console.log('1. Signing in with achudharaa@gmail.com...');
    const cred = await signInWithEmailAndPassword(auth, 'achudharaa@gmail.com', 'SriSuryaTex@2026');
    console.log('✅ Signed in successfully! UID:', cred.user.uid, 'Email:', cred.user.email);

    console.log('2. Testing READ from products collection...');
    try {
      const snap = await getDocs(collection(db, 'products'));
      console.log(`✅ Read products succeeded! Found ${snap.docs.length} products.`);
    } catch (readErr) {
      console.error('❌ Read products failed:', readErr.code, readErr.message);
    }

    console.log('3. Testing WRITE to products collection...');
    try {
      const testDoc = await addDoc(collection(db, 'products'), {
        title: 'Diagnostic Test Mat',
        category: 'Handloom Mats',
        baseRate: 450,
        unit: 'per Bundle',
        bundlePieces: 10,
        bundlesPerPack: 8,
        inStock: true,
        createdAt: new Date().toISOString()
      });
      console.log('✅ Write to products succeeded! Doc ID:', testDoc.id);

      console.log('4. Testing DELETE from products collection...');
      await deleteDoc(doc(db, 'products', testDoc.id));
      console.log('✅ Delete from products succeeded!');
    } catch (writeErr) {
      console.error('❌ Write/Delete products failed:', writeErr.code, writeErr.message);
    }

    console.log('5. Testing READ from settings/store_config...');
    try {
      const snap = await getDoc(doc(db, 'settings', 'store_config'));
      console.log('✅ Read settings succeeded! Data:', snap.data());
    } catch (rErr) {
      console.error('❌ Read settings failed:', rErr.code, rErr.message);
    }

    console.log('6. Testing WRITE to settings/store_config...');
    try {
      await setDoc(doc(db, 'settings', 'store_config'), {
        hidePrices: true,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log('✅ Write to settings succeeded!');
    } catch (wErr) {
      console.error('❌ Write to settings failed:', wErr.code, wErr.message);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Fatal Error:', err.code, err.message);
    process.exit(1);
  }
}

run();
