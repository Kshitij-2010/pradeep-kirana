import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAXUJSlNo1ncGw4IjkZjlO_LnbUKR3YPdI",
  authDomain: "pradeep-kirana-store-bfff1.firebaseapp.com",
  projectId: "pradeep-kirana-store-bfff1",
  storageBucket: "pradeep-kirana-store-bfff1.firebasestorage.app",
  messagingSenderId: "445739510579",
  appId: "1:445739510579:web:040818d41177d77d112c46",
  measurementId: "G-8J091D6JKJ"
};

// Initialize Firebase (Next.js ke liye safe tarika)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Database, Auth aur Google Provider ko setup karna
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Analytics sirf browser mein chalti hai, isliye ye safe check lagana zaroori hai
let analytics;
if (typeof window !== "undefined") {
  isSupported().then((yes) => yes ? analytics = getAnalytics(app) : null);
}

// In sabko export kar rahe hain taaki poori app mein inhe use kar sakein
export { db, auth, googleProvider, analytics };