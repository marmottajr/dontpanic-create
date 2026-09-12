#!/usr/bin/env node
/**
 * Entrypoint do bin.
 *
 * Só três responsabilidades: chamar o CLI, traduzir exceção em mensagem limpa e sair com o
 * código certo. Stack trace só com `--debug` — para quem digitou um nome de projeto errado,
 * trinta linhas de `node:internal/...` não são informação, são ruído que esconde a linha
 * que importava.
 */

import { cli } from './cli.ts';

const argv = process.argv.slice(2);
// Lido do argv cru porque o erro pode acontecer antes (ou dentro) do parse.
const debug = argv.includes('--debug');

try {
  process.exitCode = await cli(argv);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\n✖ ${message}\n`);
  if (debug && error instanceof Error && error.stack !== undefined) {
    process.stderr.write(`${error.stack}\n`);
  } else {
    process.stderr.write('  Rode de novo com --debug para ver o stack trace.\n');
  }
  process.exitCode = 1;
}
