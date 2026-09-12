'use client';

import { Flag } from './flags';
import { LOCALES, LOCALE_INFO, localePath, writeStoredLocale } from '@/i18n/locales';

/**
 * A lista dos sete idiomas, como links.
 *
 * Usada pela raiz `/` e pela página 404 — as duas páginas que existem fora de um
 * idioma. São links de verdade porque cada idioma é uma página própria: dá para abrir
 * em nova aba, copiar o endereço e ser seguido por um crawler.
 */
export function LocaleList({ label }: { label: string }): React.ReactElement {
  return (
    <nav aria-label={label}>
      <ul>
        {LOCALES.map((locale) => {
          const info = LOCALE_INFO[locale];
          return (
            <li key={locale} className="border-t border-rule">
              <a
                href={localePath(locale)}
                hrefLang={info.tag}
                lang={info.tag}
                onClick={() => writeStoredLocale(locale)}
                className="flex items-center gap-3 py-3 text-small hover:text-amber"
              >
                <Flag locale={locale} />
                <span className="flex-1">{info.name}</span>
                <span className="font-mono text-meta text-dim">{info.short}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** O letreiro em tamanho reduzido, para as páginas sem idioma. */
export function SmallMasthead(): React.ReactElement {
  return (
    <p
      role="img"
      aria-label="Don’t Panic"
      className="select-none font-extrabold uppercase leading-[0.84] tracking-[-0.03em] text-amber-display w-mast text-[clamp(2.6rem,13vw,4rem)]"
    >
      <span className="block">Don’t</span>
      <span className="block">Panic</span>
    </p>
  );
}
