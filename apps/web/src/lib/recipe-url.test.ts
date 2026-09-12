import { describe, expect, it } from 'vitest';

import {
  buildCommand,
  DEFAULT_PRESET,
  presetRecipe,
  PRESETS,
  PRESET_IDS,
  type PresetId,
} from './recipe-bridge';
import { defaultState, parseRecipe, SAMPLE_PROJECT, serializeRecipe } from './recipe-url';

describe('serialização na URL', () => {
  it('não escreve nada além do preset quando nada foi mudado', () => {
    const { recipe, preset } = defaultState();
    expect(serializeRecipe(recipe, preset)).toBe(`preset=${DEFAULT_PRESET}`);
  });

  it.each(PRESET_IDS)('faz round-trip do preset %s intocado', (preset: PresetId) => {
    const recipe = presetRecipe(preset, { ...SAMPLE_PROJECT });
    const parsed = parseRecipe(serializeRecipe(recipe, preset));

    expect(parsed.preset).toBe(preset);
    expect(parsed.recipe).toEqual(recipe);
  });

  it('mantém a URL legível: o delta aparece por nome', () => {
    const { recipe, preset } = defaultState();
    recipe.features.twoFactor = false;
    recipe.features.captcha = false;
    recipe.features.easterEggs = true;

    const query = serializeRecipe(recipe, preset);
    expect(query).toContain('no=two-factor%2Ccaptcha');
    expect(query).toContain('yes=easter-eggs');
    expect(query).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/); // nada de base64 opaco
  });

  it('faz round-trip de um delta completo', () => {
    const { recipe, preset } = defaultState();
    recipe.project.displayName = 'Loja da Ana';
    recipe.project.slug = 'loja';
    recipe.features.oauth = true;
    recipe.features.easterEggs = true;
    recipe.drivers.mail = 'ses';
    recipe.drivers.cache = 'memory';
    recipe.i18n.locales = ['pt', 'es'];
    recipe.options.install = false;
    recipe.options.force = true;

    const parsed = parseRecipe(serializeRecipe(recipe, preset));
    expect(parsed.recipe).toEqual(recipe);
  });

  it('preserva o slug customizado e omite o derivado', () => {
    const { recipe, preset } = defaultState();
    recipe.project.displayName = 'API Gateway';
    recipe.project.slug = 'api-gateway';
    expect(serializeRecipe(recipe, preset)).not.toContain('slug=');

    recipe.project.slug = 'gw';
    expect(parseRecipe(serializeRecipe(recipe, preset)).recipe.project.slug).toBe('gw');
  });

  /**
   * Um link de uma versão futura, com uma feature que esta página não conhece, tem que
   * abrir. Cair numa tela de erro por causa de um parâmetro a mais transformaria cada
   * release do CLI numa quebra de todos os links já compartilhados.
   */
  it('ignora em silêncio o que não reconhece', () => {
    const parsed = parseRecipe(
      '?preset=quantum&no=teleporte,two-factor&db=oracle&oauth=myspace,google&opts=no-git,voar',
    );

    expect(parsed.preset).toBe(DEFAULT_PRESET);
    expect(parsed.recipe.features.twoFactor).toBe(false);
    expect(parsed.recipe.drivers.db).toBe(PRESETS[DEFAULT_PRESET].drivers.db);
    expect(parsed.recipe.oauth.providers).toEqual(['google']);
    expect(parsed.recipe.options.git).toBe(false);
  });

  it('aceita a query com e sem o "?" inicial', () => {
    expect(parseRecipe('?preset=minimal').preset).toBe('minimal');
    expect(parseRecipe('preset=minimal').preset).toBe('minimal');
  });

  /**
   * A razão de o site existir: a string que ele mostra é a que o CLI entende. Se algum
   * dia a URL e o comando divergirem, é aqui que aparece.
   */
  it('a receita reidratada da URL produz o mesmo comando', () => {
    const { recipe, preset } = defaultState();
    recipe.features.twoFactor = false;
    recipe.drivers.mail = 'console';

    const parsed = parseRecipe(serializeRecipe(recipe, preset));
    expect(buildCommand(parsed.recipe, parsed.preset)).toBe(buildCommand(recipe, preset));
  });
});
