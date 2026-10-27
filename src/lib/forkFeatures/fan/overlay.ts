import liteMode from '@helpers/liteMode';
import {i18n} from '@lib/langPack';
import {collectUnreadFromChatlist, FanCardModel, fanPoses} from '@lib/forkFeatures/fan/collectUnread';
import {isForkFeatureEnabled} from '@lib/forkFeatures/flags';

export type FanHost = {
  root: HTMLElement,
  getScrollable: () => HTMLElement | null,
  openPeer: (peerId: PeerId) => void
};

const PULL_THRESHOLD = 72;

export class FanOverlay {
  private veil: HTMLElement;
  private stage: HTMLElement;
  private empty: HTMLElement;
  private open = false;
  private pull = 0;
  private dragging = false;
  private startY = 0;
  private wheelAccum = 0;
  private cards: HTMLElement[] = [];
  private models: FanCardModel[] = [];

  constructor(private host: FanHost) {
    this.veil = document.createElement('div');
    this.veil.className = 'fan-veil';
    this.veil.addEventListener('click', () => this.close());

    this.stage = document.createElement('div');
    this.stage.className = 'fan-stage';
    this.stage.dataset.forkFeature = 'fan';

    this.empty = document.createElement('div');
    this.empty.className = 'fan-empty';
    this.empty.append(i18n('ForkFeatures.FanEmpty'));

    this.host.root.append(this.veil, this.stage, this.empty);
    this.bindPull();
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
    this.renderCards();
    if(!models.length) {
      this.empty.classList.add('is-open');
    }
  }

  public close() {
    if(!this.open) {
      return;
    }

    this.open = false;
    this.host.root.classList.remove('has-fan');
    this.veil.classList.remove('is-open');
    this.stage.classList.remove('is-open');
    this.empty.classList.remove('is-open');
    this.cards.forEach((card) => card.remove());
    this.cards = [];
    this.resetPull();
  }

  public destroy() {
    this.close();
    this.veil.remove();
    this.stage.remove();
    this.empty.remove();
  }

  private renderCards() {
    this.cards.forEach((card) => card.remove());
    this.cards = [];
    const poses = fanPoses(this.models.length);
    this.models.forEach((model, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'fan-card';
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
        this.dismissCard(card, 1, () => this.host.openPeer(model.peerId));
      });

      this.bindSwipe(card, index);
      this.stage.append(card);
      this.cards.push(card);
    });

    if(!liteMode.isAvailable('motion')) {
      this.stage.classList.add('no-motion');
    }
  }

  private bindSwipe(card: HTMLElement, index: number) {
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
      if(Math.abs(dx) > 110) {
        event.preventDefault();
        this.dismissCard(card, Math.sign(dx) || 1, () => {
          this.models.splice(index, 1);
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
      startX = event.clientX;
      startY = event.clientY;
      dx = 0;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  private dismissCard(card: HTMLElement, direction: number, done: () => void) {
    card.classList.add('is-leaving');
    card.style.transform = `translate3d(calc(var(--fan-x) + ${direction * 360}px), var(--fan-y), 0) rotate(var(--fan-r))`;
    card.style.opacity = '0';
    window.setTimeout(done, liteMode.isAvailable('motion') ? 280 : 0);
  }

  private bindPull() {
    const root = this.host.root;
    root.addEventListener('pointerdown', (event) => {
      if(this.open || !isForkFeatureEnabled('fan')) {
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

    window.addEventListener('pointermove', (event) => {
      if(!this.dragging) {
        return;
      }

      this.pull = Math.max(0, event.clientY - this.startY);
      this.applyPull(this.pull);
      if(this.pull > PULL_THRESHOLD) {
        this.dragging = false;
        this.show();
        this.resetPull();
      }
    });

    window.addEventListener('pointerup', () => {
      if(!this.dragging) {
        return;
      }

      this.dragging = false;
      this.resetPull();
    });

    root.addEventListener('wheel', (event) => {
      if(this.open || !isForkFeatureEnabled('fan')) {
        return;
      }

      const scrollable = this.host.getScrollable();
      if(!scrollable || scrollable.scrollTop > 2 || event.deltaY >= 0) {
        this.wheelAccum = 0;
        return;
      }

      this.wheelAccum += -event.deltaY;
      this.applyPull(Math.min(PULL_THRESHOLD, this.wheelAccum * 0.35));
      if(this.wheelAccum > 140) {
        this.wheelAccum = 0;
        this.show();
        this.resetPull();
      }
    }, {passive: true});
  }

  private applyPull(value: number) {
    const scrollable = this.host.getScrollable();
    if(!scrollable) {
      return;
    }

    scrollable.style.transform = value ? `translate3d(0, ${Math.min(value, PULL_THRESHOLD)}px, 0)` : '';
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
