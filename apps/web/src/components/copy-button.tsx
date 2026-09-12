'use client';

import { cn } from '@/lib/cn';
import { useCopy } from '@/lib/use-copy';

/**
 * Botão de copiar com anúncio para leitor de tela.
 *
 * O rótulo visível muda de "Copiar comando" para "Comando copiado", e **o mesmo texto**
 * vai numa região `aria-live="polite"` separada. Trocar só o rótulo do botão não basta:
 * mudança de nome de elemento focado não é anunciada de forma confiável entre leitores,
 * e a pessoa ficaria sem saber se a ação funcionou. A região é `sr-only` porque quem vê
 * a tela já recebeu a informação pelo botão.
 */
export function CopyButton({
  value,
  idleLabel,
  copiedLabel,
  failedLabel,
  variant = 'solid',
  className,
}: {
  value: string;
  idleLabel: string;
  copiedLabel: string;
  failedLabel: string;
  variant?: 'solid' | 'quiet';
  className?: string;
}): React.ReactElement {
  const { status, copy } = useCopy();

  const label = status === 'copied' ? copiedLabel : status === 'failed' ? failedLabel : idleLabel;

  return (
    <>
      <button
        type="button"
        onClick={() => void copy(value)}
        className={cn(
          'inline-flex shrink-0 items-center gap-2 rounded-1 px-3.5 py-2 text-meta font-semibold transition-colors',
          variant === 'solid'
            ? 'bg-amber text-on-amber hover:brightness-105'
            : 'border border-rule text-dim hover:border-dim/60 hover:text-ink',
          className,
        )}
      >
        {status === 'copied' ? <CheckIcon /> : <ClipboardIcon />}
        <span>{label}</span>
      </button>
      <span aria-live="polite" className="sr-only">
        {status === 'idle' ? '' : label}
      </span>
    </>
  );
}

function ClipboardIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none">
      <rect x="4.5" y="2.5" width="8" height="11" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10.5 2.5v-.8a.7.7 0 0 0-.7-.7H7.2a.7.7 0 0 0-.7.7v.8"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function CheckIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none">
      <path d="M3 8.6l3.2 3.2L13 4.8" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
