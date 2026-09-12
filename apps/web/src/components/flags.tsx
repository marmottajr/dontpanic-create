import type { ReactElement } from 'react';

import type { Locale } from '@/i18n/locales';

/**
 * Bandeiras em SVG inline.
 *
 * Não é emoji: `🇧🇷` aparece como as letras “BR” num Chrome no Windows, porque a fonte
 * do sistema não traz os glifos de indicador regional. Boa parte de quem lê esta página
 * está exatamente ali, então a bandeira é desenho, não caractere — e nada vem de CDN.
 *
 * São desenhos simplificados de propósito: a 18 pixels de altura, o detalhe da esfera
 * armilar portuguesa ou as cinquenta estrelas americanas viram ruído. O que precisa
 * sobreviver nesse tamanho é a silhueta de cor, e ela sobrevive.
 *
 * E bandeira **não é idioma**: é país. Por isso ela nunca aparece sozinha — o código do
 * idioma vem ao lado, porque `en` não tem bandeira própria e pt-BR/pt-PT só se
 * distinguem pelo rótulo. `aria-hidden` porque o texto ao lado já diz tudo.
 */

const VIEWBOX = '0 0 24 16';

function Frame({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <svg
      viewBox={VIEWBOX}
      width="21"
      height="14"
      aria-hidden="true"
      focusable="false"
      className="shrink-0 rounded-[1px] ring-1 ring-inset ring-black/20"
    >
      {children}
    </svg>
  );
}

const FLAGS: Record<Locale, () => ReactElement> = {
  'pt-br': () => (
    <Frame>
      <rect width="24" height="16" fill="#009739" />
      <path d="M12 1.6 22.4 8 12 14.4 1.6 8Z" fill="#FEDD00" />
      <circle cx="12" cy="8" r="3.6" fill="#012169" />
      <path d="M8.7 6.4a8 8 0 0 1 6.7 2.5" stroke="#fff" strokeWidth="0.9" fill="none" />
    </Frame>
  ),
  'pt-pt': () => (
    <Frame>
      <rect width="24" height="16" fill="#DA291C" />
      <rect width="9.6" height="16" fill="#046A38" />
      <circle cx="9.6" cy="8" r="3.2" fill="#FFE900" />
      <circle cx="9.6" cy="8" r="1.9" fill="#DA291C" />
      <circle cx="9.6" cy="8" r="0.8" fill="#fff" />
    </Frame>
  ),
  en: () => (
    <Frame>
      <rect width="24" height="16" fill="#012169" />
      <path d="M0 0l24 16M24 0L0 16" stroke="#fff" strokeWidth="3.2" />
      <path d="M0 0l24 16M24 0L0 16" stroke="#C8102E" strokeWidth="1.8" />
      <path d="M12 0v16M0 8h24" stroke="#fff" strokeWidth="5.4" />
      <path d="M12 0v16M0 8h24" stroke="#C8102E" strokeWidth="3.2" />
    </Frame>
  ),
  es: () => (
    <Frame>
      <rect width="24" height="16" fill="#AA151B" />
      <rect y="4" width="24" height="8" fill="#F1BF00" />
      <rect x="4.4" y="6" width="2.6" height="4" fill="#AA151B" rx="0.4" />
    </Frame>
  ),
  fr: () => (
    <Frame>
      <rect width="24" height="16" fill="#fff" />
      <rect width="8" height="16" fill="#000091" />
      <rect x="16" width="8" height="16" fill="#E1000F" />
    </Frame>
  ),
  de: () => (
    <Frame>
      <rect width="24" height="16" fill="#FFCE00" />
      <rect width="24" height="10.67" fill="#DD0000" />
      <rect width="24" height="5.33" fill="#000" />
    </Frame>
  ),
  it: () => (
    <Frame>
      <rect width="24" height="16" fill="#fff" />
      <rect width="8" height="16" fill="#008C45" />
      <rect x="16" width="8" height="16" fill="#CD212A" />
    </Frame>
  ),
};

export function Flag({ locale }: { locale: Locale }): ReactElement {
  return FLAGS[locale]();
}
