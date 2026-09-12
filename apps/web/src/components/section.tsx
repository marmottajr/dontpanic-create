import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** Gutter único da página. Sai daqui e de nenhum outro lugar. */
export function Shell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn('mx-auto w-full max-w-[74rem] px-5 sm:px-8', className)}>{children}</div>
  );
}

/**
 * Uma seção da especificação.
 *
 * A régua horizontal de largura total separa as seções — não há cartão, sombra nem
 * raio. A faixa `rail` à esquerda carrega o metadado técnico do bloco (identificador,
 * contagem, referência a ADR); ela informa, não decora, e em telas estreitas vira uma
 * linha acima do conteúdo em vez de desaparecer.
 */
export function Section({
  id,
  title,
  rail,
  lead,
  children,
  className,
}: {
  id: string;
  title: string;
  rail?: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <section id={id} className={cn('scroll-mt-16 border-t border-rule py-14 sm:py-20', className)}>
      <Shell>
        <div className="spec">
          <div className="rail">{rail}</div>
          <div>
            <h2 className="text-h2 font-bold tracking-[-0.015em] w-wide">{title}</h2>
            {lead ? <p className="measure mt-4 text-lead text-dim">{lead}</p> : null}
            {children ? <div className="mt-10">{children}</div> : null}
          </div>
        </div>
      </Shell>
    </section>
  );
}
