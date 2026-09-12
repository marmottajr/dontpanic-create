'use client';

import { cn } from '@/lib/cn';

export interface Option<T extends string> {
  value: T;
  label: string;
}

/**
 * Escolha única, com `<input type="radio">` de verdade.
 *
 * O grupo de radio nativo já dá o que um listbox custom levaria trezentas linhas para
 * imitar: setas navegam entre as opções, Tab entra e sai do grupo como uma unidade, e
 * o `<fieldset>`/`<legend>` nomeia o conjunto. O input fica visualmente escondido mas
 * presente na árvore de acessibilidade, e `peer-focus-visible` desenha o foco no
 * rótulo — que é o que a pessoa vê.
 */
export function OptionGroup<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
  invalid = false,
}: {
  name: string;
  legend: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (next: T) => void;
  invalid?: boolean;
}): React.ReactElement {
  return (
    <fieldset className="min-w-0">
      <legend className="rail mb-1.5">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label key={option.value} className="min-w-0">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'block cursor-pointer rounded-control border px-2.5 py-1.5 font-mono text-[0.78rem] transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                value === option.value
                  ? 'border-amber bg-amber-solid/12 text-text'
                  : 'border-rule text-dim hover:border-rule-strong hover:text-text',
                invalid && value === option.value && 'border-amber',
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Escolha múltipla — mesmas garantias, com checkbox. */
export function CheckGroup<T extends string>({
  legend,
  values,
  options,
  onChange,
}: {
  legend: string;
  values: readonly T[];
  options: readonly Option<T>[];
  onChange: (next: T[]) => void;
}): React.ReactElement {
  const toggle = (value: T) => {
    // Preserva a ordem canônica das opções em vez da ordem de clique: a receita
    // serializada tem que ser a mesma para a mesma escolha, ou dois links iguais
    // viram strings diferentes.
    const next = options
      .map((option) => option.value)
      .filter((candidate) =>
        candidate === value ? !values.includes(candidate) : values.includes(candidate),
      );
    onChange(next);
  };

  return (
    <fieldset className="min-w-0">
      <legend className="rail mb-1.5">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label key={option.value} className="min-w-0">
            <input
              type="checkbox"
              checked={values.includes(option.value)}
              onChange={() => toggle(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'block cursor-pointer rounded-control border px-2.5 py-1.5 font-mono text-[0.78rem] transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                values.includes(option.value)
                  ? 'border-amber bg-amber-solid/12 text-text'
                  : 'border-rule text-dim hover:border-rule-strong hover:text-text',
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
