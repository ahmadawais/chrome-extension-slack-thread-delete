(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let running = false;      // true while a delete job is active
  let queue = [];           // message list items still to delete
  let failed = 0;           // consecutive failures before we bail
  let statusTimer = null;
  let lastSentStatus = "";

  const FLEXPANE = ".p-threads_flexpane";
  const REPLY_LIST_SELECTOR =
    '[data-qa="slack_kit_list"] > [data-qa="virtual-list-item"][role="listitem"]';
  const CHANNEL_ITEM_SELECTOR =
    '[data-qa="message_pane"] [data-qa="slack_kit_list"] > [data-qa="virtual-list-item"][role="listitem"]';

  // A message is deletable if it carries a message timestamp (real message,
  // not the separator or the reply input).
  const isDeletableMessage = (el) =>
    !!el.querySelector('[data-qa="message_container"][data-msg-ts]') ||
    !!el.querySelector('[data-msg-ts]');

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function threadPane() {
    return document.querySelector(FLEXPANE);
  }

  // The message elements in the open thread panel, in DOM order (root first).
  function threadMessages() {
    const pane = threadPane();
    if (!pane) return [];
    return [...pane.querySelectorAll(REPLY_LIST_SELECTOR)];
  }

  // The root (parent) message of the open thread: the first *deletable*
  // message in the thread pane.
  function rootMessage() {
    const items = threadMessages().filter(isDeletableMessage);
    return items[0] || null;
  }

  function msgTs(el) {
    const c = el.querySelector && el.querySelector("[data-msg-ts]");
    return c ? c.getAttribute("data-msg-ts") : null;
  }

  function openMenuOn(el) {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX: r.right,
        clientY: r.bottom,
      })
    );
  }

  function waitFor(selector, timeout = 1500) {
    return new Promise((resolve, reject) => {
      const found = document.querySelector(selector);
      if (found) return resolve(found);
      let timer = null;
      const obs = new MutationObserver(() => {
        const node = document.querySelector(selector);
        if (node) {
          obs.disconnect();
          clearTimeout(timer);
          resolve(node);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      timer = setTimeout(() => {
        obs.disconnect();
        reject(new Error(`Timeout waiting for ${selector}`));
      }, timeout);
    });
  }

  function closeMenu() {
    const menu = document.querySelector('[data-qa="menu"]');
    if (!menu) return;
    menu.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape",
        code: "Escape",
        keyCode: 27,
      })
    );
  }

  function currentStatus() {
    if (!running) return { deleting: false, total: 0, done: 0, remaining: 0, mode: null };
    return {
      deleting: true,
      total: queue.length + 1, // +1 for the root message
      done: 0,
      remaining: queue.length,
      mode: "thread",
    };
  }

  function sendStatus() {
    const s = currentStatus();
    const key = JSON.stringify(s);
    if (key === lastSentStatus) return;
    lastSentStatus = key;
    chrome.runtime.sendMessage({ action: "status", ...s }).catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Deletion
  // ---------------------------------------------------------------------------

  // Delete one message. Returns true if the delete went through (or the message
  // is gone), false if the user doesn't have permission / it can't be deleted.
  async function deleteMessage(item) {
    item.setAttribute("data-std-in-progress", "true");
    try {
      openMenuOn(item);
      const menu = await waitFor('[data-qa="menu"]', 1500);

      const deleteBtn = menu.querySelector('[data-qa="delete_message"]');
      if (!deleteBtn) {
        closeMenu();
        return false;
      }
      deleteBtn.click();

      const dialog = await waitFor('[data-qa="dialog"]', 1500);
      const go = dialog.querySelector('[data-qa="dialog_go"]');
      if (!go) {
        closeMenu();
        return false;
      }
      go.click();
      await sleep(400);
      return true;
    } finally {
      item.removeAttribute("data-std-in-progress");
    }
  }

  // Delete the queued replies, then the root message (Slack refuses to delete
  // a root while replies exist, so the root always goes last).
  async function deleteThreadItems() {
    while (queue.length) {
      const item = queue.shift();
      const ok = await deleteMessage(item);
      if (!ok) {
        failed += 1;
        if (failed >= 5) break;
      } else {
        failed = 0;
      }
      sendStatus();
    }
    const root = rootMessage();
    if (root) await deleteMessage(root);
  }

  // ---------------------------------------------------------------------------
  // Marked-emoji mode: delete every thread whose root message carries the
  // configured reaction emoji.
  // ---------------------------------------------------------------------------

  // Build a selector matching a reaction button for the given shortcode, e.g.
  // ":red_circle:" -> matches by aria-label name and the emoji's data attrs.
  function emojiSelector(shortcode) {
    const code = String(shortcode || "").trim() || ":red_circle:";
    const name = code.replace(/^:+|:+$/g, "").replace(/_/g, " ");
    const quoted = JSON.stringify(code);
    return [
      `[data-qa="reactji"][aria-label*="${name}" i]`,
      `[data-qa="reactji"] img[data-stringify-emoji=${quoted}]`,
      `[data-qa="reactji"] img[alt=${quoted}]`,
    ].join(", ");
  }

  function threadOpenButton(parent) {
    return parent.querySelector('[data-qa="reply_bar_count"]');
  }

  async function openThreadOn(parent) {
    const btn = threadOpenButton(parent);
    if (!btn) return false;
    btn.click();
    try {
      await waitFor(FLEXPANE, 3000);
      await sleep(800);
      return true;
    } catch {
      return false;
    }
  }

  // Close the thread flexpane. The X has no stable label, so try several
  // strategies: header icon button, any labeled close, Escape, then a click
  // outside the pane.
  function closeThreadPane() {
    const pane = threadPane();
    if (!pane) return true;

    // Strategy 1: header icon buttons (rightmost is usually Close).
    const header = pane.querySelector(
      ".p-threads_flexpane__header, .p-flexpane_header, [class*='flexpane_header'], [class*='FlexpaneHeader']"
    );
    const area = header || pane;
    const iconBtns = [...area.querySelectorAll("button")].filter(
      (b) =>
        !b.getAttribute("data-qa") &&
        (b.className || "").includes("c-icon_button")
    );
    if (iconBtns.length) {
      iconBtns[iconBtns.length - 1].click();
      return false;
    }

    // Strategy 2: a button labeled close/dismiss.
    const closeBtn = [...area.querySelectorAll("button")].find((b) =>
      /close|dismiss/i.test(
        (b.getAttribute("aria-label") || "") +
          " " +
          (b.getAttribute("data-qa") || "")
      )
    );
    if (closeBtn) {
      closeBtn.click();
      return false;
    }

    // Strategy 3: Escape (Slack closes flexpanes on Escape).
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape",
        code: "Escape",
        keyCode: 27,
      })
    );
    return false;
  }

  // A channel message whose root is a deleted-message tombstone ("This message
  // was deleted."). The tombstone itself can't be deleted (no menu option) and
  // the thread pane contains only replies — so every pane message is a reply.
  function isTombstoneParent(parent) {
    const container = parent.querySelector('[data-qa="message_container"]');
    return (
      !!container &&
      /This message was deleted/.test(container.textContent || "") &&
      !container.querySelector('[data-qa="message_content"] .c-message__body, [data-qa="message_text"]')
    );
  }

  // Delete one marked message: its whole thread (replies + root) if it has
  // one, or just the message itself. Returns true if anything was deleted.
  async function deleteOneThread(parent) {
    if (threadOpenButton(parent)) {
      if (!(await openThreadOn(parent))) return false;
      await sleep(500);
      const tombstone = isTombstoneParent(parent);
      const items = threadMessages().filter(isDeletableMessage);
      if (tombstone) {
        // Root is already deleted: every pane message is a reply.
        queue = [...items];
      } else {
        // Normal thread: replies first, root last (Slack refuses root
        // deletion while replies exist).
        queue = items.length ? items.slice(1) : [];
      }
      if (!queue.length && !items.length) {
        closeThreadPane();
        return false;
      }
      await deleteThreadItems();
      if (!tombstone) {
        // Only delete the root for a normal (non-tombstone) thread.
        const root = rootMessage();
        if (root) await deleteMessage(root);
      }
      // The pane usually closes itself after deletion; close it anyway in
      // case it is still open.
      await sleep(600);
      closeThreadPane();
      await sleep(500);
      return true;
    }
    // No thread on this message — delete the message itself.
    return deleteMessage(parent);
  }

  // Shared driver: repeatedly find matching channel messages and delete their
  // threads until none remain (Slack virtualizes, so rescan after each delete).
  async function scanAndDeleteParents(findParents, doneLabel) {
    const failedTs = new Set();
    let deleted = 0;
    let guard = 0;
    while (guard++ < 60) {
      const parents = findParents();
      const parent = parents.find((p) => {
        const ts = msgTs(p);
        return !(ts && failedTs.has(ts));
      });
      if (!parent) break;

      const ts = msgTs(parent);
      const ok = await deleteOneThread(parent);
      if (ok) {
        deleted += 1;
        failed = 0;
      } else {
        if (ts) failedTs.add(ts);
        if (++failed >= 8) break;
      }
      sendStatus();
      await sleep(600);
    }
    return {
      ok: deleted > 0,
      message: deleted ? `Deleted ${deleted} thread${deleted === 1 ? "" : "s"}.` : doneLabel,
    };
  }

  async function deleteMarkedThreads(emoji) {
    running = true;
    failed = 0;
    try {
      const selector = emojiSelector(emoji);
      const result = await scanAndDeleteParents(
        () =>
          [...document.querySelectorAll(CHANNEL_ITEM_SELECTOR)].filter((i) =>
            i.querySelector(selector)
          ),
        "No marked threads found in this channel."
      );
      return result;
    } catch (err) {
      console.error("Slack Thread Deleter:", err);
      return { ok: false, error: String((err && err.message) || err) };
    } finally {
      running = false;
      clearInterval(statusTimer);
      statusTimer = null;
      queue = [];
      sendStatus();
    }
  }

  // Delete the replies of every thread whose root is already deleted
  // (tombstone: "This message was deleted.").
  async function deleteDeletedThreads() {
    running = true;
    failed = 0;
    try {
      const result = await scanAndDeleteParents(
        () =>
          [...document.querySelectorAll(CHANNEL_ITEM_SELECTOR)].filter(
            (i) => isTombstoneParent(i) && i.querySelector('[data-qa="reply_bar_count"]')
          ),
        "No deleted threads found in this channel."
      );
      return result;
    } catch (err) {
      console.error("Slack Thread Deleter:", err);
      return { ok: false, error: String((err && err.message) || err) };
    } finally {
      running = false;
      clearInterval(statusTimer);
      statusTimer = null;
      queue = [];
      sendStatus();
    }
  }

  // ---------------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.action === "get-status") {
      sendResponse({ running, ...currentStatus() });
    } else if (msg && msg.action === "delete-marked") {
      deleteMarkedThreads(msg.emoji)
        .then(sendResponse)
        .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
      return true; // async response
    } else if (msg && msg.action === "delete-deleted") {
      deleteDeletedThreads()
        .then(sendResponse)
        .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
      return true; // async response
    }
    return false;
  });

  // Keep the popup's status view fresh while deleting.
  statusTimer = setInterval(sendStatus, 500);
})();
