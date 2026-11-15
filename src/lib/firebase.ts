/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Firebase Initialization, Google Authentication & Mandatory Firestore Error Handler
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const BOOTSTRAPPED_ADMIN_EMAIL = 'salemjalaal1@gmail.com';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration. ');
      return false;
    }
    return true;
  }
}

const inFlightUserProfiles = new Map<string, Promise<void>>();

export async function ensureCloudUserProfile(
  user: User,
  preferredRole: 'manager' | 'driver' = 'manager'
): Promise<void> {
  const existingPromise = inFlightUserProfiles.get(user.uid);
  if (existingPromise) {
    return existingPromise;
  }

  const run = (async () => {
    const isBootstrappedAdmin =
      (user.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
    const safeRole = isBootstrappedAdmin ? preferredRole : 'driver';
    const displayName = (user.displayName || user.email || 'مستخدم مياهنا').trim().slice(0, 120);

    // Ensure admin entry if bootstrapped admin
    if (isBootstrappedAdmin) {
      const adminRef = doc(db, 'admins', user.uid);
      try {
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
          await setDoc(adminRef, {
            uid: user.uid,
            email: (user.email || '').slice(0, 254),
            serverCreatedAt: serverTimestamp(),
            serverUpdatedAt: serverTimestamp(),
          });
        }
      } catch {
        // Non-fatal if already handled or rules forbid re-create
      }
    }

    // Public profile (/users/{uid})
    const userRef = doc(db, 'users', user.uid);
    try {
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          displayName,
          role: safeRole,
          ownerId: user.uid,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        });
      } else {
        const existing = userSnap.data();
        await setDoc(userRef, {
          uid: user.uid,
          displayName,
          role: existing.role || safeRole,
          ownerId: existing.ownerId || user.uid,
          serverCreatedAt: existing.serverCreatedAt || serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }

    // Private PII profile (/users/{uid}/private/info)
    const privRef = doc(db, 'users', user.uid, 'private', 'info');
    try {
      const privSnap = await getDoc(privRef);
      const email = (user.email || '').slice(0, 254);
      if (!privSnap.exists()) {
        await setDoc(privRef, {
          uid: user.uid,
          email,
          ownerId: user.uid,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        });
      } else {
        const existing = privSnap.data();
        await setDoc(privRef, {
          uid: user.uid,
          email,
          ...(existing.phone ? { phone: String(existing.phone).slice(0, 32) } : {}),
          ownerId: existing.ownerId || user.uid,
          serverCreatedAt: existing.serverCreatedAt || serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/private/info`);
    }
  })().finally(() => {
    inFlightUserProfiles.delete(user.uid);
  });

  inFlightUserProfiles.set(user.uid, run);
  return run;
}

export async function signInWithGoogle(
  preferredRole: 'manager' | 'driver' = 'manager'
): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  await ensureCloudUserProfile(result.user, preferredRole);
  return result.user;
}

export async function signOutCloud(): Promise<void> {
  await signOut(auth);
}

export async function getCloudIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}
