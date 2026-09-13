import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, LOCALES, detectLocale, isLocale, localeUrl } from './locales';

describe('detecção de idioma', () => {
  it('casa a tag inteira antes da subtag', () => {
    expect(detectLocale(['pt-PT', 'en'])).toBe('pt-pt');
    expect(detectLocale(['PT-pt'])).toBe('pt-pt');
  });

  /**
   * `pt` sem região resolve para pt-BR por uma razão de público, não de linguística: o
   * projeto é brasileiro, e quem está em Portugal costuma declarar `pt-PT`.
   */
  it('resolve pt sem região para pt-BR', () => {
    expect(detectLocale(['pt'])).toBe('pt-br');
    expect(detectLocale(['pt-AO'])).toBe('pt-br');
  });

  it('cai na subtag principal quando a região não tem página', () => {
    expect(detectLocale(['de-AT', 'en-US'])).toBe('de');
    expect(detectLocale(['es-MX'])).toBe('es');
  });

  it('respeita a ordem de preferência do navegador', () => {
    expect(detectLocale(['it', 'fr'])).toBe('it');
    expect(detectLocale(['fr', 'it'])).toBe('fr');
  });

  it('cai no padrão quando nada casa', () => {
    expect(detectLocale(['ja', 'ko'])).toBe(DEFAULT_LOCALE);
    expect(detectLocale([])).toBe(DEFAULT_LOCALE);
  });

  it('só reconhece os sete segmentos de URL', () => {
    expect(LOCALES.every(isLocale)).toBe(true);
    expect(isLocale('pt-BR')).toBe(false); // a URL é minúscula
    expect(isLocale('ja')).toBe(false);
  });

  it('monta URLs absolutas com barra final', () => {
    expect(localeUrl('pt-br')).toBe('https://getdontpanic.com/pt-br/');
  });
});
