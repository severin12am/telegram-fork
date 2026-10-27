# Telegram WebK fork — four extra features

This repository is a working fork of [Telegram Web K / tweb](https://github.com/morethanwords/tweb) (GPL-3.0). Upstream history is preserved; the import commit records **`b494470fa4ebbd7bb64fa9378f202944dc8158fd`** (`tweb/master` on 2026-10-27).

The official client, login flow, MTProto stack, and credentials handling are unchanged. Nothing here logs phone numbers, codes, or passwords. API id/hash stay in the upstream `.env` that WebK already ships.

## What each feature does

### 1. Voice Score

Karaoke-style read-along on a voice-message transcription.

- **Where:** inside a voice-message bubble, after you tap the existing transcribe button.
- **What:** once Telegram returns the transcript, each word is a tap target. The current word highlights in the bubble accent while the clip plays; spoken words stay readable. Tap a word to seek and play from there.
- **Limitation:** `messages.transcribeAudio` returns plain text, not word timestamps, and it is a Telegram Premium API. Timings are estimated from the clip duration (longer tokens get a larger share), then scaled to the real length. Without Premium or a cached transcript the upstream upsell still appears.

### 2. Reply Loom

A thread sheet for ordinary reply chains (not only channel comments).

- **Where:** long-press a message → **Thread**, or tap a reply quote in the bubble.
- **What:** unrelated bubbles dim. A bottom sheet titled **Thread** lists the root and every reply we can see in the open chat. The composer is armed to reply in that chain. **Back to chat** closes the sheet.
- **Limitation:** Telegram does not expose a “replies to this mid” search for private chats. The loom walks `reply_to` on messages already loaded in the chat. Send or scroll to load more of the chain, then reopen.

### 3. Fan

Unread chats spread into a card fan.

- **Where:** the left chat list. Pull down from the top (touch or click-drag) or scroll/wheel up while already at the top.
- **What:** unread rows become stacked, slightly rotated cards (title, last-message preview, unread badge, the same avatar Telegram already drew). Tap a card to open that chat. Swipe a card sideways to skip it. Tap the dimmed backdrop to close.
- **Limitation:** cards come from the chats already rendered in the current folder. Chats that have not been painted yet will not appear until they show up in the list.

### 4. Year Rail

A history-scrub loupe.

- **Where:** the open chat, while you fast-scroll a long history.
- **What:** a card on the right shows month + year, the message text, and a photo or muted looping video preview of the bubble nearest the upper part of the viewport. It hides when scrolling settles.
- **Limitation:** the preview uses media already in the DOM (Telegram’s own thumbs / blob URLs). Messages that have not been rendered yet cannot be previewed.

## Feature flags

All four default **on**. Toggle them in **Settings → General Settings → Extra features**, or with query parameters:

`http://localhost:8080/?voiceScore=0&replyLoom=0&fan=0&yearRail=0`

Flags are stored in `localStorage` under `tweb-fork-features`.

## Code layout

Isolated under `src/lib/forkFeatures/`. Host files only call small hooks:

| Feature | Logic | Hooked from |
|---|---|---|
| Voice Score | `voiceScore/` | `src/components/audioTranscription.tsx` |
| Reply Loom | `replyLoom/` | `src/components/chat/contextMenu.ts`, `src/components/chat/bubbles.ts` |
| Fan | `fan/` | `src/components/sidebarLeft/index.ts` |
| Year Rail | `yearRail/` | `src/components/chat/bubbles.ts` |
| Settings | `settings.tsx` | `src/components/sidebarLeft/tabs/generalSettings.tsx` |

## License

GPL-3.0-only, same as tweb. See `LICENSE`. Credit: Eduard Kuzmenko / morethanwords, and the Webogram authors named in upstream files.
