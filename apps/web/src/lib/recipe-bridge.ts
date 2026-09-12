/**
 * A única porta da landing para a lógica de receita do gerador.
 *
 * A razão de existir deste arquivo é o contrato: a string que o site mostra tem que ser
 * *exatamente* a que o CLI entende. Se a landing tivesse a sua própria cópia de
 * `buildCommand`, um comando bonito na tela poderia ser um comando errado no terminal —
 * e o erro só apareceria no `npx` de outra pessoa. Então nenhum componente monta flag
 * na mão nem decide o que um preset significa: todo mundo passa por aqui.
 *
 * O que é do CLI e o que é da landing:
 *
 * - **Do CLI:** presets, ids de feature, dependências, nomes de flag, `toFlags`,
 *   `buildCommand`, validação e reconciliação. Também `FEATURE_INFO`, que serve de
 *   fallback de rótulo.
 * - **Da landing:** tradução. Os sete dicionários em `src/i18n/messages` são a camada de
 *   apresentação; `FEATURE_INFO` está em português e a página existe em sete idiomas,
 *   então o texto exibido vem do dicionário e só o **id** vem do pacote. O que nunca
 *   traduz é identificador: flag, nome de driver, forma derivada do nome, comando.
 *
 * Nada de `enum` atravessa esta fronteira. Os tipos do CLI são uniões de literais de
 * `as const`, que `node --test --experimental-strip-types` apaga sem transformação —
 * um `enum` teria que existir em runtime e quebraria o teste do outro lado.
 */

// ── Receita ──────────────────────────────────────────────────────────────────
export {
  ALWAYS_ON,
  buildCommand,
  cloneRecipe,
  DEFAULT_PRESET,
  FEATURE_FLAGS,
  FEATURE_INFO,
  PRESET_IDS,
  PRESETS,
  presetRecipe,
  reconcileRecipe,
  toFlags,
  validateRecipe,
} from '@dontpanic/create/recipe';

export type { PresetDefinition, PresetId, RecipeIssue } from '@dontpanic/create/recipe';

// ── Nomes ────────────────────────────────────────────────────────────────────
export {
  deriveNames,
  hasBlockingIssue,
  namesFromDisplayName,
  slugify,
  validateDisplayName,
  validateSlug,
} from '@dontpanic/create/naming';

export type { ValidationIssue } from '@dontpanic/create/naming';

// ── Tipos do gerador ─────────────────────────────────────────────────────────
export {
  CACHE_DRIVERS,
  CAPTCHA_DRIVERS,
  DB_DRIVERS,
  FEATURE_IDS,
  MAIL_DRIVERS,
  OAUTH_PROVIDERS,
  QUEUE_DRIVERS,
  STORAGE_DRIVERS,
} from '@dontpanic/create/types';

export type {
  CacheDriver,
  CaptchaDriver,
  DbDriver,
  DriverSelection,
  FeatureId,
  FeatureSelection,
  GeneratorOptions,
  MailDriver,
  NameForms,
  OAuthProvider,
  ProjectIdentity,
  QueueDriver,
  Recipe,
  StorageDriver,
} from '@dontpanic/create/types';
