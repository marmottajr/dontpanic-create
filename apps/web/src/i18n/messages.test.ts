import { describe, expect, it } from 'vitest';

import { LOCALES, SOURCE_LOCALE, type Locale } from './locales';
import { MESSAGES } from './messages';
import { PROOF_IDS } from './messages/types';
import { ANSWERABLE_STEPS } from '@/lib/configurator-context';
import { FEATURE_IDS, PRESET_IDS } from '@/lib/recipe-bridge';
import { STACK } from '@/content/stack';

/**
 * Paridade de chaves entre os sete idiomas.
 *
 * O tipo `Messages` já obriga toda chave a existir. O que ele não vê é o que este teste
 * cobre: array com comprimento diferente (uma `faq` com cinco perguntas num idioma e
 * seis noutro renderiza silenciosamente a menos), string vazia (que passa como `string`
 * e aparece como espaço em branco na tela) e texto que ficou sem traduzir por cópia.
 *
 * Sem isto, um idioma cai para chave crua ou para conteúdo pela metade sem ninguém
 * perceber — exatamente o defeito que o `apps/web` do dontpanic também testa.
 */

type Path = string;

/** Achata o dicionário em caminho → valor, com índice numérico para array. */
function flatten(value: unknown, prefix = ''): Map<Path, unknown> {
  const out = new Map<Path, unknown>();

  if (Array.isArray(value)) {
    out.set(`${prefix}[]`, value.length);
    value.forEach((item, index) => {
      for (const [path, leaf] of flatten(item, `${prefix}[${index}]`)) out.set(path, leaf);
    });
    return out;
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      for (const [path, leaf] of flatten(child, prefix ? `${prefix}.${key}` : key)) {
        out.set(path, leaf);
      }
    }
    return out;
  }

  out.set(prefix, value);
  return out;
}

const source = flatten(MESSAGES[SOURCE_LOCALE]);
const others = LOCALES.filter((locale) => locale !== SOURCE_LOCALE);

describe('dicionários', () => {
  it('cobre os sete idiomas declarados', () => {
    expect(Object.keys(MESSAGES).sort()).toEqual([...LOCALES].sort());
  });

  it.each(others)('%s tem exatamente os caminhos do idioma de origem', (locale: Locale) => {
    const target = flatten(MESSAGES[locale]);

    const missing = [...source.keys()].filter((path) => !target.has(path));
    const extra = [...target.keys()].filter((path) => !source.has(path));

    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it.each(LOCALES)('%s não tem texto vazio', (locale: Locale) => {
    const empty = [...flatten(MESSAGES[locale])].filter(
      ([, value]) => typeof value === 'string' && value.trim().length === 0,
    );
    expect(empty.map(([path]) => path)).toEqual([]);
  });

  it.each(LOCALES)('%s cobre todas as features e presets do CLI', (locale: Locale) => {
    const { features, presets } = MESSAGES[locale].configurator;
    expect(Object.keys(features).sort()).toEqual([...FEATURE_IDS].sort());
    expect(Object.keys(presets).sort()).toEqual([...PRESET_IDS].sort());
  });

  it.each(LOCALES)('%s tem um item de prova por id, na mesma ordem', (locale: Locale) => {
    expect(MESSAGES[locale].proof.items.map((item) => item.id)).toEqual([...PROOF_IDS]);
  });

  it.each(LOCALES)('%s descreve cada item da stack', (locale: Locale) => {
    expect(MESSAGES[locale].inside.stackRoles).toHaveLength(STACK.length);
  });

  /**
   * A grade "De fábrica" é 2×3 no desenho. Um idioma com cinco ou sete tópicos deixaria
   * um buraco ou uma linha órfã, e nada no tipo impede isso.
   */
  it.each(LOCALES)('%s tem seis tópicos de fábrica', (locale: Locale) => {
    expect(MESSAGES[locale].inside.factory).toHaveLength(6);
  });

  /** Os doze passos do assistente existem em todos os idiomas, com os três campos. */
  it.each(LOCALES)('%s descreve os doze passos do assistente', (locale: Locale) => {
    const steps = MESSAGES[locale].wizard.steps;
    expect(Object.keys(steps)).toHaveLength(12);
    for (const [id, step] of Object.entries(steps)) {
      expect(step.eyebrow, id).toBeTruthy();
      expect(step.question, id).toBeTruthy();
      expect(step.help, id).toBeTruthy();
    }
  });

  /**
   * O bloco técnico existe nos dez passos que perguntam, e só neles: revisão e
   * "pronto" não são recursos. É onde mora toda afirmação verificável do assistente,
   * então um idioma sem ele deixaria metade do público sem a informação que veio
   * buscar.
   */
  it.each(LOCALES)('%s tem o bloco técnico nos dez passos que perguntam', (locale: Locale) => {
    const steps = MESSAGES[locale].wizard.steps;
    for (const step of ANSWERABLE_STEPS) {
      expect(steps[step].whatChanges, `${locale}/${step}`).toBeTruthy();
    }
    expect(MESSAGES[locale].wizard.whatChangesLabel).toBeTruthy();
  });

  /**
   * Os números que a chamada promete saem daqui. Se alguém acrescentar um passo que
   * pergunta, ou um sexto erro à prova, este teste falha e aponta o texto que passou a
   * mentir — que é a única forma de o ADR 0006 sobreviver a quem não leu o ADR 0006.
   */
  it('a chamada promete a contagem que o código tem', () => {
    expect(ANSWERABLE_STEPS).toHaveLength(10); // "Dez perguntas. Um comando no fim."
    expect(PROOF_IDS).toHaveLength(5); // "Ver os cinco erros"
  });

  /**
   * `progress` é a única string com interpolação. Perder um dos marcadores numa
   * tradução renderiza "Passo de 12" — e o tipo não tem como ver isso.
   */
  it.each(LOCALES)('%s mantém os marcadores de {n} e {total}', (locale: Locale) => {
    expect(MESSAGES[locale].wizard.progress).toContain('{n}');
    expect(MESSAGES[locale].wizard.progress).toContain('{total}');
  });

  /**
   * Um trecho longo idêntico ao original em outro idioma é, quase sempre, uma tradução
   * esquecida — e não uma coincidência. O limiar de 90 caracteres é generoso para não
   * acusar frase curta que legitimamente coincide ("MIT", "Extras", "Cache").
   *
   * pt-PT é o caso especial, e por uma razão que não é preguiça: é a MESMA língua. Há
   * frases inteiras que coincidem legitimamente entre Brasil e Portugal, e reescrevê-las
   * só para satisfazer um teste pioraria o texto. Então aqui a exigência muda de forma:
   * não "toda frase difere", mas "a maior parte difere" — o que continua a pegar o erro
   * real, que é um arquivo copiado inteiro, sem exigir diferença artificial.
   */
  it.each(others)('%s traduz os textos longos do idioma de origem', (locale: Locale) => {
    const target = flatten(MESSAGES[locale]);
    const long = [...source].filter(([, value]) => typeof value === 'string' && value.length > 90);
    const identical = long.filter(([path, value]) => target.get(path) === value);

    const sameLanguage = locale.split('-')[0] === SOURCE_LOCALE.split('-')[0];
    if (sameLanguage) {
      expect(identical.length / long.length).toBeLessThan(0.25);
      return;
    }

    expect(identical.map(([path]) => path)).toEqual([]);
  });
});
