import liteMode from '@helpers/liteMode';
import {i18n} from '@lib/langPack';
import {collectUnreadFromChatlist, FanCardModel, fanPoses} from '@lib/forkFeatures/fan/collectUnread';
import {isForkFeatureEnabled} from '@lib/forkFeatures/flags';

export type FanHost = {
  root: HTMLElement,
  getScrollable: () => HTMLElement | null,
  openPeer: (peerId: PeerId) => void
};

/** Downward pull (px) before unread cards fan out. Small scrolls must not trip it. */
export const FAN_PULL_THRESHOLD = 140;
/** Extra slop before a pointer-down is treated as a pull at all. */
export const FAN_PULL_SLOP = 28;
/** Accumulated upward wheel delta (px) at the top of the list before opening. */
export const FAN_WHEEL_OPEN = 480;
/** Downward wheel delta while open that closes every card. */
export const FAN_WHEEL_CLOSE = 36;

export class FanOverlay {
  private veil: HTMLElement;
  private stage: HTMLElement;
  private empty: HTMLElement;
  private closeBtn: HTMLButtonElement;
  private open = false;
  private pull = 0;
  private dragging = false;
  private tracking = false;
  private startY = 0;
  private wheelAccum = 0;
  private wheelTimer = 0;
  private cards: HTMLElement[] = [];
  private models: FanCardModel[] = [];

  constructor(private host: FanHost) {
    this.veil = document.createElement('div');
    this.veil.className = 'fan-veil';
    this.veil.setAttribute('inert', '');
    this.veil.addEventListener('click', (event) => {
      if(event.target === this.veil) {
        this.close();
      }
    });

    this.stage = document.createElement('div');
    this.stage.className = 'fan-stage';
    this.stage.dataset.forkFeature = 'fan';
    this.stage.setAttribute('inert', '');

    this.closeBtn = document.createElement('button');
    this.closeBtn.type = 'button';
    this.closeBtn.className = 'fan-close';
    this.closeBtn.append(i18n('ForkFeatures.FanClose'));
    this.closeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    });
    this.stage.append(this.closeBtn);

    this.empty = document.createElement('div');
    this.empty.className = 'fan-empty';
    this.empty.setAttribute('inert', '');
    this.empty.append(i18n('ForkFeatures.FanEmpty'));

    this.host.root.append(this.veil, this.stage, this.empty);
    this.bindGestures();
  }

  public isOpen() {
    return this.open;
  }

  public show(models = collectUnreadFromChatlist(this.host.root)) {
    if(!isForkFeatureEnabled('fan')) {
      return;
    }

    this.models = models;
    this.open = true;
    this.host.root.classList.add('has-fan');
    this.veil.classList.add('is-open');
    this.stage.classList.add('is-open');
    this.veil.removeAttribute('inert');
    this.stage.removeAttribute('inert');
    this.renderCards();
    this.empty.classList.toggle('is-open', !models.length);
    if(!models.length) {
      this.empty.removeAttribute('inert');
    } else {
      this.empty.setAttribute('inert', '');
    }
  }

  public close() {
    if(!this.open) {
      this.releaseUi();
      return;
    }

    this.open = false;
    this.models = [];
    this.releaseUi();
  }

  public destroy() {
    this.close();
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
    this.veil.remove();
    this.stage.remove();
    this.empty.remove();
  }

  private releaseUi() {
    this.host.root.classList.remove('has-fan');
    this.veil.classList.remove('is-open');
    this.stage.classList.remove('is-open');
    this.empty.classList.remove('is-open');
    this.veil.setAttribute('inert', '');
    this.stage.setAttribute('inert', '');
    this.empty.setAttribute('inert', '');
    this.cards.forEach((card) => card.remove());
    this.cards = [];
    this.resetPull();
    this.restoreList();
  }

  private restoreList() {
    const scrollable = this.host.getScrollable();
    if(scrollable) {
      scrollable.style.transform = '';
      scrollable.style.pointerEvents = '';
    }

    this.host.root.style.pointerEvents = '';
    const active = document.activeElement as HTMLElement | null;
    if(active && (this.veil.contains(active) || this.stage.contains(active) || this.closeBtn.contains(active))) {
      active.blur();
    }
  }

  private renderCards() {
    this.cards.forEach((card) => card.remove());
    this.cards = [];
    const poses = fanPoses(this.models.length);
    this.models.forEach((model, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'fan-card';
      card.dataset.peerId = String(model.peerId);
      card.style.setProperty('--fan-x', poses[index].x + 'px');
      card.style.setProperty('--fan-y', poses[index].y + 'px');
      card.style.setProperty('--fan-r', poses[index].r + 'deg');
      card.style.setProperty('--fan-i', String(index));

      if(model.avatarHTML) {
        const media = document.createElement('div');
        media.className = 'fan-card-avatar';
        media.innerHTML = model.avatarHTML;
        card.append(media);
      }

      const copy = document.createElement('div');
      copy.className = 'fan-card-copy';
      const title = document.createElement('b');
      title.textContent = model.title;
      const preview = document.createElement('p');
      preview.textContent = model.preview;
      copy.append(title, preview);
      card.append(copy);

      const badge = document.createElement('span');
      badge.className = 'fan-card-badge';
      badge.textContent = model.unread;
      card.append(badge);

      card.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.dismissCard(card, 1, () => {
          this.close();
          this.host.openPeer(model.peerId);
        });
      });

      this.bindSwipe(card, model.peerId);
      this.stage.append(card);
      this.cards.push(card);
    });

    if(!liteMode.isAvailable('motion')) {
      this.stage.classList.add('no-motion');
    }
  }

  private bindSwipe(card: HTMLElement, peerId: PeerId) {
    let startX = 0;
    let startY = 0;
    let dx = 0;
    const onMove = (event: PointerEvent) => {
      dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if(Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        return;
      }

      card.style.transform = `translate3d(calc(var(--fan-x) + ${dx}px), var(--fan-y), 0) rotate(var(--fan-r))`;
      card.style.opacity = String(Math.max(0.15, 1 - Math.abs(dx) / 280));
    };

    const onUp = (event: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if(Math.abs(dx) > 110) {
        event.preventDefault();
        this.dismissCard(card, Math.sign(dx) || 1, () => {
          this.models = this.models.filter((model) => model.peerId !== peerId);
          if(!this.models.length) {
            this.close();
          } else {
            this.renderCards();
          }
        });
        return;
      }

      card.style.transform = '';
      card.style.opacity = '';
    };

    card.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      startX = event.clientX;
      startY = event.clientY;
      dx = 0;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
  }

  private dismissCard(card: HTMLElement, direction: number, done: () => void) {
    card.classList.add('is-leaving');
    card.style.transform = `translate3d(calc(var(--fan-x) + ${direction * 360}px), var(--fan-y), 0) rotate(var(--fan-r))`;
    card.style.opacity = '0';
    card.style.pointerEvents = 'none';
    window.setTimeout(done, liteMode.isAvailable('motion') ? 280 : 0);
  }

  private bindGestures() {
    const root = this.host.root;
    root.addEventListener('pointerdown', (event) => {
      if(!isForkFeatureEnabled('fan') || event.button !== 0) {
        return;
      }

      if(this.open) {
        if((event.target as HTMLElement).closest('.fan-card, .fan-close')) {
          return;
        }

        this.tracking = true;
        this.startY = event.clientY;
        return;
      }

      const scrollable = this.host.getScrollable();
      if(!scrollable || scrollable.scrollTop > 2) {
        return;
      }

      this.dragging = true;
      this.startY = event.clientY;
      this.pull = 0;
    });

    window.addEventListener('pointermove', this.onWindowMove);
    window.addEventListener('pointerup', this.onWindowUp);
    window.addEventListener('pointercancel', this.onWindowUp);

    root.addEventListener('wheel', (event) => {
      if(!isForkFeatureEnabled('fan')) {
        return;
      }

      if(this.open) {
        if(event.deltaY > FAN_WHEEL_CLOSE) {
          this.close();
        }
        return;
      }

      const scrollable = this.host.getScrollable();
      if(!scrollable || scrollable.scrollTop > 2 || event.deltaY >= 0) {
        this.wheelAccum = 0;
        return;
      }

      this.wheelAccum += -event.deltaY;
      window.clearTimeout(this.wheelTimer);
      this.wheelTimer = window.setTimeout(() => {
        this.wheelAccum = 0;
        this.resetPull();
      }, 280);
      this.applyPull(Math.min(FAN_PULL_THRESHOLD, this.wheelAccum * 0.22));
      if(this.wheelAccum > FAN_WHEEL_OPEN) {
        this.wheelAccum = 0;
        this.show();
        this.resetPull();
      }
    }, {passive: true});
  }

  private onWindowMove = (event: PointerEvent) => {
    if(this.open && this.tracking) {
      if(event.clientY - this.startY > FAN_PULL_SLOP) {
        this.tracking = false;
        this.close();
      }
      return;
    }

    if(!this.dragging) {
      return;
    }

    const delta = event.clientY - this.startY;
    if(delta < FAN_PULL_SLOP) {
      this.applyPull(0);
      return;
    }

    this.pull = delta - FAN_PULL_SLOP;
    this.applyPull(this.pull);
    if(this.pull > FAN_PULL_THRESHOLD) {
      this.dragging = false;
      this.show();
      this.resetPull();
    }
  };

  private onWindowUp = () => {
    this.tracking = false;
    if(!this.dragging) {
      return;
    }

    this.dragging = false;
    this.resetPull();
  };

  private applyPull(value: number) {
    const scrollable = this.host.getScrollable();
    if(!scrollable) {
      return;
    }

    scrollable.style.transform = value ? `translate3d(0, ${Math.min(value, FAN_PULL_THRESHOLD)}px, 0)` : '';
  }

  private resetPull() {
    this.pull = 0;
    this.wheelAccum = 0;
    this.applyPull(0);
  }
}

let installed: FanOverlay | undefined;

export function installFan(host: FanHost): FanOverlay {
  installed?.destroy();
  installed = new FanOverlay(host);
  return installed;
}

export function getFanOverlay() {
  return installed;
}
