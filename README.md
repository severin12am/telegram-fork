# Telegram Web K fork

A working fork of Telegram’s official open-source web client **[Telegram Web K / tweb](https://github.com/morethanwords/tweb)** (GPL-3.0). Official WebK stays at https://web.telegram.org/k/.

This tree keeps upstream history. The imported `tweb/master` commit is **`b494470fa4ebbd7bb64fa9378f202944dc8158fd`**. Extra features are real client code against live Telegram chats; details and limits are in [FORK.md](FORK.md).

## Extra features

All four default **on**. Toggle them in **Settings → General Settings → Extra features**, or with query flags such as `http://localhost:8080/?fan=0`. Flags live in `localStorage` under `tweb-fork-features`.

| Feature | What it does |
|---|---|
| **Voice Score** | After you transcribe a voice message, each word is a tap target. The current word highlights while the clip plays; tap a word to play from there. |
| **Reply Loom** | Long-press or right-click → **Thread** on a reply chain. A comments-style sheet shows the tree with real avatars and connector lines. Esc or the header **X** closes it. |
| **Fan** | At the top of the chat list (`scrollTop` 0), pull/overscroll up to spread unread chats into cards. **Close all** puts them away. |
| **Year Rail** | While you fast-scroll a long chat, a loupe on the right shows month + year and a preview of the nearest bubble. |

`?voiceScore=0&replyLoom=0&fan=0&yearRail=0` turns them all off.

## Run in development

You need **Node.js 22.18+** (or 24.11+) and **pnpm 11**. Git is required for the `opus-recorder` and `solid` submodules.

```bash
git clone https://github.com/severin12am/telegram-fork.git
cd telegram-fork
git submodule update --init --recursive
corepack enable
corepack prepare pnpm@11.16.0 --activate
pnpm install
pnpm start
```

Open http://localhost:8080/ and sign in with your own Telegram account (same flow as web.telegram.org/k). This app does not log phone numbers, codes, or passwords.

`pnpm dev` serves on http://localhost:43817/ and binds every interface. While the Vite server is running, `/fork-playground.html` and `/fork-layout.html` are local fixtures for the extra features.

## Static dist (`START.bat` layout)

```bash
pnpm build:static
```

That is `vite build` without the full test/typecheck/changelog pipeline. The output is `dist/`.

To pack a Windows-ready folder like the v6 zip:

1. Copy `dist/` to a folder named `telegram-webk-fork/`.
2. Copy `LICENSE` into that folder.
3. Add `START.bat` in the same folder:

```bat
@echo off
echo Starting Telegram Web K fork on http://localhost:8080/
npx --yes serve -s . -l 8080
```

4. Double-click `START.bat` (needs Node.js) or run `npx --yes serve -s . -l 8080` from inside `telegram-webk-fork/`, then open http://localhost:8080/.

Do not commit `dist/`, `node_modules/`, or zip files.

## License and credit

Licensed under **GPL-3.0-only**, same as tweb. The full text is in [LICENSE](LICENSE).

This fork is based on:

- [morethanwords/tweb](https://github.com/morethanwords/tweb) — Telegram Web K, Eduard Kuzmenko and contributors
- [zhukov/webogram](https://github.com/zhukov/webogram) — the original Webogram client

Do not file product bugs for the four extra features on bugs.telegram.org; those are local to this fork.
