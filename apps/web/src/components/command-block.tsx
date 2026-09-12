'use client';

import { useEffect, useRef, useState } from 'react';

import { CopyButton } from './copy-button';
import { cn } from '@/lib/cn';

/**
 * O comando. É o protagonista da página: aparece no hero e no configurador, e é a única
 * coisa que o visitante leva daqui.
 *
 * Quando o texto muda, um flash âmbar percorre a linha uma vez. É a exceção deliberada
 * à regra de não animar nada sem ação do usuário — aqui houve ação (um toggle, lá
 * longe na coluna ao lado) e o efeito existe para mostrar *que a mudança chegou aqui*.
 * Respeita `prefers-reduced-motion` pelo CSS global.
 */
export function CommandBlock({
  command,
  label,
  copy,
  copied,
  copyFailed,
  size = 'normal',
}: {
  command: string;
  label: string;
  copy: string;
  copied: string;
  copyFailed: string;
  size?: 'normal' | 'large';
}): React.ReactElement {
  const [flash, setFlash] = useState(false);
  const previous = useRef(command);

  useEffect(() => {
    if (previous.current === command) return;
    previous.current = command;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 640);
    return () => clearTimeout(timer);
  }, [command]);

  return (
    <div className="border border-rule bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-rule px-3 py-1.5">
        <span className="rail w-condensed">{label}</span>
        <CopyButton
          value={command}
          idleLabel={copy}
          copiedLabel={copied}
          failedLabel={copyFailed}
          variant="quiet"
        />
      </div>

      {/*
       * O comando QUEBRA linha, não rola.
       *
       * Numa coluna de 21rem uma linha com seis flags produz uma barra de rolagem
       * horizontal, e aí a parte que decide a configuração fica fora da vista de quem
       * não pensa em arrastar. Quebrar nos espaços mostra o comando inteiro; o botão de
       * copiar entrega o texto exato de qualquer forma. `overflow-wrap: anywhere` é a
       * rede para um token longo demais (uma lista de idiomas, por exemplo).
       */}
      <div className="px-3 py-3 sm:px-4 sm:py-4">
        <code
          data-command=""
          className={cn(
            'block whitespace-pre-wrap [overflow-wrap:anywhere] font-mono leading-relaxed',
            size === 'large' ? 'text-[0.9rem] sm:text-[1.05rem]' : 'text-[0.82rem] sm:text-meta',
            flash && 'command-changed',
          )}
        >
          <span className="select-none pr-2 text-dim" aria-hidden="true">
            $
          </span>
          {command}
        </code>
      </div>
    </div>
  );
}
