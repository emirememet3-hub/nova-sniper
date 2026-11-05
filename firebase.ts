/** NOVA SİPER Firebase client integration using Google's official compat SDK CDN. */
export const firebaseConfig = {
  apiKey: "AIzaSyCg_LFDgP-Ac7CQ7mcvNTBd4Vd_-YtaE",
  authDomain: "nova-96b53.firebaseapp.com",
  projectId: "nova-96b53",
  storageBucket: "nova-96b53.firebasestorage.app",
  messagingSenderId: "586954352853",
  appId: "1:586954352853:web:1ad85e5ebf05b5dbe01a5c",
  measurementId: "G-H8SY4PY8EL",
};

declare global { interface Window { firebase?: any } }
let sdkPromise: Promise<any> | null = null;
function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.loaded === "true") return resolve();
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Firebase SDK yüklenemedi.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src; script.async = true;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = () => reject(new Error("Firebase SDK yüklenemedi. İnternet bağlantını kontrol et."));
    document.head.appendChild(script);
  });
}
export function getFirebase() {
  if (typeof window === "undefined") return Promise.reject(new Error("Firebase tarayıcıda başlatılabilir."));
  if (!sdkPromise) sdkPromise = (async () => {
    const v = "10.14.1";
    await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-app-compat.js`);
    await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-auth-compat.js`);
    await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore-compat.js`);
    const fb = window.firebase;
    if (!fb) throw new Error("Firebase SDK bulunamadı.");
    if (!fb.apps.length) fb.initializeApp(firebaseConfig);
    return fb;
  })().catch((e) => { sdkPromise = null; throw e; });
  return sdkPromise;
}
export type OnlinePilot = { uid: string; name: string; score: number; wave: number; at: number };
export async function signInWithGoogle() {
  const fb = await getFirebase(); const provider = new fb.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const auth = fb.auth();
  if (window.matchMedia("(pointer: coarse)").matches) { await auth.signInWithRedirect(provider); return null; }
  return (await auth.signInWithPopup(provider)).user;
}
export async function signOutGoogle() { const fb = await getFirebase(); await fb.auth().signOut(); }
export async function watchPilot(callback: (user: any) => void) { const fb = await getFirebase(); return fb.auth().onAuthStateChanged(callback); }
export async function fetchOnlineScores(): Promise<OnlinePilot[]> {
  const fb = await getFirebase();
  const snap = await fb.firestore().collection("leaderboard").orderBy("score", "desc").limit(20).get();
  return snap.docs.map((doc: any) => doc.data() as OnlinePilot);
}
export async function submitOnlineScore(row: Omit<OnlinePilot, "uid">, uid: string) {
  const fb = await getFirebase();
  await fb.firestore().collection("leaderboard").add({ ...row, uid, name: row.name.slice(0, 16), score: Math.floor(row.score), wave: Math.floor(row.wave), at: Date.now(), cheated: false });
}
