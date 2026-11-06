import liteMode from '@helpers/liteMode';
import {
  formatYearRailLabel,
  mediaFromBubble,
  pickFocusBubble,
  shouldShowYearRail
} from '@lib/forkFeatures/yearRail/focusMessage';
import {isForkFeatureEnabled} from '@lib/forkFeatures/flags';

export type YearRailHost = {
  container: HTMLElement,
  chatInner: HTMLElement,
  scrollable: HTMLElement,
  getMessage: (mid: number) => {message?: string, date?: number, peerId?: PeerId} | undefined
};

export class YearRailLoupe {
  private root: HTMLElement;
  private label: HTMLElement;
  private text: HTMLElement;
  private media: HTMLElement;
  private visible = false;
  private hideTimer = 0;
  private lastMid = 0;
  private previewVideo?: HTMLVideoElement;

  public rebind(host: YearRailHost) {
    const changed = this.host.chatInner !== host.chatInner || this.host.scrollable !== host.scrollable;
    this.host = host;
    if(changed) {
      this.reset();
    }
  }

  public reset() {
    this.hide();
    this.lastMid = 0;
    this.media.replaceChildren();
  }

  constructor(private host: YearRailHost) {
    this.root = document.createElement('div');
    this.root.className = 'year-rail-loupe';
    this.root.dataset.forkFeature = 'year-rail';

    this.label = document.createElement('div');
    this.label.className = 'year-rail-loupe-k';

    this.text = document.createElement('p');
    this.media = document.createElement('div');
    this.media.className = 'year-rail-loupe-media';

    this.root.append(this.label, this.text, this.media);
    this.host.container.append(this.root);
  }

  public onScroll(isScrolling: boolean, lastDirection: number) {
    if(!isForkFeatureEnabled('yearRail')) {
      this.hide();
      return;
    }

    const scrollable = this.host.scrollable;
    const show = shouldShowYearRail({
      isScrolling,
      scrollTop: scrollable.scrollTop,
      scrollHeight: scrollable.scrollHeight,
      clientHeight: scrollable.clientHeight,
      lastDirection
    });

    if(!show) {
      this.scheduleHide();
      return;
    }

    this.update();
  }

  public destroy() {
    window.clearTimeout(this.hideTimer);
    this.stopVideo();
    this.root.remove();
  }

  private update() {
    const viewport = this.host.container.getBoundingClientRect();
    const bubbles = Array.from(this.host.chatInner.querySelectorAll<HTMLElement>('.bubble[data-mid]:not(.is-date)'));
    const bubble = pickFocusBubble(bubbles, viewport);
    if(!bubble) {
      this.scheduleHide();
      return;
    }

    const mid = +bubble.dataset.mid;
    const message = this.host.getMessage(mid);
    if(!message) {
      return;
    }

    this.label.textContent = formatYearRailLabel(message.date || 0);
    this.text.textContent = (message.message || '').trim() || this.fallbackCaption(bubble);
    if(mid !== this.lastMid) {
      this.lastMid = mid;
      this.fillMedia(bubble);
    }

    this.show();
  }

  private fallbackCaption(bubble: HTMLElement): string {
    if(bubble.querySelector('video')) {
      return 'Video';
    }

    if(bubble.querySelector('img:not(.emoji):not(.custom-emoji)')) {
      return 'Photo';
    }

    return '';
  }

  private fillMedia(bubble: HTMLElement) {
    this.stopVideo();
    this.media.replaceChildren();
    const {photoSrc, videoSrc} = mediaFromBubble(bubble);
    if(videoSrc) {
      const video = document.createElement('video');
      video.src = videoSrc;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      this.media.append(video);
      this.previewVideo = video;
      video.play()?.catch(() => {});
      return;
    }

    if(photoSrc) {
      const img = document.createElement('img');
      img.src = photoSrc;
      img.alt = '';
      this.media.append(img);
    }
  }

  private show() {
    window.clearTimeout(this.hideTimer);
    this.hideTimer = 0;
    this.visible = true;
    this.root.classList.add('is-open');
    if(!liteMode.isAvailable('motion')) {
      this.root.classList.add('no-motion');
    }
  }

  private scheduleHide() {
    if(!this.visible || this.hideTimer) {
      return;
    }

    this.hideTimer = window.setTimeout(() => this.hide(), 180);
  }

  private hide() {
    window.clearTimeout(this.hideTimer);
    this.hideTimer = 0;
    this.visible = false;
    this.lastMid = 0;
    this.root.classList.remove('is-open');
    this.stopVideo();
  }

  private stopVideo() {
    if(!this.previewVideo) {
      return;
    }

    this.previewVideo.pause();
    this.previewVideo.removeAttribute('src');
    this.previewVideo.load();
    this.previewVideo = undefined;
  }
}

const loupes = new WeakMap<HTMLElement, YearRailLoupe>();

export function ensureYearRail(host: YearRailHost): YearRailLoupe {
  let loupe = loupes.get(host.container);
  if(!loupe) {
    loupe = new YearRailLoupe(host);
    loupes.set(host.container, loupe);
  } else {
    loupe.rebind(host);
  }

  return loupe;
}

export function resetYearRail(container: HTMLElement) {
  loupes.get(container)?.reset();
}

export function destroyYearRail(container: HTMLElement) {
  loupes.get(container)?.destroy();
  loupes.delete(container);
}
