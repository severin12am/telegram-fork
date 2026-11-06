import {Message} from '@layer';
import {i18n} from '@lib/langPack';
import liteMode from '@helpers/liteMode';
import {collectThreadMids, getReplyToMid, messageHasReplyChain, ThreadLink} from '@lib/forkFeatures/replyLoom/collectThread';
import {isForkFeatureEnabled} from '@lib/forkFeatures/flags';

export type ReplyLoomHost = {
  container: HTMLElement,
  chatInner: HTMLElement,
  chat: {
    peerId: PeerId,
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
    links.push({
      mid,
      replyToMid: message ? getReplyToMid(message) : undefined
    });
  }

  return links;
}

export class ReplyLoomController {
  private sheet: HTMLElement;
  private body: HTMLElement;
  private open = false;
  private seedMid = 0;

  public rebind(host: ReplyLoomHost) {
    this.host = host;
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
    title.append(i18n('ForkFeatures.Thread'));

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'reply-loom-sheet-back';
    back.append(i18n('ForkFeatures.BackToChat'));
    back.addEventListener('click', () => this.close());

    head.append(title, back);

    this.body = document.createElement('div');
    this.body.className = 'reply-loom-sheet-body';

    this.sheet.append(head, this.body);
    this.host.container.append(this.sheet);
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
    this.clearDim();
  }

  public destroy() {
    this.close();
    this.sheet.remove();
  }

  private render(seed: Message.message) {
    const getMessage = (mid: number) => this.host.chat.getMessage(mid);
    const links = linksFromChatInner(this.host.chatInner, getMessage);
    if(!links.some((link) => link.mid === seed.mid)) {
      links.push({mid: seed.mid, replyToMid: getReplyToMid(seed)});
    }

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
  return messageHasReplyChain(message, linksFromChatInner(chatInner, getMessage));
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
