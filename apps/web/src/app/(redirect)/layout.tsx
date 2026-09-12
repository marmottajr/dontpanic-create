import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '../globals.css';
import { themeBootstrapScript } from '@/components/theme-toggle';
import { DEFAULT_LOCALE, LOCALES, LOCALE_INFO, SITE_URL, localeUrl } from '@/i18n/locales';

/**
 * Root layout da raiz `/`.
 *
 * O `lang` aqui é o do idioma padrão, e é honesto: esta página não tem conteúdo além de
 * uma lista de links para os idiomas. O conteúdo de verdade mora em `/{locale}/`, e é
 * lá que `lang` importa.
 */

const languages: Record<string, string> = {};
for (const locale of LOCALES) {
  languages[LOCALE_INFO[locale].tag] = localeUrl(locale);
}
languages['x-default'] = localeUrl(DEFAULT_LOCALE);

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'DontPanic',
  alternates: { canonical: SITE_URL, languages },
};

export default function RedirectLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <html lang={LOCALE_INFO[DEFAULT_LOCALE].tag} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        {children}
      </body>
    </html>
  );
}
