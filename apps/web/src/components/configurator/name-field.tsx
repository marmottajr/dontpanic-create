'use client';

import { RichText } from '../rich-text';
import type { Messages } from '@/i18n/messages';
import { slugify, type ValidationIssue } from '@/lib/recipe-bridge';
import { cn } from '@/lib/cn';

/**
 * Nome e slug, validados enquanto se digita.
 *
 * `validateSlug` devolve uma lista e não lança — foi escrito assim justamente para esta
 * tela poder mostrar todos os problemas de uma vez em vez do primeiro. Quando o
 * problema tem `suggestion`, ela vira um botão: é a diferença entre dizer "o Postgres
 * corta identificadores em 63 bytes" e resolver isso para quem leu.
 *
 * O slug acompanha o nome até alguém editá-lo à mão. A partir daí ele manda, e a tela
 * diz isso com um rótulo — senão a pessoa digita o nome, vê o slug parado e conclui que
 * o campo está quebrado.
 */
export function NameField({
  messages,
  displayName,
  slug,
  nameIssues,
  slugIssues,
  onDisplayNameChange,
  onSlugChange,
}: {
  messages: Messages;
  displayName: string;
  slug: string;
  nameIssues: ValidationIssue[];
  slugIssues: ValidationIssue[];
  onDisplayNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
}): React.ReactElement {
  const c = messages.configurator;
  const derived = slugify(displayName);
  const slugIsCustom = slug !== derived;

  return (
    <fieldset>
      <legend className="sr-only">{c.nameLabel}</legend>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="project-name" className="label mb-1.5 block text-dim">
            {c.nameLabel}
          </label>
          <input
            id="project-name"
            type="text"
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
            placeholder={c.namePlaceholder}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="project-name-help"
            aria-invalid={nameIssues.some((issue) => issue.level === 'error')}
            data-step-focus=""
            className="w-full rounded-1 border border-rule bg-surface px-3.5 py-2.5 text-ink placeholder:text-faint aria-[invalid=true]:border-danger"
          />
          <p id="project-name-help" className="mt-1.5 text-small text-dim">
            {c.nameHelp}
          </p>
          <IssueList
            issues={nameIssues}
            apply={onDisplayNameChange}
            applyLabel={c.applySuggestion}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label htmlFor="project-slug" className="label text-dim">
              {c.slugLabel}
            </label>
            {slugIsCustom ? (
              <button
                type="button"
                onClick={() => onSlugChange(derived)}
                className="text-meta text-amber underline-offset-2 hover:underline"
              >
                {c.slugReset}
              </button>
            ) : (
              <span className="label text-faint">{c.slugDerived}</span>
            )}
          </div>
          <input
            id="project-slug"
            type="text"
            value={slug}
            onChange={(event) => onSlugChange(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="project-slug-help"
            aria-invalid={slugIssues.some((issue) => issue.level === 'error')}
            className="w-full rounded-1 border border-rule bg-surface px-3.5 py-2.5 font-mono text-small text-ink aria-[invalid=true]:border-danger"
          />
          <p id="project-slug-help" className="mt-1.5 text-small text-dim">
            {c.slugHelp}
          </p>
          <IssueList issues={slugIssues} apply={onSlugChange} applyLabel={c.applySuggestion} />
        </div>
      </div>
    </fieldset>
  );
}

function IssueList({
  issues,
  apply,
  applyLabel,
}: {
  issues: ValidationIssue[];
  apply: (value: string) => void;
  applyLabel: string;
}): React.ReactElement | null {
  if (issues.length === 0) return null;

  return (
    <ul className="mt-2.5 space-y-2" aria-live="polite">
      {issues.map((issue) => (
        <li
          key={issue.message}
          className={cn(
            'border-l-2 pl-3 text-small',
            issue.level === 'error' ? 'border-danger text-ink' : 'border-rule text-dim',
          )}
        >
          <RichText>{issue.message}</RichText>
          {issue.suggestion ? (
            <button
              type="button"
              onClick={() => apply(issue.suggestion as string)}
              className="mt-1 block font-mono text-amber underline-offset-2 hover:underline"
            >
              {applyLabel} <span className="font-semibold">{issue.suggestion}</span>
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
