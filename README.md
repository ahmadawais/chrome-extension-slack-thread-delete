# Slack Thread Deleter

![Slack Thread Deleter popup](icons/slack-thread-delete.png)

Chrome extension that deletes **entire Slack threads** — all replies, then the root (Slack refuses to delete a root while replies exist).

Two popup modes:

- **Delete marked threads** — delete every thread whose root has the configured emoji (default `:red_circle:`, any shortcode works and persists).
- **Delete deleted threads** — clean up orphaned replies in threads whose root was already deleted (tombstones vanish once empty).

Only targeted threads are touched; the channel is rescanned after each deletion since Slack virtualizes the message list.

## Install (unpacked)

1. Clone/download this repo.
2. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder.
3. Open `https://app.slack.com/` and use it.

## Usage

1. Open a Slack channel.
2. React with the configured emoji to each message whose thread you want to delete.
3. Click **Delete marked threads** (or **Delete deleted threads** for orphaned replies).

## Notes

- Only works on `app.slack.com`; messages you can't delete are skipped after a few attempts.
- Works in channels, private channels, DMs, and group DMs.
- No deps, no tracking, no network calls. Only permission: Slack's domain.

## Files

- `manifest.json` — Manifest V3 manifest
- `content.js` — thread detection, selection, deletion engine
- `content.css` — dims messages while deleting
- `popup.html` / `popup.css` / `popup.js` — popup UI
- `icons/` — icons
