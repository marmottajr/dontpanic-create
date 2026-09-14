'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  buildCommand,
  cloneRecipe,
  deriveNames,
  hasBlockingIssue,
  PRESETS,
  presetRecipe,
  reconcileRecipe,
  slugify,
  toFlags,
  validateDisplayName,
  validateRecipe,
  validateSlug,
  type CaptchaDriver,
  type DriverSelection,
  type FeatureId,
  type GeneratorOptions,
  type NameForms,
  type OAuthProvider,
  type PresetId,
  type Recipe,
  type RecipeIssue,
  type ValidationIssue,
} from './recipe-bridge';
import { readStoredQuery, writeStoredQuery } from './recipe-store';
import { addressBarQuery, defaultState, parseRecipe, serializeRecipe } from './recipe-url';
import { syncPlatform } from './wizard-answers';

export interface CommandChip {
  flag: string;
  /** `undefined` quando nenhuma dimensão conhecida reivindicou a flag: mostra, não remove. */
  onRemove?: () => void;
}

export interface ConfiguratorState {
  recipe: Recipe;
  preset: PresetId;
  command: string;
  chips: CommandChip[];
  names: NameForms;
  nameIssues: ValidationIssue[];
  slugIssues: ValidationIssue[];
  /** O nome impede gerar o projeto? */
  nameBlocks: boolean;
  issues: RecipeIssue[];
  shareQuery: string;
  hydrated: boolean;

  setPreset: (preset: PresetId) => void;
  setDisplayName: (value: string) => void;
  setSlug: (value: string) => void;
  setFeature: (id: FeatureId, enabled: boolean) => void;
  setDriver: <K extends keyof DriverSelection>(key: K, value: DriverSelection[K]) => void;
  setOAuthProviders: (providers: OAuthProvider[]) => void;
  setLocales: (locales: string[]) => void;
  setDefaultLocale: (locale: string) => void;
  setOption: (key: keyof GeneratorOptions, value: boolean) => void;
  /** `none` desliga a feature; qualquer outro valor a liga com aquele driver. */
  setCaptcha: (driver: CaptchaDriver) => void;
  applyFeatureFix: (feature: FeatureId, enable: boolean) => void;
  resetToPreset: () => void;
}

type Draft = (recipe: Recipe) => void;

export function useConfigurator(): ConfiguratorState {
  const [state, setState] = useState(defaultState);
  const [hydrated, setHydrated] = useState(false);

  /**
   * Reidratação, em ordem de autoridade: query string, depois `localStorage`, depois o
   * preset padrão.
   *
   * A URL vem primeiro porque um link compartilhado é a intenção de outra pessoa: se o
   * `localStorage` do visitante vencesse, abrir o link do colega mostraria a
   * configuração *dele mesmo* — e ninguém entenderia por quê.
   *
   * Roda só depois da montagem. Com export estático o HTML é gerado sem saber a URL,
   * então ler a query no primeiro render produziria markup diferente do do servidor e o
   * React descartaria a árvore inteira.
   */
  useEffect(() => {
    const fromUrl = window.location.search.length > 1 ? window.location.search : null;
    const source = fromUrl ?? readStoredQuery();
    if (source) {
      const parsed = parseRecipe(source);
      // Um link pode chegar incoerente — escrito à mão, ou gerado por uma versão com
      // outras dependências entre features. Reconciliar aqui (e só aqui) faz a página
      // abrir mostrando uma receita que o CLI aceita, sem acusar o visitante de um erro
      // que não foi dele.
      const { recipe } = reconcileRecipe(parsed.recipe);
      setState({ recipe, preset: parsed.preset });
    }
    setHydrated(true);
  }, []);

  const shareQuery = useMemo(() => serializeRecipe(state.recipe, state.preset), [state]);

  /**
   * A URL é o estado canônico visível. `replaceState` e não `pushState`: cada toggle
   * empilharia uma entrada no histórico, e o botão de voltar deixaria de voltar para a
   * página anterior.
   */
  useEffect(() => {
    if (!hydrated) return;
    const query = addressBarQuery(state.recipe, state.preset);
    const target = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (target !== current) window.history.replaceState(null, '', target);
    writeStoredQuery(shareQuery);
  }, [state, shareQuery, hydrated]);

  const update = useCallback((mutate: Draft) => {
    setState((current) => {
      const draft = cloneRecipe(current.recipe);
      mutate(draft);
      return { ...current, recipe: draft };
    });
  }, []);

  const setPreset = useCallback((preset: PresetId) => {
    setState((current) => ({
      preset,
      // Trocar de preset descarta os toggles, mas nunca o nome: quem digitou "Acme
      // Corp" e depois foi comparar presets não quer digitar de novo.
      recipe: presetRecipe(preset, current.recipe.project),
    }));
  }, []);

  const setDisplayName = useCallback(
    (value: string) => {
      update((draft) => {
        // O slug acompanha o nome enquanto for o derivado dele. Editado à mão, ele passa
        // a ser autoridade — o mesmo contrato de `deriveNames`, que privilegia o slug
        // customizado para as formas de código.
        const slugWasDerived = draft.project.slug === slugify(draft.project.displayName);
        draft.project.displayName = value;
        if (slugWasDerived) draft.project.slug = slugify(value);
      });
    },
    [update],
  );

  const setSlug = useCallback(
    (value: string) => update((draft) => void (draft.project.slug = value)),
    [update],
  );

  /**
   * Liga ou desliga uma feature — e mantém o painel da plataforma coerente com ela.
   *
   * O painel não é pergunta do assistente: vem do preset. Por isso ele tem de seguir as
   * respostas de que depende (`syncPlatform`). Sem isso, responder "sem planos" ou
   * "só pelo seed" num preset com painel montava um comando que o CLI recusa — um em
   * cada quatro caminhos pelo assistente terminava num erro no terminal.
   */
  const setFeature = useCallback((id: FeatureId, enabled: boolean) => {
    setState((current) => {
      const draft = cloneRecipe(current.recipe);
      draft.features[id] = enabled;
      syncPlatform(draft, current.preset, id);
      return { ...current, recipe: draft };
    });
  }, []);

  const setDriver = useCallback(
    <K extends keyof DriverSelection>(key: K, value: DriverSelection[K]) =>
      update((draft) => void (draft.drivers[key] = value)),
    [update],
  );

  const setOAuthProviders = useCallback(
    (providers: OAuthProvider[]) => update((draft) => void (draft.oauth.providers = providers)),
    [update],
  );

  const setLocales = useCallback(
    (locales: string[]) => {
      update((draft) => {
        draft.i18n.locales = locales;
        // O idioma padrão tem que continuar existindo na lista, senão o projeto nasce
        // apontando para um arquivo de mensagens que não foi gerado.
        if (locales.length > 0 && !locales.includes(draft.i18n.defaultLocale)) {
          draft.i18n.defaultLocale = locales[0] as string;
        }
      });
    },
    [update],
  );

  const setDefaultLocale = useCallback(
    (locale: string) => {
      update((draft) => {
        draft.i18n.defaultLocale = locale;
        if (!draft.i18n.locales.includes(locale))
          draft.i18n.locales = [...draft.i18n.locales, locale];
      });
    },
    [update],
  );

  const setOption = useCallback(
    (key: keyof GeneratorOptions, value: boolean) =>
      update((draft) => void (draft.options[key] = value)),
    [update],
  );

  /**
   * Captcha é uma decisão só, com quatro valores.
   *
   * A receita guarda duas coisas — `features.captcha` e `drivers.captcha` — e o CLI
   * recusa a combinação "feature desligada, driver escolhido". Mexer nas duas num
   * mesmo update mantém a receita sempre coerente, em vez de passar por um estado
   * inválido que o painel de problemas mostraria e desapareceria.
   */
  const setCaptcha = useCallback(
    (driver: CaptchaDriver) =>
      update((draft) => {
        draft.features.captcha = driver !== 'none';
        draft.drivers.captcha = driver;
      }),
    [update],
  );

  const applyFeatureFix = useCallback(
    (feature: FeatureId, enable: boolean) =>
      update((draft) => void (draft.features[feature] = enable)),
    [update],
  );

  const resetToPreset = useCallback(() => {
    setState((current) => ({
      preset: current.preset,
      recipe: presetRecipe(current.preset, current.recipe.project),
    }));
  }, []);

  const { recipe, preset } = state;

  const chips = useMemo(() => buildChips(recipe, preset, update), [recipe, preset, update]);

  const nameIssues = useMemo(
    () => validateDisplayName(recipe.project.displayName),
    [recipe.project.displayName],
  );
  const slugIssues = useMemo(() => validateSlug(recipe.project.slug), [recipe.project.slug]);

  return {
    recipe,
    preset,
    command: buildCommand(recipe, preset),
    chips,
    names: deriveNames(recipe.project.displayName || recipe.project.slug, recipe.project.slug),
    nameIssues,
    slugIssues,
    nameBlocks: hasBlockingIssue(nameIssues) || hasBlockingIssue(slugIssues),
    issues: validateRecipe(recipe),
    shareQuery: `?${shareQuery}`,
    hydrated,
    setPreset,
    setDisplayName,
    setSlug,
    setFeature,
    setDriver,
    setOAuthProviders,
    setLocales,
    setDefaultLocale,
    setOption,
    setCaptcha,
    applyFeatureFix,
    resetToPreset,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chips
// ─────────────────────────────────────────────────────────────────────────────

/** Uma dimensão da receita que pode divergir do preset e ser devolvida a ele. */
interface Dimension {
  reset: Draft;
}

/**
 * Os chips são as flags do comando, não uma segunda opinião sobre elas.
 *
 * A tentação seria prever o nome da flag de cada dimensão e casar por string. Não dá, e
 * não deveria dar: o CLI escolhe apelidos (`twoFactor` emite `--no-2fa`) e compõe
 * dimensões (i18n rende `--i18n=...` e às vezes também `--default-locale=...`). Duplicar
 * essas regras aqui seria a cópia que este arquivo existe para evitar.
 *
 * Em vez disso: para cada dimensão, calcula-se `toFlags` da receita com aquela dimensão
 * devolvida ao preset. As flags que **desaparecem** pertencem a ela. É exato por
 * construção, sobrevive a um apelido novo no CLI, e uma flag que nenhuma dimensão
 * reivindique ainda aparece na tela — apenas sem o botão de remover.
 */
function buildChips(
  recipe: Recipe,
  preset: PresetId,
  update: (mutate: Draft) => void,
): CommandChip[] {
  const base = PRESETS[preset];
  const current = toFlags(recipe, preset);
  if (current.length === 0) return [];

  const dimensions: Dimension[] = [];

  for (const id of Object.keys(recipe.features) as FeatureId[]) {
    dimensions.push({ reset: (draft) => void (draft.features[id] = base.features[id]) });
  }

  for (const key of Object.keys(recipe.drivers) as (keyof DriverSelection)[]) {
    dimensions.push({ reset: (draft) => assignDriver(draft.drivers, key, base.drivers[key]) });
  }

  dimensions.push({
    reset: (draft) => void (draft.oauth.providers = [...base.oauth.providers]),
  });
  dimensions.push({
    reset: (draft) => {
      draft.i18n.locales = [...base.i18n.locales];
      draft.i18n.defaultLocale = base.i18n.defaultLocale;
    },
  });
  dimensions.push({
    reset: (draft) => void (draft.project.slug = slugify(draft.project.displayName)),
  });
  dimensions.push({
    reset: (draft) => {
      draft.options.git = true;
      draft.options.install = true;
      draft.options.docker = true;
      draft.options.force = false;
    },
  });

  const owner = new Map<string, Draft>();
  for (const dimension of dimensions) {
    const candidate = cloneRecipe(recipe);
    dimension.reset(candidate);
    const remaining = new Set(toFlags(candidate, preset));
    for (const flag of current) {
      if (!remaining.has(flag) && !owner.has(flag)) owner.set(flag, dimension.reset);
    }
  }

  return current.map((flag) => {
    const reset = owner.get(flag);
    if (!reset) return { flag };
    return { flag, onRemove: () => update(reset) };
  });
}

/**
 * Copia um driver de um objeto para outro, pela chave.
 *
 * Existe por uma limitação real do TypeScript, não por gosto: `obj[key] = valor` com
 * `key` sendo uma UNIÃO de chaves tem tipo de escrita `never`, porque o compilador não
 * sabe qual membro da união está em jogo e teria de aceitar o valor de todos. Com `K`
 * amarrado num genérico, a chave e o valor se correlacionam e a atribuição passa.
 *
 * A alternativa era um `as never` no destino — que é o que estava aqui, e que o lint
 * (corretamente) marcou como assertion sem efeito. Assertion silencia o compilador;
 * este helper o convence.
 */
function assignDriver<K extends keyof DriverSelection>(
  drivers: DriverSelection,
  key: K,
  value: DriverSelection[K],
): void {
  drivers[key] = value;
}
