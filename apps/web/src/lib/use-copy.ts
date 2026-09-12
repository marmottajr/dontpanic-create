'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CopyStatus = 'idle' | 'copied' | 'failed';

/**
 * Copia para a área de transferência e devolve o estado para anunciar.
 *
 * `navigator.clipboard` não existe em contexto não seguro (http fora de localhost) e
 * pode ser negado por permissão — o fallback com `execCommand` cobre esses casos, e
 * quando nem ele funciona o estado vira `failed` para a interface poder dizer
 * "selecione e copie" em vez de fingir sucesso.
 */
export function useCopy(resetAfterMs = 2400): {
  status: CopyStatus;
  copy: (text: string) => Promise<void>;
} {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      const ok = await writeToClipboard(text);
      setStatus(ok ? 'copied' : 'failed');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus('idle'), resetAfterMs);
    },
    [resetAfterMs],
  );

  return { status, copy };
}

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // cai no fallback
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    // Fora da tela, mas não `display: none` — um elemento não renderizado não pode
    // receber seleção, e sem seleção o `execCommand` não copia nada.
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
