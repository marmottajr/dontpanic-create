/**
 * Utilidades de sistema de arquivos compartilhadas pelo gerador.
 *
 * Existe para que o motor de rename, o copiador de template e o aplicador de costuras
 * concordem sobre duas perguntas onde divergir causaria corrupção silenciosa:
 * "isto é binário?" e "o que eu nunca devo atravessar?".
 */

import { createReadStream } from 'node:fs';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, opendir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// O que nunca se atravessa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Diretórios que o gerador não percorre, em nenhuma hipótese.
 *
 * `node_modules` é óbvio. `.git` é crítico por um motivo menos óbvio: um rename que
 * entrasse nos objetos do git corromperia o histórico de forma irreparável, e o dano
 * só apareceria num `git fsck` muito depois.
 */
export const NEVER_TRAVERSE = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'build',
  'out',
  'coverage',
  '.nyc_output',
  'storybook-static',
  '.pnpm-store',
  '.vercel',
  '.cache',
  '__snapshots__',
]);

/**
 * Arquivos que o rename nunca reescreve mesmo sendo texto.
 *
 * Lockfile é o caso perigoso: ele contém o nome dos pacotes do workspace, então um
 * rename "bem-sucedido" produz um lockfile que descreve pacotes que não existem, e o
 * `pnpm install --frozen-lockfile` do CI do projeto gerado falha com uma mensagem que
 * não aponta para a causa. O projeto gerado nasce sem lockfile, de propósito.
 */
export const NEVER_REWRITE = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  '.DS_Store',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Acréscimos do motor de rename / do copiador de template
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nomes que nunca são COPIADOS do template para o projeto gerado.
 *
 * Não é a mesma lista de `NEVER_REWRITE`, e a diferença é o ponto: um lockfile que o
 * rename se recusa a reescrever mas que é copiado é pior que nenhum lockfile — ele
 * descreve `@dontpanic/shared` num projeto onde esse pacote não existe mais, e o
 * `pnpm install --frozen-lockfile` do CI do gerado falha apontando para integridade,
 * não para o nome. O projeto nasce sem lockfile e o primeiro `pnpm install` o escreve.
 *
 * `.env` é o outro caso crítico: é o `.env` REAL da máquina de quem sincronizou o
 * template, com segredos de dev dentro. O gerado recebe um `.env` novo, com segredos
 * novos (passo de env, outro módulo).
 */
export const NEVER_COPY_NAMES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  '.DS_Store',
  '.env',
  '.env.local',
  'Thumbs.db',
]);

/** Sufixos que nunca são copiados (cache de build e log que escapou do `.gitignore`). */
export const NEVER_COPY_SUFFIXES = ['.tsbuildinfo', '.log'];

/**
 * Subárvores (caminho RELATIVO à raiz, separador `/`) que nem o copiador nem o rename
 * atravessam.
 *
 * Por caminho relativo e não por nome: `packages/create-dontpanic/template/` é uma
 * cópia integral do próprio repositório, gitignorada e regenerada por
 * `build-template.mjs` — varrê-la faz o rename trabalhar em 373 ocorrências fantasma e
 * contamina a verificação final (o mapa mediu 506 linhas com a exclusão contra 879 sem
 * ela). Mas excluir pelo NOME `template` seria amplo demais: qualquer diretório
 * legítimo chamado `template` no repo base cairia fora do rename em silêncio, que é a
 * classe de erro que este módulo existe para evitar.
 */
export const NEVER_TRAVERSE_REL_PATHS = [
  'packages/create-dontpanic/template',
  'packages/create-dontpanic',
  '.husky/_',
  '.claude/settings.local.json',
];

/** `true` se `rel` é, ou está dentro de, um dos caminhos dados. */
export function isUnderAnyRelPath(rel: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`));
}

/** `true` se o basename cai em `NEVER_COPY_NAMES` ou num sufixo proibido. */
export function isNeverCopied(name: string): boolean {
  if (NEVER_COPY_NAMES.has(name)) return true;
  return NEVER_COPY_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * Extensões tratadas como binárias sem olhar o conteúdo.
 *
 * A sniffagem por byte NUL resolve o resto; esta lista é atalho para os casos comuns e
 * seguro para arquivos pequenos que poderiam passar pela heurística (um PNG de 1x1 cabe
 * em menos que a janela de sniff e pode não ter NUL).
 */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp', '.tiff',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.zip', '.gz', '.tgz', '.tar', '.br', '.7z', '.rar',
  '.mp3', '.mp4', '.webm', '.ogg', '.wav', '.mov', '.avi',
  '.node', '.wasm', '.so', '.dylib', '.dll', '.exe', '.bin',
  '.jks', '.keystore', '.p12', '.pfx',
]);

/** Janela de sniff. 8 KiB é o suficiente para achar um NUL em qualquer formato real. */
const SNIFF_BYTES = 8192;

// ─────────────────────────────────────────────────────────────────────────────
// Classificação
// ─────────────────────────────────────────────────────────────────────────────

export function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf(sep) + 1);
  const dot = base.lastIndexOf('.');
  // Um nome como `.env` é extensão nenhuma, e não a extensão ".env".
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

export function hasBinaryExtension(path: string): boolean {
  return BINARY_EXTENSIONS.has(extensionOf(path));
}

/**
 * Decide se um arquivo é binário.
 *
 * A regra é a do git: se há um byte NUL na janela inicial, é binário. Erra para o lado
 * de "binário" em caso de dúvida, porque o dano assimétrico está do outro lado —
 * reescrever um binário o corrompe, enquanto deixar de reescrever um texto exótico só
 * deixa uma ocorrência do nome antigo, que o teste de conformidade pega e reporta.
 */
export async function isBinaryFile(path: string): Promise<boolean> {
  if (hasBinaryExtension(path)) return true;

  const handle = createReadStream(path, { start: 0, end: SNIFF_BYTES - 1 });
  try {
    for await (const chunk of handle) {
      if ((chunk as Buffer).includes(0)) return true;
    }
    return false;
  } finally {
    handle.destroy();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Travessia
// ─────────────────────────────────────────────────────────────────────────────

export interface WalkEntry {
  /** Caminho absoluto. */
  path: string;
  /** Caminho relativo à raiz da travessia, sempre com `/` como separador. */
  rel: string;
  isDirectory: boolean;
}

export interface WalkOptions {
  /** Diretórios a não atravessar, além de `NEVER_TRAVERSE`. Casa por NOME, em qualquer nível. */
  skipDirs?: Set<string>;
  /**
   * Subárvores a não atravessar, por caminho RELATIVO à raiz (separador `/`).
   *
   * Existe porque `skipDirs` casa por nome e por isso é cego a contexto: excluir
   * `packages/create-dontpanic/template` sem excluir todo diretório chamado `template`
   * só é expressável assim. Aplica-se a arquivos também, não só a diretórios.
   */
  skipRelPaths?: readonly string[];
  /** Emitir também as entradas de diretório. Default: false. */
  includeDirs?: boolean;
  /** Seguir links simbólicos. Default: false — um link para fora da árvore é rota de escape. */
  followSymlinks?: boolean;
}

/**
 * Percorre uma árvore de diretórios, em profundidade.
 *
 * Não segue symlink por padrão: o template vem de um repo real, e um link apontando
 * para fora da árvore faria o rename escrever em lugar nenhum previsível — ou, num
 * template adulterado, fora do diretório de destino.
 */
export async function* walk(root: string, options: WalkOptions = {}): AsyncGenerator<WalkEntry> {
  const { skipDirs, skipRelPaths, includeDirs = false, followSymlinks = false } = options;
  const absRoot = resolve(root);

  async function* recurse(dir: string): AsyncGenerator<WalkEntry> {
    const handle = await opendir(dir);
    for await (const dirent of handle) {
      const abs = join(dir, dirent.name);
      const rel = relative(absRoot, abs).split(sep).join('/');

      if (skipRelPaths && isUnderAnyRelPath(rel, skipRelPaths)) continue;

      let isDirectory = dirent.isDirectory();
      if (dirent.isSymbolicLink()) {
        if (!followSymlinks) continue;
        isDirectory = (await stat(abs).catch(() => null))?.isDirectory() ?? false;
      }

      if (isDirectory) {
        if (NEVER_TRAVERSE.has(dirent.name)) continue;
        if (skipDirs?.has(dirent.name)) continue;
        if (includeDirs) yield { path: abs, rel, isDirectory: true };
        yield* recurse(abs);
      } else {
        yield { path: abs, rel, isDirectory: false };
      }
    }
  }

  yield* recurse(absRoot);
}

/** Coleta a travessia numa lista. Conveniência para quando a ordem importa. */
export async function listFiles(root: string, options: WalkOptions = {}): Promise<WalkEntry[]> {
  const out: WalkEntry[] = [];
  for await (const entry of walk(root, options)) out.push(entry);
  // Ordem estável: dois runs do gerador produzem o mesmo relatório, o que é o que
  // permite comparar execuções no CI de conformidade.
  out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura e escrita
// ─────────────────────────────────────────────────────────────────────────────

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isDirEmpty(path: string): Promise<boolean> {
  try {
    const handle = await opendir(path);
    try {
      const first = await handle.read();
      return first === null;
    } finally {
      await handle.close().catch(() => {});
    }
  } catch {
    // Não existe conta como vazio: o gerador vai criá-lo.
    return true;
  }
}

export async function readText(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

/** Escreve criando os diretórios intermediários. */
export async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

/** Move criando os diretórios intermediários do destino. */
export async function movePath(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
}

// ─────────────────────────────────────────────────────────────────────────────
// Contenção de caminho
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Garante que `candidate` está dentro de `root`.
 *
 * Todo caminho que o gerador apaga ou reescreve vem de um manifesto ou de um glob, e um
 * `..` num manifesto — ou um glob resolvido contra a raiz errada — significa apagar
 * arquivo do usuário fora do diretório de destino. Isto é chamado antes de toda escrita
 * e de toda remoção, e lança em vez de avisar.
 */
export function assertWithin(root: string, candidate: string): string {
  const absRoot = resolve(root);
  const abs = resolve(root, candidate);
  const rel = relative(absRoot, abs);
  if (rel.startsWith('..') || resolve(absRoot, rel) !== abs) {
    throw new Error(
      `Caminho fora do diretório do projeto: ${candidate}\n` +
        `Isto é bug no manifesto do gerador, não erro seu. Reporte com a receita usada.`,
    );
  }
  return abs;
}
