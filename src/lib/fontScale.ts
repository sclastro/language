/**
 * 全 app 字體大小(S / M / L / XL)。
 *
 * 樣式表的字體全部以 rem 表示,所以只需在 <html> 設 `data-font`,
 * globals.css 便會改變根字號,所有文字按比例放大縮小。
 * 設定存於 localStorage(只屬這部機,不同步:手機與電腦需要的大小本來就不同)。
 */
export const FONT_KEY = "english-tutor-font-v1";

export const FONT_SIZES = [
  { id: "s", label: "S" },
  { id: "m", label: "M" },
  { id: "l", label: "L" },
  { id: "xl", label: "XL" },
] as const;

export type FontSize = (typeof FONT_SIZES)[number]["id"];

/** 預設 L:舊版(即 M)在 Galaxy Fold 外屏上偏細。 */
export const DEFAULT_FONT: FontSize = "l";

export function isFontSize(v: unknown): v is FontSize {
  return FONT_SIZES.some((f) => f.id === v);
}

export function getFontSize(): FontSize {
  try {
    const v = localStorage.getItem(FONT_KEY);
    if (isFontSize(v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_FONT;
}

export function setFontSize(size: FontSize) {
  document.documentElement.dataset.font = size;
  try {
    localStorage.setItem(FONT_KEY, size);
  } catch {
    /* ignore */
  }
}

/**
 * 在首次繪製前執行的 inline script(見 layout.tsx)。
 * 若等 React hydrate 後才設定,頁面會先以預設大小畫出,再跳到用戶選的大小。
 */
export const FONT_INIT_SCRIPT = `try{var f=localStorage.getItem(${JSON.stringify(
  FONT_KEY
)});if(f==="s"||f==="m"||f==="l"||f==="xl")document.documentElement.dataset.font=f}catch(e){}`;
