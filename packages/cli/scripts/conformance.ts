#!/usr/bin/env node
/**
 * O portão de conformidade.
 *
 * O rename atravessa ~490 ocorrências do nome em 199 arquivos, em nove variantes que
 * incluem o SQL que cria uma role do Postgres. Revisão humana não dá conta, e o modo
 * como cada variante falha é silencioso: um escopo pnpm renomeado pela metade faz
 * `pnpm --filter` casar nada e sair com código 0; uma role renomeada pela metade faz o
 * RLS devolver zero linhas em vez de erro.
 *
 * Este script é a garantia mecânica: gera um projeto por preset, prova que o nome antigo
 * não sobrou em lugar nenhum, e só então prova que o projeto instala, compila e passa.
 *
 * Roda no CI (.github/workflows/conformance.yml) e localmente com `pnpm conformance`.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { pathExists } from '../src/util/fs.ts';
import { slugify } from '../src/naming.ts';
import { verifyRename } from '../src/rename.ts';

const exec = promisify(execFile);

// ─────────────────────────────────────────────────────────────────────────────
// Configuração
// ─────────────────────────────────────────────────────────────────────────────

const CLI_ROOT = resolve(import.meta.dirname, '..');
const REPO_ROOT = resolve(CLI_ROOT, '../..');

/**
 * Os casos que o CI roda inteiros.
 *
 * A matriz é linear no número de features, não exponencial: os 4 presets, mais os dois
 * extremos, mais cada feature desligada isoladamente sobre o preset `saas`. Ver
 * docs/decisions/0003 — combinações fora daqui são permitidas e declaradamente não
 * testadas.
 */
interface ConformanceCase {
  id: string;
  /** Nome passado ao CLI. */
  projectName: string;
  flags: string[];
  /** Rodar a suíte e2e (exige Postgres). Caro: só nos casos que mexem com RLS. */
  e2e: boolean;
}

const CASES: ConformanceCase[] = [
  // Os presets, com nomes que também exercitam a derivação.
  { id: 'preset-minimal', projectName: 'acme', flags: ['--preset=minimal'], e2e: true },
  { id: 'preset-saas', projectName: 'acme-corp', flags: ['--preset=saas'], e2e: true },
  { id: 'preset-complete', projectName: 'Acme Corp', flags: ['--preset=complete'], e2e: true },
  { id: 'preset-internal', projectName: 'ferramenta-interna', flags: ['--preset=internal'], e2e: true },

  // Um nome com acento e um com camelCase: os dois caminhos de `slugify` que já
  // quebraram uma vez durante o desenvolvimento.
  { id: 'nome-acentuado', projectName: 'Ação Rápida', flags: ['--preset=saas'], e2e: false },
  { id: 'nome-camelcase', projectName: 'MinhaLoja', flags: ['--preset=saas'], e2e: false },

  // Os extremos.
  { id: 'tudo-ligado', projectName: 'tudo', flags: ['--preset=complete'], e2e: true },
  { id: 'tudo-desligado', projectName: 'nada', flags: ['--preset=minimal', '--no-i18n'], e2e: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Verificações
// ─────────────────────────────────────────────────────────────────────────────

interface Violation {
  case: string;
  kind: 'nome-remanescente' | 'artefato-ausente' | 'comando-falhou' | 'lista-divergente';
  detail: string;
}

/**
 * Verifica que não sobrou nome antigo — delegando ao `verifyRename` do próprio gerador.
 *
 * Este script tinha uma lista própria de padrões proibidos e uma varredura própria. Era
 * errado: duas definições de "sobrou o nome antigo" divergem, e a divergência aparece
 * como falso positivo no CI (o `verifyRename` aceita uma ocorrência declarada, o portão
 * reprova) ou como falso negativo (o portão desconhece uma das cinco formas de
 * apóstrofo que o motor conhece). A autoridade é uma só.
 *
 * O que o portão acrescenta é o que o `verifyRename` não faz: provar que a build produziu
 * artefato, e que as listas duplicadas continuam em sincronia.
 */
async function checkNoOldName(
  caseId: string,
  dir: string,
  keepEasterEggs: boolean,
): Promise<Violation[]> {
  const verification = await verifyRename(dir, { keepEasterEggs });

  return verification.blocking.map((o) => ({
    case: caseId,
    kind: 'nome-remanescente' as const,
    detail: `${o.file}:${o.line} — "${o.match}": ${o.context.slice(0, 120)}`,
  }));
}

/**
 * Prova que a build realmente produziu os artefatos.
 *
 * Esta checagem existe por causa de uma armadilha específica: `pnpm --filter @x/shared
 * build` com um filtro que não casa nada **sai com código 0**. Um escopo renomeado pela
 * metade não falha a build — ela simplesmente não roda, e o erro aparece três passos
 * depois, num import que não resolve. Conferir exit code não detecta; conferir o
 * artefato detecta.
 */
async function checkBuildArtifacts(caseId: string, dir: string): Promise<Violation[]> {
  const required = [
    'packages/shared/dist/index.js',
    'apps/api/dist/main.js',
    'apps/api/dist/worker.js',
  ];

  const violations: Violation[] = [];
  for (const rel of required) {
    if (!(await pathExists(join(dir, rel)))) {
      violations.push({
        case: caseId,
        kind: 'artefato-ausente',
        detail:
          `${rel} não foi produzido. Se a build saiu com código 0, provavelmente um ` +
          `\`pnpm --filter\` não casou nada — filtro renomeado pela metade não falha.`,
      });
    }
  }
  return violations;
}

/**
 * Confere que a lista de slugs reservados do gerador continua igual à do boilerplate.
 *
 * O gerador tem uma cópia de `RESERVED_TENANT_SLUGS` (ver o comentário em naming.ts).
 * Cópia é aceitável; cópia que envelhece em silêncio não é — o sintoma seria um projeto
 * gerado cujo `db:seed` falha no último passo do setup.
 */
async function checkReservedSlugsInSync(dir: string): Promise<Violation[]> {
  const tenantFile = join(dir, 'packages/shared/src/tenant.ts');
  if (!(await pathExists(tenantFile))) return [];

  const source = await readFile(tenantFile, 'utf8');
  const match = source.match(/RESERVED_TENANT_SLUGS\s*=\s*\[([\s\S]*?)\]/);
  if (!match?.[1]) {
    return [
      {
        case: 'lista-reservada',
        kind: 'lista-divergente',
        detail: 'Não consegui localizar RESERVED_TENANT_SLUGS no projeto gerado.',
      },
    ];
  }

  const fromProject = new Set(
    [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((s): s is string => Boolean(s)),
  );

  const ours = await readFile(join(CLI_ROOT, 'src/naming.ts'), 'utf8');
  const oursMatch = ours.match(/RESERVED_TENANT_SLUGS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  const fromCli = new Set(
    [...(oursMatch?.[1] ?? '').matchAll(/'([^']+)'/g)]
      .map((m) => m[1])
      .filter((s): s is string => Boolean(s)),
  );

  const missing = [...fromProject].filter((s) => !fromCli.has(s));
  const extra = [...fromCli].filter((s) => !fromProject.has(s));

  if (missing.length === 0 && extra.length === 0) return [];

  return [
    {
      case: 'lista-reservada',
      kind: 'lista-divergente',
      detail:
        `RESERVED_TENANT_SLUGS divergiu do boilerplate. ` +
        `Faltando no gerador: [${missing.join(', ')}]. Sobrando: [${extra.join(', ')}].`,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Execução de um caso
// ─────────────────────────────────────────────────────────────────────────────

interface RunOptions {
  /** Rodar install/build/test — caro. Desligado, só valida a geração e o rename. */
  deep: boolean;
  /** Rodar a suíte e2e. Exige Postgres acessível. */
  e2e: boolean;
}

async function runCase(c: ConformanceCase, opts: RunOptions): Promise<Violation[]> {
  const workdir = await mkdtemp(join(tmpdir(), `dp-conformance-${c.id}-`));
  // O CLI deriva o diretório do slug quando não recebe um caminho, então é `slugify`
  // que diz onde o projeto vai aparecer — e é de propósito que este script não passe
  // um caminho: quem tem de estar certo é o caminho que o USUÁRIO obtém.
  const target = join(workdir, slugify(c.projectName));
  const violations: Violation[] = [];

  const log = (msg: string) => console.log(`  [${c.id}] ${msg}`);

  try {
    log('gerando...');
    // Chama o CLI pela interface pública, não pela API interna: é o que o usuário
    // executa, e é isso que precisa estar certo.
    await exec(
      'node',
      [
        join(CLI_ROOT, 'dist/index.js'),
        c.projectName,
        ...c.flags,
        '--no-install',
        '--no-git',
        '--yes',
      ],
      { cwd: workdir, timeout: 300_000 },
    ).catch((err: unknown) => {
      violations.push({
        case: c.id,
        kind: 'comando-falhou',
        detail: `geração falhou: ${errorText(err)}`,
      });
      throw err;
    });

    log('verificando que o nome antigo não sobrou...');
    // Os easter eggs mudam o que conta como sobra: ligados, "Don't Panic" fica de
    // propósito. O preset `complete` é o único da matriz que os liga.
    const keepEasterEggs = c.flags.includes('--preset=complete');
    violations.push(...(await checkNoOldName(c.id, target, keepEasterEggs)));
    violations.push(...(await checkReservedSlugsInSync(target)));

    if (!opts.deep) return violations;

    log('pnpm install...');
    await run('pnpm', ['install', '--no-frozen-lockfile'], target, c, violations, 900_000);

    log('build...');
    await run('pnpm', ['build'], target, c, violations, 900_000);
    violations.push(...(await checkBuildArtifacts(c.id, target)));

    log('typecheck...');
    await run('pnpm', ['typecheck'], target, c, violations, 600_000);

    log('lint...');
    await run('pnpm', ['lint'], target, c, violations, 600_000);

    log('test...');
    await run('pnpm', ['test'], target, c, violations, 900_000);

    if (opts.e2e && c.e2e) {
      log('test:e2e...');
      await run('pnpm', ['test:e2e'], target, c, violations, 1_800_000);
    }

    return violations;
  } catch {
    return violations;
  } finally {
    // Preserva o diretório quando houve violação: sem os arquivos, uma falha de
    // conformidade no CI é indepurável.
    if (violations.length > 0) {
      console.log(`  [${c.id}] preservado para inspeção: ${target}`);
    } else {
      await rm(workdir, { recursive: true, force: true });
    }
  }
}

async function run(
  cmd: string,
  args: string[],
  cwd: string,
  c: ConformanceCase,
  violations: Violation[],
  timeout: number,
): Promise<void> {
  try {
    await exec(cmd, args, { cwd, timeout, maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    violations.push({
      case: c.id,
      kind: 'comando-falhou',
      detail: `\`${cmd} ${args.join(' ')}\` falhou: ${errorText(err)}`,
    });
  }
}

function errorText(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    // `String(err)` num objeto sem `toString` próprio rende "[object Object]" — e é
    // exatamente no caso sem stderr/stdout/message que a mensagem precisaria ajudar.
    const text = e.stderr || e.stdout || e.message || JSON.stringify(err);
    // As últimas linhas são onde está a causa; o começo é ruído de progresso.
    return text.split('\n').slice(-25).join('\n');
  }
  return String(err);
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrypoint
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const only = argv.find((a) => a.startsWith('--case='))?.slice('--case='.length);
  const deep = !argv.includes('--shallow');
  const e2e = argv.includes('--e2e');

  const cases = only ? CASES.filter((c) => c.id === only) : CASES;
  if (cases.length === 0) {
    console.error(`Nenhum caso com id "${only}". Disponíveis: ${CASES.map((c) => c.id).join(', ')}`);
    process.exit(2);
  }

  if (!(await pathExists(join(CLI_ROOT, 'dist/index.js')))) {
    console.error('dist/index.js não existe. Rode `pnpm --filter create-dontpanic build` antes.');
    process.exit(2);
  }
  if (!(await pathExists(join(CLI_ROOT, 'template')))) {
    console.error('template/ não existe. Rode `pnpm sync-template` antes.');
    process.exit(2);
  }

  console.log(
    `Conformidade: ${cases.length} caso(s), modo ${deep ? 'profundo' : 'raso'}${e2e ? ' + e2e' : ''}\n`,
  );

  const all: Violation[] = [];
  for (const c of cases) {
    const found = await runCase(c, { deep, e2e });
    all.push(...found);
    console.log(found.length === 0 ? `  [${c.id}] ok\n` : `  [${c.id}] ${found.length} violação(ões)\n`);
  }

  // Relatório em arquivo além do stdout: o log do CI é truncado e a violação
  // interessante costuma ser a que ficou de fora.
  const reportPath = join(REPO_ROOT, '.conformance/report.json');
  await writeFile(reportPath, JSON.stringify({ cases: cases.map((c) => c.id), violations: all }, null, 2)).catch(
    () => {},
  );

  if (all.length === 0) {
    console.log('Conformidade: tudo passou.');
    return;
  }

  console.error(`\nConformidade FALHOU com ${all.length} violação(ões):\n`);
  for (const v of all) {
    console.error(`  [${v.case}] ${v.kind}: ${v.detail}`);
  }
  process.exit(1);
}

await main();
