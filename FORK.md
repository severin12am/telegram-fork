# Telegram WebK fork — four extra features

This repository is a working fork of [Telegram Web K / tweb](https://github.com/morethanwords/tweb) (GPL-3.0). Upstream history is preserved; the import commit records **`b494470fa4ebbd7bb64fa9378f202944dc8158fd`** (`tweb/master` on 2026-10-27).

The official client, login flow, MTProto stack, and credentials handling are unchanged. Nothing here logs phone numbers, codes, or passwords. API id/hash stay in the upstream `.env` that WebK already ships.

## What each feature does

### 1. Voice Score

Karaoke-style read-along on a voice-message transcription.

- **Where:** inside a voice-message bubble, after you tap the existing transcribe button.
- **What:** once Telegram returns the transcript, each word is a tap target. The current word highlights in the bubble accent while the clip plays; spoken words stay readable. Tap a word to seek and play from there.
- **Limitation:** `messages.transcribeAudio` returns plain text, not word timestamps, and it is a Telegram Premium API. Tokens are placed by syllable weight across the real media duration (Opus/`HTMLMediaElement.duration`), then each start snaps to the nearest energy onset within ±250 ms. Highlight and seek share that one map, so a tap on word N lights word N and starts there. Without Premium or a cached transcript the upstream upsell still appears.

### 2. Reply Loom

A thread sheet for ordinary reply chains (not only channel comments).

- **Where:** long-press a message (mouse or touch), or right-click → **Thread**. A plain click on a quoted reply still jumps to and highlights that original message. The Thread item is hidden on messages that are not part of a reply chain.
- **What:** unrelated bubbles dim. A comments-style sheet with a close **X** (Esc also closes) lists the reply **tree**: root on top, indentation, and SVG connector lines that run from one avatar centre to the next. Each reply quotes who it answers. Avatars load through `avatarNew` (the same photos as the chat list); letters are only used when someone has no photo. Photos and image files load through `wrapPhoto` / `wrapDocument` at bubble resolution, not the 40px chat thumb. The sheet sits `position: fixed` in the chat column, from below the topbar and pinned plate down to the composer **including** the Reply-to helper.
- **Limitation:** Telegram does not expose a “replies to this mid” search for private chats. The loom walks `reply_to` / `reply_to_mid` on messages already loaded (on screen or in the history cache). Send or scroll to load more of the chain, then reopen.

### 3. Fan

Unread chats spread into a card fan.

- **Where:** the left chat list, and **only** when that list is already at `scrollTop` 0. Pull down (touch or click-drag) or keep scrolling/wheeling up so the list overscrolls. Scrolling up mid-list never opens it.
- **What:** unread rows become stacked, slightly rotated cards (title, last-message preview, unread badge, the same avatar Telegram already drew). Tap a card to open that chat. Swipe a card sideways to skip it. **Close all** (a real button at the bottom of the overlay), scroll/swipe down, or tap the dimmed backdrop puts every card away and the list is immediately usable again.
- **Limitation:** cards come from the chats already rendered in the current folder. Chats that have not been painted yet will not appear until they show up in the list.

### 4. Year Rail

A history-scrub loupe.

- **Where:** the open chat, while you fast-scroll a long history.
- **What:** a card on the right shows month + year, the message text, and a photo or muted looping video preview of the bubble nearest the upper part of the viewport. It hides when scrolling settles. Switching chats resets and rebinds the loupe so it cannot stick on the previous conversation.
- **Limitation:** the preview uses media already in the DOM (Telegram’s own thumbs / blob URLs). Messages that have not been rendered yet cannot be previewed.

A local playground that drives the same timing, thread-walk, fan-layout and date-label functions is at `/fork-playground.html` while the Vite dev server is running. Layout and Voice Score regression against the **real** `.chat` / topbar / pinned / bubbles CSS lives at `/fork-layout.html` (`?view=thread` or `?view=voice`).

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
