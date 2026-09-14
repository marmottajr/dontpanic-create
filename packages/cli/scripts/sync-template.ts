/**
 * Materializa `packages/cli/template/` a partir do repo do boilerplate.
 *
 * O template não é versionado neste repo (ver `.gitignore`): a fonte da verdade é uma
 * **tag** do `marmottajr/dontpanic`, declarada em `packages/cli/template.json`. Este
 * script é a ponte entre as duas coisas, e tem três responsabilidades que não são
 * cosméticas:
 *
 * **1. Recusar working tree sujo.** Um template tirado de um repo com alterações não
 * commitadas é irreprodutível por definição: ninguém — nem o autor, dois dias depois —
 * consegue reconstruir o mesmo tarball, e o `template.json` estaria afirmando um commit
 * que não descreve o que foi empacotado. Como o pacote publicado no npm carrega o
 * template dentro, o erro viaja para todo usuário e só aparece como "o projeto gerado
 * tem um arquivo que o boilerplate não tem".
 *
 * **2. Renomear os dotfiles que o npm mangleia.** O npm nunca entrega um `.gitignore`
 * nem um `.npmrc` dentro de um tarball, e as duas exclusões são inegociáveis (não há
 * flag). Sem o `.gitignore`, o projeto gerado commita `node_modules` e o `.env` no
 * primeiro commit. Sem o `.npmrc` (`auto-install-peers=true`,
 * `strict-peer-dependencies=false`), o `pnpm install` do projeto gerado pode falhar em
 * peers. Então viajam dot-less e o scaffold os restaura — mesma estratégia do
 * `build-template.mjs` do `create-dontpanic`, mantida compatível de propósito para que
 * os dois instaladores possam coexistir durante a transição.
 *
 * **3. Aplicar os patches que são propriedade do TEMPLATE, não da receita.** Ver
 * `TEMPLATE_PATCHES`: são dois problemas do boilerplate que só existem porque ele virou
 * template, e por isso se consertam aqui e uma vez, em vez de em cada geração.
 */

import { gzipSync } from 'node:zlib';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { cp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  NEVER_TRAVERSE,
  isNeverCopied,
  isUnderAnyRelPath,
  listFiles,
  pathExists,
} from '../src/util/fs.ts';
import { CommandFailedError, run } from '../src/util/exec.ts';

const CLI_ROOT = resolve(import.meta.dirname, '..');
const TEMPLATE_DIR = join(CLI_ROOT, 'template');
const TEMPLATE_JSON = join(CLI_ROOT, 'template.json');

// ─────────────────────────────────────────────────────────────────────────────
// O que não viaja
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subárvores excluídas por caminho relativo.
 *
 * Por caminho e não por nome: `packages/create-dontpanic` é o instalador anterior, com
 * um `template/` dentro que é uma cópia integral do próprio repo (2,4 MB). Copiá-lo
 * dobraria o tarball e faria o motor de rename trabalhar em centenas de ocorrências
 * fantasma. Mas excluir pelo NOME `template` deixaria de fora qualquer diretório
 * legítimo chamado `template` no boilerplate — e isso em silêncio, que é a classe de
 * erro pior.
 */
export const EXCLUDED_REL_PATHS = [
  // O instalador anterior, inteiro. Ele não faz parte do produto gerado.
  'packages/create-dontpanic',
  // Gerado pelo husky no `prepare`; recriado no `pnpm install` do projeto gerado.
  '.husky/_',
  // Configuração da MÁQUINA de quem sincronizou: lista servidores MCP locais. Não é
  // segredo, mas não tem por que viajar num pacote público.
  '.claude/settings.local.json',
  // Artefato do processo do boilerplate, não do produto gerado.
  'PENDENCIAS.template.md',
  // Publica o INSTALADOR no npm. Num projeto gerado, roda e falha (não existe pacote).
  '.github/workflows/publish-create-dontpanic.yml',
] as const;

/**
 * Changesets pendentes.
 *
 * `.changeset/config.json` e `.changeset/README.md` viajam (o projeto gerado herda o
 * fluxo de versionamento); os `.md` de changeset pendente, não — descrevem mudanças do
 * BOILERPLATE ("feat: convites e login social"), e no primeiro `changeset version` do
 * projeto gerado virariam o changelog dele, contando uma história que não é a sua.
 */
function isPendingChangeset(rel: string): boolean {
  return (
    rel.startsWith('.changeset/') &&
    rel.endsWith('.md') &&
    rel !== '.changeset/README.md'
  );
}

/** Dotfiles que o npm mangleia → viajam dot-less, o scaffold restaura. */
export const DOTFILE_RENAMES: Record<string, string> = {
  '.gitignore': 'gitignore',
  '.npmrc': 'npmrc',
};

// ─────────────────────────────────────────────────────────────────────────────
// Patches de template
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplatePatch {
  /** Onde aplica — testado contra o caminho relativo (`/` como separador). */
  matches: (rel: string) => boolean;
  find: RegExp;
  replace: string;
  /** Aparece no resumo e é a documentação de por que o patch existe. */
  reason: string;
}

/**
 * Os dois consertos que pertencem ao template.
 *
 * O critério para estar aqui, e não na geração: o problema existe por uma propriedade
 * do TEMPLATE (não tem lockfile; é a base de uma subtração), é igual em toda receita, e
 * consertá-lo por receita significaria consertá-lo N vezes e errar em uma.
 */
export const TEMPLATE_PATCHES: TemplatePatch[] = [
  // ── 0. O template não pode falar do instalador que não vai junto ───────────
  //
  // `packages/create-dontpanic/` é o instalador anterior, e ele NÃO é copiado para o
  // projeto gerado (não é produto do usuário). Mas o boilerplate o documenta em seis
  // lugares do README, num comentário do `release.yml` e num glob do `.vscode`. Sem
  // estes patches, o projeto gerado abre o README mandando rodar `npx create-dontpanic`
  // e apontando para um diretório que não existe ali — a primeira coisa que o usuário lê
  // é uma instrução falsa sobre o próprio repositório.
  {
    matches: (rel) => rel === 'README.md',
    // O bloco inteiro: o comando de instalação e o parágrafo que explica o gerador.
    // Quem está lendo o README DENTRO de um projeto gerado já passou por essa etapa.
    find: /```bash\nnpx create-dontpanic@latest meu-app\n```\n\nUma linha e uma cópia nova se desdobra no disco[^]*?tudo abaixo é para quando você já está _dentro_ de um projeto\.\n\n---\n\n/,
    replace: '',
    reason: 'README abria mandando rodar o instalador — quem lê isto já rodou',
  },
  {
    matches: (rel) => rel === 'README.md',
    find: /, `packages\/create-dontpanic`/g,
    replace: '',
    reason: 'README listava o instalador entre os workspaces do projeto (PT e EN)',
  },
  {
    matches: (rel) => rel === 'README.md',
    find: /^ {2}create-dontpanic\/ +(o gerador `npx create-dontpanic`|the `npx create-dontpanic` generator)\n/gm,
    replace: '',
    reason: 'árvore de diretórios do README citava o instalador (PT e EN)',
  },
  {
    matches: (rel) => rel === '.github/workflows/release.yml',
    find: /in publish-create-dontpanic\.yml when a `v\*` tag is pushed\./,
    replace: 'in a publish workflow when a `v*` tag is pushed.',
    reason: 'comentário apontava para um workflow que não é copiado',
  },
  {
    matches: (rel) => rel === '.vscode/settings.json',
    find: /^ *"packages\/create-dontpanic\/template": true,\n/m,
    replace: '',
    reason: 'glob de arquivos ocultos apontava para diretório inexistente',
  },

  // ── 0a. A atribuição tem que dizer ORIGEM, não "o repositório" ─────────────
  //
  // O README fecha com "o repositório vive em github.com/marmottajr/dontpanic". Num
  // projeto derivado essa frase é simplesmente falsa: afirma que o repositório DAQUELE
  // produto é o nosso. A atribuição é bem-vinda — a licença é MIT e dar crédito é
  // correto —, mas ela precisa se ler como procedência, não como endereço do projeto.
  //
  // É por isso que `verifyRename` aceita o nome antigo nestas duas linhas: elas são a
  // única menção que sobrevive de propósito, e sobrevive dizendo a coisa certa.
  {
    matches: (rel) => rel === 'README.md',
    find: /o\nrepositório vive em\n\*\*\[github\.com\/marmottajr\/dontpanic\]\(https:\/\/github\.com\/marmottajr\/dontpanic\)\*\*\./,
    replace:
      'este projeto foi\ngerado a partir do **[DontPanic](https://github.com/marmottajr/dontpanic)**.',
    reason: 'atribuição dizia "o repositório vive em" — falso num projeto derivado (PT)',
  },
  {
    matches: (rel) => rel === 'README.md',
    find: /the\nrepository is at \*\*\[github\.com\/marmottajr\/dontpanic\]\(https:\/\/github\.com\/marmottajr\/dontpanic\)\*\*\./,
    replace:
      'this project was\ngenerated from **[DontPanic](https://github.com/marmottajr/dontpanic)**.',
    reason: 'atribuição dizia "the repository is at" — falso num projeto derivado (EN)',
  },

  // ── 0b. Os links de contato apontam para o repositório de ORIGEM ───────────
  //
  // `ISSUE_TEMPLATE/config.yml` manda "reportar vulnerabilidade" e "fazer perguntas"
  // para os advisories e as discussions de `marmottajr/dontpanic`. Num projeto derivado
  // isso é pior que um link quebrado: encaminha o relatório de segurança do produto do
  // usuário para a caixa de outra pessoa, e quem clica acredita ter reportado.
  //
  // O arquivo fica (a estrutura é útil), sem os links: o usuário preenche com os dele.
  {
    matches: (rel) => rel === '.github/ISSUE_TEMPLATE/config.yml',
    find: /^blank_issues_enabled: false\ncontact_links:[^]*$/,
    replace: `blank_issues_enabled: false
# Preencha com os canais DESTE projeto antes de abrir o repositório. Os links do
# boilerplate foram removidos de propósito: apontavam para os advisories e as
# discussions do repositório de origem, e um relatório de segurança enviado para lá
# não chega a quem mantém este produto.
#
# contact_links:
#   - name: Report a security vulnerability
#     url: https://github.com/SEU-USUARIO/SEU-REPO/security/advisories/new
#     about: Please report security issues privately, not as public issues.
`,
    reason: 'links de contato mandavam relatório de segurança para o repo de origem',
  },

  {
    // ── 1. `--frozen-lockfile` num template que não tem lockfile ──────────────
    //
    // O template nasce sem `pnpm-lock.yaml`, e isso é deliberado: integridades travadas
    // na máquina de quem sincronizou divergem do que o registry serve numa máquina nova
    // (`ERR_PNPM_TARBALL_INTEGRITY`), e create-next-app/create-vite também não enviam
    // lockfile. Mas o boilerplate usa `pnpm install --frozen-lockfile` em 4 workflows e
    // em 2 Dockerfiles — então o `create-dontpanic` v0.3.0 publicado hoje gera um
    // projeto cujo CI e cujo `Dockerfile.api` quebram no PRIMEIRO push, com
    // `ERR_PNPM_NO_LOCKFILE`, num arquivo que o usuário nunca tocou.
    //
    // Das três saídas possíveis — enviar o lockfile, gerar o lockfile no scaffold, ou
    // emitir o CI sem o flag — esta é a única que vale para os três cenários de uso ao
    // mesmo tempo:
    //
    //   · enviar o lockfile: +200 KB e reintroduz o ERR_PNPM_TARBALL_INTEGRITY que o
    //     `build-template.mjs` documentou ter encontrado;
    //   · gerar no scaffold: só funciona quando o usuário aceita `pnpm install` — com
    //     `--no-install`, ou sem rede, o projeto sai com CI quebrado do mesmo jeito.
    //
    // Trocar por `--no-frozen-lockfile` custa a garantia de build reproduzível NO
    // PRIMEIRO CI, e recupera-a assim que o usuário commita o lockfile que o próprio
    // `pnpm install` dele gerou — momento em que ele pode reverter o flag. É esse
    // trade-off, explicado no README do projeto gerado, contra "o CI vem vermelho de
    // fábrica".
    matches: (rel) =>
      rel.endsWith('.yml') || rel.endsWith('.yaml') || rel.split('/').pop()!.startsWith('Dockerfile'),
    find: /--frozen-lockfile/g,
    replace: '--no-frozen-lockfile',
    reason:
      'template nasce sem lockfile; --frozen-lockfile faria o primeiro CI e o docker ' +
      'build do projeto gerado falharem com ERR_PNPM_NO_LOCKFILE',
  },
  {
    // ── 2. `coverageThreshold.functions: 100`, sem folga nenhuma ──────────────
    //
    // A API atinge 99,2/94,8/**100**/99,2 e exige 97/92/**100**/97. Funções tem margem
    // ZERO. Como o gerador SUBTRAI, qualquer receita menor que a completa tem chance de
    // deixar uma função sem cobertura — remove-se o spec de OAuth e fica um helper que
    // só aquele spec exercitava — e aí o `pnpm test` do projeto gerado falha na primeira
    // execução, num gate que o usuário não escreveu, num número que ele não escolheu.
    //
    // Rejeitado: recalcular o threshold rodando a suíte na geração. Exigiria
    // `pnpm install` + uma execução completa de Jest por projeto gerado (minutos), e
    // fixaria o gate no "alcançado hoje", o que é pior que um piso: qualquer regressão
    // posterior do usuário passaria a ser o novo normal.
    //
    // Escolhido: baixar o piso para um valor ainda exigente no TEMPLATE. Não enfraquece
    // o gate do boilerplate (o repo dele tem o seu próprio CI, com os números
    // originais); enfraquece o gate do projeto gerado em alguns pontos, que é o preço de
    // um gate que não dispara por causa de uma feature ausente. Um piso de 90 continua
    // pegando "alguém apagou os testes".
    //
    // `functions: \d+` e não o literal `100`. O boilerplate v0.4.0 baixou o próprio piso
    // para 98, e o padrão literal parou de casar — em silêncio, porque `applyTemplatePatches`
    // só reporta o que mudou. Os projetos gerados passaram a nascer com 97/92/98/97, e as
    // receitas menores falhavam o `pnpm test` no gate de cobertura. O que este patch
    // corrige é o piso da API como um todo, qualquer que seja o número de funções do dia.
    matches: (rel) => rel === 'apps/api/jest.config.js',
    find: /statements: 97,\s*\n(\s*)branches: 92,\s*\n\s*functions: \d+,\s*\n\s*lines: 97,/,
    replace:
      'statements: 90,\n$1branches: 85,\n$1// 90 e não 100: este projeto foi gerado por subtração, e um piso sem\n$1// folga nenhuma dispara por causa de uma feature ausente, não de um teste\n$1// que falta. Suba-o de volta quando a sua suíte estabilizar.\n$1functions: 90,\n$1lines: 90,',
    reason: 'coverageThreshold.functions: 100 não tem folga e quebra em qualquer subtração',
  },
  {
    // Mesmo problema, menor: o web exige 99 de statements/lines contra 99,5/99,7
    // alcançados — 0,5 e 0,7 ponto de margem.
    matches: (rel) => rel === 'apps/web/vitest.config.mts',
    find: /statements: 99,\s*\n(\s*)branches: 88,\s*\n\s*functions: 95,\s*\n\s*lines: 99,/,
    replace: 'statements: 90,\n$1branches: 80,\n$1functions: 85,\n$1lines: 90,',
    reason: 'thresholds do web com 0,5 ponto de margem quebram em qualquer subtração',
  },
  {
    // ── 3. Ignores que apontam para o instalador que não veio ─────────────────
    // `.gitignore` e `.prettierignore` do boilerplate ignoram
    // `packages/create-dontpanic/template/`. No projeto gerado esse caminho não existe,
    // e a linha fica como pista falsa para quem for procurar de onde o projeto veio.
    //
    // Sai a linha do caminho E o comentário que a explica, que nos dois arquivos está
    // logo acima. Apagar só o caminho deixava um `# create-dontpanic: generated
    // template` órfão — pior que a linha original, porque descreve uma regra que já não
    // existe. Num arquivo de ignore, toda linha que menciona o instalador é sobre ele.
    matches: (rel) => rel === '.gitignore' || rel === '.prettierignore',
    find: /^.*create-dontpanic.*\n/gm,
    replace: '',
    reason: 'ignore apontando para o instalador, que não faz parte do projeto gerado',
  },
];

/** Aplica os patches de template a um arquivo de texto. */
export function applyTemplatePatches(
  rel: string,
  content: string,
): { content: string; applied: string[] } {
  let out = content;
  const applied: string[] = [];

  for (const patch of TEMPLATE_PATCHES) {
    if (!patch.matches(rel)) continue;
    const next = out.replace(patch.find, patch.replace);
    if (next !== out) {
      out = next;
      applied.push(patch.reason);
    }
  }

  return { content: out, applied };
}

/** Extensões tratadas como texto para fins de patch. Fora disso, cópia byte a byte. */
const PATCHABLE = /\.(ya?ml|js|mjs|cjs|ts|mts|json|md)$|(^|\/)Dockerfile[^/]*$|(^|\/)\.?gitignore$|(^|\/)\.?prettierignore$/;

// ─────────────────────────────────────────────────────────────────────────────
// Verificações no repo de origem
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Falha se o working tree não estiver limpo.
 *
 * `--porcelain` inclui arquivos não rastreados de propósito: um arquivo novo ainda não
 * commitado entra no template do mesmo jeito que um modificado, e é ainda mais difícil
 * de reconstruir depois — não está em commit nenhum.
 */
export async function assertCleanRepo(dir: string): Promise<void> {
  let stdout: string;
  try {
    ({ stdout } = await run('git', ['status', '--porcelain'], { cwd: dir, timeout: 60_000 }));
  } catch (err) {
    if (err instanceof CommandFailedError) {
      throw new Error(
        `\`git status\` falhou em ${dir}.\n` +
          'O template só pode sair de um repositório git: é dele que vem o commit que o ' +
          `template.json declara.\n${err.tail}`,
      );
    }
    throw err;
  }

  const dirty = stdout.split('\n').filter((line) => line.trim() !== '');
  if (dirty.length === 0) return;

  throw new Error(
    `O repo de origem está sujo (${dirty.length} arquivo(s)):\n` +
      `${dirty.slice(0, 20).join('\n')}${dirty.length > 20 ? `\n… e mais ${dirty.length - 20}` : ''}\n\n` +
      'Um template tirado de um working tree sujo é irreprodutível: o template.json ' +
      'declararia um commit que não descreve o que foi empacotado, e como o template vai ' +
      'DENTRO do pacote publicado, o erro chega a todo usuário. Commite, faça stash, ou ' +
      'sincronize de um clone limpo da tag.',
  );
}

/** Resolve uma ref (tag, branch, sha) no commit correspondente. */
export async function resolveCommit(dir: string, ref: string): Promise<string> {
  const { stdout } = await run('git', ['rev-parse', `${ref}^{commit}`], {
    cwd: dir,
    timeout: 60_000,
  });
  return stdout.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Cópia
// ─────────────────────────────────────────────────────────────────────────────

interface CopyStats {
  files: number;
  bytes: number;
  patched: { rel: string; reasons: string[] }[];
  renamedDotfiles: string[];
  skipped: number;
}

async function copyTree(sourceDir: string, destDir: string): Promise<CopyStats> {
  const stats: CopyStats = {
    files: 0,
    bytes: 0,
    patched: [],
    renamedDotfiles: [],
    skipped: 0,
  };

  async function recurse(rel: string): Promise<void> {
    const absSource = rel === '' ? sourceDir : join(sourceDir, rel);
    const entries = await readdir(absSource, { withFileTypes: true });

    for (const entry of entries) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;

      if (entry.isSymbolicLink()) {
        // Link para fora da árvore é rota de escape, e link para dentro seria
        // reconstruído errado depois do rename de caminhos. O boilerplate não tem
        // nenhum; se passar a ter, é melhor perceber pela ausência do que copiar um
        // alvo inesperado.
        stats.skipped += 1;
        continue;
      }

      if (isUnderAnyRelPath(childRel, EXCLUDED_REL_PATHS) || isPendingChangeset(childRel)) {
        stats.skipped += 1;
        continue;
      }

      if (entry.isDirectory()) {
        if (NEVER_TRAVERSE.has(entry.name)) {
          stats.skipped += 1;
          continue;
        }
        await mkdir(join(destDir, childRel), { recursive: true });
        await recurse(childRel);
        continue;
      }

      if (isNeverCopied(entry.name)) {
        stats.skipped += 1;
        continue;
      }

      const renamed = DOTFILE_RENAMES[entry.name];
      const destRel = renamed
        ? childRel.slice(0, childRel.length - entry.name.length) + renamed
        : childRel;
      if (renamed) stats.renamedDotfiles.push(`${childRel} → ${destRel}`);

      const absDest = join(destDir, destRel);
      await mkdir(join(absDest, '..'), { recursive: true });

      if (PATCHABLE.test(childRel)) {
        const original = await readFile(join(absSource, entry.name), 'utf8');
        const { content, applied } = applyTemplatePatches(childRel, original);
        if (applied.length > 0) stats.patched.push({ rel: childRel, reasons: applied });
        await writeFile(absDest, content, 'utf8');
        stats.bytes += Buffer.byteLength(content);
      } else {
        await cp(join(absSource, entry.name), absDest);
        stats.bytes += (await stat(absDest)).size;
      }

      stats.files += 1;
    }
  }

  await mkdir(destDir, { recursive: true });
  await recurse('');
  return stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tamanho do tarball
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tamanho do `.tar.gz` do template.
 *
 * É o número que decide se o template pode viajar dentro do pacote npm (a alternativa
 * seria baixar um tarball do GitHub em runtime, com rede no caminho crítico da
 * geração). Medido, não estimado: gzip de arquivos de texto tem taxa muito diferente da
 * de binário, e o template é quase todo texto.
 */
async function measureTarball(dir: string): Promise<number | null> {
  const scratch = await mkdtemp(join(tmpdir(), 'dp-template-'));
  const tarPath = join(scratch, 'template.tar');
  try {
    await run('tar', ['-cf', tarPath, '-C', dir, '.'], { cwd: scratch, timeout: 120_000 });
    const tar = await readFile(tarPath);
    return gzipSync(tar, { level: 9 }).length;
  } catch {
    return null;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Orquestração
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateDeclaration {
  repo: string;
  url: string;
  tag: string;
  commit: string;
  syncedAt: string | null;
  stats: { files: number; bytes: number; tarballGzipBytes: number };
}

export interface SyncOptions {
  /** Repo local de origem. Sem ele, clona a tag declarada. */
  from?: string;
  /** Ref a usar; default: a `tag` do template.json. */
  ref?: string;
  /** Reescreve o template.json com a tag/commit/estatísticas usados. */
  write?: boolean;
  /** Escape hatch para desenvolvimento — nunca no CI. */
  allowDirty?: boolean;
  quiet?: boolean;
}

export interface SyncSummary {
  sourceDir: string;
  ref: string;
  commit: string;
  files: number;
  bytes: number;
  tarballGzipBytes: number | null;
  patched: { rel: string; reasons: string[] }[];
  renamedDotfiles: string[];
  skipped: number;
  warnings: string[];
}

export async function readDeclaration(): Promise<TemplateDeclaration> {
  return JSON.parse(await readFile(TEMPLATE_JSON, 'utf8')) as TemplateDeclaration;
}

export async function syncTemplate(options: SyncOptions = {}): Promise<SyncSummary> {
  const declaration = await readDeclaration();
  const ref = options.ref ?? declaration.tag;
  const warnings: string[] = [];

  let sourceDir: string;
  let ephemeral: string | null = null;

  if (options.from) {
    sourceDir = resolve(options.from);
    if (!(await pathExists(sourceDir))) {
      throw new Error(`Repo de origem não encontrado: ${sourceDir}`);
    }
  } else {
    // Clone raso da tag. Um clone novo é limpo por definição, o que satisfaz a
    // verificação de repo sujo sem exceção — e é o modo que o CI deve usar, porque não
    // depende de nenhum checkout na máquina.
    ephemeral = await mkdtemp(join(tmpdir(), 'dontpanic-src-'));
    sourceDir = join(ephemeral, 'dontpanic');
    await run(
      'git',
      ['clone', '--depth', '1', '--branch', ref, declaration.url, sourceDir],
      { cwd: ephemeral, timeout: 600_000 },
    );
  }

  try {
    if (options.allowDirty) {
      warnings.push(
        '--allow-dirty: o template saiu de um working tree possivelmente sujo. Este ' +
          'template NÃO é reprodutível e não pode ser publicado.',
      );
    } else {
      await assertCleanRepo(sourceDir);
    }

    const commit = await resolveCommit(sourceDir, ref);
    const head = await resolveCommit(sourceDir, 'HEAD');

    if (head !== commit) {
      throw new Error(
        `O working tree de ${sourceDir} está em ${head.slice(0, 12)}, mas a ref pedida ` +
          `(${ref}) resolve para ${commit.slice(0, 12)}.\n` +
          'Copiar o working tree e declarar a tag seriam duas coisas diferentes. Faça ' +
          `\`git checkout ${ref}\` no repo de origem, ou rode sem --from para clonar a tag.`,
      );
    }

    if (!options.write && declaration.commit !== commit) {
      warnings.push(
        `template.json declara ${declaration.commit.slice(0, 12)} (${declaration.tag}) e o ` +
          `template foi tirado de ${commit.slice(0, 12)} (${ref}). Rode com --write para ` +
          'atualizar a declaração.',
      );
    }

    // Idempotência por construção: o destino é apagado antes de cada sync, então duas
    // execuções seguidas produzem árvores idênticas byte a byte. Atualizar no lugar
    // deixaria para trás arquivos que a versão nova do boilerplate não tem mais — e um
    // arquivo órfão no template é um arquivo órfão em todo projeto gerado.
    await rm(TEMPLATE_DIR, { recursive: true, force: true });
    const stats = await copyTree(sourceDir, TEMPLATE_DIR);

    // Conferência dos dois dotfiles: se o boilerplate perder o `.npmrc`, o projeto
    // gerado passa a falhar em peers e ninguém liga uma coisa à outra.
    for (const [dotted, plain] of Object.entries(DOTFILE_RENAMES)) {
      if (!(await pathExists(join(TEMPLATE_DIR, plain)))) {
        warnings.push(
          `${dotted} não veio do boilerplate. O scaffold não terá o que restaurar — ` +
            (dotted === '.gitignore'
              ? 'o projeto gerado commitaria node_modules e o .env.'
              : 'o pnpm install do projeto gerado pode falhar em peer dependencies.'),
        );
      }
    }

    if (stats.patched.length === 0) {
      warnings.push(
        'Nenhum patch de template casou. Ou o boilerplate consertou os dois problemas ' +
          '(ótimo: apague os patches), ou os padrões apodreceram (ruim: o projeto gerado ' +
          'volta a sair com CI vermelho). Verifique TEMPLATE_PATCHES.',
      );
    }

    // O CLAUDE.md do boilerplate afirma que `minimumReleaseAge` protege o install, e o
    // `pnpm-workspace.yaml` só tem `minimumReleaseAgeExclude` — a lista de exceções sem
    // a política, que é inerte. Não ligamos a política aqui de propósito: com pins
    // exatos, `minimumReleaseAge` pode não achar versão elegível e falhar o install. Mas
    // a documentação herdada fica errada, e alguém tem de decidir qual dos dois lados
    // corrigir.
    const workspace = join(TEMPLATE_DIR, 'pnpm-workspace.yaml');
    if (await pathExists(workspace)) {
      const yaml = await readFile(workspace, 'utf8');
      if (yaml.includes('minimumReleaseAgeExclude') && !/^minimumReleaseAge:/m.test(yaml)) {
        warnings.push(
          'pnpm-workspace.yaml tem minimumReleaseAgeExclude sem minimumReleaseAge: a ' +
            'política não existe, só a lista de exceções. O CLAUDE.md do boilerplate diz ' +
            'que ela protege o install — a poda de docs precisa corrigir essa frase.',
        );
      }
    }

    const tarballGzipBytes = await measureTarball(TEMPLATE_DIR);

    if (options.write) {
      const next: TemplateDeclaration = {
        ...declaration,
        tag: ref,
        commit,
        syncedAt: new Date().toISOString(),
        stats: {
          files: stats.files,
          bytes: stats.bytes,
          tarballGzipBytes: tarballGzipBytes ?? 0,
        },
      };
      await writeFile(TEMPLATE_JSON, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    }

    return {
      sourceDir,
      ref,
      commit,
      files: stats.files,
      bytes: stats.bytes,
      tarballGzipBytes,
      patched: stats.patched,
      renamedDotfiles: stats.renamedDotfiles,
      skipped: stats.skipped,
      warnings,
    };
  } finally {
    if (ephemeral) await rm(ephemeral, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** Conta arquivos e bytes do template já materializado — usado no resumo e nos testes. */
export async function measureTemplate(dir: string): Promise<{ files: number; bytes: number }> {
  const entries = await listFiles(dir);
  let bytes = 0;
  for (const entry of entries) bytes += (await stat(entry.path)).size;
  return { files: entries.length, bytes };
}

function parseArgv(argv: string[]): SyncOptions {
  const options: SyncOptions = {};
  for (const arg of argv) {
    if (arg.startsWith('--from=')) options.from = arg.slice('--from='.length);
    else if (arg.startsWith('--tag=')) options.ref = arg.slice('--tag='.length);
    else if (arg === '--write') options.write = true;
    else if (arg === '--allow-dirty') options.allowDirty = true;
    else if (arg === '--quiet') options.quiet = true;
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgv(process.argv.slice(2));

  // Sem `--from`, tenta o irmão `../dontpanic` antes de clonar: é onde ele está na
  // máquina de quem desenvolve o gerador, e clonar 500 MB para sincronizar um template
  // que já está no disco seria desperdício com espera.
  if (!options.from) {
    const sibling = resolve(CLI_ROOT, '../../../dontpanic');
    if (await pathExists(join(sibling, '.git'))) options.from = sibling;
  }

  const summary = await syncTemplate(options);

  if (options.quiet) return;

  console.log('');
  console.log(`  template sincronizado de ${summary.sourceDir}`);
  console.log(`  ref ${summary.ref} @ ${summary.commit.slice(0, 12)}`);
  console.log('');
  console.log(`  arquivos      ${summary.files}`);
  console.log(`  bytes         ${formatBytes(summary.bytes)}`);
  console.log(
    `  tarball .gz   ${summary.tarballGzipBytes === null ? '(tar indisponível)' : formatBytes(summary.tarballGzipBytes)}`,
  );
  console.log(`  ignorados     ${summary.skipped}`);
  console.log('');

  if (summary.renamedDotfiles.length > 0) {
    console.log('  dotfiles renomeados (o npm não entrega os originais num tarball):');
    for (const line of summary.renamedDotfiles) console.log(`    · ${line}`);
    console.log('');
  }

  if (summary.patched.length > 0) {
    console.log('  patches de template aplicados:');
    for (const { rel, reasons } of summary.patched) {
      for (const reason of reasons) console.log(`    · ${rel}: ${reason}`);
    }
    console.log('');
  }

  for (const warning of summary.warnings) console.warn(`  ⚠️  ${warning}\n`);
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(`\n  ✖ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
