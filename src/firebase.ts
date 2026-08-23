import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId,
);

export const TRIP_ID = import.meta.env.VITE_TRIP_ID || "ny-2026-09";

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;

export type AuthStatus =
  | { state: "disabled" }
  | { state: "pending" }
  | { state: "ok"; uid: string }
  | { state: "error"; code: string; message: string };

let currentAuth: AuthStatus = isFirebaseConfigured ? { state: "pending" } : { state: "disabled" };
const authListeners = new Set<(s: AuthStatus) => void>();

function setAuth(next: AuthStatus) {
  currentAuth = next;
  authListeners.forEach((cb) => cb(next));
}

export function getAuthStatus(): AuthStatus {
  return currentAuth;
}

export function subscribeAuthStatus(cb: (s: AuthStatus) => void): () => void {
  authListeners.add(cb);
  cb(currentAuth);
  return () => authListeners.delete(cb);
}

// Resolves once an anonymous session is ready so Firestore reads/writes are
// allowed by security rules that require request.auth != null.
//
// A failure here is not cosmetic: without a signed-in user every read and
// write is rejected, and the app looks like it simply doesn't save. The
// outcome is recorded so the settings screen can say what went wrong.
export const authReady: Promise<void> = new Promise((resolve) => {
  if (!auth) {
    resolve();
    return;
  }
  onAuthStateChanged(auth, (user) => {
    if (user) {
      setAuth({ state: "ok", uid: user.uid });
      resolve();
    } else {
      signInAnonymously(auth)
        .then((cred) => {
          setAuth({ state: "ok", uid: cred.user.uid });
          resolve();
        })
        .catch((err: { code?: string; message?: string }) => {
          console.error("anonymous sign-in failed", err);
          setAuth({
            state: "error",
            code: err?.code ?? "unknown",
            message: err?.message ?? String(err),
          });
          resolve();
        });
    }
  });
});
