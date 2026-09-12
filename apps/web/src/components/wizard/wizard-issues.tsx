'use client';

import { RichText } from '../rich-text';
import type { Messages } from '@/i18n/messages';
import { useConfiguratorContext } from '@/lib/configurator-context';
import { cn } from '@/lib/cn';

/**
 * As incoerências da combinação escolhida, com o conserto ao lado.
 *
 * O assistente **não bloqueia** a resposta que causa o problema. Bloquear esconderia a
 * regra: a pessoa clica, nada acontece, e conclui que a página está quebrada. Mostrar o
 * problema com o texto do porquê ensina — e o botão aplica o conserto para quem não
 * quer aprender agora.
 *
 * `aria-live="polite"` porque o aviso nasce depois do clique, num lugar diferente de
 * onde o clique aconteceu.
 *
 * Um `error` sem `fix` é uma recusa do CLI, não uma correção pendente (a auditoria, que
 * a v1 não deixa desligar, cai aí). Nesse caso não há botão: oferecer um seria prometer
 * um conserto que não existe.
 */
export function WizardIssues({ messages }: { messages: Messages }): React.ReactElement | null {
  const { issues, applyFeatureFix } = useConfiguratorContext();
  const c = messages.configurator;

  if (issues.length === 0) return null;

  return (
    <div aria-live="polite" className="border-t border-rule pt-4">
      <h3 className="label text-dim">{c.issuesTitle}</h3>
      <ul className="mt-2.5 space-y-3">
        {issues.map((issue) => (
          <li
            key={issue.message}
            className={cn(
              'measure border-l-2 pl-3',
              issue.level === 'error' ? 'border-danger' : 'border-rule',
            )}
          >
            <p className="text-small">
              <span
                className={cn(
                  'mr-1.5 font-semibold',
                  issue.level === 'error' ? 'text-danger' : 'text-dim',
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
                  if (fix) applyFeatureFix(fix.feature, fix.enable);
                }}
                className="mt-1 font-mono text-meta text-amber underline-offset-2 hover:underline"
              >
                {issue.fix.enable ? '+' : '−'} {c.features[issue.fix.feature].label}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
