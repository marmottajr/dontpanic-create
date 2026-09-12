/**
 * Os sete idiomas da landing.
 *
 * Três coisas para saber antes de mexer:
 *
 * 1. **O segmento da URL é minúsculo, a tag BCP-47 não.** `/pt-br/` e
 *    `hreflang="pt-BR"`. Hospedagem estática serve arquivo, e arquivo com maiúscula
 *    no caminho é uma aposta em qual sistema de arquivos está do outro lado —
 *    S3 diferencia caixa, um bucket servido por CDN com normalização não. Minúsculo
 *    sempre resolve; a tag correta vai no `lang` e no `hreflang`, onde importa.
 *
 * 2. **`en` é o `x-default`.** É o idioma que um visitante de qualquer lugar entende
 *    com mais probabilidade, e é para onde a detecção cai quando `navigator.languages`
 *    não casa com nada.
 *
 * 3. **Bandeira não é idioma.** Ela acompanha o código do idioma, nunca o substitui:
 *    `en` não tem bandeira própria e o par pt-BR/pt-PT só se distingue pelo rótulo.
 *    Ver `components/flags.tsx`.
 */

export const LOCALES = ['pt-br', 'pt-pt', 'en', 'es', 'fr', 'de', 'it'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** O idioma do autor do projeto — o texto nasce aqui e é traduzido a partir dele. */
export const SOURCE_LOCALE: Locale = 'pt-br';

export interface LocaleInfo {
  /** Segmento da URL. */
  locale: Locale;
  /** Tag BCP-47 para `lang` e `hreflang`. */
  tag: string;
  /** Nome do idioma no próprio idioma — quem procura "Deutsch" não procura "Alemão". */
  name: string;
  /** Código curto exibido ao lado da bandeira. */
  short: string;
  /** País da bandeira, só para o `title` da imagem. */
  flagOf: string;
}

export const LOCALE_INFO: Record<Locale, LocaleInfo> = {
  'pt-br': { locale: 'pt-br', tag: 'pt-BR', name: 'Português', short: 'pt-BR', flagOf: 'Brasil' },
  'pt-pt': { locale: 'pt-pt', tag: 'pt-PT', name: 'Português', short: 'pt-PT', flagOf: 'Portugal' },
  en: { locale: 'en', tag: 'en', name: 'English', short: 'en', flagOf: 'United Kingdom' },
  es: { locale: 'es', tag: 'es', name: 'Español', short: 'es', flagOf: 'España' },
  fr: { locale: 'fr', tag: 'fr', name: 'Français', short: 'fr', flagOf: 'France' },
  de: { locale: 'de', tag: 'de', name: 'Deutsch', short: 'de', flagOf: 'Deutschland' },
  it: { locale: 'it', tag: 'it', name: 'Italiano', short: 'it', flagOf: 'Italia' },
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * URL canônica do site.
 *
 * Precisa ser absoluta: `hreflang` relativo é ignorado por buscador, e sem
 * `hreflang` recíproco sete páginas de conteúdo equivalente competem entre si na
 * indexação em vez de se apontarem. Este é o único lugar onde o domínio aparece.
 */
export const SITE_URL = 'https://dontpanic.dev';

export function localePath(locale: Locale): string {
  return `/${locale}/`;
}

export function localeUrl(locale: Locale): string {
  return `${SITE_URL}${localePath(locale)}`;
}

/**
 * Escolhe o idioma a partir do que o navegador declara.
 *
 * A ordem de `navigator.languages` é a preferência da pessoa, então a primeira
 * entrada que casar ganha — e casar é em dois níveis: tag inteira primeiro
 * (`pt-PT` tem página própria), subtag principal depois.
 *
 * O caso `pt` sem região resolve para `pt-BR` e não para `pt-PT` por uma razão de
 * público, não de linguística: o projeto é brasileiro e a maior parte de quem declara
 * só `pt` está no Brasil. Quem está em Portugal costuma declarar `pt-PT`.
 */
export function detectLocale(preferences: readonly string[]): Locale {
  for (const preference of preferences) {
    const normalized = preference.toLowerCase();
    if (isLocale(normalized)) return normalized;

    const primary = normalized.split('-')[0] ?? '';
    if (primary === 'pt') return 'pt-br';
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

/** Chave da escolha explícita. Separada da receita: são decisões independentes. */
export const LOCALE_STORAGE_KEY = 'dontpanic.locale.v1';

export function readStoredLocale(): Locale | null {
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return value && isLocale(value) ? value : null;
  } catch {
    // Aba privada faz o próprio acessor lançar, não só o getItem. Sem storage a
    // detecção por navegador continua funcionando — só não lembra da escolha.
    return null;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // idem
  }
}
