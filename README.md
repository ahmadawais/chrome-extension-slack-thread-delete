# Slack Thread Deleter

A Chrome extension that deletes **an entire Slack thread**: every reply in the
thread plus the thread's root (parent) message. Only the thread you select is
touched — nothing else in the channel.

## How it works

1. Open a thread in Slack (`app.slack.com`) so its replies are visible in the
   right-hand thread panel.
2. Click the extension icon.
3. Click **"I've selected it — delete this thread"**.
4. **Click the root message** of the thread (the top message in the thread
   panel, or the parent message in the channel).
5. The extension deletes every reply, one by one (dimming each message while it
   works), then deletes the root message last — Slack refuses to delete a root
   message while replies still exist, so the root goes last.

## Install (unpacked)

1. Download/clone this repo.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
5. Open `https://app.slack.com/` and use the extension.

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
