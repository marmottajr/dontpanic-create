import { GTM_ID } from '@/lib/gtm';

/**
 * Google Tag Manager.
 *
 * **O que vem da variável de ambiente é o id do contêiner, não o snippet.** O HTML que
 * o GTM manda colar é boilerplate que nunca muda; a única parte variável dele é
 * `GTM-XXXXXXX`, e ela aparece duas vezes — no `<script>` e no `<iframe>` do
 * `<noscript>`. Guardar as duas metades como texto em duas variáveis separadas cria um
 * jeito de elas divergirem: alguém troca o contêiner, atualiza uma e esquece a outra, e
 * o site passa a carregar um contêiner e a reportar para outro. Com o id sozinho as
 * duas metades são derivadas da mesma string, e a divergência deixa de ser possível.
 *
 * **O id não é segredo.** Ele vai no HTML de toda página, legível por qualquer um que
 * abra o inspetor — guardá-lo em `secrets` daria uma sensação de proteção que o meio de
 * entrega desmente. Por isso ele é uma *variable* do repositório, não um *secret*: o
 * objetivo é mantê-lo fora do versionamento e trocável sem commit, não escondê-lo.
 *
 * **Sem id, nada é renderizado.** É o que faz `pnpm dev`, um fork e um preview não
 * poluírem a propriedade do GA4 com tráfego que não é de gente — e o que permite ao
 * build passar em quem não tem a variável configurada.
 */
export function TagManager(): React.ReactElement | null {
  if (!GTM_ID) return null;

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html:
            `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':` +
            `new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],` +
            `j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=` +
            `'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);` +
            `})(window,document,'script','dataLayer','${GTM_ID}');`,
        }}
      />
      {/* Para quem está sem JavaScript. Fica aqui, e não no fim do body, porque o GTM
          o especifica logo após a abertura do `<body>` — e porque `display:none` faz
          a posição não custar nada em layout. */}
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
          title="Google Tag Manager"
        />
      </noscript>
    </>
  );
}
