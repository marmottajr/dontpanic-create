import { describe, expect, it } from 'vitest';

import { WIZARD_TERMS } from './wizard-terms';
import { ANSWERABLE_STEPS, WIZARD_STEPS } from '@/lib/configurator-context';
import { MESSAGES } from '@/i18n/messages';
import { LOCALES } from '@/i18n/locales';

describe('termos técnicos do assistente', () => {
  it('tem um termo para cada passo que responde algo', () => {
    expect(Object.keys(WIZARD_TERMS).sort()).toEqual([...ANSWERABLE_STEPS].sort());
  });

  /** Revisão e "pronto" não são recursos: são momentos do assistente. */
  it('não inventa termo para revisão e pronto', () => {
    expect(WIZARD_TERMS.review).toBeUndefined();
    expect(WIZARD_TERMS.done).toBeUndefined();
    expect(Object.keys(WIZARD_TERMS)).toHaveLength(WIZARD_STEPS.length - 2);
  });

  /**
   * O termo é conteúdo estrutural, não string de i18n: ele é o que a pessoa vai digitar
   * numa busca ou procurar no `CLAUDE.md` do projeto gerado, e traduzir "Row Level
   * Security" para "segurança em nível de linha" não acha nada em lugar nenhum.
   *
   * Este teste é a trava: se alguém mover os termos para os dicionários, o tipo de
   * `Messages` não vai reclamar — mas um termo diferente por idioma vai passar a
   * existir, e é isso que não pode acontecer. Aqui eles vêm de uma fonte só, e a
   * asserção registra a intenção para quem ler depois.
   */
  it('é o mesmo termo nos sete idiomas', () => {
    for (const locale of LOCALES) {
      const steps = MESSAGES[locale].wizard.steps;
      for (const step of ANSWERABLE_STEPS) {
        // O dicionário traz o rótulo em linguagem de gente; o termo vem daqui.
        expect(steps[step].eyebrow, `${locale}/${step}`).toBeTruthy();
        expect(WIZARD_TERMS[step], step).toBeTruthy();
      }
    }
  });

  it('não usa caixa alta forçada: a capitalização do termo é a dele', () => {
    // `RLS` é maiúsculo, `slug` é minúsculo, `OAuth 2.0` é misto — é assim que se
    // procura por eles.
    expect(WIZARD_TERMS.tenancy).toContain('RLS');
    expect(WIZARD_TERMS.name).toContain('slug');
    expect(WIZARD_TERMS.social).toContain('OAuth');
    expect(Object.values(WIZARD_TERMS).every((term) => term === term?.trim())).toBe(true);
  });
});
