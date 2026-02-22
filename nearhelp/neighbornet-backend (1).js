/**
 * NeighborNet — Firebase Backend
 * ================================
 * Stack: Firebase Authentication + Firestore + Cloud Messaging (FCM)
 * Install: npm install firebase
 * Usage:   import { auth, db, ... } from './neighbornet-backend.js'
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  GeoPoint,
} from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// ─────────────────────────────────────────────
//  1. FIREBASE CONFIGURATION
//     Replace with your actual Firebase project config
// ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export const messaging = getMessaging(app);

// ─────────────────────────────────────────────
//  2. CONSTANTS & HELPERS
// ─────────────────────────────────────────────
const RADIUS_KM = 2;           // default search radius

/**
 * Haversine formula — calculate distance between two lat/lng points.
 * @returns distance in kilometres
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Get approximate bounding box coordinates for a lat/lng + radius.
 * Used to pre-filter Firestore results.
 */
function getBoundingBox(lat, lng, radiusKm) {
  const degPerKm = 1 / 111;
  return {
    minLat: lat - radiusKm * degPerKm,
    maxLat: lat + radiusKm * degPerKm,
    minLng: lng - radiusKm * (degPerKm / Math.cos((lat * Math.PI) / 180)),
    maxLng: lng + radiusKm * (degPerKm / Math.cos((lat * Math.PI) / 180)),
  };
}

// ─────────────────────────────────────────────
//  3. AUTHENTICATION MODULE
// ─────────────────────────────────────────────

/**
 * Register a new user with email + password, then create their Firestore profile.
 */
export async function registerWithEmail(email, password, profileData) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await createUserProfile(cred.user.uid, {
      email,
      ...profileData,
    });
    return { success: true, user: cred.user };
  } catch (err) {
    console.error('Registration error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Login with email + password.
 */
export async function loginWithEmail(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: cred.user };
  } catch (err) {
    console.error('Login error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send OTP to phone number.
 * @param {string} phoneNumber  e.g. "+919876543210"
 * @param {HTMLElement} buttonEl  DOM element used as reCAPTCHA anchor
 */
export async function sendOTP(phoneNumber, buttonEl) {
  try {
    const recaptcha = new RecaptchaVerifier(auth, buttonEl, { size: 'invisible' });
    const confirmation = await signInWithPhoneNumber(auth, phoneNumber, recaptcha);
    return { success: true, confirmation };
  } catch (err) {
    console.error('OTP error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Verify OTP code returned from sendOTP().
 */
export async function verifyOTP(confirmationResult, otpCode) {
  try {
    const cred = await confirmationResult.confirm(otpCode);
    return { success: true, user: cred.user };
  } catch (err) {
    console.error('OTP verify error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Logout current user.
 */
export async function logout() {
  await signOut(auth);
}

/**
 * Subscribe to auth state changes.
 * @param {Function} callback  Called with user object or null
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ─────────────────────────────────────────────
//  4. USER PROFILE MODULE
// ─────────────────────────────────────────────

/**
 * Create a user profile document in Firestore.
 * @param {string} uid
 * @param {object} data  { name, phone, email, location: {lat, lng}, userType }
 */
export async function createUserProfile(uid, data) {
  const userRef = doc(db, 'users', uid);
  await setDoc(userRef, {
    uid,
    name: data.name || '',
    phone: data.phone || '',
    email: data.email || '',
    location: data.location
      ? new GeoPoint(data.location.lat, data.location.lng)
      : null,
    userType: data.userType || 'general',   // 'general' | 'elder' | 'volunteer'
    isVolunteer: false,
    acceptEmergencyAlerts: false,
    radiusKm: RADIUS_KM,
    rating: 0,
    ratingCount: 0,
    fcmToken: null,
    createdAt: serverTimestamp(),
  });
}

/**
 * Fetch a user's profile.
 */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

/**
 * Update user location (called after getting GPS coords).
 */
export async function updateUserLocation(uid, lat, lng) {
  await updateDoc(doc(db, 'users', uid), {
    location: new GeoPoint(lat, lng),
  });
}

/**
 * Update user FCM token for push notifications.
 */
export async function saveFCMToken(uid, token) {
  await updateDoc(doc(db, 'users', uid), { fcmToken: token });
}

/**
 * Toggle volunteer / emergency-alert availability.
 */
export async function updateVolunteerStatus(uid, isVolunteer, acceptEmergency) {
  await updateDoc(doc(db, 'users', uid), {
    isVolunteer,
    acceptEmergencyAlerts: acceptEmergency,
  });
}

// ─────────────────────────────────────────────
//  5. POSTS MODULE (Items & Help Offers)
// ─────────────────────────────────────────────

/**
 * Create a new post (item listing or help offer).
 * @param {object} postData
 *   type:        'item' | 'help'
 *   title, description
 *   category
 *   location:    { lat, lng }
 *   radiusKm
 *   availability: string
 *   depositAmount: number (optional)
 *   imageUrl: string (optional)
 *   isPaid: boolean
 */
export async function createPost(uid, postData) {
  try {
    const docRef = await addDoc(collection(db, 'posts'), {
      userID: uid,
      type: postData.type,
      title: postData.title,
      description: postData.description,
      category: postData.category || '',
      location: new GeoPoint(postData.location.lat, postData.location.lng),
      radiusKm: postData.radiusKm || RADIUS_KM,
      availability: postData.availability || '',
      depositAmount: postData.depositAmount || 0,
      imageUrl: postData.imageUrl || null,
      isPaid: postData.isPaid || false,
      status: 'active',    // 'active' | 'borrowed' | 'completed' | 'cancelled'
      createdAt: serverTimestamp(),
    });
    return { success: true, postId: docRef.id };
  } catch (err) {
    console.error('Create post error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch posts within user's radius.
 * Strategy: bounding-box pre-filter in Firestore, then precise haversine filter.
 * @param {number} lat  User's latitude
 * @param {number} lng  User's longitude
 * @param {number} radiusKm  Search radius (default 2)
 * @param {string} type  'item' | 'help' | 'all'
 */
export async function getNearbyPosts(lat, lng, radiusKm = RADIUS_KM, type = 'all') {
  try {
    const box = getBoundingBox(lat, lng, radiusKm);

    let q = query(
      collection(db, 'posts'),
      where('status', '==', 'active'),
      orderBy('location'),
      limit(100)
    );

    if (type !== 'all') {
      q = query(
        collection(db, 'posts'),
        where('status', '==', 'active'),
        where('type', '==', type),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
    }

    const snap = await getDocs(q);
    const posts = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data.location) return;
      const dist = haversineDistance(
        lat, lng,
        data.location.latitude,
        data.location.longitude
      );
      if (dist <= radiusKm) {
        posts.push({ id: docSnap.id, ...data, distanceKm: dist.toFixed(1) });
      }
    });

    posts.sort((a, b) => a.distanceKm - b.distanceKm);
    return { success: true, posts };
  } catch (err) {
    console.error('Fetch posts error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Listen to nearby posts in real-time.
 * @returns Unsubscribe function
 */
export function subscribeToNearbyPosts(lat, lng, radiusKm = RADIUS_KM, callback) {
  const q = query(
    collection(db, 'posts'),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  return onSnapshot(q, (snap) => {
    const posts = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data.location) return;
      const dist = haversineDistance(
        lat, lng,
        data.location.latitude,
        data.location.longitude
      );
      if (dist <= radiusKm) {
        posts.push({ id: docSnap.id, ...data, distanceKm: dist.toFixed(1) });
      }
    });
    callback(posts.sort((a, b) => a.distanceKm - b.distanceKm));
  });
}

/**
 * Update a post's status.
 */
export async function updatePostStatus(postId, status) {
  await updateDoc(doc(db, 'posts', postId), { status });
}

/**
 * Delete a post (soft-delete via status change).
 */
export async function deletePost(postId) {
  await updateDoc(doc(db, 'posts', postId), { status: 'cancelled' });
}

// ─────────────────────────────────────────────
//  6. BORROW REQUEST MODULE
// ─────────────────────────────────────────────

/**
 * Send a borrow request for an item.
 */
export async function createBorrowRequest(requesterUID, postId, message = '') {
  try {
    const docRef = await addDoc(collection(db, 'requests'), {
      postID: postId,
      requesterID: requesterUID,
      message,
      status: 'pending',    // 'pending' | 'accepted' | 'rejected' | 'completed'
      createdAt: serverTimestamp(),
    });
    return { success: true, requestId: docRef.id };
  } catch (err) {
    console.error('Request error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Owner accepts or rejects a request.
 * When accepted, a chat session is automatically created.
 */
export async function respondToRequest(requestId, status, postId, ownerUID, requesterUID) {
  try {
    await updateDoc(doc(db, 'requests', requestId), { status });

    if (status === 'accepted') {
      await updatePostStatus(postId, 'borrowed');
      // Unlock chat between the two parties
      await createChatSession(ownerUID, requesterUID, requestId);
    }
    return { success: true };
  } catch (err) {
    console.error('Respond error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch all pending requests for posts owned by a user.
 */
export async function getRequestsForUser(uid) {
  const snap = await getDocs(
    query(collection(db, 'requests'), where('requesterID', '==', uid), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─────────────────────────────────────────────
//  7. CHAT MODULE
// ─────────────────────────────────────────────

/**
 * Create or fetch a chat session between two users.
 * Chat is only created when a request is accepted.
 * @returns chatId
 */
export async function createChatSession(uid1, uid2, requestId) {
  // Use sorted UIDs to ensure a deterministic chatId
  const chatId = [uid1, uid2].sort().join('_');
  const chatRef = doc(db, 'chats', chatId);
  const snap = await getDoc(chatRef);

  if (!snap.exists()) {
    await setDoc(chatRef, {
      participants: [uid1, uid2],
      requestId,
      createdAt: serverTimestamp(),
      lastMessage: null,
      lastMessageAt: null,
    });
  }
  return chatId;
}

/**
 * Fetch all chats for a user.
 */
export async function getUserChats(uid) {
  const snap = await getDocs(
    query(collection(db, 'chats'), where('participants', 'array-contains', uid))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Send a message in a chat session.
 */
export async function sendMessage(chatId, senderUID, content) {
  try {
    const msgRef = await addDoc(collection(db, 'chats', chatId, 'messages'), {
      senderID: senderUID,
      content,
      timestamp: serverTimestamp(),
      read: false,
    });

    // Update chat's lastMessage metadata
    await updateDoc(doc(db, 'chats', chatId), {
      lastMessage: content,
      lastMessageAt: serverTimestamp(),
    });

    return { success: true, messageId: msgRef.id };
  } catch (err) {
    console.error('Send message error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Subscribe to messages in a chat — real-time listener.
 * @returns Unsubscribe function
 */
export function subscribeToMessages(chatId, callback) {
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('timestamp', 'asc')
  );
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(msgs);
  });
}

/**
 * Mark all messages in a chat as read for a given user.
 */
export async function markMessagesRead(chatId, uid) {
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    where('senderID', '!=', uid),
    where('read', '==', false)
  );
  const snap = await getDocs(q);
  const updates = snap.docs.map(d => updateDoc(d.ref, { read: true }));
  await Promise.all(updates);
}

/**
 * Block or report a user.
 */
export async function blockUser(reporterUID, blockedUID, reason = '') {
  await addDoc(collection(db, 'reports'), {
    reporterID: reporterUID,
    blockedID: blockedUID,
    reason,
    createdAt: serverTimestamp(),
  });
  // Add to reporter's blocked list
  await updateDoc(doc(db, 'users', reporterUID), {
    blockedUsers: blockedUID,   // frontend should use arrayUnion
  });
}

// ─────────────────────────────────────────────
//  8. EMERGENCY / SOS MODULE
// ─────────────────────────────────────────────

/**
 * Trigger an SOS alert.
 * - Creates an emergency document in Firestore
 * - Nearby volunteers with acceptEmergencyAlerts=true are notified via FCM
 *   (FCM fan-out is done by a Cloud Function triggered on this collection)
 *
 * @param {string} uid     Triggering user's UID
 * @param {number} lat     Current latitude
 * @param {number} lng     Current longitude
 * @param {string} type    'medical' | 'general' | 'fire' | 'other'
 */
export async function triggerSOS(uid, lat, lng, type = 'general') {
  try {
    const docRef = await addDoc(collection(db, 'emergencies'), {
      userID: uid,
      location: new GeoPoint(lat, lng),
      type,
      status: 'active',    // 'active' | 'resolved'
      respondedBy: [],
      createdAt: serverTimestamp(),
    });
    return { success: true, emergencyId: docRef.id };
  } catch (err) {
    console.error('SOS error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Volunteer responds to an SOS alert.
 */
export async function respondToSOS(emergencyId, volunteerUID) {
  // arrayUnion equivalent with updateDoc
  const ref = doc(db, 'emergencies', emergencyId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const current = snap.data().respondedBy || [];
    if (!current.includes(volunteerUID)) {
      await updateDoc(ref, { respondedBy: [...current, volunteerUID] });
    }
  }
}

/**
 * Resolve / close an SOS alert.
 */
export async function resolveSOS(emergencyId) {
  await updateDoc(doc(db, 'emergencies', emergencyId), { status: 'resolved' });
}

// ─────────────────────────────────────────────
//  9. RATINGS MODULE
// ─────────────────────────────────────────────

/**
 * Submit a rating for a user after an interaction.
 * @param {string} reviewerUID
 * @param {string} reviewedUID
 * @param {string} requestId    Associated request (for deduplication)
 * @param {number} stars        1–5
 * @param {string} comment      Optional text feedback
 */
export async function submitRating(reviewerUID, reviewedUID, requestId, stars, comment = '') {
  try {
    // Prevent duplicate reviews for same request
    await addDoc(collection(db, 'ratings'), {
      reviewerID: reviewerUID,
      reviewedID: reviewedUID,
      requestId,
      stars,
      comment,
      createdAt: serverTimestamp(),
    });

    // Recalculate user's average rating
    const ratingsSnap = await getDocs(
      query(collection(db, 'ratings'), where('reviewedID', '==', reviewedUID))
    );
    const allRatings = ratingsSnap.docs.map(d => d.data().stars);
    const avg = allRatings.reduce((a, b) => a + b, 0) / allRatings.length;

    await updateDoc(doc(db, 'users', reviewedUID), {
      rating: parseFloat(avg.toFixed(2)),
      ratingCount: allRatings.length,
    });

    return { success: true };
  } catch (err) {
    console.error('Rating error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch all reviews for a user.
 */
export async function getUserRatings(uid) {
  const snap = await getDocs(
    query(collection(db, 'ratings'), where('reviewedID', '==', uid), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─────────────────────────────────────────────
//  10. PUSH NOTIFICATIONS (FCM)
// ─────────────────────────────────────────────

const FCM_VAPID_KEY = 'YOUR_VAPID_PUBLIC_KEY'; // From Firebase console

/**
 * Request notification permission and get FCM token.
 * Call this after user logs in.
 */
export async function initPushNotifications(uid) {
  try {
    const token = await getToken(messaging, { vapidKey: FCM_VAPID_KEY });
    if (token) {
      await saveFCMToken(uid, token);
      console.log('FCM token saved:', token);
    }
    return token;
  } catch (err) {
    console.error('FCM token error:', err.message);
    return null;
  }
}

/**
 * Handle foreground push messages.
 * @param {Function} handler  Called with { title, body, data }
 */
export function onPushMessage(handler) {
  onMessage(messaging, (payload) => {
    handler({
      title: payload.notification?.title,
      body: payload.notification?.body,
      data: payload.data,
    });
  });
}

// ─────────────────────────────────────────────
//  11. NEARBY VOLUNTEERS MODULE
// ─────────────────────────────────────────────

/**
 * Fetch all active volunteers near a location.
 */
export async function getNearbyVolunteers(lat, lng, radiusKm = RADIUS_KM) {
  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('isVolunteer', '==', true))
    );
    const volunteers = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (!data.location) return;
      const dist = haversineDistance(lat, lng, data.location.latitude, data.location.longitude);
      if (dist <= radiusKm) {
        volunteers.push({ uid: docSnap.id, ...data, distanceKm: dist.toFixed(1) });
      }
    });
    return { success: true, volunteers: volunteers.sort((a, b) => a.distanceKm - b.distanceKm) };
  } catch (err) {
    console.error('Volunteers fetch error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────
//  12. USAGE EXAMPLES (for reference)
// ─────────────────────────────────────────────
/*

// 1. Register a new user
const result = await registerWithEmail('ravi@email.com', 'Password@123', {
  name: 'Ravi Kumar',
  phone: '+919876543210',
  location: { lat: 9.9312, lng: 76.2673 },
  userType: 'general',
});

// 2. Login
const login = await loginWithEmail('ravi@email.com', 'Password@123');

// 3. Post an item for lending
const post = await createPost(auth.currentUser.uid, {
  type: 'item',
  title: 'Cordless Drill',
  description: 'Good condition, 18V. Available for up to 5 days.',
  category: 'Tools & Hardware',
  location: { lat: 9.9312, lng: 76.2673 },
  radiusKm: 2,
});

// 4. Get nearby posts
const feed = await getNearbyPosts(9.9312, 76.2673, 2, 'all');
console.log(feed.posts);

// 5. Subscribe to real-time feed
const unsubscribe = subscribeToNearbyPosts(9.9312, 76.2673, 2, (posts) => {
  console.log('Feed updated:', posts);
});
// later: unsubscribe();

// 6. Send a borrow request
const req = await createBorrowRequest(auth.currentUser.uid, post.postId, "Need it this Saturday!");

// 7. Accept request & unlock chat
await respondToRequest(req.requestId, 'accepted', post.postId, ownerUID, requesterUID);

// 8. Chat
const chatId = await createChatSession(ownerUID, requesterUID, req.requestId);
await sendMessage(chatId, auth.currentUser.uid, "Hey! The drill is ready for pickup.");

// Subscribe to messages
const unsubMsg = subscribeToMessages(chatId, (messages) => {
  console.log('Messages:', messages);
});

// 9. SOS alert
await triggerSOS(auth.currentUser.uid, 9.9312, 76.2673, 'medical');

// 10. Submit a rating after transaction
await submitRating(requesterUID, ownerUID, req.requestId, 5, "Very helpful neighbor!");

*/

export default {
  auth, db,
  registerWithEmail, loginWithEmail, sendOTP, verifyOTP, logout, onAuthChange,
  createUserProfile, getUserProfile, updateUserLocation, updateVolunteerStatus,
  createPost, getNearbyPosts, subscribeToNearbyPosts, updatePostStatus, deletePost,
  createBorrowRequest, respondToRequest, getRequestsForUser,
  createChatSession, getUserChats, sendMessage, subscribeToMessages, markMessagesRead, blockUser,
  triggerSOS, respondToSOS, resolveSOS,
  submitRating, getUserRatings,
  initPushNotifications, onPushMessage,
  getNearbyVolunteers,
};
