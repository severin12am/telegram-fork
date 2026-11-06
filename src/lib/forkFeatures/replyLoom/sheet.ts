import {Message, User} from '@layer';
import apiManagerProxy from '@lib/apiManagerProxy';
import liteMode from '@helpers/liteMode';
import Icon from '@components/icon';
import {getMiddleware, MiddlewareHelper} from '@helpers/middleware';
import {
  collectThreadTree,
  expandLinksForSeed,
  getReplyToMid,
  getReplyToTopId,
  linkFromMessage,
  linksFromMessages,
  messageHasReplyChain,
  ThreadLayoutItem,
  ThreadLink
} from '@lib/forkFeatures/replyLoom/collectThread';
import {attachThreadMedia, ThreadMediaMessage} from '@lib/forkFeatures/replyLoom/threadMedia';
import {fillAvatarSlot} from '@lib/forkFeatures/replyLoom/threadAvatars';
import {paintThreadConnectors} from '@lib/forkFeatures/replyLoom/paintThreadTree';
import {isForkFeatureEnabled} from '@lib/forkFeatures/flags';
import {forkLabel} from '@lib/forkFeatures/label';
import {layoutReplyLoomSheet} from '@lib/forkFeatures/replyLoom/fitSheet';

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
const PEER_COLORS = ['red', 'orange', 'violet', 'green', 'cyan', 'pink', 'blue'] as const;

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
    return '';
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

  const named = (message as Message.message & {__senderName?: string}).__senderName;
  if(named) {
    return named;
  }

  const peerId = message.fromId ?? message.peerId;
  if(!peerId) {
    return '';
  }

  let peer: any;
  try {
    peer = apiManagerProxy.getPeer(peerId);
  } catch(_err) {
    return '';
  }

  if(!peer) {
    return '';
  }

  if(peer._ === 'user') {
    const user = peer as User.user;
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || '';
  }

  return 'title' in peer ? (peer.title || '') : '';
}

function senderPeerId(message: Message.message | undefined): number {
  return Number(message?.fromId || message?.peerId || 0) || 0;
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
  private treeHost: HTMLElement;
  private subtitle: HTMLElement;
  private open = false;
  private seedMid = 0;
  private chatEl: HTMLElement | null = null;
  private resizeObserver?: ResizeObserver;
  private middlewareHelper: MiddlewareHelper;
  private onViewport = () => this.layout();
  private onBodyScroll = () => this.paintTree();
  private onKeyDown = (event: KeyboardEvent) => {
    if(!this.open) {
      return;
    }

    if(event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  };

  public rebind(host: ReplyLoomHost) {
    this.host = host;
    const parent = this.mountParent();
    if(this.sheet.parentElement !== parent) {
      parent.append(this.sheet);
    }

    this.chatEl = host.container.closest('.chat') || host.container;
    this.unwatchLayout();
    this.watchLayout();
    if(this.open) {
      this.layout();
    }
  }

  constructor(private host: ReplyLoomHost) {
    this.middlewareHelper = getMiddleware();
    this.sheet = document.createElement('div');
    this.sheet.className = 'reply-loom-sheet';
    this.sheet.dataset.forkFeature = 'reply-loom';
    this.sheet.dataset.forkProbe = 'thread-sheet';
    this.sheet.setAttribute('role', 'dialog');
    this.sheet.setAttribute('aria-modal', 'true');
    this.sheet.setAttribute('aria-label', 'Thread');

    const head = document.createElement('div');
    head.className = 'reply-loom-sheet-head';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn-icon reply-loom-sheet-close';
    close.dataset.forkProbe = 'thread-close';
    close.setAttribute('aria-label', 'Close');
    close.append(Icon('close'));
    close.addEventListener('click', () => this.close());

    const titles = document.createElement('div');
    titles.className = 'reply-loom-sheet-titles';
    const title = document.createElement('b');
    title.textContent = forkLabel('ForkFeatures.Thread', 'Thread');
    this.subtitle = document.createElement('span');
    this.subtitle.className = 'reply-loom-sheet-sub';
    titles.append(title, this.subtitle);

    head.append(close, titles);

    this.body = document.createElement('div');
    this.body.className = 'reply-loom-sheet-body';
    this.body.dataset.forkProbe = 'thread-body';
    this.body.addEventListener('scroll', this.onBodyScroll, {passive: true});
    this.treeHost = document.createElement('div');
    this.treeHost.className = 'reply-loom-tree-host';
    this.body.append(this.treeHost);

    this.sheet.append(head, this.body);
    this.mountParent().append(this.sheet);
    this.watchLayout();
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
    this.chatEl = this.host.container.closest('.chat') || this.mountParent();
    this.chatEl.classList.add('has-reply-loom');
    this.host.container.classList.add('has-reply-loom');
    this.sheet.classList.add('is-open');
    if(!liteMode.isAvailable('motion')) {
      this.sheet.classList.add('no-motion');
    }

    document.addEventListener('keydown', this.onKeyDown, true);

    const replyTo = this.host.chat.input.getChatInputReplyToFromMessage?.(message) || {replyToMsgId: message.mid};
    const armed = this.host.chat.input.initMessageReply(replyTo);
    this.layout();
    requestAnimationFrame(() => this.layout());
    Promise.resolve(armed).finally(() => {
      this.layout();
      requestAnimationFrame(() => this.layout());
    });
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
    document.removeEventListener('keydown', this.onKeyDown, true);
    this.middlewareHelper.clean();
    this.clearDim();
  }

  public destroy() {
    this.close();
    this.unwatchLayout();
    document.removeEventListener('keydown', this.onKeyDown, true);
    this.body.removeEventListener('scroll', this.onBodyScroll);
    this.sheet.remove();
  }

  private mountParent(): HTMLElement {
    return document.getElementById('page-chats') ||
      document.body ||
      this.host.container.closest('.chat') ||
      this.host.container;
  }

  private layout() {
    const chat = this.chatEl || this.mountParent();
    if(!chat) {
      return;
    }

    layoutReplyLoomSheet(this.sheet, chat);
    this.paintTree();
  }

  private watchLayout() {
    if(typeof ResizeObserver !== 'undefined' && !this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() => this.layout());
    }

    const observer = this.resizeObserver;
    if(!observer) {
      window.addEventListener('resize', this.onViewport);
      return;
    }

    const chat = this.host.container.closest('.chat') || this.host.container;
    observer.observe(chat);
    observer.observe(this.body);
    observer.observe(this.treeHost);
    observer.observe(this.mountParent());
    const bubbles = chat.querySelector('.bubbles');
    if(bubbles) {
      observer.observe(bubbles);
    }
    const sidebar = document.getElementById('column-left');
    if(sidebar) {
      observer.observe(sidebar);
    }
    const input = chat.querySelector('.chat-input');
    if(input) {
      observer.observe(input);
    }
    const reply = chat.querySelector('.reply-wrapper');
    if(reply) {
      observer.observe(reply);
    }

    window.addEventListener('resize', this.onViewport);
  }

  private unwatchLayout() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    window.removeEventListener('resize', this.onViewport);
  }

  private render(seed: Message.message) {
    this.middlewareHelper.clean();
    const getMessage = (mid: number) => this.host.chat.getMessage(mid);
    const links = collectAllLinks(this.host, seed);
    const tree = collectThreadTree(seed.mid, links);
    this.treeHost = document.createElement('div');
    this.treeHost.className = 'reply-loom-tree-host';
    this.body.replaceChildren(this.treeHost);
    this.body.dataset.forkProbe = 'thread-body';
    this.body.dataset.tree = '1';
    this.applyDim(new Set(tree.map((item) => item.mid)));

    const names = new Set<string>();
    for(const item of tree) {
      const name = senderLabel(getMessage(item.mid) as Message.message);
      if(name) {
        names.add(name);
      }
    }

    const people = names.size;
    this.subtitle.textContent = people ?
      `${tree.length} messages · ${people} people` :
      `${tree.length} messages`;
    this.subtitle.dataset.participants = String(people);

    for(const item of tree) {
      const message = getMessage(item.mid) as Message.message;
      this.treeHost.append(this.row(message, item, getMessage));
    }

    this.body.scrollTop = 0;
    this.resizeObserver?.observe(this.treeHost);
    requestAnimationFrame(() => {
      this.paintTree();
      requestAnimationFrame(() => {
        this.paintTree();
        setTimeout(() => this.paintTree(), 80);
        setTimeout(() => this.paintTree(), 280);
      });
    });
  }

  private paintTree() {
    if(!this.open) {
      return;
    }

    const segments = paintThreadConnectors(this.treeHost);
    this.body.dataset.connectors = String(segments.length);
  }

  private row(
    message: Message.message | undefined,
    item: ThreadLayoutItem,
    getMessage: (mid: number) => any
  ) {
    const isOut = !!message?.pFlags?.out;
    const row = document.createElement('div');
    row.className = 'reply-loom-row' + (isOut ? ' is-out' : '');
    row.dataset.mid = String(item.mid);
    row.dataset.depth = String(item.depth);
    if(item.replyToMid) {
      row.dataset.replyTo = String(item.replyToMid);
    }
    row.style.setProperty('--thread-depth', String(Math.min(item.depth, 8)));

    const name = senderLabel(message);
    const peerId = senderPeerId(message);
    const color = PEER_COLORS[Math.abs(peerId) % PEER_COLORS.length];
    const slot = document.createElement('div');
    slot.className = 'reply-loom-avatar-slot avatar-gradient avatar-36';
    slot.setAttribute('aria-hidden', 'true');
    fillAvatarSlot(slot, {
      peerId,
      name,
      photoUrl: (message as ThreadMediaMessage & {__avatarUrl?: string})?.__avatarUrl
    }, this.middlewareHelper.get(), color, () => this.paintTree());

    const bubble = document.createElement('div');
    bubble.className = 'reply-loom-bubble' + (isOut ? ' is-out' : '');

    if(name) {
      const sender = document.createElement('span');
      sender.className = 'reply-loom-sender';
      sender.dataset.color = color;
      sender.textContent = name;
      bubble.append(sender);
    }

    if(item.replyToMid) {
      const parent = getMessage(item.replyToMid) as Message.message | undefined;
      const quote = document.createElement('div');
      quote.className = 'reply-loom-quote';
      quote.dataset.forkProbe = 'thread-quote';
      const qName = document.createElement('span');
      qName.className = 'reply-loom-quote-name';
      qName.textContent = senderLabel(parent) || 'Message';
      const qText = document.createElement('span');
      qText.className = 'reply-loom-quote-text';
      const parentText = messageText(parent) || (parent?.media ? 'Photo' : '');
      qText.textContent = parentText.slice(0, 80) || `#${item.replyToMid}`;
      quote.append(qName, qText);
      bubble.append(quote);
    }

    const hasMedia = !!(message as ThreadMediaMessage)?.media || !!(message as ThreadMediaMessage)?.__fullMediaUrl;
    if(hasMedia) {
      const mediaHost = document.createElement('div');
      mediaHost.className = 'reply-loom-media-host';
      bubble.append(mediaHost);
      attachThreadMedia(mediaHost, message as ThreadMediaMessage, this.middlewareHelper.get());
    }

    const text = messageText(message);
    if(text) {
      const copy = document.createElement('div');
      copy.className = 'reply-loom-text';
      copy.textContent = text;
      bubble.append(copy);
    }

    const meta = document.createElement('span');
    meta.className = 'reply-loom-meta';
    if(message?.date) {
      meta.textContent = new Date(message.date * 1000).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
    }

    bubble.append(meta);
    row.append(slot, bubble);
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
