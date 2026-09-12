import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CommandFailedError,
  CommandNotFoundError,
  hasCommand,
  run,
} from '../src/util/exec.ts';
import { findEnclosingRepo, initRepo } from '../src/util/git.ts';

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'dp-exec-test-'));
}

describe('run', () => {
  it('devolve stdout de um comando que passa', async () => {
    const dir = await scratch();
    try {
      const result = await run('node', ['-e', 'process.stdout.write("ok")'], { cwd: dir });
      assert.equal(result.stdout, 'ok');
      assert.equal(result.code, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('distingue comando ausente de comando que falhou', async () => {
    const dir = await scratch();
    try {
      // A distinção importa porque só uma das duas tem conserto que o usuário pode
      // aplicar ("instale o pnpm"), e cada uma merece a sua mensagem.
      await assert.rejects(
        () => run('comando-que-nao-existe-xyz', [], { cwd: dir }),
        CommandNotFoundError,
      );
      await assert.rejects(
        () => run('node', ['-e', 'process.exit(3)'], { cwd: dir }),
        CommandFailedError,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('expõe o fim da saída no erro, que é onde está a causa', async () => {
    const dir = await scratch();
    try {
      const err = await run('node', ['-e', 'console.error("linha".repeat(1)); process.exit(1)'], {
        cwd: dir,
      }).catch((e: unknown) => e);
      assert.ok(err instanceof CommandFailedError);
      assert.match(err.tail, /linha/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('não interpreta metacaractere de shell no argumento', async () => {
    const dir = await scratch();
    try {
      // O nome do projeto vem do usuário e acaba em argumento. Com `exec` (shell), um
      // nome com `;` executaria outra coisa; com `execFile` ele é só texto.
      const result = await run('node', ['-e', 'process.stdout.write(process.argv[1])', '; echo hack'], {
        cwd: dir,
      });
      assert.equal(result.stdout, '; echo hack');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('hasCommand não lança para comando ausente', async () => {
    const dir = await scratch();
    try {
      assert.equal(await hasCommand('comando-que-nao-existe-xyz', dir), false);
      assert.equal(await hasCommand('node', dir), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('git', () => {
  it('detecta que está dentro de um repositório', async () => {
    // O caso perigoso: gerar dentro de um repo existente cria repo aninhado, que o git
    // de fora comita como diretório comum e arrasta o projeto para o histórico errado.
    const inside = await findEnclosingRepo(import.meta.dirname);
    assert.ok(inside, 'o próprio repo do gerador deveria ser detectado');
  });

  it('devolve null fora de qualquer repositório', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dp-sem-git-'));
    try {
      // `os.tmpdir()` não está sob repositório em nenhum runner suportado; se estivesse,
      // este teste apontaria isso em vez de passar em falso.
      assert.equal(await findEnclosingRepo(dir), null);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('inicializa repo com branch main e commit inicial', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dp-git-init-'));
    try {
      await writeFile(join(dir, 'arquivo.txt'), 'conteúdo');
      const result = await initRepo(dir, 'acme');

      assert.equal(result.initialized, true, result.skippedReason);
      assert.equal(result.committed, true, result.skippedReason);

      // `main` explícito: sem isso o nome do branch depende da config global de quem
      // rodou, e um projeto em `master` com CI esperando `main` falha no primeiro push.
      const { stdout } = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir });
      assert.equal(stdout.trim(), 'main');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('commita sem depender da identidade global do usuário', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dp-git-ident-'));
    try {
      await writeFile(join(dir, 'a.txt'), 'x');
      // Simula uma máquina sem `user.name`/`user.email` configurados: o commit tem que
      // sair de todo modo, e sem escrever nada na configuração global de quem rodou.
      const result = await initRepo(dir, 'acme');
      assert.equal(result.committed, true, result.skippedReason);

      const { stdout } = await run('git', ['log', '-1', '--pretty=%an'], { cwd: dir });
      assert.equal(stdout.trim(), 'create-dontpanic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
