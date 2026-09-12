/**
 * Emissão do `docker-compose.yml` do projeto gerado.
 *
 * O compose é escrito, não subtraído. Podar YAML por regex é possível e é exatamente
 * onde nasce o bug que este arquivo existe para não ter: um `depends_on: redis:
 * condition: service_healthy` que sobrevive à remoção do serviço `redis` faz o
 * `docker compose up` esperar PARA SEMPRE por um serviço que não existe, sem erro e sem
 * timeout — o usuário vê "waiting" e conclui que o boilerplate não funciona.
 *
 * Duas invariantes que o mapa de config levantou e que aqui são estruturais:
 *
 * **`POSTGRES_USER` ↔ `pg_isready -U`.** O healthcheck do Postgres roda `pg_isready -U
 * <role>`. Se a role do healthcheck não for a que a imagem criou, o healthcheck NUNCA
 * passa, e todo `depends_on: postgres: condition: service_healthy` trava. Os dois saem
 * da mesma variável aqui.
 *
 * **Credencial do MinIO ↔ `S3_*` ↔ `mc alias set`.** Três lugares, um valor: o
 * `environment` do serviço, o `.env` (que este módulo não escreve, mas lê do mesmo
 * `GeneratedSecrets`) e o argumento do `mc` no `entrypoint` do job de setup. Divergir
 * dá container saudável, bucket inexistente e `SignatureDoesNotMatch` em todo upload.
 *
 * As duas roles do Postgres continuam nascendo como no boilerplate: o **dono** vem das
 * variáveis da imagem (aqui), e a **role restrita** vem da migration de baseline. Não
 * há `docker-entrypoint-initdb.d` de propósito — em deploy com Postgres gerenciado
 * (RDS, Neon) esse diretório não existe, e a role tem de nascer igual nos dois mundos.
 */

import { DEV_PORTS, effectiveDrivers } from './env.ts';
import { assertWithin, pathExists, readText, writeText } from './util/fs.ts';
import type { GeneratedSecrets } from './secrets.ts';
import type { NameForms, Recipe } from './types.ts';

/** Os serviços que o compose do boilerplate tem. */
export const COMPOSE_SERVICE_IDS = [
  'postgres',
  'redis',
  'minio',
  'minio-setup',
  'mailpit',
] as const;

export type ComposeServiceId = (typeof COMPOSE_SERVICE_IDS)[number];

export interface ComposeResult {
  yaml: string;
  services: ComposeServiceId[];
  /** Serviços que saíram, com o motivo — vai para o relatório e para o terminal. */
  omitted: { service: ComposeServiceId; reason: string }[];
  volumes: string[];
}

/**
 * Quais serviços a receita precisa.
 *
 * Consome `effectiveDrivers`, o mesmo resolvedor que o `.env` usa. É isso que garante
 * o par 11 do mapa ("driver ↔ serviço de infra"): não existem duas decisões sobre o
 * Redis, existe uma, e os dois arquivos a leem.
 */
export function selectComposeServices(recipe: Recipe): {
  services: ComposeServiceId[];
  omitted: { service: ComposeServiceId; reason: string }[];
} {
  const drivers = effectiveDrivers(recipe);
  const services: ComposeServiceId[] = ['postgres'];
  const omitted: { service: ComposeServiceId; reason: string }[] = [];

  // Postgres nunca sai: Prisma + RLS são o núcleo, não um adapter.
  if (drivers.needsRedis) {
    services.push('redis');
  } else {
    omitted.push({
      service: 'redis',
      reason: 'CACHE_DRIVER=memory e QUEUE_DRIVER=memory — nada usa REDIS_URL',
    });
  }

  if (drivers.storage === 's3') {
    services.push('minio', 'minio-setup');
  } else {
    omitted.push(
      { service: 'minio', reason: 'STORAGE_DRIVER=local — os arquivos vão para o disco' },
      { service: 'minio-setup', reason: 'sem MinIO não há bucket para criar' },
    );
  }

  if (drivers.mail === 'smtp') {
    services.push('mailpit');
  } else {
    omitted.push({
      service: 'mailpit',
      reason: `MAIL_DRIVER=${drivers.mail} — nada abre conexão SMTP local`,
    });
  }

  return { services, omitted };
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderização
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emite o `docker-compose.yml`.
 *
 * YAML montado à mão, sem dependência: o arquivo tem cinco formas de serviço conhecidas
 * e nenhum dado vindo do usuário além de nomes já validados por `validateSlug` (só
 * `[a-z0-9-]`) e de senhas geradas com alfabeto alfanumérico. Um serializador genérico
 * de YAML resolveria um problema de quoting que, por construção, não existe aqui.
 */
export function renderCompose(
  recipe: Recipe,
  names: NameForms,
  secrets: GeneratedSecrets,
): ComposeResult {
  const { services, omitted } = selectComposeServices(recipe);
  const blocks: string[] = [];
  const volumes: string[] = [];

  // O dono do banco. Uma variável, três consumidores (POSTGRES_USER, o healthcheck e a
  // DATABASE_ADMIN_URL que o .env monta com o mesmo `names.dbName`).
  const owner = names.dbName;

  blocks.push(postgresService(names, secrets, owner));
  volumes.push('postgres_data');

  if (services.includes('redis')) {
    blocks.push(redisService(names));
    volumes.push('redis_data');
  }

  if (services.includes('minio')) {
    blocks.push(minioService(names, secrets));
    blocks.push(minioSetupService(names, secrets));
    volumes.push('minio_data');
  }

  if (services.includes('mailpit')) {
    blocks.push(mailpitService(names));
  }

  const header = [
    `# ${names.human} — infraestrutura de desenvolvimento.`,
    '#',
    '# Modo padrão: infra em container, apps no host (`docker compose up -d` + `pnpm dev`).',
    '# Só os serviços que esta receita usa estão aqui; o .env gerado publica as mesmas',
    '# portas 42xx e aponta para eles.',
    '#',
    '# Ordem obrigatória num banco novo:',
    '#   1. docker compose up -d          cria o banco e o DONO dele',
    `#   2. pnpm --filter @${names.npmScope}/api db:migrate   cria o schema e a role ${names.dbRole}`,
    '#   3. pnpm dev                      a API conecta como a role restrita',
    '#',
    '# A role restrita nasce na migration, não aqui, de propósito: num Postgres',
    '# gerenciado (RDS, Neon) não existe docker-entrypoint-initdb.d, e a role tem de',
    '# nascer do mesmo jeito nos dois mundos.',
  ];

  if (omitted.length > 0) {
    header.push('#');
    header.push('# Serviços que esta receita NÃO precisa:');
    for (const { service, reason } of omitted) header.push(`#   · ${service}: ${reason}`);
  }

  const yaml = [
    ...header,
    '',
    'services:',
    blocks.join('\n'),
    'volumes:',
    ...volumes.map((volume) => `  ${volume}:`),
    '',
  ].join('\n');

  return { yaml, services, omitted, volumes };
}

function postgresService(names: NameForms, secrets: GeneratedSecrets, owner: string): string {
  return [
    '  postgres:',
    '    image: postgres:17-alpine',
    `    container_name: ${names.slug}-postgres`,
    '    restart: unless-stopped',
    '    environment:',
    `      POSTGRES_USER: ${owner}`,
    `      POSTGRES_PASSWORD: ${secrets.dbOwnerPassword}`,
    `      POSTGRES_DB: ${names.dbName}`,
    '    ports:',
    `      - "\${POSTGRES_PORT:-${DEV_PORTS.postgres}}:5432"`,
    '    volumes:',
    '      - postgres_data:/var/lib/postgresql/data',
    '    healthcheck:',
    // Mesma variável do POSTGRES_USER acima. Se as duas divergirem o healthcheck nunca
    // passa e todo depends_on: service_healthy espera para sempre.
    `      test: ["CMD-SHELL", "pg_isready -U ${owner}"]`,
    '      interval: 5s',
    '      timeout: 5s',
    '      retries: 5',
    '',
  ].join('\n');
}

function redisService(names: NameForms): string {
  return [
    '  redis:',
    '    image: redis:7-alpine',
    `    container_name: ${names.slug}-redis`,
    '    restart: unless-stopped',
    '    command: redis-server --save 60 1 --loglevel warning',
    '    ports:',
    `      - "\${REDIS_PORT:-${DEV_PORTS.redis}}:6379"`,
    '    volumes:',
    '      - redis_data:/data',
    '    healthcheck:',
    '      test: ["CMD", "redis-cli", "ping"]',
    '      interval: 5s',
    '      timeout: 3s',
    '      retries: 5',
    '',
  ].join('\n');
}

function minioService(names: NameForms, secrets: GeneratedSecrets): string {
  return [
    '  minio:',
    '    image: minio/minio:latest',
    `    container_name: ${names.slug}-minio`,
    '    restart: unless-stopped',
    '    command: server /data --console-address ":9001"',
    '    environment:',
    // Os mesmos valores que S3_ACCESS_KEY/S3_SECRET_KEY no .env e que o `mc alias set`
    // abaixo. Três lugares, um valor gerado.
    `      MINIO_ROOT_USER: ${secrets.s3AccessKey}`,
    `      MINIO_ROOT_PASSWORD: ${secrets.s3SecretKey}`,
    '    ports:',
    `      - "\${MINIO_PORT:-${DEV_PORTS.minio}}:9000"`,
    `      - "\${MINIO_CONSOLE_PORT:-${DEV_PORTS.minioConsole}}:9001"`,
    '    volumes:',
    '      - minio_data:/data',
    '    healthcheck:',
    '      test: ["CMD", "mc", "ready", "local"]',
    '      interval: 5s',
    '      timeout: 5s',
    '      retries: 5',
    '',
  ].join('\n');
}

function minioSetupService(names: NameForms, secrets: GeneratedSecrets): string {
  return [
    '  # Cria o bucket e o deixa legível publicamente (só dev). Job one-shot.',
    '  minio-setup:',
    '    image: minio/mc:latest',
    '    depends_on:',
    '      minio:',
    '        condition: service_started',
    '    entrypoint: >',
    '      /bin/sh -c "',
    `      until mc alias set local http://minio:9000 ${secrets.s3AccessKey} ${secrets.s3SecretKey}; do echo 'esperando o minio...'; sleep 1; done;`,
    // O bucket é o mesmo valor de S3_BUCKET no .env, e o sufixo de S3_PUBLIC_URL.
    `      mc mb --ignore-existing local/${names.bucket};`,
    `      mc anonymous set download local/${names.bucket};`,
    "      echo 'Bucket pronto.';",
    '      exit 0;',
    '      "',
    '',
  ].join('\n');
}

function mailpitService(names: NameForms): string {
  return [
    '  mailpit:',
    '    image: axllent/mailpit:latest',
    `    container_name: ${names.slug}-mailpit`,
    '    restart: unless-stopped',
    '    ports:',
    `      - "\${MAILPIT_SMTP_PORT:-${DEV_PORTS.mailpitSmtp}}:1025"`,
    `      - "\${MAILPIT_UI_PORT:-${DEV_PORTS.mailpitUi}}:8025"`,
    '    environment:',
    '      MP_MAX_MESSAGES: 500',
    '      MP_SMTP_AUTH_ACCEPT_ANY: 1',
    '      MP_SMTP_AUTH_ALLOW_INSECURE: 1',
    '',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// O override de dev, que é subtraído e não reescrito
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove de um `docker-compose.dev.yml` as dependências de serviços que não existem
 * mais.
 *
 * Por que este é subtraído em vez de reescrito como o principal: o override carrega uma
 * âncora YAML (`x-app-volumes`) com sete volumes nomeados, `env_file`, bind-mounts e o
 * comando de cada app — conteúdo que o boilerplate muda e que reescrever aqui faria
 * apodrecer a cada sync do template. O que ELE precisa é cirúrgico: sem o serviço
 * `redis`, as cláusulas
 *
 *     depends_on:
 *       redis:
 *         condition: service_healthy
 *
 * têm de sair, senão `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`
 * fica esperando um serviço inexistente, para sempre, sem mensagem de erro.
 */
export function pruneComposeDependsOn(yaml: string, removedServices: readonly string[]): string {
  if (removedServices.length === 0) return yaml;

  const lines = yaml.split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const match = /^(\s+)([a-z0-9_-]+):\s*$/.exec(line);
    const service = match?.[2];

    // Só interessa a chave de serviço que está DENTRO de um depends_on, e a única forma
    // que o boilerplate usa é a de duas linhas (`nome:` + `condition:`). Casar a linha
    // seguinte com `condition:` é o que impede esta função de apagar, por exemplo, a
    // definição do próprio serviço `redis:` no arquivo principal.
    if (service && removedServices.includes(service) && /^\s+condition:/.test(lines[i + 1] ?? '')) {
      i += 1; // pula a linha do condition junto
      continue;
    }

    out.push(line);
  }

  // Um `depends_on:` que ficou sem nenhum filho é erro de sintaxe no compose ("null"
  // não é um mapa válido ali), então ele sai também.
  return dropEmptyDependsOn(out).join('\n');
}

/**
 * Aplica a poda no `docker-compose.dev.yml` do projeto gerado, no disco.
 *
 * Chame depois de escrever o `docker-compose.yml`, passando `ComposeResult.omitted`.
 * Sem isto, `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` numa
 * receita sem Redis fica esperando um serviço que não existe — indefinidamente, sem
 * erro, sem timeout e sem nenhuma pista de qual serviço está faltando.
 *
 * Devolve `null` quando não havia nada a fazer (o arquivo não existe, ou nenhum serviço
 * saiu), para que o chamador não relate um passo que não aconteceu.
 */
export async function pruneComposeDevOverride(
  targetDir: string,
  omitted: readonly { service: ComposeServiceId }[],
  options: { dryRun?: boolean } = {},
): Promise<{ file: string; removed: string[] } | null> {
  if (omitted.length === 0) return null;

  const rel = 'docker-compose.dev.yml';
  const file = assertWithin(targetDir, rel);
  if (!(await pathExists(file))) return null;

  const removed = omitted.map((entry) => entry.service);
  const original = await readText(file);
  const pruned = pruneComposeDependsOn(original, removed);

  if (pruned === original) return null;
  if (!options.dryRun) await writeText(file, pruned);

  return { file: rel, removed };
}

function dropEmptyDependsOn(lines: string[]): string[] {
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const match = /^(\s+)depends_on:\s*$/.exec(line);
    if (match) {
      const indent = match[1]!.length;
      const next = lines[i + 1];
      const nextIndent = next ? /^(\s*)/.exec(next)![1]!.length : 0;
      // Sem filho mais indentado, a chave está vazia.
      if (!next || nextIndent <= indent || next.trim() === '') continue;
    }
    out.push(line);
  }

  return out;
}
