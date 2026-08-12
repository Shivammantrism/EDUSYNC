export function registerSW() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}

export function notificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function ensureNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export async function showLocalNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const opts = { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "edusync-alert", renotify: true };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, opts);
      return;
    }
  } catch {
    /* fall through to page notification */
  }
  try {
    new Notification(title, opts);
  } catch {
    /* ignore */
  }
}
