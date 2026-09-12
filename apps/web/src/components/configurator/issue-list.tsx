'use client';

import { RichText } from '../rich-text';
import type { Messages } from '@/i18n/messages';
import type { FeatureId, RecipeIssue } from '@/lib/recipe-bridge';
import { cn } from '@/lib/cn';

/**
 * Os problemas da combinação escolhida, com o conserto ao lado.
 *
 * A tela **não bloqueia** o toggle que causou o problema. Bloquear esconderia a
 * dependência: a pessoa clica, nada acontece, e conclui que a página está quebrada.
 * Mostrar o problema junto com o porquê ensina a regra — e o botão aplica o conserto
 * para quem não quer aprender agora.
 *
 * Um `error` sem `fix` é uma recusa do CLI, não uma correção pendente (`audit`, que a v1
 * não deixa desligar, cai aí). Nesse caso não há botão: oferecer um seria prometer um
 * conserto que não existe.
 *
 * `aria-live="polite"` porque a lista aparece longe de onde o clique aconteceu; sem
 * isso, quem usa leitor de tela liga `platform` sem multi-tenancy e não fica sabendo.
 */
export function IssueList({
  messages,
  issues,
  onApplyFix,
}: {
  messages: Messages;
  issues: RecipeIssue[];
  onApplyFix: (feature: FeatureId, enable: boolean) => void;
}): React.ReactElement {
  const c = messages.configurator;

  return (
    <div aria-live="polite">
      {issues.length === 0 ? (
        <p className="text-meta text-dim">{c.noIssues}</p>
      ) : (
        <>
          <h3 className="rail mb-2">{c.issuesTitle}</h3>
          <ul className="space-y-3">
            {issues.map((issue) => (
              <li
                key={issue.message}
                className={cn(
                  'measure border-l-2 pl-3',
                  issue.level === 'error' ? 'border-amber' : 'border-rule-strong',
                )}
              >
                <p className="text-meta">
                  <span
                    className={cn(
                      'mr-1.5 font-semibold',
                      issue.level === 'error' ? 'text-amber' : 'text-dim',
                    )}
                  >
                    {issue.level === 'error' ? c.issueError : c.issueWarning}:
                  </span>
                  <RichText>{issue.message}</RichText>
                </p>
                {issue.fix ? (
                  <button
                    type="button"
                    onClick={() => {
                      const fix = issue.fix;
                      if (fix) onApplyFix(fix.feature, fix.enable);
                    }}
                    className="mt-1 font-mono text-meta text-amber underline-offset-2 hover:underline"
                  >
                    {issue.fix.enable ? '+' : '−'} {c.features[issue.fix.feature].label}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
