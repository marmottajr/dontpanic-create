/**
 * Inicialização do repositório do projeto gerado.
 *
 * O ponto sensível: o gerador pode estar rodando **dentro** de um repositório existente
 * (alguém que digitou `npx @dontpanic/create servico` dentro do próprio monorepo). Um
 * `git init` ali cria um repo aninhado, que o git de fora vê como um diretório comum e
 * comita junto, arrastando o projeto inteiro para o histórico errado. Detectar isso e
 * perguntar é obrigação, não cortesia.
 */

import { CommandFailedError, CommandNotFoundError, hasCommand, run } from './exec.ts';

export interface GitInitResult {
  initialized: boolean;
  committed: boolean;
  /** Por que não fez, quando não fez. */
  skippedReason?: string;
}

/**
 * Descobre se `dir` está dentro da árvore de trabalho de algum repositório.
 *
 * Usa `rev-parse --show-toplevel` em vez de procurar `.git` subindo os diretórios à mão,
 * porque o git tem casos que a busca ingênua erra: worktrees (onde `.git` é arquivo, não
 * diretório), submódulos, e `GIT_DIR` no ambiente.
 */
export async function findEnclosingRepo(dir: string): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      timeout: 15_000,
    });
    const top = stdout.trim();
    return top.length > 0 ? top : null;
  } catch {
    // Fora de repo, git indisponível ou diretório inacessível: em todos os casos não há
    // repo envolvente a respeitar.
    return null;
  }
}

/**
 * `git init` + commit inicial no projeto gerado.
 *
 * O commit inicial existe para dar um ponto de retorno antes de o usuário começar a
 * mexer: o gerador escreveu centenas de arquivos, e sem commit não há como ver o que foi
 * dele e o que foi seu.
 */
export async function initRepo(
  dir: string,
  projectName: string,
): Promise<GitInitResult> {
  if (!(await hasCommand('git', dir))) {
    return {
      initialized: false,
      committed: false,
      skippedReason: 'git não está instalado ou não está no PATH.',
    };
  }

  try {
    // `-b main` explícito: sem isso o nome do branch depende da config global do
    // usuário, e um projeto gerado em `master` enquanto o CI espera `main` falha no
    // primeiro push por um motivo que ninguém procura no gerador.
    await run('git', ['init', '-b', 'main'], { cwd: dir, timeout: 30_000 });
    await run('git', ['add', '-A'], { cwd: dir, timeout: 120_000 });

    try {
      await run(
        'git',
        [
          // `-c` em vez de `config`: se o usuário não tem `user.name`/`user.email`
          // globais, o commit falha. Passar no comando resolve sem escrever nada na
          // configuração dele — mexer na config global de alguém por causa de um
          // scaffold seria invasivo.
          '-c',
          'user.name=create-dontpanic',
          '-c',
          'user.email=noreply@localhost',
          'commit',
          '-m',
          `chore: inicializa ${projectName} a partir do DontPanic`,
          '--no-verify',
        ],
        { cwd: dir, timeout: 120_000 },
      );
      return { initialized: true, committed: true };
    } catch (err) {
      // O repo foi criado; só o commit falhou. Isso é recuperável pelo usuário e não
      // justifica abortar uma geração que já terminou.
      return {
        initialized: true,
        committed: false,
        skippedReason:
          err instanceof CommandFailedError
            ? `o commit inicial falhou: ${err.tail}`
            : 'o commit inicial falhou.',
      };
    }
  } catch (err) {
    if (err instanceof CommandNotFoundError) {
      return { initialized: false, committed: false, skippedReason: 'git não encontrado.' };
    }
    return {
      initialized: false,
      committed: false,
      skippedReason:
        err instanceof CommandFailedError ? `git init falhou: ${err.tail}` : 'git init falhou.',
    };
  }
}
