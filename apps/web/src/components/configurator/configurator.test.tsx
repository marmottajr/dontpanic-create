import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Configurator } from './configurator';
import { ptBR } from '@/i18n/messages/pt-BR';
import { buildCommand, DEFAULT_PRESET, presetRecipe, toFlags } from '@/lib/recipe-bridge';
import { SAMPLE_PROJECT } from '@/lib/recipe-url';

/** O `<code>` do comando, sem o `$` do prompt (que é decorativo e `aria-hidden`). */
function commandText(): string {
  const code = document.querySelector('[data-command]');
  return (code?.textContent ?? '').replace(/^\$\s*/, '').trim();
}

function setup() {
  return { user: userEvent.setup(), ...render(<Configurator messages={ptBR} />) };
}

beforeEach(() => {
  window.history.replaceState(null, '', '/pt-br/');
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('configurador', () => {
  it('abre no preset padrão, mostrando o comando que o CLI entende', () => {
    setup();
    const expected = buildCommand(
      presetRecipe(DEFAULT_PRESET, { ...SAMPLE_PROJECT }),
      DEFAULT_PRESET,
    );
    expect(commandText()).toBe(expected);
  });

  /**
   * O diferencial da tela: o visitante vê que o rename atravessa o identificador SQL,
   * a role do Postgres e o escopo do pnpm — lugares com regras contraditórias.
   */
  it('mostra as formas derivadas do nome e as atualiza ao digitar', async () => {
    const { user } = setup();

    expect(screen.getByText('acme_corp')).toBeInTheDocument();
    expect(screen.getByText('acme_corp_app')).toBeInTheDocument();
    expect(screen.getByText('@acme-corp/*')).toBeInTheDocument();
    expect(screen.getByText('admin@acme-corp.dev')).toBeInTheDocument();

    const name = screen.getByLabelText(ptBR.configurator.nameLabel);
    await user.clear(name);
    await user.type(name, 'Loja da Ana');

    expect(screen.getByText('loja_da_ana')).toBeInTheDocument();
    expect(screen.getByText('loja_da_ana_e2e')).toBeInTheDocument();
    expect(screen.getByText('admin@loja-da-ana.dev')).toBeInTheDocument();
  });

  it('o slug segue o nome até ser editado à mão, e então manda', async () => {
    const { user } = setup();
    const name = screen.getByLabelText(ptBR.configurator.nameLabel);
    const slug = screen.getByLabelText(ptBR.configurator.slugLabel);

    await user.clear(name);
    await user.type(name, 'Acme');
    expect(slug).toHaveValue('acme');

    await user.clear(slug);
    await user.type(slug, 'loja');
    await user.type(name, ' Corp');

    expect(slug).toHaveValue('loja');
    // `deriveNames` privilegia o slug customizado para as formas de código, então o
    // nome humano "Acme Corp" não contamina o identificador SQL.
    expect(screen.getByText('admin@loja.dev')).toBeInTheDocument();
    expect(screen.queryByText('acme_corp')).not.toBeInTheDocument();
  });

  /**
   * `validateSlug` devolve lista em vez de lançar justamente para esta tela: mostra o
   * problema com o motivo, e a sugestão vira um botão.
   */
  it('explica um slug ilegal e aplica a sugestão num clique', async () => {
    const { user } = setup();
    const slug = screen.getByLabelText(ptBR.configurator.slugLabel);

    await user.clear(slug);
    await user.type(slug, 'select');

    expect(screen.getByText(/palavra reservada do SQL/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /select-app/ }));
    expect(slug).toHaveValue('select-app');
  });

  it('avisa que o comando não serve enquanto o nome é inválido', async () => {
    const { user } = setup();
    const slug = screen.getByLabelText(ptBR.configurator.slugLabel);

    await user.clear(slug);
    await user.type(slug, 'ab');

    expect(screen.getByRole('alert')).toHaveTextContent(ptBR.configurator.blockedByName);
  });

  it('um toggle muda o comando, e o chip removido o desfaz', async () => {
    const { user } = setup();
    const before = commandText();

    await user.click(
      screen.getByRole('switch', { name: new RegExp(ptBR.configurator.features.easterEggs.label) }),
    );

    const after = commandText();
    expect(after).not.toBe(before);

    // O chip é um token do comando, não uma segunda representação dele.
    const recipe = presetRecipe(DEFAULT_PRESET, { ...SAMPLE_PROJECT });
    recipe.features.easterEggs = true;
    const flags = toFlags(recipe, DEFAULT_PRESET);
    expect(flags.length).toBeGreaterThan(0);
    for (const flag of flags) expect(after).toContain(flag);

    const chip = screen.getByRole('button', {
      name: new RegExp(`${ptBR.configurator.removeFlag} ${escapeRe(flags[0] as string)}`),
    });
    await user.click(chip);
    expect(commandText()).toBe(before);
  });

  it('trocar de preset descarta os toggles mas nunca o nome', async () => {
    const { user } = setup();
    const name = screen.getByLabelText(ptBR.configurator.nameLabel);

    await user.clear(name);
    await user.type(name, 'Loja');
    await user.click(
      screen.getByRole('radio', { name: new RegExp(ptBR.configurator.presets.minimal.label) }),
    );

    expect(name).toHaveValue('Loja');
    expect(commandText()).toContain('--preset=minimal');
  });

  /**
   * Bloquear o toggle esconderia a dependência: a pessoa clica, nada acontece, e conclui
   * que a página está quebrada. A regra aparece como texto, e o conserto como botão.
   */
  it('mostra a incoerência e oferece o conserto em vez de bloquear', async () => {
    const { user } = setup();

    await user.click(
      screen.getByRole('switch', {
        name: new RegExp(ptBR.configurator.features.multiTenant.label),
      }),
    );

    const issues = await screen.findByText(ptBR.configurator.issuesTitle);
    const panel = issues.parentElement as HTMLElement;
    const fix = within(panel).getAllByRole('button')[0] as HTMLElement;

    const before = commandText();
    await user.click(fix);
    // O botão tem que mexer na receita. Um conserto que não muda o comando é um conserto
    // que não aconteceu — e foi para isso que ele apareceu na tela.
    expect(commandText()).not.toBe(before);
  });

  it('recusa desligar uma feature que o CLI não deixa desligar', async () => {
    const { user } = setup();
    const audit = screen.getByRole('switch', {
      name: new RegExp(ptBR.configurator.features.audit.label),
    });

    expect(audit).toHaveAttribute('aria-disabled', 'true');
    expect(audit).toHaveAttribute('aria-checked', 'true');

    await user.click(audit);
    expect(audit).toHaveAttribute('aria-checked', 'true');
  });

  it('escreve a configuração na URL e no localStorage', async () => {
    const { user } = setup();

    await user.click(
      screen.getByRole('switch', { name: new RegExp(ptBR.configurator.features.easterEggs.label) }),
    );

    expect(window.location.search).toContain('yes=easter-eggs');
    expect(window.localStorage.getItem('dontpanic.recipe.v1')).toContain('yes=easter-eggs');
  });

  /**
   * Aba privada faz o próprio acessor `localStorage` lançar — não só o `getItem`. Uma
   * exceção aqui derrubaria a hidratação do configurador inteiro.
   */
  it('funciona quando o localStorage lança', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const { user } = setup();
    await user.click(
      screen.getByRole('switch', { name: new RegExp(ptBR.configurator.features.easterEggs.label) }),
    );

    expect(commandText()).toContain('npx create-dontpanic');
    expect(spy).toHaveBeenCalled();
  });

  /**
   * O botão precisa anunciar o resultado, e não só mudar de rótulo: mudança de nome de
   * elemento focado não é anunciada de forma confiável entre leitores de tela.
   *
   * A área de transferência aqui é a que o `userEvent.setup()` instala — não um mock
   * próprio, que ele sobrescreveria de qualquer forma.
   */
  it('copia o comando e anuncia o resultado', async () => {
    const { user } = setup();
    const expected = commandText();

    await user.click(screen.getByRole('button', { name: ptBR.configurator.copy }));

    expect(await navigator.clipboard.readText()).toBe(expected);
    const announcement = await screen.findByText(ptBR.configurator.copied, {
      selector: '[aria-live] , [aria-live] *',
    });
    expect(announcement).toBeInTheDocument();
  });
});

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
