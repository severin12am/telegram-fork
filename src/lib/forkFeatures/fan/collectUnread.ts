export type FanCardModel = {
  peerId: PeerId,
  title: string,
  preview: string,
  unread: string,
  avatarHTML: string
};

const UNREAD_BADGE = '.dialog-subtitle-badge-unread';

function isVisibleUnreadBadge(badge: HTMLElement | null): badge is HTMLElement {
  if(!badge) {
    return false;
  }

  return badge.classList.contains('is-visible') && !badge.classList.contains('backwards');
}

/**
 * Unread chats already drawn in the current folder. Using the live rows keeps
 * Fan on the same titles, previews and avatars Telegram just rendered.
 */
export function collectUnreadFromChatlist(root: HTMLElement): FanCardModel[] {
  const rows = Array.from(root.querySelectorAll<HTMLElement>('.chatlist-chat[data-peer-id]'));
  const cards: FanCardModel[] = [];
  const seen = new Set<string>();

  for(const row of rows) {
    const peerId = row.dataset.peerId;
    if(!peerId || seen.has(peerId)) {
      continue;
    }

    const badge = row.querySelector<HTMLElement>(UNREAD_BADGE);
    if(!isVisibleUnreadBadge(badge)) {
      continue;
    }

    seen.add(peerId);
    const title = (row.querySelector('.peer-title, .user-title')?.textContent || '').trim();
    const preview = (row.querySelector('.dialog-subtitle-span-last, .dialog-subtitle-span')?.textContent || '').trim();
    const avatar = row.querySelector('.avatar, .row-media');
    cards.push({
      peerId: peerId.toPeerId(),
      title: title || 'Chat',
      preview,
      unread: (badge.textContent || '').trim() || '1',
      avatarHTML: avatar ? avatar.outerHTML : ''
    });
  }

  return cards;
}

export type FanPose = {x: number, y: number, r: number};

/** Resting fan layout from the concept animation, scaled to however many cards we have. */
export function fanPoses(count: number): FanPose[] {
  if(count <= 0) {
    return [];
  }

  const poses: FanPose[] = [];
  const mid = (count - 1) / 2;
  for(let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i - mid) / Math.max(1, mid);
    poses.push({
      x: t * 36,
      y: 18 + i * 60,
      r: t * 11
    });
  }

  return poses;
}
