import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WizardModal } from './wizard-modal';
import { ptBR } from '@/i18n/messages/pt-BR';
import { ConfiguratorProvider, useConfiguratorContext } from '@/lib/configurator-context';
import { buildCommand, DEFAULT_PRESET, presetRecipe, toFlags } from '@/lib/recipe-bridge';
import { SAMPLE_PROJECT } from '@/lib/recipe-url';

const w = ptBR.wizard;

/** O `<code>` do comando, sem o `$` do prompt (decorativo e `aria-hidden`). */
function commandText(): string {
  const code = document.querySelector('[data-command]');
  return (code?.textContent ?? '').replace(/^\$\s*/, '').trim();
}

/**
 * O assistente com um botão que o abre — o botão importa: é para ele que o foco tem
 * que voltar quando o modal fecha.
 */
function Harness(): React.ReactElement {
  return (
    <ConfiguratorProvider>
      <Opener />
      <WizardModal messages={ptBR} />
    </ConfiguratorProvider>
  );
}

function Opener(): React.ReactElement {
  const { wizard } = useConfiguratorContext();
  return (
    <button type="button" onClick={(event) => wizard.openWizard(event.currentTarget)}>
      {w.open}
    </button>
  );
}

async function setup() {
  const user = userEvent.setup();
  const result = render(<Harness />);
  await user.click(screen.getByRole('button', { name: w.open }));
  return { user, ...result };
}

function question(): string {
  return document.querySelector('[role=dialog] h2')?.textContent ?? '';
}

async function advance(user: ReturnType<typeof userEvent.setup>, times: number) {
  for (let i = 0; i < times; i += 1) {
    await user.click(screen.getByRole('button', { name: w.next }));
  }
}

beforeEach(() => {
  window.history.replaceState(null, '', '/pt-br/');
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('assistente', () => {
  it('abre no primeiro passo e conta os doze', async () => {
    await setup();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(question()).toBe(w.steps.name.question);
    expect(
      screen.getByText(w.progress.replace('{n}', '1').replace('{total}', '12')),
    ).toBeInTheDocument();
  });

  it('nomeia o diálogo pela pergunta do passo', async () => {
    await setup();
    const dialog = screen.getByRole('dialog');
    const labelId = dialog.getAttribute('aria-labelledby');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.getElementById(labelId ?? '')?.textContent).toBe(w.steps.name.question);
  });

  /**
   * A promessa do assistente: quem escolheu um ponto de partida só clica Continuar.
   * Se algum passo exigisse uma resposta que o preset não deu, este teste travaria no
   * meio — e é exactamente o que ele existe para pegar.
   */
  it('atravessa os doze passos só com Continuar', async () => {
    const { user } = await setup();

    await advance(user, 10);
    expect(question()).toBe(w.steps.review.question);

    await user.click(screen.getByRole('button', { name: w.finish }));
    expect(question()).toBe(w.steps.done.question);

    const expected = buildCommand(
      presetRecipe(DEFAULT_PRESET, { ...SAMPLE_PROJECT }),
      DEFAULT_PRESET,
    );
    expect(commandText()).toBe(expected);
  });

  it('voltar não perde a resposta', async () => {
    const { user } = await setup();

    await advance(user, 2);
    expect(question()).toBe(w.steps.tenancy.question);

    await user.click(
      screen.getByRole('radio', { name: new RegExp(w.steps.tenancy.choices.no.label) }),
    );
    await user.click(screen.getByRole('button', { name: w.back }));
    expect(question()).toBe(w.steps.preset.question);

    await user.click(screen.getByRole('button', { name: w.next }));
    expect(
      screen.getByRole('radio', { name: new RegExp(w.steps.tenancy.choices.no.label) }),
    ).toBeChecked();
  });

  it('uma resposta muda o comando que o CLI vai receber', async () => {
    const { user } = await setup();
    await advance(user, 5);
    expect(question()).toBe(w.steps.twoFactor.question);

    await user.click(
      screen.getByRole('radio', { name: new RegExp(w.steps.twoFactor.choices.no.label) }),
    );
    await advance(user, 5);
    await user.click(screen.getByRole('button', { name: w.finish }));

    const recipe = presetRecipe(DEFAULT_PRESET, { ...SAMPLE_PROJECT });
    recipe.features.twoFactor = false;
    const flags = toFlags(recipe, DEFAULT_PRESET);
    expect(flags.length).toBeGreaterThan(0);
    for (const flag of flags) expect(commandText()).toContain(flag);
  });

  /**
   * Bloquear o toggle esconderia a regra. O assistente deixa responder, mostra o
   * problema com o porquê, e oferece o conserto.
   */
  it('mostra a incoerência e oferece o conserto em vez de bloquear', async () => {
    const { user } = await setup();
    await advance(user, 2);

    await user.click(
      screen.getByRole('radio', { name: new RegExp(w.steps.tenancy.choices.no.label) }),
    );

    const title = await screen.findByText(ptBR.configurator.issuesTitle);
    const panel = title.parentElement as HTMLElement;
    const problem = within(panel).getAllByRole('listitem')[0] as HTMLElement;
    const message = problem.textContent ?? '';
    const fix = within(problem).getByRole('button');

    await user.click(fix);

    // O conserto tem que mexer na receita: aquele problema sai da lista. Um botão que
    // não muda nada é um conserto que não aconteceu.
    expect(message.length).toBeGreaterThan(20);
    expect(screen.queryByText(message.replace(/^[^:]+:\s*/, ''))).not.toBeInTheDocument();
  });

  it('a revisão volta para o passo da linha', async () => {
    const { user } = await setup();
    await advance(user, 10);

    const row = screen.getByText(w.steps.entry.eyebrow).closest('div') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: w.edit }));

    expect(question()).toBe(w.steps.entry.question);
  });

  it('não deixa sair do primeiro passo com um nome ilegal', async () => {
    const { user } = await setup();
    const slug = screen.getByLabelText(ptBR.configurator.slugLabel);

    await user.clear(slug);
    await user.type(slug, 'api');

    expect(screen.getByRole('button', { name: w.next })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(ptBR.configurator.blockedByName);

    // `validateSlug` sugere `api-app`; o botão aplica.
    await user.click(screen.getByRole('button', { name: /api-app/ }));
    expect(slug).toHaveValue('api-app');
    expect(screen.getByRole('button', { name: w.next })).toBeEnabled();
  });

  it('Esc fecha e devolve o foco a quem abriu', async () => {
    const { user } = await setup();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: w.open })).toHaveFocus();
  });

  /** Tab não pode escapar para a página atrás: é o que `aria-modal` promete. */
  it('prende o foco no diálogo', async () => {
    const { user } = await setup();
    const dialog = screen.getByRole('dialog');

    for (let i = 0; i < 24; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('trava a rolagem da página enquanto está aberto', async () => {
    const { user } = await setup();
    expect(document.body.dataset.scrollLocked).toBe('true');

    await user.click(screen.getByRole('button', { name: w.close }));
    expect(document.body.dataset.scrollLocked).toBeUndefined();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('escreve a configuração na URL e no localStorage', async () => {
    const { user } = await setup();
    await advance(user, 5);
    await user.click(
      screen.getByRole('radio', { name: new RegExp(w.steps.twoFactor.choices.no.label) }),
    );

    expect(window.location.search).toContain('no=');
    expect(window.localStorage.getItem('dontpanic.recipe.v1')).toContain('no=');
  });

  /**
   * Aba privada faz o próprio acessor `localStorage` lançar — não só o `getItem`. Uma
   * exceção aqui derrubaria o assistente inteiro.
   */
  it('funciona quando o localStorage lança', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const { user } = await setup();
    await advance(user, 10);
    await user.click(screen.getByRole('button', { name: w.finish }));

    expect(commandText()).toContain('npx create-dontpanic');
    expect(spy).toHaveBeenCalled();
  });

  it('copia o comando no último passo e anuncia o resultado', async () => {
    const { user } = await setup();
    await advance(user, 10);
    await user.click(screen.getByRole('button', { name: w.finish }));

    const expected = commandText();
    await user.click(screen.getByRole('button', { name: ptBR.configurator.copy }));

    expect(await navigator.clipboard.readText()).toBe(expected);
    // Dois nós com o mesmo texto, de propósito: o rótulo visível e a região
    // `aria-live` que anuncia. Ver `copy-button.tsx`.
    const announcements = await screen.findAllByText(ptBR.configurator.copied);
    expect(announcements.length).toBe(2);
    expect(announcements.some((node) => node.closest('[aria-live]'))).toBe(true);
  });
});
