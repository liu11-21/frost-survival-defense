export type TranslationDictionary = Record<string, string>;

export type SupportedLocale = "zh-TW" | "en" | "ja";

export interface TranslationParams {
  [key: string]: string | number;
}
