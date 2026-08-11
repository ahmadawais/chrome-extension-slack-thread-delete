const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const statusText = $("status-text");
const deleteBtn = $("delete");
const emojiInput = $("emoji");
const errorEl = $("error");

const SLACK_URL = /^https:\/\/app\.slack\.com\//;
const EMOJI_KEY = "markedEmoji";

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function clearError() {
  errorEl.textContent = "";
  errorEl.classList.add("hidden");
}

function setRunningUI(running) {
  deleteBtn.disabled = running;
  emojiInput.disabled = running;
  deleteBtn.textContent = running ? "Deleting…" : "Delete marked threads";
}

function render(status) {
  clearError();
  if (status.deleting) {
    statusEl.classList.remove("hidden");
    const remaining = status.remaining ?? 0;
    statusText.textContent =
      remaining > 0
        ? `Deleting… ${remaining} message${remaining === 1 ? "" : "s"} left`
        : "Deleting…";
    setRunningUI(true);
  } else {
    statusEl.classList.add("hidden");
    setRunningUI(false);
  }
}

function normalizeEmoji(value) {
  const v = String(value || "").trim();
  if (!v) return ":red_circle:";
  return v.startsWith(":") ? v : `:${v}:`;
}

async function findSlackTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active && active.id && SLACK_URL.test(active.url || "")) return active;
  const tabs = await chrome.tabs.query({ url: "https://app.slack.com/*" });
  if (tabs && tabs.length) return tabs[0];
  return null;
}

async function getStatus(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { action: "get-status" });
  } catch {
    return null;
  }
}

deleteBtn.addEventListener("click", async () => {
  clearError();
  const emoji = normalizeEmoji(emojiInput.value);
  try {
    chrome.storage.local.set({ [EMOJI_KEY]: emoji });
    const tab = await findSlackTab();
    if (!tab || !tab.id) {
      showError("Open a Slack workspace (app.slack.com) first.");
      return;
    }
    const res = await chrome.tabs.sendMessage(tab.id, { action: "delete-marked", emoji });
    if (res && res.ok) {
      statusText.textContent = res.message || "Done.";
      statusEl.classList.remove("hidden");
      setRunningUI(true);
      poll();
    } else {
      showError((res && res.error) || "Could not start.");
      setRunningUI(false);
    }
  } catch (err) {
    showError("Could not reach Slack. Reload the Slack tab and try again.");
    setRunningUI(false);
  }
});

async function poll() {
  const tab = await findSlackTab();
  if (!tab || !tab.id) return;
  const status = await getStatus(tab.id);
  if (!status) return;
  render(status);
  if (status.deleting) setTimeout(poll, 600);
}

// Initial state.
(async () => {
  try {
    const { [EMOJI_KEY]: saved } = await chrome.storage.local.get(EMOJI_KEY);
    if (saved) emojiInput.value = saved;
    const tab = await findSlackTab();
    if (!tab || !tab.id) {
      showError("Open a Slack workspace (app.slack.com) first.");
      return;
    }
    const status = await getStatus(tab.id);
    if (status) render(status);
  } catch {
    // Content script not injected; show default UI.
  }
})();
