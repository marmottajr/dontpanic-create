'use client';

import { ChoiceList } from './choice-list';
import { WIZARD_TERMS } from '@/content/wizard-terms';
import { WizardIssues } from './wizard-issues';
import { CommandBlock } from '../command-block';
import { CopyButton } from '../copy-button';
import { DerivedNames } from '../configurator/derived-names';
import { NameField } from '../configurator/name-field';
import { RichText } from '../rich-text';
import type { Messages } from '@/i18n/messages';
import { useConfiguratorContext, ANSWERABLE_STEPS } from '@/lib/configurator-context';
import { OAUTH_PROVIDERS, PRESET_IDS } from '@/lib/recipe-bridge';
import {
  entryChoice,
  entryFeatures,
  languageChoice,
  type EntryChoice,
  type LanguageChoice,
  type ReviewRow,
} from '@/lib/wizard-answers';
import { cn } from '@/lib/cn';

/** Os idiomas que o projeto gerado pode nascer com — códigos curtos, como o CLI usa. */
const PROJECT_LOCALES = ['pt', 'en', 'es', 'fr', 'de'] as const;

/** Providers ligados quando alguém responde "sim" ao login social. */
const DEFAULT_PROVIDERS = ['google', 'github'] as const;

export function WizardStepBody({ messages }: { messages: Messages }): React.ReactElement {
  const ctx = useConfiguratorContext();
  const w = messages.wizard;
  const { recipe, wizard } = ctx;

  switch (wizard.step) {
    case 'name':
      return (
        <div className="space-y-7">
          <NameField
            messages={messages}
            displayName={recipe.project.displayName}
            slug={recipe.project.slug}
            nameIssues={ctx.nameIssues}
            slugIssues={ctx.slugIssues}
            onDisplayNameChange={ctx.setDisplayName}
            onSlugChange={ctx.setSlug}
          />
          <DerivedNames messages={messages} names={ctx.names} />
        </div>
      );

    case 'preset':
      return (
        <fieldset>
          <legend className="sr-only">{w.steps.preset.question}</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {PRESET_IDS.map((preset, position) => {
              const copy = messages.configurator.presets[preset];
              const selected = preset === ctx.preset;
              return (
                <label key={preset} className="min-w-0">
                  <input
                    type="radio"
                    name="wizard-preset"
                    value={preset}
                    checked={selected}
                    onChange={() => ctx.setPreset(preset)}
                    className="peer sr-only"
                    {...(position === 0 ? { 'data-step-focus': '' } : {})}
                  />
                  <span
                    className={cn(
                      'block h-full cursor-pointer border p-4 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber',
                      selected
                        ? 'border-amber bg-amber-wash'
                        : 'border-rule bg-surface hover:border-dim/60',
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn('font-semibold', selected && 'text-amber')}>
                        {copy.label}
                      </span>
                      <span className="font-mono text-meta text-faint">{preset}</span>
                    </span>
                    <span className="mt-1.5 block text-small text-dim">
                      <RichText>{copy.summary}</RichText>
                    </span>
                    <span className="mt-2.5 block border-t border-rule pt-2.5 text-meta text-faint">
                      {copy.audience}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      );

    case 'tenancy':
      return (
        <StepWithIssues messages={messages}>
          <ChoiceList
            name="wizard-tenancy"
            legend={w.steps.tenancy.question}
            value={recipe.features.multiTenant ? 'yes' : 'no'}
            choices={[
              { value: 'yes', ...w.steps.tenancy.choices.yes },
              { value: 'no', ...w.steps.tenancy.choices.no },
            ]}
            onChange={(next) => ctx.setFeature('multiTenant', next === 'yes')}
          />
        </StepWithIssues>
      );

    case 'entry':
      return (
        <StepWithIssues messages={messages}>
          <ChoiceList
            name="wizard-entry"
            legend={w.steps.entry.question}
            value={entryChoice(recipe.features)}
            choices={[
              { value: 'open', ...w.steps.entry.choices.open },
              { value: 'invite', ...w.steps.entry.choices.invite },
              { value: 'seed', ...w.steps.entry.choices.seed },
            ]}
            onChange={(next: EntryChoice) => {
              const { publicSignup, invitations } = entryFeatures(next);
              ctx.setFeature('publicSignup', publicSignup);
              ctx.setFeature('invitations', invitations);
            }}
          />
        </StepWithIssues>
      );

    case 'social':
      return (
        <StepWithIssues messages={messages}>
          <ChoiceList
            name="wizard-social"
            legend={w.steps.social.question}
            value={recipe.features.oauth ? 'yes' : 'no'}
            choices={[
              { value: 'yes', ...w.steps.social.choices.yes },
              { value: 'no', ...w.steps.social.choices.no },
            ]}
            onChange={(next) => {
              const on = next === 'yes';
              ctx.setFeature('oauth', on);
              // Ligar o login social sem provider nenhum gera uma tela de login sem
              // botão — o CLI recusa. Dois providers é o padrão útil, e o passo deixa
              // ajustar logo abaixo.
              if (on && recipe.oauth.providers.length === 0) {
                ctx.setOAuthProviders([...DEFAULT_PROVIDERS]);
              }
            }}
          />
          {recipe.features.oauth ? (
            <TagPicker
              legend={messages.configurator.features.oauth.label}
              values={recipe.oauth.providers}
              options={OAUTH_PROVIDERS}
              onChange={(next) =>
                ctx.setOAuthProviders(OAUTH_PROVIDERS.filter((provider) => next.includes(provider)))
              }
            />
          ) : null}
        </StepWithIssues>
      );

    case 'twoFactor':
      return (
        <StepWithIssues messages={messages}>
          <ChoiceList
            name="wizard-2fa"
            legend={w.steps.twoFactor.question}
            value={recipe.features.twoFactor ? 'yes' : 'no'}
            choices={[
              { value: 'yes', ...w.steps.twoFactor.choices.yes },
              { value: 'no', ...w.steps.twoFactor.choices.no },
            ]}
            onChange={(next) => ctx.setFeature('twoFactor', next === 'yes')}
          />
        </StepWithIssues>
      );

    case 'languages':
      return (
        <StepWithIssues messages={messages}>
          <ChoiceList
            name="wizard-languages"
            legend={w.steps.languages.question}
            value={languageChoice(recipe)}
            choices={[
              { value: 'one', ...w.steps.languages.choices.one },
              { value: 'many', ...w.steps.languages.choices.many },
            ]}
            onChange={(next: LanguageChoice) => {
              if (next === 'one') {
                ctx.setFeature('i18n', false);
                ctx.setLocales([recipe.i18n.defaultLocale]);
              } else {
                ctx.setFeature('i18n', true);
                if (recipe.i18n.locales.length < 2) {
                  ctx.setLocales([...new Set([recipe.i18n.defaultLocale, 'en'])]);
                }
              }
            }}
          />
          {languageChoice(recipe) === 'many' ? (
            <TagPicker
              legend={messages.configurator.features.i18n.label}
              values={recipe.i18n.locales}
              options={PROJECT_LOCALES}
              onChange={(next) => ctx.setLocales(next)}
            />
          ) : null}
        </StepWithIssues>
      );

    case 'plans':
      return (
        <StepWithIssues messages={messages}>
          <ChoiceList
            name="wizard-plans"
            legend={w.steps.plans.question}
            value={recipe.features.plans ? 'yes' : 'no'}
            choices={[
              { value: 'yes', ...w.steps.plans.choices.yes },
              { value: 'no', ...w.steps.plans.choices.no },
            ]}
            onChange={(next) => ctx.setFeature('plans', next === 'yes')}
          />
        </StepWithIssues>
      );

    case 'files':
      return (
        <StepWithIssues messages={messages}>
          <ChoiceList
            name="wizard-files"
            legend={w.steps.files.question}
            value={recipe.features.files ? 'yes' : 'no'}
            choices={[
              { value: 'yes', ...w.steps.files.choices.yes },
              { value: 'no', ...w.steps.files.choices.no },
            ]}
            onChange={(next) => ctx.setFeature('files', next === 'yes')}
          />
        </StepWithIssues>
      );

    case 'captcha':
      return (
        <StepWithIssues messages={messages}>
          <ChoiceList
            name="wizard-captcha"
            legend={w.steps.captcha.question}
            value={recipe.features.captcha ? 'yes' : 'no'}
            choices={[
              { value: 'yes', ...w.steps.captcha.choices.yes },
              { value: 'no', ...w.steps.captcha.choices.no },
            ]}
            // Feature e driver mudam juntos: o CLI recusa "captcha ligado, driver none"
            // e "captcha desligado, driver turnstile".
            onChange={(next) => ctx.setCaptcha(next === 'yes' ? 'turnstile' : 'none')}
          />
        </StepWithIssues>
      );

    case 'review':
      return <ReviewStep messages={messages} />;

    case 'done':
      return <DoneStep messages={messages} />;
  }
}

/** Envolve um passo de escolha com a lista de incoerências que a escolha possa causar. */
function StepWithIssues({
  messages,
  children,
}: {
  messages: Messages;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-5">
      {children}
      <WizardIssues messages={messages} />
    </div>
  );
}

/** Chips de seleção múltipla para valores que são identificador (provider, locale). */
function TagPicker({
  legend,
  values,
  options,
  onChange,
}: {
  legend: string;
  values: readonly string[];
  options: readonly string[];
  onChange: (next: string[]) => void;
}): React.ReactElement {
  const toggle = (option: string) => {
    // Preserva a ordem canônica das opções em vez da ordem de clique: a mesma escolha
    // tem que produzir a mesma string de comando, sempre.
    onChange(
      options.filter((candidate) =>
        candidate === option ? !values.includes(candidate) : values.includes(candidate),
      ),
    );
  };

  return (
    <fieldset className="border-t border-rule pt-4">
      <legend className="label text-dim">{legend}</legend>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={values.includes(option)}
              onChange={() => toggle(option)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'block cursor-pointer rounded-1 border px-3 py-2 font-mono text-small transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber',
                values.includes(option)
                  ? 'border-amber bg-amber-wash text-ink'
                  : 'border-rule text-dim hover:border-dim/60',
              )}
            >
              {option}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ReviewStep({ messages }: { messages: Messages }): React.ReactElement {
  const ctx = useConfiguratorContext();
  const { recipe } = ctx;
  const w = messages.wizard;
  const c = messages.configurator;

  const yesNo = (on: boolean) => (on ? w.yes : w.no);

  const rows: ReviewRow[] = [
    { step: 'name', label: w.steps.name.eyebrow, value: recipe.project.slug, mono: true },
    { step: 'preset', label: w.steps.preset.eyebrow, value: c.presets[ctx.preset].label },
    {
      step: 'tenancy',
      label: w.steps.tenancy.eyebrow,
      value: recipe.features.multiTenant
        ? w.steps.tenancy.choices.yes.label
        : w.steps.tenancy.choices.no.label,
    },
    {
      step: 'entry',
      label: w.steps.entry.eyebrow,
      value: w.steps.entry.choices[entryChoice(recipe.features)].label,
    },
    {
      step: 'social',
      label: w.steps.social.eyebrow,
      value: recipe.features.oauth ? recipe.oauth.providers.join(' · ') || w.yes : w.no,
      mono: recipe.features.oauth,
    },
    {
      step: 'twoFactor',
      label: w.steps.twoFactor.eyebrow,
      value: yesNo(recipe.features.twoFactor),
    },
    {
      step: 'languages',
      label: w.steps.languages.eyebrow,
      value: recipe.i18n.locales.join(' · '),
      mono: true,
    },
    { step: 'plans', label: w.steps.plans.eyebrow, value: yesNo(recipe.features.plans) },
    { step: 'files', label: w.steps.files.eyebrow, value: yesNo(recipe.features.files) },
    {
      step: 'captcha',
      label: w.steps.captcha.eyebrow,
      value: recipe.features.captcha ? recipe.drivers.captcha : w.no,
      mono: recipe.features.captcha,
    },
  ];

  return (
    <div className="space-y-6">
      <dl>
        {rows.map((row, position) => (
          <div
            key={row.step}
            className="flex items-baseline gap-3 border-t border-rule py-2.5 last:border-b"
          >
            {/* O termo oficial aparece também aqui: a revisão é onde a pessoa relê as
                escolhas, e é a segunda vez que ela vê o nome do recurso ao lado da
                resposta — é essa repetição que faz o termo grudar. Fica abaixo do
                rótulo, na mesma coluna, para não empurrar o valor. */}
            <dt className="w-[7.5rem] shrink-0">
              <span className="label block text-faint">{row.label}</span>
              {WIZARD_TERMS[row.step] ? (
                <span className="mt-0.5 block font-mono text-[10px] leading-tight text-faint/70">
                  {WIZARD_TERMS[row.step]}
                </span>
              ) : null}
            </dt>
            <dd className={cn('min-w-0 flex-1 break-words', row.mono && 'font-mono text-small')}>
              {row.value}
            </dd>
            <button
              type="button"
              onClick={() => ctx.wizard.goTo(row.step)}
              className="shrink-0 text-meta text-amber underline-offset-2 hover:underline"
              {...(position === 0 ? { 'data-step-focus': '' } : {})}
            >
              {w.edit}
            </button>
          </div>
        ))}
      </dl>

      <WizardIssues messages={messages} />

      <CommandBlock
        command={ctx.command}
        label="npx"
        copy={c.copy}
        copied={c.copied}
        copyFailed={c.copyFailed}
      />
    </div>
  );
}

function DoneStep({ messages }: { messages: Messages }): React.ReactElement {
  const ctx = useConfiguratorContext();
  const c = messages.configurator;

  return (
    <div className="space-y-6">
      <CommandBlock
        command={ctx.command}
        label="npx"
        copy={c.copy}
        copied={c.copied}
        copyFailed={c.copyFailed}
        size="large"
      />

      <div>
        <h3 className="label text-dim">{c.flagsTitle}</h3>
        <p className="mt-1 text-meta text-faint">{c.flagsNote}</p>
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {ctx.chips.length === 0 ? (
            <li className="font-mono text-meta text-faint">{ctx.preset}</li>
          ) : (
            ctx.chips.map((chip) => (
              <li
                key={chip.flag}
                className="rounded-1 border border-rule bg-code px-2 py-1 font-mono text-meta"
              >
                {chip.flag}
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="border-t border-rule pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="label text-dim">{c.shareTitle}</h3>
          <ShareCopy messages={messages} />
        </div>
        <p className="mt-2 break-all font-mono text-meta text-faint">{ctx.shareQuery}</p>
        <p className="measure mt-2 text-small text-dim">
          <RichText>{c.shareNote}</RichText>
        </p>
      </div>

      {/* Os passos respondíveis, para quem quiser rever antes de sair. */}
      <p className="text-meta text-faint">
        {ANSWERABLE_STEPS.map((step) => messages.wizard.steps[step].eyebrow).join(' · ')}
      </p>
    </div>
  );
}

/** O link absoluto só existe no navegador — com export estático não há host na build. */
function ShareCopy({ messages }: { messages: Messages }): React.ReactElement {
  const { shareQuery } = useConfiguratorContext();
  const c = messages.configurator;
  const href =
    typeof window === 'undefined'
      ? shareQuery
      : `${window.location.origin}${window.location.pathname}${shareQuery}`;

  return (
    <CopyButton
      value={href}
      idleLabel={c.shareCopy}
      copiedLabel={c.shareCopied}
      failedLabel={c.copyFailed}
      variant="quiet"
    />
  );
}
