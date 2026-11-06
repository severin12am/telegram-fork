import {FAN_WHEEL_OPEN} from '@lib/forkFeatures/fan/overlayConstants';

/** Fractional scrollTop that still counts as the top of the list. */
export const FAN_TOP_EPSILON = 0.5;

export function listIsAtTop(scrollTop: number): boolean {
  return !(scrollTop > FAN_TOP_EPSILON);
}

export type FanWheelState = {
  accum: number,
  /** True while a gesture that started mid-list is still going. */
  blocked: boolean
};

/**
 * Fan may open only when the dialogs list is already at scrollTop 0 and the
 * user keeps pulling up (overscroll). A flick that merely *arrives* at the top
 * from mid-list must not open it.
 */
export function reduceFanWheel(
  state: FanWheelState,
  event: {scrollTop: number, deltaY: number},
  openThreshold = FAN_WHEEL_OPEN
): FanWheelState & {open: boolean} {
  if(!listIsAtTop(event.scrollTop)) {
    return {accum: 0, blocked: true, open: false};
  }

  if(state.blocked) {
    if(event.deltaY >= 0) {
      return {accum: 0, blocked: false, open: false};
    }

    return {accum: 0, blocked: true, open: false};
  }

  if(event.deltaY >= 0) {
    return {accum: 0, blocked: false, open: false};
  }

  const accum = state.accum + (-event.deltaY);
  return {accum, blocked: false, open: accum > openThreshold};
}

export function eventOnScrollable(target: EventTarget | null, scrollable: HTMLElement): boolean {
  if(!(target instanceof Node)) {
    return false;
  }

  return scrollable === target || scrollable.contains(target);
}

export function getFanScrollable(root: HTMLElement, preferred?: HTMLElement | null): HTMLElement | null {
  if(preferred && root.contains(preferred)) {
    return preferred;
  }

  const lists = root.querySelectorAll<HTMLElement>('.scrollable.scrollable-y');
  for(const list of lists) {
    if(list.offsetParent && list.clientHeight > 40) {
      return list;
    }
  }

  return lists[0] || null;
}
