import {Message, User} from '@layer';
import apiManagerProxy from '@lib/apiManagerProxy';
import liteMode from '@helpers/liteMode';
import {
  collectThreadMids,
  expandLinksForSeed,
  getReplyToMid,
  getReplyToTopId,
  linkFromMessage,
  linksFromMessages,
  messageHasReplyChain,
  ThreadLink
} from '@lib/forkFeatures/replyLoom/collectThread';
import {isForkFeatureEnabled} from '@lib/forkFeatures/flags';
import {forkLabel} from '@lib/forkFeatures/label';

export type ReplyLoomHost = {
  container: HTMLElement,
  chatInner: HTMLElement,
  chat: {
    peerId: PeerId,
    messagesStorageKey?: string,
    getMessage: (mid: number) => any,
    input: {
      initMessageReply: (replyTo: {replyToMsgId?: number}) => unknown,
      getChatInputReplyToFromMessage?: (message: Message.message) => {replyToMsgId?: number}
    }
  }
};

const DIM_CLASS = 'reply-loom-dim';

function messageText(message: any): string {
  if(!message) {
    return '';
  }

  if(typeof message.message === 'string' && message.message) {
    return message.message;
  }

  const media = message.media;
  if(media?._ === 'messageMediaDocument') {
    const doc = media.document;
    if(doc?.type === 'voice' || doc?.pFlags?.voice) {
      return 'Voice message';
    }

    if(doc?.type === 'round') {
      return 'Video message';
    }

    return doc?.file_name || doc?.fileName || 'File';
  }

  if(media?._ === 'messageMediaPhoto') {
    return 'Photo';
  }

  if(media?._ === 'messageMediaGeo' || media?._ === 'messageMediaGeoLive') {
    return 'Location';
  }

  return '';
}

function senderLabel(message: Message.message | undefined): string {
  if(!message) {
    return '';
  }

  const peerId = message.fromId ?? message.peerId;
  if(!peerId) {
    return '';
  }

  const peer = apiManagerProxy.getPeer(peerId);
  if(!peer) {
    return '';
  }

  if(peer._ === 'user') {
    const user = peer as User.user;
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || '';
  }

  return 'title' in peer ? (peer.title || '') : '';
}

function cachedHistoryMessages(storageKey: string | undefined, peerId: PeerId): any[] {
  const proxy = apiManagerProxy as unknown as {
    mirrors?: {messages?: Record<string, Record<number, any>>}
  };
  const key = storageKey || `${peerId}_history`;
  const cache = proxy.mirrors?.messages?.[key];
  if(!cache) {
    return [];
  }

  const out: any[] = [];
  for(const mid in cache) {
    const message = cache[mid as unknown as number];
    if(message && message._ === 'message') {
      out.push(message);
    }
  }

  return out;
}

export function linksFromChatInner(chatInner: HTMLElement, getMessage: (mid: number) => any): ThreadLink[] {
  const bubbles = chatInner.querySelectorAll<HTMLElement>('.bubble[data-mid]:not(.is-date)');
  const links: ThreadLink[] = [];
  const seen = new Set<number>();
  for(const bubble of bubbles) {
    const mid = +bubble.dataset.mid;
    if(!mid || seen.has(mid)) {
      continue;
    }

    seen.add(mid);
    const message = getMessage(mid);
    links.push(linkFromMessage(message, mid) || {mid});
  }

  return links;
}

function collectAllLinks(host: ReplyLoomHost, seed: Message.message): ThreadLink[] {
  const getMessage = (mid: number) => host.chat.getMessage(mid);
  const fromDom = linksFromChatInner(host.chatInner, getMessage);
  const fromCache = linksFromMessages(cachedHistoryMessages(host.chat.messagesStorageKey, host.chat.peerId));
  const merged = new Map<number, ThreadLink>();
  for(const link of [...fromCache, ...fromDom]) {
    const prev = merged.get(link.mid);
    merged.set(link.mid, {
      mid: link.mid,
      replyToMid: link.replyToMid ?? prev?.replyToMid,
      replyToTopId: link.replyToTopId ?? prev?.replyToTopId
    });
  }

  const seedLink: ThreadLink = {
    mid: seed.mid,
    replyToMid: getReplyToMid(seed),
    replyToTopId: getReplyToTopId(seed)
  };
  merged.set(seed.mid, {
    ...seedLink,
    replyToMid: seedLink.replyToMid ?? merged.get(seed.mid)?.replyToMid,
    replyToTopId: seedLink.replyToTopId ?? merged.get(seed.mid)?.replyToTopId
  });

  let parent = getReplyToMid(seed);
  const seen = new Set<number>([seed.mid]);
  while(parent && !seen.has(parent)) {
    seen.add(parent);
    const message = getMessage(parent);
    const link = linkFromMessage(message, parent) || {mid: parent};
    const prev = merged.get(parent);
    merged.set(parent, {
      mid: parent,
      replyToMid: link.replyToMid ?? prev?.replyToMid,
      replyToTopId: link.replyToTopId ?? prev?.replyToTopId
    });
    parent = link.replyToMid;
  }

  return expandLinksForSeed(merged.get(seed.mid) || seedLink, [...merged.values()]);
}

export class ReplyLoomController {
  private sheet: HTMLElement;
  private body: HTMLElement;
  private open = false;
  private seedMid = 0;
  private chatEl: HTMLElement | null = null;

  public rebind(host: ReplyLoomHost) {
    this.host = host;
    const parent = this.mountParent();
    if(this.sheet.parentElement !== parent) {
      parent.append(this.sheet);
    }
  }

  constructor(private host: ReplyLoomHost) {
    this.sheet = document.createElement('div');
    this.sheet.className = 'reply-loom-sheet';
    this.sheet.dataset.forkFeature = 'reply-loom';
    this.sheet.setAttribute('role', 'dialog');
    this.sheet.setAttribute('aria-label', 'Thread');

    const head = document.createElement('div');
    head.className = 'reply-loom-sheet-head';

    const title = document.createElement('b');
    title.textContent = forkLabel('ForkFeatures.Thread', 'Thread');

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'reply-loom-sheet-back';
    back.textContent = forkLabel('ForkFeatures.BackToChat', 'Back to chat');
    back.addEventListener('click', () => this.close());

    head.append(title, back);

    this.body = document.createElement('div');
    this.body.className = 'reply-loom-sheet-body';

    this.sheet.append(head, this.body);
    this.mountParent().append(this.sheet);
  }

  public isOpen() {
    return this.open;
  }

  public toggle(message: Message.message) {
    if(this.open && this.seedMid === message.mid) {
      this.close();
      return;
    }

    this.show(message);
  }

  public show(message: Message.message) {
    if(!isForkFeatureEnabled('replyLoom')) {
      return;
    }

    this.seedMid = message.mid;
    this.open = true;
    this.render(message);
    this.sheet.classList.add('is-open');
    this.host.container.classList.add('has-reply-loom');
    this.chatEl = this.host.container.closest('.chat');
    this.chatEl?.classList.add('has-reply-loom');
    if(!liteMode.isAvailable('motion')) {
      this.sheet.classList.add('no-motion');
    }

    const replyTo = this.host.chat.input.getChatInputReplyToFromMessage?.(message) || {replyToMsgId: message.mid};
    this.host.chat.input.initMessageReply(replyTo);
  }

  public refresh() {
    if(!this.open) {
      return;
    }

    const message = this.host.chat.getMessage(this.seedMid) as Message.message;
    if(message) {
      this.render(message);
    }
  }

  public close() {
    if(!this.open) {
      return;
    }

    this.open = false;
    this.sheet.classList.remove('is-open');
    this.host.container.classList.remove('has-reply-loom');
    this.chatEl?.classList.remove('has-reply-loom');
    this.clearDim();
  }

  public destroy() {
    this.close();
    this.sheet.remove();
  }

  private mountParent(): HTMLElement {
    return this.host.container.closest('.chat') || this.host.container;
  }

  private render(seed: Message.message) {
    const getMessage = (mid: number) => this.host.chat.getMessage(mid);
    const links = collectAllLinks(this.host, seed);
    const mids = collectThreadMids(seed.mid, links);
    this.body.replaceChildren();
    this.applyDim(new Set(mids));

    for(const mid of mids) {
      const message = getMessage(mid) as Message.message;
      this.body.append(this.row(message, mid));
    }

    this.body.scrollTop = this.body.scrollHeight;
  }

  private row(message: Message.message | undefined, mid: number) {
    const row = document.createElement('div');
    row.className = 'reply-loom-row' + (message?.pFlags?.out ? ' is-out' : '');
    row.dataset.mid = String(mid);

    const bubble = document.createElement('div');
    bubble.className = 'reply-loom-bubble' + (message?.pFlags?.out ? ' is-out' : '');

    const mediaBubble = this.host.chatInner.querySelector<HTMLElement>(`.bubble[data-mid="${mid}"]`);
    const photo = mediaBubble?.querySelector<HTMLImageElement>('img:not(.emoji):not(.custom-emoji)');
    if(photo?.currentSrc) {
      const img = document.createElement('img');
      img.className = 'reply-loom-media';
      img.src = photo.currentSrc;
      img.alt = '';
      bubble.append(img);
    }

    const video = mediaBubble?.querySelector<HTMLVideoElement>('video');
    if(video?.currentSrc && !photo?.currentSrc) {
      const clip = document.createElement('video');
      clip.className = 'reply-loom-media';
      clip.src = video.currentSrc;
      clip.muted = true;
      clip.loop = true;
      clip.playsInline = true;
      clip.setAttribute('playsinline', '');
      bubble.append(clip);
      clip.play()?.catch(() => {});
    }

    const name = senderLabel(message);
    if(name) {
      const sender = document.createElement('span');
      sender.className = 'reply-loom-sender';
      sender.textContent = name;
      bubble.append(sender);
    }

    const text = document.createElement('div');
    text.className = 'reply-loom-text';
    text.textContent = messageText(message) || `#${mid}`;
    bubble.append(text);

    const meta = document.createElement('span');
    meta.className = 'reply-loom-meta';
    if(message?.date) {
      meta.textContent = new Date(message.date * 1000).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
    }

    bubble.append(meta);
    row.append(bubble);
    return row;
  }

  private applyDim(keep: Set<number>) {
    const bubbles = this.host.chatInner.querySelectorAll<HTMLElement>('.bubble[data-mid]:not(.is-date)');
    for(const bubble of bubbles) {
      const mid = +bubble.dataset.mid;
      bubble.classList.toggle(DIM_CLASS, !keep.has(mid));
    }
  }

  private clearDim() {
    this.host.chatInner.querySelectorAll('.' + DIM_CLASS).forEach((node) => {
      node.classList.remove(DIM_CLASS);
    });
  }
}

const controllers = new WeakMap<object, ReplyLoomController>();

export function chatMessageHasReplyChain(
  message: Message.message,
  chatInner: HTMLElement,
  getMessage: (mid: number) => any
): boolean {
  const fromDom = linksFromChatInner(chatInner, getMessage);
  const fromCache = linksFromMessages(cachedHistoryMessages(undefined, message.peerId));
  return messageHasReplyChain(message, [...fromCache, ...fromDom]);
}

export function openReplyLoom(host: ReplyLoomHost, message: Message.message): boolean {
  if(!isForkFeatureEnabled('replyLoom') || !message || message._ !== 'message') {
    return false;
  }

  if(!chatMessageHasReplyChain(message, host.chatInner, (mid) => host.chat.getMessage(mid))) {
    return false;
  }

  let controller = controllers.get(host.container);
  if(!controller) {
    controller = new ReplyLoomController(host);
    controllers.set(host.container, controller);
  } else {
    controller.rebind(host);
  }

  controller.toggle(message);
  return true;
}

export function closeReplyLoom(container: HTMLElement) {
  controllers.get(container)?.close();
}

export function refreshReplyLoom(container: HTMLElement) {
  controllers.get(container)?.refresh();
}

export function destroyReplyLoom(container: HTMLElement) {
  controllers.get(container)?.destroy();
  controllers.delete(container);
}
