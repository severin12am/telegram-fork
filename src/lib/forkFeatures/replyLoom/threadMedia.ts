import {Message} from '@layer';
import {Middleware} from '@helpers/middleware';

export type ThreadMediaMessage = Message.message & {
  __fullMediaUrl?: string,
  __mediaWidth?: number,
  __mediaHeight?: number
};

function photoFromMessage(message: ThreadMediaMessage | undefined) {
  const media = message?.media as any;
  if(!media) {
    return undefined;
  }

  if(media._ === 'messageMediaPhoto' && media.photo) {
    return media.photo;
  }

  if(media._ === 'messageMediaDocument' && media.document) {
    const doc = media.document;
    const mime = doc.mime_type || '';
    if(typeof mime === 'string' && mime.startsWith('image/')) {
      return doc;
    }
  }

  return undefined;
}

function documentFromMessage(message: ThreadMediaMessage | undefined) {
  const media = message?.media as any;
  if(media?._ === 'messageMediaDocument' && media.document) {
    return media.document;
  }

  return undefined;
}

function paintFullImage(container: HTMLElement, url: string, width: number, height: number) {
  container.classList.add('media-container', 'photo', 'reply-loom-media-box');
  const maxW = Math.min(420, Math.max(160, container.clientWidth || 420));
  const maxH = 280;
  const scale = Math.min(1, maxW / Math.max(1, width), maxH / Math.max(1, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  container.style.width = w + 'px';
  container.style.height = h + 'px';
  const img = new Image();
  img.className = 'media-photo';
  img.alt = '';
  img.dataset.forkProbe = 'thread-photo';
  img.src = url;
  container.append(img);
}

/**
 * Same loaders the chat bubbles use (`wrapPhoto` / `wrapDocument`), with a
 * high-res box so Telegram's `x`/`y` sizes load instead of a 40px thumb.
 * Fixture messages may carry `__fullMediaUrl` when there is no MTProto session.
 */
export async function attachThreadMedia(
  container: HTMLElement,
  message: ThreadMediaMessage | undefined,
  middleware?: Middleware
): Promise<void> {
  if(!message) {
    return;
  }

  const fallbackUrl = message.__fullMediaUrl;
  const photo = photoFromMessage(message);
  const doc = documentFromMessage(message);
  const width = message.__mediaWidth || photo?.w || 1280;
  const height = message.__mediaHeight || photo?.h || 720;

  if(photo && !fallbackUrl) {
    try {
      const {default: wrapPhoto} = await import('@components/wrappers/photo');
      await wrapPhoto({
        photo,
        message,
        container,
        boxWidth: 800,
        boxHeight: 800,
        lazyLoadQueue: false,
        noBlur: true,
        autoDownloadSize: Number.MAX_SAFE_INTEGER,
        middleware
      });
      container.classList.add('reply-loom-media-box');
      const img = container.querySelector<HTMLImageElement>('img.media-photo, video.media-photo');
      if(img) {
        img.dataset.forkProbe = 'thread-photo';
        return;
      }
    } catch(_err) {}
  }

  if(doc && !(doc.mime_type || '').startsWith('image/') && !fallbackUrl) {
    try {
      const {default: wrapDocument} = await import('@components/wrappers/document');
      if(!middleware) {
        throw new Error('no middleware');
      }

      const node = await wrapDocument({
        message,
        middleware,
        lazyLoadQueue: false as any,
        autoDownloadSize: Number.MAX_SAFE_INTEGER
      });
      container.classList.add('reply-loom-media-box');
      container.append(node);
      return;
    } catch(_err) {}
  }

  if(fallbackUrl) {
    paintFullImage(container, fallbackUrl, width, height);
  }
}
