'use client';

import { CommandPanel } from './command-panel';
import { DerivedNames } from './derived-names';
import { IssueList } from './issue-list';
import { NameField } from './name-field';
import { PresetPicker } from './preset-picker';
import { RichText } from '../rich-text';
import { Shell } from '../section';
import { CheckGroup, OptionGroup } from '../ui/option-group';
import { SwitchRow } from '../ui/switch-row';
import { FEATURE_GROUPS } from '@/content/feature-groups';
import type { Messages } from '@/i18n/messages';
import {
  ALWAYS_ON,
  CACHE_DRIVERS,
  CAPTCHA_DRIVERS,
  DB_DRIVERS,
  MAIL_DRIVERS,
  OAUTH_PROVIDERS,
  PRESETS,
  QUEUE_DRIVERS,
  STORAGE_DRIVERS,
  type FeatureId,
  type Recipe,
  type PresetId,
} from '@/lib/recipe-bridge';
import { useConfigurator } from '@/lib/use-configurator';

/**
 * Os idiomas que o projeto gerado pode nascer com.
 *
 * Nada a ver com os idiomas desta página: são os arquivos de mensagem que o template
 * leva. Os códigos são curtos porque é o que os presets do CLI usam (`locales: ['pt',
 * 'en']`) e é o que a flag `--i18n=pt,en` carrega — escrever `pt-BR` aqui faria a
 * caixa do preset padrão aparecer desmarcada, com o comando dizendo o contrário.
 */
const PROJECT_LOCALES = ['pt', 'en', 'es', 'fr', 'de'] as const;

export function Configurator({ messages }: { messages: Messages }): React.ReactElement {
  const state = useConfigurator();
  const c = messages.configurator;

  /**
   * As features que aparecem numa incoerência. `RecipeIssue` não diz "de quem é o
   * problema" — diz qual feature o conserto mexeria —, e isso é suficiente para marcar a
   * linha certa: destacar o toggle que está no caminho do conserto é o que liga o texto
   * do problema, lá embaixo, ao controle que o causou.
   */
  const targetedFeatures = new Set<FeatureId>(
    state.issues.flatMap((issue) => (issue.fix ? [issue.fix.feature] : [])),
  );

  return (
    <section id="build" className="scroll-mt-16 border-t border-rule py-14 sm:py-20">
      <Shell>
        <div className="spec">
          <div className="rail">
            <span className="font-mono">create-dontpanic</span>
            <div className="mt-1">docs/decisions/0003</div>
          </div>
          <div>
            <h2 className="text-h2 font-bold tracking-[-0.015em] w-wide">{c.title}</h2>
            <p className="measure mt-4 text-lead text-dim">
              <RichText>{c.lead}</RichText>
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_23rem] lg:grid-rows-[auto_1fr] lg:gap-x-12">
          <div className="order-1 min-w-0 space-y-8 lg:col-start-1 lg:row-start-1">
            <NameField
              messages={messages}
              displayName={state.recipe.project.displayName}
              slug={state.recipe.project.slug}
              nameIssues={state.nameIssues}
              slugIssues={state.slugIssues}
              onDisplayNameChange={state.setDisplayName}
              onSlugChange={state.setSlug}
            />
            <DerivedNames messages={messages} names={state.names} />
          </div>

          <div className="order-2 min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="lg:sticky lg:top-20">
              <CommandPanel
                messages={messages}
                command={state.command}
                chips={state.chips}
                preset={state.preset}
                shareQuery={state.shareQuery}
                blocked={state.nameBlocks}
              />
            </div>
          </div>

          <div className="order-3 min-w-0 space-y-10 lg:col-start-1 lg:row-start-2">
            <PresetPicker
              messages={messages}
              value={state.preset}
              dirty={divergesFromPreset(state.recipe, state.preset)}
              onChange={state.setPreset}
              onReset={state.resetToPreset}
            />

            <fieldset>
              <legend className="text-h3 font-semibold">{c.featuresLegend}</legend>
              <p className="measure mt-2 text-meta text-dim">
                <RichText>{c.featuresNote}</RichText>
              </p>

              <div className="mt-5 space-y-7">
                {FEATURE_GROUPS.map((group) => (
                  <div key={group.id}>
                    <h4 className="rail mb-1">{c.groups[group.id]}</h4>
                    {group.features.map((id) => (
                      <SwitchRow
                        key={id}
                        id={`feature-${id}`}
                        checked={state.recipe.features[id]}
                        onChange={(next) => state.setFeature(id, next)}
                        label={c.features[id].label}
                        summary={c.features[id].text}
                        highlighted={targetedFeatures.has(id)}
                        /* O CLI recusa desligar `audit`: o export de LGPD devolve
                           linhas de auditoria, então removê-la mudaria um contrato de
                           resposta. Um toggle que existe e não obedece é pior que um
                           toggle desabilitado que diz por quê. */
                        disabled={ALWAYS_ON.includes(id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </fieldset>

            {state.recipe.features.oauth ? (
              <div>
                <CheckGroup
                  legend={c.oauthLegend}
                  values={state.recipe.oauth.providers}
                  options={OAUTH_PROVIDERS.map((provider) => ({
                    value: provider,
                    label: provider,
                  }))}
                  onChange={state.setOAuthProviders}
                />
                <p className="measure mt-2 text-meta text-dim">
                  <RichText>{c.oauthNote}</RichText>
                </p>
              </div>
            ) : null}

            {state.recipe.features.i18n ? (
              <div className="space-y-3">
                <CheckGroup
                  legend={c.localesLegend}
                  values={state.recipe.i18n.locales}
                  options={PROJECT_LOCALES.map((locale) => ({ value: locale, label: locale }))}
                  onChange={state.setLocales}
                />
                <OptionGroup
                  name="default-locale"
                  legend={c.defaultLocaleLabel}
                  value={state.recipe.i18n.defaultLocale}
                  options={state.recipe.i18n.locales.map((locale) => ({
                    value: locale,
                    label: locale,
                  }))}
                  onChange={state.setDefaultLocale}
                />
                <p className="measure text-meta text-dim">{c.localesNote}</p>
              </div>
            ) : null}

            <fieldset>
              <legend className="text-h3 font-semibold">{c.driversLegend}</legend>
              <p className="measure mt-2 text-meta text-dim">
                <RichText>{c.driversNote}</RichText>
              </p>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {/*
                 * O banco não é uma escolha: `DB_DRIVERS` tem um item só, porque Row
                 * Level Security é do Postgres e é ele que sustenta o argumento de
                 * segurança inteiro. Um grupo de rádio com uma opção seria um controle
                 * que finge oferecer algo — melhor declarar o valor.
                 */}
                {DB_DRIVERS.length > 1 ? (
                  <OptionGroup
                    name="driver-db"
                    legend={c.driverLabels.db}
                    value={state.recipe.drivers.db}
                    options={DB_DRIVERS.map((driver) => ({ value: driver, label: driver }))}
                    onChange={(next) => state.setDriver('db', next)}
                  />
                ) : (
                  <div className="min-w-0">
                    <p className="rail mb-1.5">{c.driverLabels.db}</p>
                    <p className="font-mono text-[0.78rem] text-dim">{state.recipe.drivers.db}</p>
                  </div>
                )}
                <OptionGroup
                  name="driver-mail"
                  legend={c.driverLabels.mail}
                  value={state.recipe.drivers.mail}
                  options={MAIL_DRIVERS.map((driver) => ({ value: driver, label: driver }))}
                  onChange={(next) => state.setDriver('mail', next)}
                />
                <OptionGroup
                  name="driver-cache"
                  legend={c.driverLabels.cache}
                  value={state.recipe.drivers.cache}
                  options={CACHE_DRIVERS.map((driver) => ({ value: driver, label: driver }))}
                  onChange={(next) => state.setDriver('cache', next)}
                />
                {/*
                 * Nenhum seletor de driver é escondido em função de uma feature.
                 *
                 * A tentação era mostrar o storage só com "arquivos" ligado. Mas o CLI
                 * AVISA sobre "arquivos desligado com driver s3" — e um aviso cujo
                 * controle não está na tela é um beco sem saída: a pessoa lê o que
                 * fazer e não encontra onde. Melhor um seletor que ela talvez não
                 * precise do que um problema sem caminho de conserto.
                 */}
                <OptionGroup
                  name="driver-storage"
                  legend={c.driverLabels.storage}
                  value={state.recipe.drivers.storage}
                  options={STORAGE_DRIVERS.map((driver) => ({ value: driver, label: driver }))}
                  onChange={(next) => state.setDriver('storage', next)}
                />
                <OptionGroup
                  name="driver-queue"
                  legend={c.driverLabels.queue}
                  value={state.recipe.drivers.queue}
                  options={QUEUE_DRIVERS.map((driver) => ({ value: driver, label: driver }))}
                  onChange={(next) => state.setDriver('queue', next)}
                />
                {/* `none` na lista É o desligar: mesma forma da flag `--captcha=none`. */}
                <OptionGroup
                  name="driver-captcha"
                  legend={c.driverLabels.captcha}
                  value={state.recipe.features.captcha ? state.recipe.drivers.captcha : 'none'}
                  options={CAPTCHA_DRIVERS.map((driver) => ({ value: driver, label: driver }))}
                  onChange={state.setCaptcha}
                />
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-h3 font-semibold">{c.optionsLegend}</legend>
              <div className="mt-4">
                <SwitchRow
                  id="option-git"
                  checked={state.recipe.options.git}
                  onChange={(next) => state.setOption('git', next)}
                  label="git"
                  summary={c.optionLabels.git}
                />
                <SwitchRow
                  id="option-install"
                  checked={state.recipe.options.install}
                  onChange={(next) => state.setOption('install', next)}
                  label="install"
                  summary={c.optionLabels.install}
                />
                <SwitchRow
                  id="option-docker"
                  checked={state.recipe.options.docker}
                  onChange={(next) => state.setOption('docker', next)}
                  label="docker"
                  summary={c.optionLabels.docker}
                />
                <SwitchRow
                  id="option-force"
                  checked={state.recipe.options.force}
                  onChange={(next) => state.setOption('force', next)}
                  label="force"
                  summary={c.optionLabels.force}
                />
              </div>
            </fieldset>

            <IssueList
              messages={messages}
              issues={state.issues}
              onApplyFix={state.applyFeatureFix}
            />
          </div>
        </div>
      </Shell>
    </section>
  );
}

/**
 * A receita já se afastou do preset?
 *
 * Compara com a definição do preset em vez de olhar o comando: `--slug=` também é uma
 * flag, mas mexer no nome do projeto não é "divergir do preset" — e oferecer
 * "descartar as mudanças deste preset" a quem só digitou o nome sugeriria que ele
 * perderia o nome.
 */
function divergesFromPreset(recipe: Recipe, preset: PresetId): boolean {
  const base = PRESETS[preset];
  const sameFeatures = Object.keys(recipe.features).every(
    (key) => recipe.features[key as FeatureId] === base.features[key as FeatureId],
  );
  const sameDrivers = Object.keys(recipe.drivers).every(
    (key) =>
      recipe.drivers[key as keyof typeof recipe.drivers] ===
      base.drivers[key as keyof typeof base.drivers],
  );
  const sameOauth = recipe.oauth.providers.join(',') === base.oauth.providers.join(',');
  const sameI18n =
    recipe.i18n.locales.join(',') === base.i18n.locales.join(',') &&
    recipe.i18n.defaultLocale === base.i18n.defaultLocale;
  const sameOptions =
    recipe.options.git && recipe.options.install && recipe.options.docker && !recipe.options.force;

  return !(sameFeatures && sameDrivers && sameOauth && sameI18n && sameOptions);
}
