import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDymxI8KZYiIV9h5AJwdq-szMPJY7RZPCc",
  authDomain: "skinbri-shop-928cd.firebaseapp.com",
  projectId: "skinbri-shop-928cd",
  storageBucket: "skinbri-shop-928cd.firebasestorage.app",
  messagingSenderId: "416247849384",
  appId: "1:416247849384:web:1e137b57a9441607357d9d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);