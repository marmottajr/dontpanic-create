import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const BIN = fileURLToPath(new URL('../src/index.ts', import.meta.url));

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
  /** As duas saídas juntas, para asserção de mensagem sem se importar com o canal. */
  all: string;
}

/**
 * Roda o bin de verdade, em subprocesso.
 *
 * Em processo seria mais rápido, mas trocar `process.stdout.write` briga com o reporter do
 * `node:test`, que escreve no mesmo descritor. O subprocesso também exercita o `index.ts`
 * — o tratamento de erro não capturado e o exit code, que são justamente o que o shell do
 * CLI promete — e garante `isTTY === false`, que é o caminho de CI.
 */
function runCli(args: string[], cwd = process.cwd()): Promise<CliRun> {
  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      ['--experimental-strip-types', BIN, ...args],
      { cwd, env: { ...process.env, NO_COLOR: '1' } },
      (error, stdout, stderr) => {
        const code =
          error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
        resolvePromise({ code, stdout, stderr, all: `${stdout}${stderr}` });
      },
    );
  });
}

/** Diretório temporário fora de qualquer repositório git, para os testes de destino. */
function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'dpc-cli-'));
}

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('cli — telas que não geram nada', () => {
  it('--help sai com 0 e documenta presets, features e opções', async () => {
    const result = await runCli(['--help']);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Uso/);
    assert.match(result.stdout, /--preset=saas/);
    assert.match(result.stdout, /--no-2fa|--2fa/);
    assert.match(result.stdout, /--dry-run/);
  });

  it('--version imprime só a versão', async () => {
    const result = await runCli(['--version']);
    assert.equal(result.code, 0);
    assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
  });
});

describe('cli — erros de entrada', () => {
  it('flag desconhecida falha e sugere a próxima', async () => {
    // O ponto todo: um `--no-2af` aceito em silêncio geraria o projeto COM 2FA.
    const result = await runCli(['acme', '--no-2af']);
    assert.equal(result.code, 1);
    assert.match(result.all, /Flag desconhecida/);
    assert.match(result.all, /--no-2fa/);
  });

  it('sem argumento nenhum e sem TTY, recusa em vez de abrir um prompt que ninguém responde', async () => {
    const result = await runCli([]);
    assert.equal(result.code, 1);
    assert.match(result.all, /terminal interativo/);
  });

  it('--yes sem nome falha dizendo o que fazer', async () => {
    const result = await runCli(['--yes']);
    assert.equal(result.code, 1);
    assert.match(result.all, /nome do projeto/);
  });

  it('slug ilegal falha antes de tocar o disco', async () => {
    const result = await runCli(['acme', '--slug=user', '--yes', '--dry-run']);
    assert.equal(result.code, 1);
    assert.match(result.all, /reservada do SQL/);
  });

  it('recusa desligar a auditoria', async () => {
    const result = await runCli(['acme', '--no-audit', '--yes']);
    assert.equal(result.code, 1);
    assert.match(result.all, /não é removível/);
  });

  it('recusa o painel da plataforma sem o que ele exige', async () => {
    // Aresta hard: sem convites o `POST /platform/tenants` não tem como entregar a empresa.
    const result = await runCli(['acme', '--preset=minimal', '--multi-tenant', '--platform', '--yes']);
    assert.equal(result.code, 1);
    assert.match(result.all, /--invitations/);
  });
});

describe('cli — destino', () => {
  it('gera (dry-run) num caminho novo e imprime os próximos passos', async () => {
    const base = tempDir();
    const result = await runCli([join(base, 'acme'), '--yes', '--dry-run']);
    assert.equal(result.code, 0);
    assert.match(result.all, /dry-run/);
    assert.match(result.all, /acme/);
  });

  it('recusa diretório não vazio sem --force', async () => {
    const base = tempDir();
    const target = join(base, 'acme');
    mkdirSync(target);
    writeFileSync(join(target, 'README.md'), '# já existe\n');

    const result = await runCli([target, '--yes', '--dry-run']);
    assert.equal(result.code, 1);
    assert.match(result.all, /não está vazio/);
    assert.match(result.all, /--force/);
  });

  it('aceita diretório não vazio com --force', async () => {
    const base = tempDir();
    const target = join(base, 'acme');
    mkdirSync(target);
    writeFileSync(join(target, 'README.md'), '# já existe\n');

    const result = await runCli([target, '--yes', '--dry-run', '--force']);
    assert.equal(result.code, 0);
  });

  it('ignora .DS_Store ao decidir se o diretório está vazio', async () => {
    // Qualquer pasta que alguém abriu no Finder tem um. Recusar por causa dele é recusar
    // por nada, e o usuário não tem como adivinhar o motivo.
    const base = tempDir();
    const target = join(base, 'acme');
    mkdirSync(target);
    writeFileSync(join(target, '.DS_Store'), '');

    const result = await runCli([target, '--yes', '--dry-run']);
    assert.equal(result.code, 0);
  });

  it('sem terminal interativo e sem --yes, recusa em vez de travar', async () => {
    // O caso de CI: um prompt aqui deixaria o job pendurado até o timeout.
    const base = tempDir();
    const result = await runCli([join(base, 'acme'), '--dry-run']);
    assert.equal(result.code, 1);
    assert.match(result.all, /--yes/);
  });
});

describe('cli — repositório git envolvente', () => {
  it('avisa e exige confirmação quando o destino cai dentro de um repo', async (t) => {
    if (!hasGit) {
      t.skip('git não disponível');
      return;
    }
    const base = tempDir();
    execFileSync('git', ['init', '-q', base]);

    const blocked = await runCli([join(base, 'acme'), '--dry-run']);
    assert.equal(blocked.code, 1);
    assert.match(blocked.all, /dentro do repositório git/);

    // Com --yes a confirmação está dada: o aviso continua, a geração segue.
    const allowed = await runCli([join(base, 'acme'), '--dry-run', '--yes']);
    assert.equal(allowed.code, 0);
    assert.match(allowed.all, /dentro do repositório git/);
  });
});

describe('cli — resumo', () => {
  it('mostra as formas derivadas do nome e a linha que reproduz a receita', async () => {
    const base = tempDir();
    const result = await runCli([join(base, 'acme-corp'), '--name=Acme Corp', '--yes', '--dry-run']);
    assert.equal(result.code, 0);
    // As formas derivadas são a surpresa mais cara do gerador: banco, role e escopo npm.
    assert.match(result.all, /acme_corp_app/);
    assert.match(result.all, /@acme-corp\/shared/);
    assert.match(result.all, /admin@acme-corp\.dev/);
    assert.match(result.all, /npx create-dontpanic/);
  });

  it('avisa sobre a fila em memória e sobre o seed ser a única porta no preset mínimo', async () => {
    const base = tempDir();
    const result = await runCli([join(base, 'acme'), '--preset=minimal', '--yes', '--dry-run']);
    assert.equal(result.code, 0);
    assert.match(result.all, /db:seed/);
    assert.match(result.all, /QUEUE_DRIVER=bullmq/);
  });
});
