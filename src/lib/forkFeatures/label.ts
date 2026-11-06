import I18n, {LangPackKey} from '@lib/langPack';

/**
 * Plain text for a fork UI label. If the lang pack has not been applied yet,
 * or the server pack has no such key, `format` returns the key itself — never
 * show that raw key in the UI.
 */
export function forkLabel(key: LangPackKey, fallback: string): string {
  try {
    const text = I18n.format(key, true);
    if(typeof text === 'string' && text && text !== key) {
      return text;
    }
  } catch(_err) {}
  return fallback;
}
