export type LayoutBox = {
  left: number,
  top: number,
  right: number,
  bottom: number,
  width: number,
  height: number
};

export type ReplyLoomFit = {
  left: number,
  top: number,
  width: number,
  height: number
};

const GAP_BELOW_PINNED_PX = 4;
const DOCKED_LEFT_MIN_WIDTH = 925;

function boxFromRect(rect: DOMRect): LayoutBox {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}

function isDockedSidebar(sidebar: LayoutBox | null | undefined, viewportWidth: number): sidebar is LayoutBox {
  if(!sidebar || viewportWidth <= DOCKED_LEFT_MIN_WIDTH) {
    return false;
  }

  if(sidebar.width < 80) {
    return false;
  }

  if(sidebar.right < 80 || sidebar.left > viewportWidth - 80) {
    return false;
  }

  return true;
}

/**
 * Viewport box for the thread sheet: left edge after the docked sidebar,
 * right edge at the window (or the docked right column), top just below the
 * topbar and pinned plate, bottom at the composer.
 *
 * `#column-center` is translateX-centred, so a `position:absolute` sheet
 * mounted inside `.chat` cannot use `inset: 0` or even `.bubbles`'
 * compensatory insets without drifting. These numbers are viewport
 * coordinates for `position: fixed` on a parent that is not transformed.
 */
export function sheetBoxForChatColumn(input: {
  column: LayoutBox,
  topbar?: LayoutBox | null,
  pinned?: LayoutBox | null,
  input?: LayoutBox | null,
  sidebar?: LayoutBox | null,
  rightbar?: LayoutBox | null,
  rtl?: boolean,
  viewport: {width: number, height: number}
}): ReplyLoomFit {
  const rtl = !!input.rtl;
  const docked = isDockedSidebar(input.sidebar, input.viewport.width);
  let leftEdge = Math.max(0, input.column.left);
  let rightEdge = input.viewport.width;
  if(docked) {
    if(rtl) {
      leftEdge = 0;
      rightEdge = Math.min(rightEdge, input.sidebar.left);
    } else {
      leftEdge = input.sidebar.right;
      rightEdge = input.viewport.width;
    }
  }
  if(input.rightbar && input.rightbar.width > 80 && input.rightbar.left < input.viewport.width && input.rightbar.left > leftEdge) {
    if(rtl) {
      leftEdge = Math.max(leftEdge, input.rightbar.right);
    } else {
      rightEdge = Math.min(rightEdge, input.rightbar.left);
    }
  }

  let topEdge = Math.max(0, input.column.top);
  if(input.topbar && input.topbar.height > 0) {
    topEdge = Math.max(topEdge, input.topbar.bottom);
  }
  if(input.pinned && input.pinned.height > 0) {
    topEdge = Math.max(topEdge, input.pinned.bottom);
  }
  topEdge += GAP_BELOW_PINNED_PX;

  let bottomEdge = Math.min(input.viewport.height, input.column.bottom);
  if(input.input && input.input.height > 0 && input.input.top > topEdge) {
    bottomEdge = Math.min(bottomEdge, input.input.top);
  }

  return {
    left: Math.max(0, leftEdge),
    top: Math.max(0, topEdge),
    width: Math.max(0, Math.min(input.viewport.width, rightEdge) - Math.max(0, leftEdge)),
    height: Math.max(0, Math.min(input.viewport.height, bottomEdge) - Math.max(0, topEdge))
  };
}

function visibleBox(el: HTMLElement | null): LayoutBox | null {
  if(!el || el.classList.contains('hide') || el.hidden) {
    return null;
  }

  const rect = el.getBoundingClientRect();
  if(rect.width < 1 && rect.height < 1) {
    return null;
  }

  return boxFromRect(rect);
}

export function layoutReplyLoomSheet(sheet: HTMLElement, chat: HTMLElement): ReplyLoomFit | undefined {
  const bubbles = chat.querySelector<HTMLElement>('.bubbles');
  const columnEl = bubbles || chat;
  const topbar = chat.querySelector<HTMLElement>('.topbar');
  const plates = chat.querySelector<HTMLElement>('.topbar-floating-plates');
  const input = chat.querySelector<HTMLElement>('.chat-input');
  const sidebar = document.getElementById('column-left');

  const fit = sheetBoxForChatColumn({
    column: boxFromRect(columnEl.getBoundingClientRect()),
    topbar: visibleBox(topbar),
    pinned: visibleBox(plates),
    input: visibleBox(input),
    sidebar: visibleBox(sidebar),
    rightbar: document.body.classList.contains('is-right-column-shown') &&
      !document.body.classList.contains('right-column-floats') ?
      visibleBox(document.getElementById('column-right')) :
      null,
    rtl: document.documentElement.dir === 'rtl' || document.documentElement.classList.contains('is-rtl'),
    viewport: {width: window.innerWidth, height: window.innerHeight}
  });

  const left = fit.left;
  const top = fit.top;
  const width = fit.width;
  const height = fit.height;

  sheet.style.position = 'fixed';
  sheet.style.inset = 'auto';
  sheet.style.insetInline = 'auto';
  sheet.style.insetBlock = 'auto';
  sheet.style.left = left + 'px';
  sheet.style.top = top + 'px';
  sheet.style.right = 'auto';
  sheet.style.bottom = 'auto';
  sheet.style.width = width + 'px';
  sheet.style.height = height + 'px';
  sheet.style.maxWidth = width + 'px';
  sheet.style.maxHeight = height + 'px';
  sheet.style.boxSizing = 'border-box';
  sheet.style.overflow = 'hidden';
  sheet.style.transform = 'none';
  sheet.style.minWidth = '0';
  const chatBg = getComputedStyle(chat).backgroundColor;
  if(chatBg && chatBg !== 'rgba(0, 0, 0, 0)' && chatBg !== 'transparent') {
    sheet.style.backgroundColor = chatBg;
  }
  sheet.dataset.forkFit = `${left},${top},${width},${height}`;

  return {left, top, width, height};
}

export function sheetOverflowVsViewport(sheet: HTMLElement, viewport: {width: number, height: number}): {
  left: number,
  right: number,
  top: number,
  bottom: number
} {
  const rect = sheet.getBoundingClientRect();
  return {
    left: Math.min(0, rect.left),
    right: Math.max(0, rect.right - viewport.width),
    top: Math.min(0, rect.top),
    bottom: Math.max(0, rect.bottom - viewport.height)
  };
}
