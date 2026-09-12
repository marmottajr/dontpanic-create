'use client';

import type { ReactNode } from 'react';

import { RichText } from '../rich-text';
import { cn } from '@/lib/cn';

/**
 * Um toggle com rótulo e explicação.
 *
 * `role="switch"` num `<button>`, com `aria-checked` — e não um checkbox escondido com
 * um `<div>` estilizado por cima. A diferença que importa é o anúncio: um leitor de
 * tela diz "ligado/desligado" num switch, e a explicação viaja via
 * `aria-describedby`, então quem navega por teclado ouve *por que* a opção existe sem
 * precisar sair do controle.
 *
 * A área clicável é o botão inteiro, incluindo o texto: alvo grande é o que faz isto
 * funcionar num telefone de 380 pixels.
 */
export function SwitchRow({
  id,
  checked,
  onChange,
  label,
  summary,
  badge,
  highlighted = false,
  disabled = false,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  summary: string;
  badge?: ReactNode;
  highlighted?: boolean;
  /** Trava a escolha mantendo o controle focável — ver nota abaixo. */
  disabled?: boolean;
}): React.ReactElement {
  const descriptionId = `${id}-desc`;

  return (
    <div
      className={cn(
        'border-t border-rule',
        highlighted && 'border-l-2 border-l-amber pl-3 -ml-3 sm:-ml-4 sm:pl-4',
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descriptionId}
        /* `aria-disabled` e não o atributo `disabled`: um botão desabilitado sai da
           ordem de tabulação, e com ele sairia a explicação de por que a opção está
           travada — que é justamente o que quem navega por teclado precisa ouvir. */
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onChange(!checked);
        }}
        className={cn(
          'group flex w-full items-start gap-3 py-3 text-left',
          disabled && 'cursor-default opacity-70',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 grid h-[1.15rem] w-[2rem] shrink-0 grid-cols-2 rounded-full border transition-colors',
            checked ? 'border-amber bg-amber-solid/25' : 'border-rule-strong bg-transparent',
          )}
        >
          <span
            className={cn(
              'my-[0.14rem] h-[0.75rem] w-[0.75rem] rounded-full transition-transform',
              checked
                ? 'translate-x-[0.95rem] bg-amber-solid'
                : 'translate-x-[0.2rem] bg-rule-strong',
            )}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={cn(
                'text-small font-semibold',
                checked ? 'text-text' : 'text-dim group-hover:text-text',
              )}
            >
              {label}
            </span>
            {badge}
          </span>
          <span id={descriptionId} className="mt-1 block text-meta text-dim">
            <RichText>{summary}</RichText>
          </span>
        </span>
      </button>
    </div>
  );
}
