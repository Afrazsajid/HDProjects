console.log("H&D background service worker loaded");

const CONFIG = {
  LEAD_CAPTURE_URL: "https://hd-whatsapp-backend.vercel.app/api/extension/lead-capture",
  MANUAL_UPDATE_URL: "https://hd-whatsapp-backend.vercel.app/api/extension/manual-update",
  LEAD_CONTEXT_URL: "https://hd-whatsapp-backend.vercel.app/api/extension/lead-context"
};

async function getSettings() {
  const settings = await chrome.storage.local.get([
    "extensionSecret",
    "captureEnabled",
    "lastStatus",
    "lastSync",
    "lastError",
    "capturedCount"
  ]);

  return {
    extensionSecret: settings.extensionSecret || "",
    captureEnabled: settings.captureEnabled === true,
    captureMode: "unread_incoming_only",
    lastStatus: settings.lastStatus || "Ready",
    lastSync: settings.lastSync || "Never",
    lastError: settings.lastError || "None",
    capturedCount: settings.capturedCount || 0
  };
}

async function saveSyncStatus(status, error = "None", increaseCount = false) {
  const current = await chrome.storage.local.get(["capturedCount"]);

  await chrome.storage.local.set({
    lastStatus: status,
    lastSync: new Date().toLocaleString(),
    lastError: error,
    capturedCount: increaseCount
      ? Number(current.capturedCount || 0) + 1
      : Number(current.capturedCount || 0)
  });
}

async function postToBackend(url, secret, payload) {
  if (!secret) {
    throw new Error("Extension secret is missing. Open Settings and add it.");
  }

  console.log("H&D post URL:", url);
  console.log("H&D payload:", payload);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-extension-secret": secret
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    console.error("H&D backend returned non-JSON:", text);
  }

  console.log("H&D backend status:", response.status);
  console.log("H&D backend response:", data);

  if (!response.ok) {
    throw new Error(data?.error || `Backend returned ${response.status}`);
  }

  return data;
}

async function sendLeadToBackend(payload) {
  const settings = await getSettings();

  return postToBackend(
    CONFIG.LEAD_CAPTURE_URL,
    settings.extensionSecret,
    payload
  );
}

async function sendManualUpdate(payload) {
  const settings = await getSettings();

  return postToBackend(
    CONFIG.MANUAL_UPDATE_URL,
    settings.extensionSecret,
    payload
  );
}

async function getLeadContext(payload) {
  const settings = await getSettings();

  return postToBackend(
    CONFIG.LEAD_CONTEXT_URL,
    settings.extensionSecret,
    payload
  );
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get([
    "extensionSecret",
    "captureEnabled",
    "capturedCount"
  ]);

  await chrome.storage.local.set({
    extensionSecret: existing.extensionSecret || "",
    captureEnabled: existing.captureEnabled === true,
    capturedCount: existing.capturedCount || 0,
    lastStatus: "Installed",
    lastError: "None",
    lastSync: "Never"
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_CAPTURE_SETTINGS") {
    getSettings()
      .then((settings) => {
        sendResponse({
          success: true,
          settings
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: error.message
        });
      });

    return true;
  }

  if (message.type === "SEND_LEAD_TO_BACKEND") {
    sendLeadToBackend(message.payload)
      .then(async (data) => {
        await saveSyncStatus("Lead synced successfully", "None", true);

        sendResponse({
          success: true,
          data
        });
      })
      .catch(async (error) => {
        await saveSyncStatus("Lead sync failed", error.message, false);

        sendResponse({
          success: false,
          error: error.message
        });
      });

    return true;
  }

  if (message.type === "SEND_MANUAL_UPDATE") {
    sendManualUpdate(message.payload)
      .then(async (data) => {
        await saveSyncStatus("Lead update saved", "None", false);

        sendResponse({
          success: true,
          data
        });
      })
      .catch(async (error) => {
        await saveSyncStatus("Lead update failed", error.message, false);

        sendResponse({
          success: false,
          error: error.message
        });
      });

    return true;
  }

  if (message.type === "GET_LEAD_CONTEXT") {
    getLeadContext(message.payload)
      .then((data) => {
        sendResponse({
          success: true,
          data
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: error.message
        });
      });

    return true;
  }

  if (message.type === "RESET_STATS") {
    chrome.storage.local
      .set({
        capturedCount: 0,
        lastStatus: "Stats reset",
        lastError: "None",
        lastSync: new Date().toLocaleString()
      })
      .then(() => {
        sendResponse({
          success: true
        });
      });

    return true;
  }

  sendResponse({
    success: false,
    error: "Unknown message type"
  });

  return true;
});