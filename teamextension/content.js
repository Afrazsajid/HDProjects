console.log("H&D WhatsApp reader loaded");

const HND_CAPTURE = {
  scanLimit: 20,
  scanIntervalMs: 120000,
  debounceMs: 1500,
  processedKeys: new Set(),
  observer: null,
  debounceTimer: null,
  backupTimer: null,
  isContextAlive: true
};

function normaliseText(value) {
  return (value || "")
    .replace(/\u202A|\u202B|\u202C|\u200E|\u200F/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTextFromElement(element) {
  if (!element) return "";
  return normaliseText(element.innerText || element.textContent || "");
}

function isExtensionContextValid() {
  try {
    return Boolean(chrome?.runtime?.id && HND_CAPTURE.isContextAlive);
  } catch (error) {
    return false;
  }
}

function safeSendMessage(message) {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) {
      resolve({
        success: false,
        error: "Extension context invalidated"
      });
      return;
    }

    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message || "";

          if (errorMessage.includes("Extension context invalidated")) {
            stopExtensionRunners(true);
          }

          resolve({
            success: false,
            error: errorMessage
          });

          return;
        }

        resolve(response || { success: false, error: "No response" });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("Extension context invalidated")) {
        stopExtensionRunners(true);
      }

      resolve({
        success: false,
        error: errorMessage
      });
    }
  });
}

/* =========================
   POSTCODE HELPERS
========================= */

function extractPostcodeFromText(text) {
  if (!text) return "";

  const postcodeRegex =
    /\b(GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

  const match = text.match(postcodeRegex);

  if (!match) return "";

  return normalisePostcode(match[0]);
}

function normalisePostcode(postcode) {
  const cleaned = postcode
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();

  if (cleaned.length <= 3) return cleaned;

  const outward = cleaned.slice(0, -3);
  const inward = cleaned.slice(-3);

  return `${outward} ${inward}`;
}

function detectPostcodeRegion(postcode) {
  if (!postcode) return "";

  const outwardCode = postcode
    .toUpperCase()
    .trim()
    .split(/\s+/)[0];

  if (/^(TW|UB|SL)/i.test(outwardCode)) {
    return "West London";
  }

  if (/^(IG|RM)/i.test(outwardCode)) {
    return "East London";
  }

  if (/^E1[1-8]$/i.test(outwardCode)) {
    return "East London";
  }

  return "Others";
}

/* =========================
   CHAT LIST DETECTION
========================= */

function getChatListContainer() {
  return (
    document.querySelector("#pane-side [data-testid='chat-list']") ||
    document.querySelector("[data-testid='chat-list']") ||
    document.querySelector("#pane-side [role='grid']") ||
    document.querySelector("#pane-side")
  );
}

function getChatRows() {
  const chatList = getChatListContainer();

  if (!chatList) {
    console.log("H&D getChatRows: chat list not found");
    return [];
  }

  let rows = Array.from(
    chatList.querySelectorAll("[role='row'][data-testid^='list-item-']")
  );

  if (!rows.length) {
    rows = Array.from(chatList.querySelectorAll("[role='row']"));
  }

  if (!rows.length) {
    rows = Array.from(document.querySelectorAll("#pane-side [role='row']"));
  }

  console.log("H&D getChatRows count:", rows.length);

  return rows.slice(0, HND_CAPTURE.scanLimit);
}

/* =========================
   CHAT ROW EXTRACTION
========================= */

function extractUnreadCount(row) {
  const unreadElement = row.querySelector(
    "[data-testid='icon-unread-count'][aria-label]"
  );

  if (!unreadElement) return 0;

  const ariaLabel = unreadElement.getAttribute("aria-label") || "";
  const numberMatch = ariaLabel.match(/\d+/);

  if (numberMatch) return Number(numberMatch[0]);

  const visibleText = getTextFromElement(unreadElement);
  const textMatch = visibleText.match(/\d+/);

  return textMatch ? Number(textMatch[0]) : 0;
}

function extractContactName(row) {
  const titleContainer = row.querySelector("[data-testid='cell-frame-title']");

  if (!titleContainer) return "";

  const titleElement =
    titleContainer.querySelector("[title]") ||
    titleContainer.querySelector("span[dir='auto']") ||
    titleContainer.querySelector("span");

  const titleValue =
    titleElement?.getAttribute("title") || getTextFromElement(titleElement);

  return normaliseText(titleValue)
    .replace(/^\d+\s+unread messages?\s*/i, "")
    .trim();
}

function extractTimestamp(row) {
  const timeElement = row.querySelector(
    "[data-testid='cell-frame-primary-detail'] span"
  );

  return normaliseText(
    timeElement?.getAttribute("title") || getTextFromElement(timeElement)
  );
}

function extractLastMessage(row) {
  const lastMessageElement =
    row.querySelector("[data-testid='last-msg-status']") ||
    row.querySelector("[data-testid='cell-frame-secondary']") ||
    row.querySelector("span[title]");

  if (!lastMessageElement) return "";

  const titleValue = lastMessageElement.getAttribute("title");

  if (titleValue) return normaliseText(titleValue);

  return getTextFromElement(lastMessageElement);
}

function detectLastMessageDirection(row) {
  const outgoingSelectors = [
    "[data-testid='status-dblcheck']",
    "[data-testid='status-check']",
    "[data-testid='status-time']",
    "[data-icon='status-dblcheck']",
    "[data-icon='status-check']",
    "[data-icon='status-time']"
  ];

  const hasOutgoingStatus = outgoingSelectors.some((selector) =>
    row.querySelector(selector)
  );

  return hasOutgoingStatus ? "outgoing" : "incoming";
}

function extractPhoneNumber(value) {
  if (!value) return "";

  const text = String(value);

  const ukMatch = text.match(/(\+44\s?\d{3,5}\s?\d{5,8}|\+44\d{8,12})/);

  if (ukMatch) {
    return ukMatch[1].replace(/\s+/g, " ").trim();
  }

  const genericMatch = text.match(/(\+\d[\d\s-]{7,15}\d)/);

  if (genericMatch) {
    return genericMatch[1].replace(/\s+/g, " ").trim();
  }

  return "";
}

function createChatIdentifier(contactName, rawText, index) {
  const base = contactName || rawText || `unknown-chat-${index}`;

  return normaliseText(base)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9+_-]/g, "")
    .slice(0, 120);
}

function createCaptureKey(chat) {
  return [
    chat.chatIdentifier,
    chat.lastMessage,
    chat.visibleTimestamp,
    chat.unreadCount,
    chat.lastMessageDirection,
    chat.postcode
  ].join("|");
}

function extractChatData(row, index) {
  const rawText = getTextFromElement(row);
  const contactName = extractContactName(row);
  const lastMessage = extractLastMessage(row);
  const visibleTimestamp = extractTimestamp(row);
  const unreadCount = extractUnreadCount(row);
  const lastMessageDirection = detectLastMessageDirection(row);

  const postcode =
    extractPostcodeFromText(lastMessage) ||
    extractPostcodeFromText(rawText) ||
    "";

  const postcodeRegion = postcode ? detectPostcodeRegion(postcode) : "";

  let phoneNumber =
    extractPhoneNumber(contactName) ||
    extractPhoneNumber(rawText) ||
    "";

  let finalContactName = contactName || "Unknown Contact";

  if (phoneNumber && finalContactName.includes(phoneNumber)) {
    finalContactName = phoneNumber;
  }

  const chatIdentifier = createChatIdentifier(finalContactName, rawText, index);

  if (!finalContactName && !lastMessage) return null;

  return {
    contactName: finalContactName,
    phoneNumber,
    lastMessage: lastMessage || rawText,
    timestamp: new Date().toISOString(),
    visibleTimestamp,
    unreadCount,
    rawMessageText: rawText,
    chatIdentifier,
    source: "WhatsApp Web",
    lastMessageDirection,
    postcode,
    postcodeRegion
  };
}

/* =========================
   SETTINGS + SEND
========================= */

async function getCaptureSettings() {
  const response = await safeSendMessage({
    type: "GET_CAPTURE_SETTINGS"
  });

  if (!response?.success) {
    return {
      captureEnabled: false,
      captureMode: "manual_only"
    };
  }

  return (
    response.settings || {
      captureEnabled: false,
      captureMode: "manual_only"
    }
  );
}

function shouldSendChat(chat, settings) {
  if (!chat) return false;
  if (!settings.captureEnabled) return false;

  const captureKey = createCaptureKey(chat);

  if (HND_CAPTURE.processedKeys.has(captureKey)) {
    return false;
  }

  HND_CAPTURE.processedKeys.add(captureKey);

  return true;
}

async function sendChatToBackground(chat) {
  const response = await safeSendMessage({
    type: "SEND_LEAD_TO_BACKEND",
    payload: chat
  });

  if (response?.success) {
    console.log("H&D lead sent:", {
      contactName: chat.contactName,
      direction: chat.lastMessageDirection,
      message: chat.lastMessage
    });
    return;
  }

  console.warn("H&D lead send failed:", response?.error);
}

/* =========================
   SCAN
========================= */

async function scanWhatsAppChats(reason = "manual") {
  console.log("H&D scan started. Reason:", reason);

  if (!isExtensionContextValid()) {
    console.warn("H&D scan stopped: extension context invalid");
    stopExtensionRunners(true);
    return;
  }

  const settings = await getCaptureSettings();

  if (!settings.captureEnabled) {
    console.log("H&D capture disabled");
    return;
  }

  const rows = getChatRows();

  if (!rows.length) {
    console.log("H&D: no chat rows found");
    return;
  }

  const chats = rows
    .map((row, index) => extractChatData(row, index))
    .filter(Boolean);

  console.table(
    chats.map((chat) => ({
      contactName: chat.contactName,
      phoneNumber: chat.phoneNumber,
      lastMessage: chat.lastMessage?.slice(0, 50),
      postcode: chat.postcode,
      postcodeRegion: chat.postcodeRegion,
      unreadCount: chat.unreadCount,
      readStatus: chat.unreadCount > 0 ? "Unread" : "Read",
      direction: chat.lastMessageDirection
    }))
  );

  for (const chat of chats) {
    if (shouldSendChat(chat, settings)) {
      await sendChatToBackground(chat);
    }
  }
}

/* =========================
   OBSERVER + BACKUP
========================= */

function debounceScan(reason) {
  clearTimeout(HND_CAPTURE.debounceTimer);

  HND_CAPTURE.debounceTimer = setTimeout(() => {
    scanWhatsAppChats(reason).catch((error) => {
      console.warn("H&D scan failed:", error?.message || error);
    });
  }, HND_CAPTURE.debounceMs);
}

function startObserver() {
  console.log("H&D trying to start observer...");

  const chatList = getChatListContainer();

  if (!chatList) {
    console.log("H&D: chat list not ready, retrying in 2 seconds...");
    setTimeout(startObserver, 2000);
    return;
  }

  if (HND_CAPTURE.observer) {
    HND_CAPTURE.observer.disconnect();
  }

  HND_CAPTURE.observer = new MutationObserver(() => {
    debounceScan("mutation");
  });

  HND_CAPTURE.observer.observe(chatList, {
    childList: true,
    subtree: true,
    characterData: true
  });

  console.log("H&D MutationObserver started");

  scanWhatsAppChats("initial").catch((error) => {
    console.warn("H&D initial scan failed:", error?.message || error);
  });
}

function startBackupScanner() {
  if (HND_CAPTURE.backupTimer) {
    clearInterval(HND_CAPTURE.backupTimer);
  }

  HND_CAPTURE.backupTimer = setInterval(() => {
    scanWhatsAppChats("backup").catch((error) => {
      console.warn("H&D backup scan failed:", error?.message || error);
    });
  }, HND_CAPTURE.scanIntervalMs);

  console.log("H&D backup scanner started");
}

function stopExtensionRunners(markInvalid = false) {
  if (markInvalid) {
    HND_CAPTURE.isContextAlive = false;
  }

  if (HND_CAPTURE.observer) {
    HND_CAPTURE.observer.disconnect();
    HND_CAPTURE.observer = null;
  }

  if (HND_CAPTURE.debounceTimer) {
    clearTimeout(HND_CAPTURE.debounceTimer);
    HND_CAPTURE.debounceTimer = null;
  }

  if (HND_CAPTURE.backupTimer) {
    clearInterval(HND_CAPTURE.backupTimer);
    HND_CAPTURE.backupTimer = null;
  }

  console.log("H&D extension runners stopped");
}

/* =========================
   CURRENT OPEN CHAT
========================= */

function findMessageBox() {
  return (
    document.querySelector("#main footer div[contenteditable='true'][role='textbox']") ||
    document.querySelector("#main footer div[contenteditable='true']") ||
    document.querySelector("footer div[contenteditable='true'][role='textbox']") ||
    document.querySelector("footer div[contenteditable='true']")
  );
}

function getCurrentOpenChatName() {
  const possibleElements = [
    document.querySelector("#main header span[title]"),
    document.querySelector("#main header span[dir='auto'][title]"),
    document.querySelector("#main header span[dir='auto']"),
    document.querySelector("header span[title]"),
    document.querySelector("header span[dir='auto'][title]"),
    document.querySelector("header span[dir='auto']")
  ];

  for (const element of possibleElements) {
    if (!element) continue;

    const value = normaliseText(
      element.getAttribute("title") || element.textContent || ""
    );

    if (!value) continue;

    const badValues = [
      "profile details",
      "search",
      "more options",
      "click here for contact info",
      "online",
      "typing..."
    ];

    if (badValues.includes(value.toLowerCase())) continue;

    return value;
  }

  return "";
}

function getCurrentOpenChatMessagesText() {
  const main = document.querySelector("#main");

  if (!main) return "";

  return getTextFromElement(main).slice(-2000);
}

function getCurrentOpenChatData() {
  const messageBox = findMessageBox();

  if (!messageBox) {
    return null;
  }

  const contactName = getCurrentOpenChatName();
  const rawText = getCurrentOpenChatMessagesText();

  const postcode = extractPostcodeFromText(rawText);
  const postcodeRegion = postcode ? detectPostcodeRegion(postcode) : "";

  const phoneNumber =
    extractPhoneNumber(contactName) ||
    extractPhoneNumber(rawText) ||
    "";

  if (!contactName && !phoneNumber) {
    return null;
  }

  const finalContactName = contactName || phoneNumber || "Unknown Contact";

  return {
    contactName: finalContactName,
    phoneNumber,
    chatIdentifier: createChatIdentifier(finalContactName, rawText, 0),
    rawMessageText: rawText,
    source: "WhatsApp Web Open Chat",
    postcode,
    postcodeRegion
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_CURRENT_OPEN_CHAT") {
    const chat = getCurrentOpenChatData();

    sendResponse({
      success: Boolean(chat),
      chat
    });

    return true;
  }

  return false;
});

/* =========================
   STARTUP
========================= */

function startHndExtension() {
  console.log("H&D startup triggered");

  if (!isExtensionContextValid()) {
    console.warn("H&D stopped: extension context invalid");
    return;
  }

  startObserver();
  startBackupScanner();

  setTimeout(() => {
    scanWhatsAppChats("forced-start-scan").catch((error) => {
      console.warn("H&D forced scan failed:", error?.message || error);
    });
  }, 1000);
}

window.addEventListener("beforeunload", () => {
  stopExtensionRunners(false);
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(startHndExtension, 3000);
  });
} else {
  setTimeout(startHndExtension, 3000);
}