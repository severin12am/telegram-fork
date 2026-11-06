export type ThreadLink = {
  mid: number,
  replyToMid?: number,
  replyToTopId?: number
};

export type ThreadLayoutItem = {
  mid: number,
  depth: number,
  replyToMid?: number
};

type ReplyToLike = {
  _?: string,
  reply_to_msg_id?: number,
  reply_to_top_id?: number
};

type MessageLike = {
  mid?: number,
  reply_to_mid?: number,
  reply_to?: ReplyToLike,
  replies?: {replies?: number}
};

/**
 * Walk `reply_to` toward the oldest ancestor we still have. If a parent is
 * missing from the local cache the walk stops there — that mid is still the
 * thread root we will ask the UI to load.
 */
export function findThreadRoot(seedMid: number, byMid: Map<number, ThreadLink>): number {
  const seen = new Set<number>();
  let current = seedMid;
  while(true) {
    if(seen.has(current)) {
      break;
    }

    seen.add(current);
    const link = byMid.get(current);
    if(!link?.replyToMid) {
      break;
    }

    current = link.replyToMid;
  }

  return current;
}

/**
 * Every message that belongs to the same reply tree as `seedMid`: the root
 * on top, then each reply with its depth (who replied to which).
 */
export function collectThreadTree(seedMid: number, links: ThreadLink[]): ThreadLayoutItem[] {
  if(!links.length) {
    return [{mid: seedMid, depth: 0}];
  }

  const byMid = new Map<number, ThreadLink>();
  for(const link of links) {
    byMid.set(link.mid, link);
  }

  if(!byMid.has(seedMid)) {
    byMid.set(seedMid, {mid: seedMid});
  }

  const root = findThreadRoot(seedMid, byMid);
  const children = new Map<number, number[]>();
  for(const link of byMid.values()) {
    if(!link.replyToMid) {
      continue;
    }

    const list = children.get(link.replyToMid);
    if(list) {
      list.push(link.mid);
    } else {
      children.set(link.replyToMid, [link.mid]);
    }
  }

  const ordered: ThreadLayoutItem[] = [];
  const seen = new Set<number>();
  const visit = (mid: number, depth: number) => {
    if(seen.has(mid)) {
      return;
    }

    seen.add(mid);
    const link = byMid.get(mid);
    ordered.push({
      mid,
      depth,
      replyToMid: link?.replyToMid
    });
    const next = children.get(mid);
    if(!next) {
      return;
    }

    next.slice().sort((a, b) => a - b).forEach((child) => visit(child, depth + 1));
  };

  visit(root, 0);
  if(!seen.has(seedMid)) {
    ordered.push({mid: seedMid, depth: 0, replyToMid: byMid.get(seedMid)?.replyToMid});
  }

  return ordered;
}

/**
 * Every message that belongs to the same reply tree as `seedMid`: the root,
 * every descendant we know about, and any ancestor still in cache. Sorted
 * oldest → newest so the sheet reads like a conversation.
 */
export function collectThreadMids(seedMid: number, links: ThreadLink[]): number[] {
  return collectThreadTree(seedMid, links).map((item) => item.mid);
}

export function getReplyToMid(message: MessageLike | undefined): number | undefined {
  if(!message) {
    return undefined;
  }

  if(typeof message.reply_to_mid === 'number' && message.reply_to_mid) {
    return message.reply_to_mid;
  }

  const replyTo = message.reply_to;
  if(replyTo?._ === 'messageReplyHeader' && replyTo.reply_to_msg_id) {
    return replyTo.reply_to_msg_id;
  }

  if(replyTo && !replyTo._ && replyTo.reply_to_msg_id) {
    return replyTo.reply_to_msg_id;
  }

  return undefined;
}

export function getReplyToTopId(message: MessageLike | undefined): number | undefined {
  if(!message) {
    return undefined;
  }

  const replyTo = message.reply_to;
  if(replyTo && replyTo.reply_to_top_id) {
    return replyTo.reply_to_top_id;
  }

  return undefined;
}

export function linkFromMessage(message: MessageLike | undefined, mid?: number): ThreadLink | undefined {
  const id = message?.mid ?? mid;
  if(!id) {
    return undefined;
  }

  return {
    mid: id,
    replyToMid: getReplyToMid(message),
    replyToTopId: getReplyToTopId(message)
  };
}

export function linksFromMessages(messages: MessageLike[]): ThreadLink[] {
  const links: ThreadLink[] = [];
  const seen = new Set<number>();
  for(const message of messages) {
    const link = linkFromMessage(message);
    if(!link || seen.has(link.mid)) {
      continue;
    }

    seen.add(link.mid);
    links.push(link);
  }

  return links;
}

/**
 * Take every loaded link that belongs to the same reply tree as `seed`:
 * ancestors, descendants, and sibling branches that share a top id.
 */
export function expandLinksForSeed(seed: ThreadLink, all: ThreadLink[]): ThreadLink[] {
  const byMid = new Map<number, ThreadLink>();
  for(const link of all) {
    byMid.set(link.mid, {
      mid: link.mid,
      replyToMid: link.replyToMid,
      replyToTopId: link.replyToTopId
    });
  }

  const seedLink: ThreadLink = {
    mid: seed.mid,
    replyToMid: seed.replyToMid ?? byMid.get(seed.mid)?.replyToMid,
    replyToTopId: seed.replyToTopId ?? byMid.get(seed.mid)?.replyToTopId
  };
  byMid.set(seed.mid, seedLink);

  let current = seedLink.replyToMid;
  const walked = new Set<number>([seed.mid]);
  while(current && !walked.has(current)) {
    walked.add(current);
    const parent = byMid.get(current);
    if(!parent) {
      byMid.set(current, {mid: current});
      break;
    }

    current = parent.replyToMid;
  }

  const root = findThreadRoot(seed.mid, byMid);
  const top = seedLink.replyToTopId || root;

  let changed = true;
  while(changed) {
    changed = false;
    for(const link of all) {
      if(byMid.has(link.mid)) {
        continue;
      }

      const pointsAtTree = !!(link.replyToMid && byMid.has(link.replyToMid));
      const sharesTop = !!(link.replyToTopId && (link.replyToTopId === top || link.replyToTopId === seed.mid || link.replyToTopId === root));
      if(pointsAtTree || sharesTop || link.mid === top) {
        byMid.set(link.mid, link);
        changed = true;
      }
    }
  }

  return [...byMid.values()];
}

/**
 * True when this message sits on a reply chain: it replies to something, or
 * something already loaded replies to it, or a comment thread has replies.
 */
export function messageHasReplyChain(
  message: MessageLike,
  links: ThreadLink[]
): boolean {
  if(getReplyToMid(message)) {
    return true;
  }

  if((message.replies?.replies || 0) > 0) {
    return true;
  }

  const mid = message.mid;
  if(!mid) {
    return false;
  }

  return links.some((link) => link.replyToMid === mid || link.replyToTopId === mid);
}
