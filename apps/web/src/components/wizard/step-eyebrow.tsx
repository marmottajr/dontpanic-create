import { WIZARD_TERMS } from '@/content/wizard-terms';
import type { WizardStepId } from '@/lib/configurator-context';
import { cn } from '@/lib/cn';

/**
 * O rótulo do passo, com o nome oficial do recurso ao lado.
 *
 * `SEGUNDO FATOR · 2FA TOTP`. O termo entra em mono, mais apagado, e **sem a caixa alta
 * do rótulo**: ele tem a sua própria capitalização (`RLS` é maiúsculo, `slug` é
 * minúsculo, `OAuth 2.0` é misto), e forçar `uppercase` transformaria nomes que a
 * pessoa vai digitar numa busca em algo que ela não reconheceria de volta.
 *
 * Dois cuidados que o desenho pede:
 *
 * - **Quebra, não trunca.** Num telefone de 380px `multi-tenancy · RLS` não cabe na
 *   mesma linha do rótulo, então a faixa é um flex que embrulha e o termo cai para a
 *   linha de baixo inteiro. Termo cortado pela metade é pior que termo nenhum — ele
 *   deixa de servir para procurar, que é a única razão de estar ali.
 * - **Lê como frase.** O separador é `aria-hidden`, então um leitor de tela anuncia
 *   "Segundo fator, 2FA TOTP" em vez de ler um ponto solto no meio. A caixa alta é só
 *   CSS: o texto no DOM continua com a capitalização original, e é essa que é
 *   anunciada.
 */
export function StepEyebrow({
  step,
  label,
  className,
}: {
  step: WizardStepId;
  label: string;
  className?: string;
}): React.ReactElement {
  const term = WIZARD_TERMS[step];

  return (
    <p className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-0.5', className)}>
      <span className="label label-wide text-dim">{label}</span>
      {term ? (
        <>
          <span aria-hidden="true" className="text-faint">
            ·
          </span>
          <span className="font-mono text-meta text-faint">{term}</span>
        </>
      ) : null}
    </p>
  );
}
