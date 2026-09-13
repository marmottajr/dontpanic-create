'use client';

import { useEffect, useId, useRef } from 'react';

import { StepEyebrow } from './step-eyebrow';
import { WizardStepBody } from './wizard-steps';
import { RichText } from '../rich-text';
import type { Messages } from '@/i18n/messages';
import { useConfiguratorContext, WIZARD_STEPS } from '@/lib/configurator-context';
import { cn } from '@/lib/cn';

/**
 * O assistente.
 *
 * Uma pergunta por tela, doze passos, e o preset do passo 2 pré-responde os outros
 * oito — é isso que faz doze passos não cansarem: quem escolhe "SaaS" clica Continuar
 * até o fim e sai com uma receita coerente.
 *
 * As respostas não moram num estado separado: cada escolha escreve direto na receita.
 * É o que faz "Voltar" nunca perder nada — voltar é só mudar o índice do passo, e o
 * passo lê o valor atual da receita.
 *
 * O que este componente tem de cuidado, e por quê:
 *
 * - **Foco preso.** Um diálogo modal que deixa o Tab escapar para a página atrás é um
 *   diálogo que quem usa leitor de tela não consegue terminar: o foco sai, o conteúdo
 *   de trás continua anunciável, e não há como voltar sem mouse.
 * - **Esc fecha, e o foco volta para quem abriu.** Sem devolver o foco, fechar o modal
 *   joga o cursor no início do documento.
 * - **A rolagem da página trava** enquanto ele está aberto, senão o fundo rola atrás no
 *   celular e o modal parece ter perdido o conteúdo.
 * - **No celular ele é uma folha em tela cheia**, com o rodapé de botões fixo. Uma caixa
 *   centralizada de 90% da altura, num teclado virtual aberto, esconde justamente o
 *   botão Continuar.
 */
export function WizardModal({ messages }: { messages: Messages }): React.ReactElement | null {
  const { wizard, nameBlocks } = useConfiguratorContext();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const w = messages.wizard;
  const step = w.steps[wizard.step];

  /*
   * As dependências dos efeitos são os VALORES, não o objeto `wizard`.
   *
   * `wizard` é recriado a cada render — e um render acontece a cada tecla digitada,
   * porque a receita mudou. Com `[wizard]` na lista, o efeito de foco rodava a cada
   * caractere e devolvia o cursor ao primeiro campo do passo: digitar "api" no slug
   * gravava "a" e jogava o resto no campo de nome. Os callbacks abaixo vêm de
   * `useCallback` com lista vazia, então são estáveis e a lista de dependências fica
   * honesta.
   */
  const { open: isOpen, step: stepId, closeWizard } = wizard;

  // Trava a rolagem do documento enquanto o modal existe.
  useEffect(() => {
    if (!isOpen) return;
    document.body.dataset.scrollLocked = 'true';
    return () => {
      delete document.body.dataset.scrollLocked;
    };
  }, [isOpen]);

  // Foco inicial e armadilha de Tab.
  useEffect(() => {
    if (!isOpen) return;
    const node = panel.current;
    if (!node) return;

    /*
     * Sem filtro de visibilidade, e isso é deliberado: os radios do assistente são
     * `sr-only` — escondidos com `clip`, não com `display: none` —, então continuam na
     * ordem de tabulação, que é exactamente o que o padrão de `peer` pede. Filtrar por
     * `offsetParent` os eliminaria da armadilha e deixaria o Tab pular as respostas.
     */
    const focusables = () =>
      [
        ...node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.closest('[hidden]'));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeWizard();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) return;
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      const active = document.activeElement;

      // O ciclo é fechado à mão: o navegador levaria o Tab para a barra de endereço e
      // para a página atrás, que é exactamente o que `aria-modal` promete que não
      // acontece — promessa que o navegador não cumpre sozinho.
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closeWizard]);

  // O primeiro campo de cada passo recebe o foco quando o passo troca — senão, depois
  // de clicar em Continuar, o foco fica no botão e o Tab começa do lugar errado.
  useEffect(() => {
    if (!isOpen) return;
    const node = panel.current?.querySelector<HTMLElement>('[data-step-focus]');
    node?.focus();
  }, [isOpen, stepId]);

  if (!wizard.open) return null;

  const isFirst = wizard.index === 0;
  const isLast = wizard.step === 'done';
  const isReview = wizard.step === 'review';
  // O nome inválido bloqueia sair do primeiro passo: seguir com ele produziria um
  // comando que o CLI recusa, e a pessoa só descobriria no terminal.
  const blocked = wizard.step === 'name' && nameBlocks;

  return (
    <div className="fixed inset-0 z-50 flex sm:items-center sm:justify-center sm:p-6">
      {/*
       * O véu é um `<div>`, não um `<button>`.
       *
       * Como botão ele entrava na ordem de tabulação com o mesmo nome do "Fechar" do
       * cabeçalho: duas paradas de teclado idênticas, uma delas invisível. Clicar fora
       * é uma conveniência de mouse; para teclado existem o Esc e o botão nomeado.
       */}
      <div
        aria-hidden="true"
        onClick={wizard.closeWizard}
        className="absolute inset-0 bg-bg/85 backdrop-blur-[2px]"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-in relative flex h-full w-full flex-col border-rule bg-bg sm:h-auto sm:max-h-[88vh] sm:max-w-3xl sm:border"
      >
        <header className="shrink-0 border-b border-rule px-5 py-3 sm:px-7">
          <div className="flex items-center justify-between gap-4">
            <p className="label text-amber">
              {/* Zero à esquerda: mantém a largura do rótulo constante, para o texto
                  não saltar ao passar de 9 para 10. */}
              {w.progress
                .replace('{n}', String(wizard.index + 1).padStart(2, '0'))
                .replace('{total}', String(wizard.total))}
            </p>
            <button
              type="button"
              onClick={wizard.closeWizard}
              className="label text-dim hover:text-ink"
            >
              {w.close}
            </button>
          </div>

          {/* Doze segmentos: um por passo. Uma barra contínua diria "está quase" sem
              dizer quantas perguntas faltam, que é a informação que importa aqui. */}
          <ol aria-hidden="true" className="mt-3 flex gap-1">
            {WIZARD_STEPS.map((id, position) => (
              <li
                key={id}
                className={cn(
                  'h-[3px] flex-1 rounded-[1px]',
                  position < wizard.index
                    ? 'bg-amber'
                    : position === wizard.index
                      ? 'bg-amber/70'
                      : 'bg-rule',
                )}
              />
            ))}
          </ol>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7 sm:py-7">
          <StepEyebrow step={stepId} label={step.eyebrow} />
          <h2 id={titleId} className="measure mt-2 text-h3 font-semibold sm:text-h2">
            {step.question}
          </h2>
          <p className="measure mt-3 text-small text-dim">
            <RichText>{step.help}</RichText>
          </p>

          <div className="mt-6">
            <WizardStepBody messages={messages} />
          </div>
        </div>

        <footer className="shrink-0 border-t border-rule bg-bg px-5 py-3 sm:px-7">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={wizard.back}
              disabled={isFirst}
              className="label px-1 py-2 text-dim hover:text-ink disabled:opacity-40 disabled:hover:text-dim"
            >
              {w.back}
            </button>

            <div className="flex items-center gap-3">
              {/* "Usar o recomendado" é só Continuar com outro nome — e é honesto: o
                  valor recomendado já está na receita, posto pelo preset. O botão
                  existe para dizer isso a quem não quer decidir. */}
              {!isLast && !isReview && wizard.step !== 'name' ? (
                <button
                  type="button"
                  onClick={wizard.next}
                  className="text-small text-dim underline-offset-4 hover:text-ink hover:underline"
                >
                  {w.recommended}
                </button>
              ) : null}

              {isLast ? (
                <button
                  type="button"
                  onClick={wizard.closeWizard}
                  className="rounded-1 bg-amber px-5 py-3 text-small font-semibold text-on-amber hover:brightness-105"
                >
                  {w.close}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={wizard.next}
                  disabled={blocked}
                  className="rounded-1 bg-amber px-5 py-3 text-small font-semibold text-on-amber hover:brightness-105 disabled:opacity-50"
                >
                  {isReview ? w.finish : w.next}
                </button>
              )}
            </div>
          </div>

          {blocked ? (
            <p role="alert" className="mt-2 text-meta text-danger">
              {messages.configurator.blockedByName}
            </p>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
