import {Message} from '@layer';
import ListenerSetter from '@helpers/listenerSetter';
import cancelEvent from '@helpers/dom/cancelEvent';
import {cancelContextMenuOpening} from '@helpers/dom/attachContextMenuListener';
import {TOUCH_HOLD_DURATION} from '@helpers/dom/touchHold';
import {isForkFeatureEnabled} from '@lib/forkFeatures/flags';
import {chatMessageHasReplyChain, openReplyLoom, ReplyLoomHost} from '@lib/forkFeatures/replyLoom/sheet';

const MOVE_PX = 10;

/**
 * Long-press (touch or primary mouse button) opens Reply Loom on a message
 * that already sits on a reply chain. Right-click still uses the context menu.
 */
export function attachReplyLoomPress(options: {
  element: HTMLElement,
  listenerSetter: ListenerSetter,
  getHost: () => ReplyLoomHost,
  getMessage: (bubble: HTMLElement) => Message.message | undefined
}) {
  let timer = 0;
  let startX = 0;
  let startY = 0;
  let bubble: HTMLElement | null = null;
  let suppressClick = false;

  const clearTimer = () => {
    window.clearTimeout(timer);
    timer = 0;
    bubble = null;
  };

  const onMove = (event: PointerEvent) => {
    if(!timer) {
      return;
    }

    if(Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_PX) {
      clearTimer();
    }
  };

  const onUp = () => {
    clearTimer();
  };

  options.listenerSetter.add(options.element)('pointerdown', (event: PointerEvent) => {
    if(!isForkFeatureEnabled('replyLoom')) {
      return;
    }

    if(event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if(target.closest('a, .audio, .document, input, textarea, .reply-markup-button, .audio-to-text-button, .voice-score-word, .bubble-beside-button')) {
      return;
    }

    const next = target.closest('.bubble[data-mid]') as HTMLElement | null;
    if(!next || next.classList.contains('is-date') || next.classList.contains('bubble-first')) {
      return;
    }

    startX = event.clientX;
    startY = event.clientY;
    bubble = next;
    timer = window.setTimeout(() => {
      const held = bubble;
      clearTimer();
      if(!held) {
        return;
      }

      const host = options.getHost();
      const message = options.getMessage(held);
      if(!message || !chatMessageHasReplyChain(message, host.chatInner, (mid) => host.chat.getMessage(mid))) {
        return;
      }

      cancelContextMenuOpening();
      suppressClick = true;
      window.getSelection()?.removeAllRanges();
      openReplyLoom(host, message);
    }, TOUCH_HOLD_DURATION);
  });

  options.listenerSetter.add(options.element)('pointermove', onMove);
  options.listenerSetter.add(options.element)('pointerup', onUp);
  options.listenerSetter.add(options.element)('pointercancel', onUp);
  options.listenerSetter.add(options.element)('click', (event: MouseEvent) => {
    if(!suppressClick) {
      return;
    }

    suppressClick = false;
    cancelEvent(event);
  }, {capture: true});
}
