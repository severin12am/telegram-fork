export type ThreadLink = {
  mid: number,
  replyToMid?: number
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
 * Every message that belongs to the same reply tree as `seedMid`: the root,
 * every descendant we know about, and any ancestor still in cache. Sorted
 * oldest → newest so the sheet reads like a conversation.
 */
export function collectThreadMids(seedMid: number, links: ThreadLink[]): number[] {
  if(!links.length) {
    return [seedMid];
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

  const ordered: number[] = [];
  const seen = new Set<number>();
  const visit = (mid: number) => {
    if(seen.has(mid)) {
      return;
    }

    seen.add(mid);
    ordered.push(mid);
    const next = children.get(mid);
    if(!next) {
      return;
    }

    next.slice().sort((a, b) => a - b).forEach(visit);
  };

  visit(root);
  if(!seen.has(seedMid)) {
    ordered.push(seedMid);
  }

  return ordered;
}

export function getReplyToMid(message: {
  reply_to?: {
    _?: string,
    reply_to_msg_id?: number
  }
}): number | undefined {
  const replyTo = message.reply_to;
  if(replyTo?._ === 'messageReplyHeader' && replyTo.reply_to_msg_id) {
    return replyTo.reply_to_msg_id;
  }

  return undefined;
}
