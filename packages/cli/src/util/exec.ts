/**
 * Execução de processos externos.
 *
 * O gerador chama `git` e `pnpm` no projeto recém-criado. Duas coisas aqui não são
 * detalhe: nunca passar comando por shell (o nome do projeto vem do usuário e acaba em
 * argumento), e distinguir "o comando não existe" de "o comando falhou" — porque a
 * primeira tem conserto que o usuário pode aplicar e merece mensagem própria.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface RunOptions {
  cwd: string;
  /** Milissegundos. Um `pnpm install` de monorepo passa de um minuto com folga. */
  timeout?: number;
  env?: Record<string, string | undefined>;
  /** Repassar stdout/stderr ao terminal do usuário enquanto roda. */
  inherit?: boolean;
}

/**
 * Lançado quando o executável não está no PATH.
 *
 * As classes deste arquivo declaram os campos e atribuem no corpo em vez de usar
 * parameter properties (`constructor(public readonly x)`). Não é preferência de estilo:
 * o modo `--experimental-strip-types` do Node só REMOVE anotações, e parameter property
 * exigiria gerar código de atribuição. Os testes rodam por ali, então a forma curta
 * quebraria a suíte inteira com um erro de sintaxe.
 */
export class CommandNotFoundError extends Error {
  readonly command: string;

  constructor(command: string) {
    super(`Comando não encontrado: ${command}`);
    this.name = 'CommandNotFoundError';
    this.command = command;
  }
}

/** Lançado quando o comando rodou e falhou. */
export class CommandFailedError extends Error {
  readonly command: string;
  readonly args: string[];
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;

  constructor(command: string, args: string[], code: number, stdout: string, stderr: string) {
    super(`\`${command} ${args.join(' ')}\` falhou com código ${code}`);
    this.name = 'CommandFailedError';
    this.command = command;
    this.args = args;
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }

  /**
   * As últimas linhas da saída, que é onde a causa costuma estar.
   *
   * Um `pnpm install` que falha emite centenas de linhas de progresso antes do erro;
   * mostrar tudo enterra a informação que importa.
   */
  get tail(): string {
    const text = this.stderr.trim() || this.stdout.trim();
    return text.split('\n').slice(-20).join('\n');
  }
}

/**
 * Roda um comando.
 *
 * Usa `execFile`, nunca `exec`: o segundo passa a linha por um shell, e o nome do
 * projeto — que veio do usuário — chega até aqui dentro de argumentos. Com shell, um
 * nome contendo `;` ou backtick executaria outra coisa.
 */
export async function run(
  command: string,
  args: string[],
  options: RunOptions,
): Promise<RunResult> {
  const { cwd, timeout = 600_000, env, inherit = false } = options;

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout,
      // 64 MiB: a saída de um install de monorepo estoura o default de 1 MiB, e o
      // sintoma é um ENOBUFS que não parece relacionado com o que aconteceu.
      maxBuffer: 64 * 1024 * 1024,
      ...(env ? { env: { ...process.env, ...env } } : {}),
      ...(inherit ? { stdio: 'inherit' as const } : {}),
    });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: unknown };

    if (e.code === 'ENOENT') throw new CommandNotFoundError(command);

    throw new CommandFailedError(
      command,
      args,
      typeof e.code === 'number' ? e.code : 1,
      e.stdout ?? '',
      e.stderr ?? '',
    );
  }
}

/** Verifica se um executável existe, sem falhar. */
export async function hasCommand(command: string, cwd: string): Promise<boolean> {
  try {
    // `--version` é o teste mais portável; `which` não existe no Windows.
    await run(command, ['--version'], { cwd, timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}
