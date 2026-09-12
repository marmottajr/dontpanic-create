'use client';

import { useEffect } from 'react';

import { LocaleList, SmallMasthead } from '@/components/locale-list';
import { detectLocale, localePath, readStoredLocale } from '@/i18n/locales';

/**
 * A raiz `/` escolhe o idioma no cliente.
 *
 * Com `output: 'export'` não existe servidor para negociar `Accept-Language`: o que
 * chega ao navegador é HTML estático servido por CDN. Então a decisão acontece aqui,
 * com `navigator.languages`, e a navegação é `replace` — não `push` — para que o botão
 * de voltar saia do site em vez de voltar para esta página e ser redirecionado de novo,
 * num laço que aprisiona a pessoa.
 *
 * Ordem de autoridade: escolha explícita salva > idiomas do navegador > `en`.
 *
 * A lista de links é a página de verdade, não um placeholder: é o que quem está sem
 * JavaScript vê, é o que um crawler segue, e é o que sobra se a detecção errar.
 */
export default function LocaleGate(): React.ReactElement {
  useEffect(() => {
    const stored = readStoredLocale();
    const target = stored ?? detectLocale(navigator.languages ?? [navigator.language]);
    window.location.replace(`${localePath(target)}${window.location.search}`);
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <SmallMasthead />
      <div className="mt-10">
        <LocaleList label="Language / Idioma" />
      </div>
    </main>
  );
}
