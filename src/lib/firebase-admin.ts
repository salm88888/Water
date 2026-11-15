/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Firebase Admin SDK Initialization (Backend Token Verification)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

export const adminAuth = getAuth();
