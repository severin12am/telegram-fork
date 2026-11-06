export type AvatarPoint = {
  mid: number,
  replyToMid?: number,
  cx: number,
  cy: number
};

export type ConnectorSegment = {
  from: AvatarPoint,
  to: AvatarPoint,
  d: string
};

export function connectorPath(parent: AvatarPoint, child: AvatarPoint, radius = 8): string {
  const px = parent.cx;
  const py = parent.cy;
  const cx = child.cx;
  const cy = child.cy;
  const dx = cx - px;
  const dy = cy - py;
  if(Math.abs(dx) < 0.6) {
    return `M ${px.toFixed(1)} ${py.toFixed(1)} L ${cx.toFixed(1)} ${cy.toFixed(1)}`;
  }

  const signX = dx >= 0 ? 1 : -1;
  const signY = dy >= 0 ? 1 : -1;
  const corner = Math.min(radius, Math.abs(dx) / 2, Math.max(0, Math.abs(dy) / 2));
  const yBefore = cy - corner * signY;
  const xAfter = px + corner * signX;
  return `M ${px.toFixed(1)} ${py.toFixed(1)} L ${px.toFixed(1)} ${yBefore.toFixed(1)} Q ${px.toFixed(1)} ${cy.toFixed(1)} ${xAfter.toFixed(1)} ${cy.toFixed(1)} L ${cx.toFixed(1)} ${cy.toFixed(1)}`;
}

export function connectorSegments(points: AvatarPoint[]): ConnectorSegment[] {
  const byMid = new Map(points.map((point) => [point.mid, point]));
  const out: ConnectorSegment[] = [];
  for(const child of points) {
    if(!child.replyToMid) {
      continue;
    }

    const parent = byMid.get(child.replyToMid);
    if(!parent) {
      continue;
    }

    out.push({
      from: parent,
      to: child,
      d: connectorPath(parent, child)
    });
  }

  return out;
}

function pointFromRow(row: HTMLElement, hostBox: DOMRect): AvatarPoint | undefined {
  const slot = row.querySelector<HTMLElement>('.reply-loom-avatar-slot') ||
    row.querySelector<HTMLElement>('.reply-loom-avatar');
  if(!slot) {
    return undefined;
  }

  const circle = slot.querySelector<HTMLElement>('.avatar') || slot;
  const box = circle.getBoundingClientRect();
  if(!(box.width > 0) || !(box.height > 0)) {
    return undefined;
  }

  return {
    mid: Number(row.dataset.mid) || 0,
    replyToMid: row.dataset.replyTo ? Number(row.dataset.replyTo) : undefined,
    cx: box.left - hostBox.left + box.width / 2,
    cy: box.top - hostBox.top + box.height / 2
  };
}

export function measureThreadAvatars(host: HTMLElement): AvatarPoint[] {
  const hostBox = host.getBoundingClientRect();
  const points: AvatarPoint[] = [];
  for(const row of host.querySelectorAll<HTMLElement>('.reply-loom-row')) {
    const point = pointFromRow(row, hostBox);
    if(point) {
      points.push(point);
    }
  }

  return points;
}

export function paintThreadConnectors(host: HTMLElement): ConnectorSegment[] {
  let svg = host.querySelector<SVGSVGElement>('svg.reply-loom-tree');
  if(!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('reply-loom-tree');
    svg.setAttribute('data-fork-probe', 'thread-tree');
    svg.setAttribute('aria-hidden', 'true');
    host.prepend(svg);
  }

  const width = Math.max(host.scrollWidth, host.clientWidth, 1);
  const height = Math.max(host.scrollHeight, host.clientHeight, 1);
  svg.setAttribute('width', String(Math.round(width)));
  svg.setAttribute('height', String(Math.round(height)));
  svg.setAttribute('viewBox', `0 0 ${Math.round(width)} ${Math.round(height)}`);

  const segments = connectorSegments(measureThreadAvatars(host));
  svg.replaceChildren();
  for(const segment of segments) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', segment.d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('data-from', String(segment.from.mid));
    path.setAttribute('data-to', String(segment.to.mid));
    svg.append(path);
  }

  return segments;
}
