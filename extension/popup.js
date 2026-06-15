const extensionSecretInput = document.getElementById("extensionSecret");
const captureEnabledInput = document.getElementById("captureEnabled");
const captureHint = document.getElementById("captureHint");

const saveSettingsButton = document.getElementById("saveSettings");
const testSendButton = document.getElementById("testSend");
const tagCurrentChatButton = document.getElementById("tagCurrentChat");
const resetStatsButton = document.getElementById("resetStats");
const toggleSettingsButton = document.getElementById("toggleSettings");

const manualStatusInput = document.getElementById("manualStatus");
const manualNotesInput = document.getElementById("manualNotes");

const statusText = document.getElementById("status");
const statusPill = document.getElementById("statusPill");
const lastSyncText = document.getElementById("lastSync");
const capturedCountText = document.getElementById("capturedCount");

const chatClosedCard = document.getElementById("chatClosedCard");
const chatOpenCard = document.getElementById("chatOpenCard");
const currentChatName = document.getElementById("currentChatName");
const settingsPanel = document.getElementById("settingsPanel");
const toast = document.getElementById("toast");

const latestNoteText = document.getElementById("latestNoteText");
const contextStatus = document.getElementById("contextStatus");
const contextTags = document.getElementById("contextTags");

let currentChat = null;
let selectedTags = [];
let lastLoadedChatKey = "";

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");

  setTimeout(() => {
    toast.classList.add("hidden");
  }, 1800);
}

function setStatusUi(status, error = "None") {
  statusText.textContent = status || "Ready";

  statusPill.className = "pill neutral";
  statusPill.textContent = "Idle";

  const lower = String(status || "").toLowerCase();

  if (
    lower.includes("success") ||
    lower.includes("saved") ||
    lower.includes("enabled") ||
    lower.includes("synced")
  ) {
    statusPill.className = "pill success";
    statusPill.textContent = "Active";
  }

  if (lower.includes("failed") || lower.includes("error")) {
    statusPill.className = "pill error";
    statusPill.textContent = "Error";
  }

  if (lower.includes("disabled") || lower.includes("paused")) {
    statusPill.className = "pill warning";
    statusPill.textContent = "Paused";
  }

  if (error && error !== "None") {
    showToast(error);
  }
}

function setSelectedTagButtons(tags) {
  selectedTags = [];

  document.querySelectorAll(".tag-btn").forEach((button) => {
    const tag = button.dataset.tag;

    if (tags.includes(tag)) {
      selectedTags.push(tag);
      button.classList.add("selected");
    } else {
      button.classList.remove("selected");
    }
  });
}

async function loadSettings() {
  const data = await chrome.storage.local.get([
    "extensionSecret",
    "captureEnabled",
    "lastSync",
    "lastError",
    "lastStatus",
    "capturedCount"
  ]);

  extensionSecretInput.value = data.extensionSecret || "";
  captureEnabledInput.checked = data.captureEnabled === true;
  captureHint.textContent = data.captureEnabled === true ? "Running" : "Paused";

  lastSyncText.textContent = data.lastSync || "Never";
  capturedCountText.textContent = String(data.capturedCount || 0);

  setStatusUi(data.lastStatus || "Ready", data.lastError || "None");
}

async function saveSettings() {
  const status = captureEnabledInput.checked
    ? "Capture enabled"
    : "Capture disabled";

  await chrome.storage.local.set({
    extensionSecret: extensionSecretInput.value.trim(),
    captureEnabled: captureEnabledInput.checked,
    captureMode: "unread_incoming_only",
    lastStatus: status,
    lastError: "None"
  });

  captureHint.textContent = captureEnabledInput.checked ? "Running" : "Paused";

  setStatusUi(status, "None");
  showToast("Settings saved");
}

async function sendTestLead() {
  const payload = {
    contactName: "Extension Test Lead",
    phoneNumber: "+440000000000",
    lastMessage: "Hi I am looking for security work and I have SIA.",
    timestamp: new Date().toISOString(),
    unreadCount: 1,
    rawMessageText: "Hi I am looking for security work and I have SIA.",
    chatIdentifier: "extension-test-lead",
    source: "Extension Test Button",
    lastMessageDirection: "incoming"
  };

  setStatusUi("Testing sync...", "None");

  chrome.runtime.sendMessage(
    {
      type: "SEND_LEAD_TO_BACKEND",
      payload
    },
    async (response) => {
      if (chrome.runtime.lastError) {
        setStatusUi("Test failed", chrome.runtime.lastError.message);
        return;
      }

      if (response?.success) {
        await loadSettings();
        setStatusUi("Test sync successful", "None");
        showToast("Test lead synced");
      } else {
        setStatusUi("Test failed", response?.error || "Unknown error");
      }
    }
  );
}

async function getActiveWhatsAppTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const activeTab = tabs[0];

  if (!activeTab?.id || !activeTab.url?.includes("web.whatsapp.com")) {
    return null;
  }

  return activeTab;
}

function resetContextUi() {
  latestNoteText.textContent = "No previous note";
  contextStatus.textContent = "-";
  contextTags.textContent = "-";
  manualStatusInput.value = "Review";
  manualNotesInput.value = "";
  manualNotesInput.placeholder = "Add a new note. Previous notes will stay in history.";
  setSelectedTagButtons([]);
}

function loadLeadContext(force = false) {
  if (!currentChat) return;

  const chatKey = currentChat.chatIdentifier || currentChat.contactName;

  if (!force && lastLoadedChatKey === chatKey) {
    return;
  }

  lastLoadedChatKey = chatKey;

  latestNoteText.textContent = "Loading latest note...";
  contextStatus.textContent = "Loading...";
  contextTags.textContent = "-";

  chrome.runtime.sendMessage(
    {
      type: "GET_LEAD_CONTEXT",
      payload: {
        contactName: currentChat.contactName,
        phoneNumber: currentChat.phoneNumber || "",
        chatIdentifier: currentChat.chatIdentifier
      }
    },
    (contextResponse) => {
      if (chrome.runtime.lastError || !contextResponse?.success) {
        latestNoteText.textContent = "Could not load lead details";
        contextStatus.textContent = "-";
        contextTags.textContent = "-";
        return;
      }

      const data = contextResponse.data;

      if (!data?.found || !data.lead) {
        latestNoteText.textContent = "No previous note";
        contextStatus.textContent = "New";
        contextTags.textContent = "-";
        manualStatusInput.value = "Review";
        manualNotesInput.value = "";
        manualNotesInput.placeholder = "Add first note for this lead";
        setSelectedTagButtons([]);
        return;
      }

      const lead = data.lead;
      const latestNote = data.latestNote;
      const tags = lead.manual_tags?.length
        ? lead.manual_tags
        : lead.final_tags || [];

      latestNoteText.textContent =
        latestNote?.note || lead.notes || "No previous note";

      contextStatus.textContent = lead.status || "Review";
      contextTags.textContent = tags.length ? tags.join(", ") : "-";

      manualStatusInput.value = lead.status || "Review";
      manualNotesInput.value = "";
      manualNotesInput.placeholder = latestNote?.note
        ? `Last note: ${latestNote.note}`
        : "Add a new note";

      setSelectedTagButtons(tags);
    }
  );
}

async function checkCurrentChat() {
  const activeTab = await getActiveWhatsAppTab();

  if (!activeTab) {
    currentChat = null;
    lastLoadedChatKey = "";
    currentChatName.textContent = "";
    chatClosedCard.classList.remove("hidden");
    chatOpenCard.classList.add("hidden");
    resetContextUi();
    return;
  }

  chrome.tabs.sendMessage(
    activeTab.id,
    {
      type: "GET_CURRENT_OPEN_CHAT"
    },
    (response) => {
      if (chrome.runtime.lastError || !response?.success || !response.chat) {
        currentChat = null;
        lastLoadedChatKey = "";
        currentChatName.textContent = "";
        chatClosedCard.classList.remove("hidden");
        chatOpenCard.classList.add("hidden");
        resetContextUi();
        return;
      }

      currentChat = response.chat;
      currentChatName.textContent = currentChat.contactName;

      chatClosedCard.classList.add("hidden");
      chatOpenCard.classList.remove("hidden");

      loadLeadContext(false);
    }
  );
}

function setupTagButtons() {
  document.querySelectorAll(".tag-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const tag = button.dataset.tag;

      if (selectedTags.includes(tag)) {
        selectedTags = selectedTags.filter((item) => item !== tag);
        button.classList.remove("selected");
      } else {
        selectedTags.push(tag);
        button.classList.add("selected");
      }
    });
  });
}

async function tagCurrentOpenChat() {
  if (!currentChat) {
    showToast("Open a WhatsApp chat first");
    return;
  }

  const note = manualNotesInput.value.trim();

  if (!selectedTags.length && !note) {
    showToast("Add a note or select a tag");
    return;
  }

  const manualPayload = {
    contactName: currentChat.contactName,
    phoneNumber: currentChat.phoneNumber || "",
    chatIdentifier: currentChat.chatIdentifier,
    manualTags: selectedTags,
    status: manualStatusInput.value,
    notes: note,
    source: "Extension Manual Tag",
    postcode: currentChat.postcode || "",
    postcodeRegion: currentChat.postcodeRegion || ""
  };

  setStatusUi("Saving update...", "None");

  chrome.runtime.sendMessage(
    {
      type: "SEND_MANUAL_UPDATE",
      payload: manualPayload
    },
    async (manualResponse) => {
      if (chrome.runtime.lastError) {
        setStatusUi("Update failed", chrome.runtime.lastError.message);
        return;
      }

      if (manualResponse?.success) {
        manualNotesInput.value = "";

        await loadSettings();
        setStatusUi("Update saved successfully", "None");
        showToast("Lead updated");

        lastLoadedChatKey = "";
        setTimeout(() => {
          loadLeadContext(true);
        }, 500);
      } else {
        setStatusUi("Update failed", manualResponse?.error || "Unknown error");
      }
    }
  );
}

function resetStats() {
  chrome.runtime.sendMessage(
    {
      type: "RESET_STATS"
    },
    async () => {
      await loadSettings();
      showToast("Stats reset");
    }
  );
}

function toggleSettings() {
  settingsPanel.classList.toggle("hidden");
}

saveSettingsButton.addEventListener("click", saveSettings);
testSendButton.addEventListener("click", sendTestLead);
tagCurrentChatButton.addEventListener("click", tagCurrentOpenChat);
resetStatsButton.addEventListener("click", resetStats);
toggleSettingsButton.addEventListener("click", toggleSettings);
captureEnabledInput.addEventListener("change", saveSettings);

setupTagButtons();
loadSettings();
checkCurrentChat();

setInterval(checkCurrentChat, 3000);