import { describe, expect, it } from 'vitest';

import {
  entryChoice,
  entryFeatures,
  languageChoice,
  PLATFORM_REQUIRES,
  syncPlatform,
  type EntryChoice,
} from './wizard-answers';
import {
  DEFAULT_PRESET,
  presetRecipe,
  PRESETS,
  PRESET_IDS,
  reconcileRecipe,
  validateRecipe,
  type PresetId,
} from './recipe-bridge';
import { SAMPLE_PROJECT } from './recipe-url';

const recipeOf = (preset: PresetId) => presetRecipe(preset, { ...SAMPLE_PROJECT });

describe('respostas do assistente', () => {
  it('lê a porta de entrada dos dois campos que a compõem', () => {
    expect(entryChoice({ ...PRESETS.saas.features })).toBe('open');
    expect(entryChoice({ ...PRESETS.internal.features })).toBe('invite');
    expect(entryChoice({ ...PRESETS.minimal.features })).toBe('seed');
  });

  /**
   * O ida-e-volta é o que garante que voltar um passo mostre a resposta que a pessoa
   * deu. Se `entryFeatures` e `entryChoice` discordarem, o passo 4 abre marcando outra
   * opção — e ninguém entende por quê.
   */
  it.each(['open', 'invite', 'seed'] as EntryChoice[])(
    'faz round-trip da resposta %s',
    (choice) => {
      const features = { ...recipeOf('saas').features, ...entryFeatures(choice) };
      expect(entryChoice(features)).toBe(choice);
    },
  );

  it('trata cadastro aberto sem convite como porta aberta', () => {
    const features = { ...recipeOf('saas').features, publicSignup: true, invitations: false };
    expect(entryChoice(features)).toBe('open');
  });

  it('lê a resposta de idiomas da feature e da contagem', () => {
    const one = recipeOf('internal');
    expect(languageChoice(one)).toBe('one');

    const many = recipeOf('saas');
    expect(many.i18n.locales.length).toBeGreaterThan(1);
    expect(languageChoice(many)).toBe('many');

    // i18n ligado com um idioma só continua sendo "um idioma" para a pergunta: é o que
    // a pessoa vê na tela, e é o que o `--i18n` vai carregar.
    expect(languageChoice({ ...many, i18n: { locales: ['pt'], defaultLocale: 'pt' } })).toBe('one');
  });

  /**
   * O preset do passo 2 pré-responde os outros oito. Se algum preset deixasse uma
   * pergunta sem resposta legível, o passo abriria sem nada marcado — e "Usar o
   * recomendado" não recomendaria nada.
   */
  it.each(PRESET_IDS)('o preset %s responde todas as perguntas', (preset: PresetId) => {
    const recipe = recipeOf(preset);
    expect(['open', 'invite', 'seed']).toContain(entryChoice(recipe.features));
    expect(['one', 'many']).toContain(languageChoice(recipe));
    expect(typeof recipe.features.multiTenant).toBe('boolean');
    expect(typeof recipe.features.twoFactor).toBe('boolean');
    expect(typeof recipe.features.plans).toBe('boolean');
    expect(typeof recipe.features.files).toBe('boolean');
    expect(typeof recipe.features.oauth).toBe('boolean');
    expect(typeof recipe.features.captcha).toBe('boolean');
  });

  it('o preset padrão abre coerente', () => {
    expect(PRESET_IDS).toContain(DEFAULT_PRESET);
    expect(entryChoice(recipeOf(DEFAULT_PRESET).features)).toBe('open');
  });
});

describe('painel da plataforma segue as respostas', () => {
  // O mesmo caminho do CLI: reconciliar e só então validar. Desligar multi-tenancy também
  // invalida o registro público (I11), e esse o CLI corrige sozinho — a pergunta aqui é
  // se sobra alguma recusa SEM correção, que é o que chegaria ao terminal como erro.
  const blocking = (recipe: ReturnType<typeof recipeOf>) =>
    validateRecipe(reconcileRecipe(recipe).recipe).filter((issue) => issue.level === 'error');

  /**
   * O caso que motivou a regra: nos presets com painel, responder "não" a qualquer uma
   * das quatro dependências montava um comando que o CLI recusa. Aqui cada uma é
   * desligada pelo mesmo caminho do assistente, e a receita tem de sair aceitável.
   */
  it.each(
    PRESET_IDS.filter((preset) => PRESETS[preset].features.platform).flatMap((preset) =>
      PLATFORM_REQUIRES.filter((id) => id !== 'audit').map((id) => [preset, id] as const),
    ),
  )('no preset %s, desligar %s desliga o painel e o CLI aceita', (preset, id) => {
    const recipe = recipeOf(preset);
    recipe.features[id] = false;
    syncPlatform(recipe, preset, id);
    expect(recipe.features.platform).toBe(false);
    expect(blocking(recipe)).toEqual([]);
  });

  it('o painel volta quando a pessoa muda de ideia', () => {
    const recipe = recipeOf('complete');
    recipe.features.plans = false;
    syncPlatform(recipe, 'complete', 'plans');
    recipe.features.plans = true;
    syncPlatform(recipe, 'complete', 'plans');
    expect(recipe.features.platform).toBe(true);
  });

  it('um preset sem painel nunca o ganha por uma resposta', () => {
    const preset = PRESET_IDS.find((p) => !PRESETS[p].features.platform);
    expect(preset).toBeDefined();
    const recipe = recipeOf(preset as PresetId);
    for (const id of PLATFORM_REQUIRES) {
      recipe.features[id] = true;
      syncPlatform(recipe, preset as PresetId, id);
    }
    expect(recipe.features.platform).toBe(false);
  });

  it('ignora features de que o painel não depende', () => {
    const recipe = recipeOf('complete');
    recipe.features.plans = false; // estado incoerente montado à mão
    syncPlatform(recipe, 'complete', 'files');
    expect(recipe.features.platform).toBe(true);
  });
});
