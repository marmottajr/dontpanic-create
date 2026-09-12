'use client';

import { useEffect, useRef, useState } from 'react';

import { Flag } from './flags';
import { LOCALES, LOCALE_INFO, localePath, writeStoredLocale, type Locale } from '@/i18n/locales';
import { cn } from '@/lib/cn';

/**
 * Troca de idioma.
 *
 * São links de verdade, um por idioma, porque cada idioma é uma página própria —
 * `<a href>` dá abrir em nova aba, copiar endereço e indexação, coisas que um
 * `onChange` de `<select>` não dá. O `<details>` cuida do teclado sem JavaScript.
 *
 * Dois detalhes que não são óbvios:
 *
 * - **A query string viaja com o link.** Quem configurou a receita e troca de idioma
 *   não pode perder a configuração; por isso os `href` são completados depois da
 *   montagem, quando `window.location.search` existe. Antes disso valem sem query, o
 *   que ainda funciona.
 * - **Clicar grava a escolha.** A partir daí a detecção por `navigator.languages` não
 *   manda mais: quem escolheu português quer português mesmo num navegador em inglês.
 */
export function LocaleSwitcher({
  current,
  label,
}: {
  current: Locale;
  label: string;
}): React.ReactElement {
  const [search, setSearch] = useState('');
  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    setSearch(window.location.search);
  }, []);

  // Fecha ao clicar fora e no Escape — um popover aberto que só fecha clicando de novo
  // no botão é a armadilha clássica do `<details>` usado como menu.
  useEffect(() => {
    const close = (event: Event) => {
      const node = details.current;
      if (!node?.open) return;
      if (event.type === 'keydown' && (event as KeyboardEvent).key !== 'Escape') return;
      if (event.type === 'pointerdown' && node.contains(event.target as Node)) return;
      node.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);

  const info = LOCALE_INFO[current];

  return (
    <details ref={details} className="relative">
      <summary
        className="flex cursor-pointer list-none items-center gap-2 rounded-control border border-rule px-2.5 py-1.5 text-meta text-dim hover:border-rule-strong hover:text-text [&::-webkit-details-marker]:hidden"
        aria-label={`${label}: ${info.name} (${info.short})`}
      >
        <Flag locale={current} />
        <span className="font-mono">{info.short}</span>
        <svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true" className="opacity-60">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.4" fill="none" />
        </svg>
      </summary>

      <div
        className="absolute right-0 z-40 mt-1.5 w-56 border border-rule bg-surface p-1 shadow-[0_12px_28px_-16px_rgba(0,0,0,0.55)]"
        role="group"
        aria-label={label}
      >
        {LOCALES.map((locale) => {
          const item = LOCALE_INFO[locale];
          return (
            <a
              key={locale}
              href={`${localePath(locale)}${search}`}
              hrefLang={item.tag}
              lang={item.tag}
              onClick={() => writeStoredLocale(locale)}
              aria-current={locale === current ? 'true' : undefined}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 text-small hover:bg-well',
                locale === current ? 'text-amber' : 'text-text',
              )}
            >
              <Flag locale={locale} />
              <span className="flex-1">{item.name}</span>
              <span className="font-mono text-meta text-dim">{item.short}</span>
            </a>
          );
        })}
      </div>
    </details>
  );
}
