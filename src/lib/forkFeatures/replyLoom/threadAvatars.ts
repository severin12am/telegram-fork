import {Middleware} from '@helpers/middleware';

export type ThreadAvatarSource = {
  peerId: number,
  name: string,
  photoUrl?: string
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if(!parts.length) {
    return '';
  }

  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function paintLetters(slot: HTMLElement, name: string, color: string) {
  slot.dataset.fallback = 'letters';
  slot.dataset.hasPhoto = '0';
  slot.dataset.color = color;
  slot.textContent = initials(name || '?') || '?';
}

function paintPhoto(slot: HTMLElement, url: string, name: string) {
  slot.textContent = '';
  slot.dataset.fallback = 'photo';
  slot.dataset.hasPhoto = '1';
  const img = new Image();
  img.className = 'avatar-photo';
  img.alt = name;
  img.dataset.forkProbe = 'thread-avatar-photo';
  img.src = url;
  slot.append(img);
}

/**
 * Real profile photos go through `avatarNew` — the same loader the chat list
 * and bubbles use. Letters are only a fallback when there is no photo at all.
 * `photoUrl` is a fixture/test hook (a JPEG we already have).
 */
export function fillAvatarSlot(
  slot: HTMLElement,
  source: ThreadAvatarSource,
  middleware: Middleware,
  color: string,
  onReady?: () => void
): void {
  slot.classList.add('avatar-like', 'reply-loom-avatar');
  slot.style.setProperty('--size', '36px');
  slot.dataset.color = color;

  const done = () => {
    if(middleware()) {
      onReady?.();
    }
  };

  if(source.photoUrl) {
    paintPhoto(slot, source.photoUrl, source.name);
    const img = slot.querySelector('img');
    if(img) {
      if(img.complete) {
        done();
      } else {
        img.addEventListener('load', done, {once: true});
        img.addEventListener('error', done, {once: true});
      }
    } else {
      done();
    }
    return;
  }

  if(!source.peerId) {
    paintLetters(slot, source.name, color);
    done();
    return;
  }

  slot.dataset.fallback = 'pending';
  slot.dataset.hasPhoto = '0';
  slot.textContent = '';
  import('@components/avatarNew').then(({avatarNew}) => {
    if(!middleware()) {
      return;
    }

    try {
      const av = avatarNew({
        peerId: source.peerId as PeerId,
        size: 36,
        lazyLoadQueue: false,
        middleware
      });
      if(!av?.node) {
        paintLetters(slot, source.name, color);
        done();
        return;
      }

      av.node.classList.add('reply-loom-avatar');
      av.node.dataset.forkProbe = 'thread-avatar';
      slot.replaceChildren(av.node);
      slot.dataset.fallback = 'avatarNew';
      const markPhoto = () => {
        const img = slot.querySelector('img');
        if(img && (img.currentSrc || img.src)) {
          slot.dataset.hasPhoto = '1';
          img.dataset.forkProbe = 'thread-avatar-photo';
        }
        done();
      };
      markPhoto();
      slot.querySelector('img')?.addEventListener('load', markPhoto);
      av.readyThumbPromise?.then(markPhoto).catch(() => done());
    } catch(_err) {
      paintLetters(slot, source.name, color);
      done();
    }
  }).catch(() => {
    paintLetters(slot, source.name, color);
    done();
  });
}
