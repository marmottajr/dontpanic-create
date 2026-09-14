/**
 * Assets embarcados no pacote do gerador — hoje, as variantes que `swapVariant` troca por
 * um arquivo inteiro do template.
 *
 * Não moram em `template/` de propósito. O template é o boilerplate REAL, materializado
 * por `pnpm sync-template` a partir de uma tag e apagado a cada sincronização; um arquivo
 * do gerador posto lá dentro sumiria na próxima subida de tag, ou — pior — viajaria para
 * todo projeto gerado, inclusive os que têm a feature ligada. `assets/` é do gerador, é
 * versionado neste repo, e só entra no projeto quando uma costura pede.
 *
 * Por isso `assets` precisa estar no `files` do `package.json`: sem ele o `npm publish`
 * deixa o diretório de fora, a leitura aqui devolve `undefined`, e a costura `required`
 * que pediu a variante para a geração de quem instalou do npm — mesmo com tudo verde no
 * clone deste repo, onde o diretório existe.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertWithin, pathExists, readText } from './util/fs.ts';

export const ASSETS_DIR_NAME = 'assets';

/**
 * A raiz do pacote: o primeiro diretório, subindo a partir deste arquivo, que tem
 * `package.json` E `assets/`.
 *
 * Subir, e não um `..` fixo, pelo mesmo motivo de `resolveTemplateDir`: o código roda de
 * `src/` (testes, com strip-types) e de `dist/` (o pacote publicado). E aqui não se usa o
 * `DONTPANIC_CREATE_TEMPLATE_DIR`: aquele escape troca a árvore do TEMPLATE, e as
 * variantes são do gerador — elas não mudam quando a conformidade aponta para outra árvore.
 */
async function resolvePackageRoot(): Promise<string | undefined> {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 8; hop += 1) {
    if ((await pathExists(join(dir, 'package.json'))) && (await pathExists(join(dir, ASSETS_DIR_NAME)))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Lê um asset pelo nome declarado no manifesto (`assets/variants/…`).
 *
 * Devolve `undefined` quando o asset não existe — não lança. Quem decide se isso é fatal
 * é o `required` da costura, que tem o `reason` para pôr na mensagem. Nome fora de
 * `assets/` é erro de manifesto, e esse lança: um `replacement` como `../template/x` leria
 * um arquivo qualquer do pacote e o gravaria no projeto do usuário.
 */
export async function readAsset(name: string): Promise<string | undefined> {
  if (!name.startsWith(`${ASSETS_DIR_NAME}/`)) {
    throw new Error(`Asset fora de \`${ASSETS_DIR_NAME}/\`: ${name}`);
  }
  const root = await resolvePackageRoot();
  if (root === undefined) return undefined;
  const abs = assertWithin(join(root, ASSETS_DIR_NAME), name.slice(ASSETS_DIR_NAME.length + 1));
  if (!(await pathExists(abs))) return undefined;
  return readText(abs);
}
