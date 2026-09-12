'use client';

import { RichText } from '../rich-text';
import { cn } from '@/lib/cn';

export interface Choice<T extends string> {
  value: T;
  label: string;
  help: string;
}

/**
 * As opções de um passo: cartões grandes, um por resposta, com o que a resposta
 * implica escrito dentro.
 *
 * `<input type="radio">` de verdade e não botões: o grupo nativo dá navegação por
 * setas, entra e sai como uma unidade no Tab, e anuncia "opção 2 de 3" sem que
 * precisemos gerenciar `aria-activedescendant`. O input fica visualmente escondido mas
 * presente na árvore de acessibilidade; `peer-focus-visible` desenha o foco no cartão,
 * que é o que a pessoa vê.
 *
 * O alvo é o cartão inteiro, incluindo a explicação — é o que faz isto funcionar com o
 * dedo, num telefone de 380px.
 */
export function ChoiceList<T extends string>({
  name,
  legend,
  value,
  choices,
  onChange,
}: {
  name: string;
  /** Nomeia o grupo para o leitor de tela; a pergunta visível já está no cabeçalho. */
  legend: string;
  value: T;
  choices: readonly Choice<T>[];
  onChange: (next: T) => void;
}): React.ReactElement {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="grid gap-2.5">
        {choices.map((choice, position) => {
          const selected = choice.value === value;
          return (
            <label key={choice.value} className="min-w-0">
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={selected}
                onChange={() => onChange(choice.value)}
                className="peer sr-only"
                {...(position === 0 ? { 'data-step-focus': '' } : {})}
              />
              <span
                className={cn(
                  'flex cursor-pointer gap-3.5 border p-4 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber',
                  selected
                    ? 'border-amber bg-amber-wash'
                    : 'border-rule hover:border-dim/60 bg-surface',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border',
                    selected ? 'border-amber' : 'border-dim/70',
                  )}
                >
                  {selected ? <span className="h-2 w-2 rounded-full bg-amber" /> : null}
                </span>
                <span className="min-w-0">
                  <span className={cn('block font-semibold', selected ? 'text-ink' : 'text-dim')}>
                    {choice.label}
                  </span>
                  <span className="measure-tight mt-1 block text-small text-dim">
                    <RichText>{choice.help}</RichText>
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
