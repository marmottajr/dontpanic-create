import { RichText } from '../rich-text';

/**
 * O bloco técnico do fim do passo.
 *
 * É onde a tela devolve o que o resto dela evitou de propósito: nomes de cookie, de
 * variável de ambiente, de função SQL. Serve ao leitor que já sabe o que quer — e que,
 * sem ele, leria a pergunta em linguagem de gente e concluiria que a página está
 * escondendo a engenharia.
 *
 * A régua é a cor de "provado", a mesma da seção "A prova": nos dois lugares ela marca
 * a mesma coisa — aqui está o que o código realmente faz.
 */
export function WhatChanges({
  label,
  children,
}: {
  label: string;
  children: string;
}): React.ReactElement {
  return (
    <section className="border-l-2 border-proof pl-4">
      <h3 className="label text-proof">{label}</h3>
      <p className="measure mt-2 text-small text-dim">
        <RichText>{children}</RichText>
      </p>
    </section>
  );
}
