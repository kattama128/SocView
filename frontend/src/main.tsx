import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { CustomerProvider } from "./context/CustomerContext";
import { ThemeModeProvider } from "./contexts/ThemeContext";
import { registerPushSubscription } from "./services/alertsApi";

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray.buffer as ArrayBuffer;
}

async function bootstrapPushSubscription() {
  const enablePush = String(import.meta.env.VITE_ENABLE_BROWSER_PUSH ?? "false").toLowerCase() === "true";
  if (!enablePush) {
    return;
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return;
  }

  const vapidPublicKey = String(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY ?? "").trim();
  if (!vapidPublicKey) {
    return;
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return;
  }
  await registerPushSubscription({
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeModeProvider>
      <BrowserRouter>
        <AuthProvider>
          <CustomerProvider>
            <App />
          </CustomerProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeModeProvider>
  </StrictMode>,
);

void bootstrapPushSubscription().catch(() => {
  // Push registration is optional.
});
