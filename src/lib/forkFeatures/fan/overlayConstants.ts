/** Downward pull (px) before unread cards fan out. Small scrolls must not trip it. */
export const FAN_PULL_THRESHOLD = 140;
/** Extra slop before a pointer-down is treated as a pull at all. */
export const FAN_PULL_SLOP = 28;
/** Accumulated upward wheel delta (px) at the top of the list before opening. */
export const FAN_WHEEL_OPEN = 480;
/** Downward wheel delta while open that closes every card. */
export const FAN_WHEEL_CLOSE = 36;
/** Visible close-button copy. Never fall back to the i18n key. */
export const FAN_CLOSE_TEXT = 'Close all';
