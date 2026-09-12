import { LocaleList, SmallMasthead } from '@/components/locale-list';

/**
 * A página 404.
 *
 * Em inglês, e isso é uma decisão: ela existe fora de `/{locale}/`, então não há idioma
 * a respeitar — quem cai aqui digitou um caminho que não existe, e `en` é o
 * `x-default` do site. Traduzir sete vezes um texto de quatro linhas que ninguém deveria
 * ler custaria mais manutenção do que vale.
 *
 * A voz do Marvin cabe aqui porque nada de segurança está sendo dito. A regra do
 * projeto é essa: humor nas bordas, nunca onde há consequência.
 *
 * Limite conhecido: o `out/404.html` do export estático — o que a hospedagem serve num
 * caminho inexistente — vem do `not-found` da RAIZ do `app/`, e a raiz aqui não tem
 * layout: são dois root layouts, um por grupo de rotas, para que `<html lang>` diga o
 * idioma real de cada página. Trocar isso por um 404 mais bonito custaria o `lang`
 * correto nas sete páginas de conteúdo, que é o que um leitor de tela e um buscador
 * usam. Então esta página cobre a navegação dentro do grupo, e um 404 duro cai na
 * página padrão do Next.
 */
export default function NotFound(): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <SmallMasthead />

      <p className="mt-8 text-lead">This page does not exist.</p>
      <p className="measure mt-3 text-small italic text-dim">
        I have calculated your chance of finding it at very close to zero. Would you like me to try
        again? I have nothing better to do.
      </p>

      <div className="mt-10">
        <LocaleList label="Language" />
      </div>
    </main>
  );
}
