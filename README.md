# Telegram Web K (fork)

A working fork of Telegram’s official open-source web client **[Telegram Web K / tweb](https://github.com/morethanwords/tweb)** (GPL-3.0).

This tree keeps upstream history. The imported `tweb/master` commit is **`b494470fa4ebbd7bb64fa9378f202944dc8158fd`**. Four extra features — Voice Score, Reply Loom, Fan, and Year Rail — are implemented as real client code against live Telegram chats. See [FORK.md](FORK.md) for what each one does, where it lives in the UI, and the MTProto limits.

Official WebK remains available at https://web.telegram.org/k/

## Run locally on Windows

You need **Node.js 22.18+** (or 24.11+) and **pnpm 11**. Git is required so the `opus-recorder` and `solid` submodules can be fetched.

1. Install Node from https://nodejs.org/ (LTS 22 is fine).
2. In **PowerShell** or **Command Prompt**:

```bat
corepack enable
corepack prepare pnpm@11.16.0 --activate
```

3. Clone this repository, then:

```bat
cd path\to\this\repo
git submodule update --init --recursive
pnpm install
pnpm start
```

4. Open http://localhost:8080/ in Chrome or Edge. After `pnpm dev`, a local playground of the four extra features (same timing / thread / fan / date code as the client) is at http://localhost:43817/fork-playground.html.
5. Sign in with your own Telegram account the same way you would on web.telegram.org/k — phone number, login code, 2FA password if you use one. This app never stores those in source and never logs them.

Optional:

```bat
pnpm dev
```

serves the same app on http://localhost:43817/ and binds every interface (useful if you open the page from another device on the LAN).

To turn one extra feature off, append a query flag, for example http://localhost:8080/?fan=0 — or use **Settings → General Settings → Extra features**.

### Production / static host

```bat
pnpm build:static
```

That is `vite build` without the full test/typecheck/changelog pipeline. Copy the `dist/` folder to any static host (nginx, GitHub Pages, Cloudflare Pages, `npx serve dist`). A full `pnpm build` also runs the upstream test suite, typecheck, and changelog step; it is slower and not required just to ship the files.

Docker (upstream):

```bat
docker-compose up tweb.dependencies
docker-compose up tweb.develop
```

Then open http://localhost:8080/

## Debugging query parameters

Same as upstream. Examples: http://localhost:8080/?test=1

* **test=1** — Telegram test DCs
* **debug=1** — extra logging
* **noSharedWorker=1** — disable Shared Worker
* **http=1** — force HTTPS transport
* **voiceScore=0 / replyLoom=0 / fan=0 / yearRail=0** — disable a fork feature

## License and credit

Licensed under **GPL-3.0-only**, same as tweb. The full license is in [LICENSE](LICENSE).

This fork is based on:

* [morethanwords/tweb](https://github.com/morethanwords/tweb) — Telegram Web K, Eduard Kuzmenko and contributors
* [zhukov/webogram](https://github.com/zhukov/webogram) — the original Webogram client

Do not file product bugs for the four extra features on bugs.telegram.org; those are local to this fork.

### Upstream dependencies

Unchanged from tweb: BigInteger.js, fflate, cryptography, emoji-data, tlottie, fast-png, opus-recorder, Prism, Solid, TinyLD, libwebp.js, Mediabunny, Temml, and the others listed in the original tweb README.
