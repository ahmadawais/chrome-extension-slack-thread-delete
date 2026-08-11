# Slack Thread Deleter

A Chrome extension that deletes **entire Slack threads**. It works two ways:

1. **Marked threads** — react to a message with an emoji (default `:red_circle:`,
   configurable in the popup), then click **Delete marked threads**. Every
   thread whose root message carries that emoji is deleted — all replies first,
   then the root.
2. **Deleted threads** — click **Delete deleted threads** to clean up threads
   whose root is already deleted ("This message was deleted."). It deletes all
   remaining replies of those threads.

Only the threads you target are touched — nothing else in the channel.

## How it works

- Opens each marked thread, deletes every reply one by one (dimming each
  message while it works), then deletes the root message last — Slack refuses
  to delete a root while replies exist.
- For already-deleted roots (tombstones), it deletes just the replies; the
  tombstone disappears from the channel once its thread is empty.
- Rescans the channel after each deletion, because Slack virtualizes the
  message list as messages disappear.
- The emoji is configurable in the popup (any shortcode like `:x:` or
  `:warning:`) and persisted.

## Install (unpacked)

1. Download/clone this repo.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
5. Open `https://app.slack.com/` and use the extension.

## Usage

1. Open a Slack channel.
2. React with the configured emoji to each message whose thread you want to delete.
3. Open the extension popup and click **Delete marked threads**.
4. Or click **Delete deleted threads** to clean up threads whose root was already deleted.

## Requirements / notes

- Only works on `app.slack.com` (the web app). It will not delete messages you
  don't have permission to delete; those are skipped after a few attempts.
- Works in channels, private channels, DMs, and group DMs — anywhere the thread
  panel renders.
- No external dependencies, no tracking, no network calls. The only permission
  is running on Slack's domain.

## Files

- `manifest.json` — extension manifest (Manifest V3)
- `content.js` — thread detection, selection, and deletion engine
- `content.css` — dims messages while they are deleted
- `popup.html` / `popup.css` / `popup.js` — the extension popup UI
- `icons/` — icons
