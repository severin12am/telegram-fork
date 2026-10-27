import {months} from '@helpers/date/common';

export type RailFocus = {
  mid: number,
  peerId: PeerId,
  date: number,
  text: string,
  photoSrc?: string,
  videoSrc?: string
};

export function formatYearRailLabel(timestampSec: number): string {
  const date = new Date(timestampSec * 1000);
  const month = months[date.getMonth()] || '';
  return `${month} ${date.getFullYear()}`.trim();
}

/**
 * The bubble nearest the loupe's rest position (~22% from the top of the
 * chat viewport), matching the concept animation.
 */
export function pickFocusBubble(
  bubbles: Array<HTMLElement>,
  viewport: DOMRect,
  ratio = 0.22
): HTMLElement | undefined {
  if(!bubbles.length) {
    return undefined;
  }

  const targetY = viewport.top + viewport.height * ratio;
  let best: HTMLElement | undefined;
  let bestDistance = Infinity;
  for(const bubble of bubbles) {
    const rect = bubble.getBoundingClientRect();
    if(rect.bottom < viewport.top || rect.top > viewport.bottom) {
      continue;
    }

    const midY = rect.top + rect.height / 2;
    const distance = Math.abs(midY - targetY);
    if(distance < bestDistance) {
      bestDistance = distance;
      best = bubble;
    }
  }

  return best;
}

export function mediaFromBubble(bubble: HTMLElement): {photoSrc?: string, videoSrc?: string} {
  const video = bubble.querySelector<HTMLVideoElement>('video');
  if(video?.currentSrc || video?.src) {
    return {videoSrc: video.currentSrc || video.src};
  }

  const images = Array.from(bubble.querySelectorAll<HTMLImageElement>('img'));
  const photo = images.find((img) => {
    if(!img.currentSrc && !img.src) {
      return false;
    }

    if(img.closest('.emoji, .custom-emoji, .reaction, .avatar, .time')) {
      return false;
    }

    return img.naturalWidth > 24 || img.width > 24 || img.clientWidth > 24;
  });

  return photo ? {photoSrc: photo.currentSrc || photo.src} : {};
}

export function shouldShowYearRail(options: {
  isScrolling: boolean,
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  lastDirection: number
}): boolean {
  const overflow = options.scrollHeight - options.clientHeight;
  if(overflow < 240) {
    return false;
  }

  if(options.scrollTop <= 8) {
    return false;
  }

  return options.isScrolling && options.lastDirection !== 0;
}
