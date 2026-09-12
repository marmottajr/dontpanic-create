'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { useConfigurator, type ConfiguratorState } from './use-configurator';

/**
 * Os doze passos do assistente, em ordem.
 *
 * A lista é a fonte da verdade: a barra de progresso conta a partir dela, a revisão
 * monta uma linha por passo respondível, e o botão "editar" de cada linha volta pelo
 * índice. Acrescentar um passo é acrescentar um id aqui e um `case` no componente —
 * o compilador aponta o que falta.
 */
export const WIZARD_STEPS = [
  'name',
  'preset',
  'tenancy',
  'entry',
  'social',
  'twoFactor',
  'languages',
  'plans',
  'files',
  'captcha',
  'review',
  'done',
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number];

/** Os passos que produzem uma linha na revisão — `review` e `done` não respondem nada. */
export const ANSWERABLE_STEPS = WIZARD_STEPS.filter((id) => id !== 'review' && id !== 'done');

interface WizardControls {
  open: boolean;
  step: WizardStepId;
  index: number;
  total: number;
  /** Abre o assistente. `from` é o elemento que devolve o foco ao fechar. */
  openWizard: (from?: HTMLElement | null) => void;
  closeWizard: () => void;
  next: () => void;
  back: () => void;
  goTo: (step: WizardStepId) => void;
}

type ConfiguratorContextValue = ConfiguratorState & { wizard: WizardControls };

const ConfiguratorContext = createContext<ConfiguratorContextValue | null>(null);

/**
 * Um estado só para a página inteira.
 *
 * O cabeçalho abre o assistente, o hero mostra o comando, e o modal edita a receita —
 * três lugares que precisam da MESMA receita. Sem um provider, cada um chamaria
 * `useConfigurator` e teria a sua cópia: o hero mostraria o comando do preset padrão
 * enquanto o modal mostrava outro, e a URL seria reescrita por dois donos.
 */
export function ConfiguratorProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const state = useConfigurator();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  // Quem abriu o modal. Ao fechar, o foco volta para lá — senão ele cai no começo do
  // documento e quem navega por teclado recomeça a página.
  const opener = useRef<HTMLElement | null>(null);

  const openWizard = useCallback((from?: HTMLElement | null) => {
    opener.current = from ?? null;
    setOpen(true);
  }, []);

  const closeWizard = useCallback(() => {
    setOpen(false);
    opener.current?.focus();
  }, []);

  const next = useCallback(
    () => setIndex((current) => Math.min(current + 1, WIZARD_STEPS.length - 1)),
    [],
  );
  const back = useCallback(() => setIndex((current) => Math.max(current - 1, 0)), []);
  const goTo = useCallback((step: WizardStepId) => {
    const target = WIZARD_STEPS.indexOf(step);
    if (target >= 0) setIndex(target);
  }, []);

  const value = useMemo<ConfiguratorContextValue>(
    () => ({
      ...state,
      wizard: {
        open,
        step: WIZARD_STEPS[index] as WizardStepId,
        index,
        total: WIZARD_STEPS.length,
        openWizard,
        closeWizard,
        next,
        back,
        goTo,
      },
    }),
    [state, open, index, openWizard, closeWizard, next, back, goTo],
  );

  return <ConfiguratorContext.Provider value={value}>{children}</ConfiguratorContext.Provider>;
}

export function useConfiguratorContext(): ConfiguratorContextValue {
  const value = useContext(ConfiguratorContext);
  if (!value)
    throw new Error('useConfiguratorContext precisa estar dentro de ConfiguratorProvider');
  return value;
}
