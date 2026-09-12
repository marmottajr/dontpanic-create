import type { Messages } from './types';

export const es: Messages = {
  meta: {
    title: 'DontPanic — el boilerplate SaaS con las decisiones de seguridad ya tomadas',
    description:
      'Genera un SaaS full-stack en NestJS y Next.js con multi-tenancy garantizado por Row Level Security, 2FA, invitaciones e inicio de sesión social. Las decisiones que una IA falla en silencio vienen ya tomadas, documentadas y probadas.',
  },

  nav: {
    skipToContent: 'Ir al contenido',
    proof: 'La prueba',
    configure: 'Montar el comando',
    how: 'Cómo funciona',
    inside: 'Qué incluye',
    faq: 'Preguntas',
    repo: 'Repositorio',
    languageLabel: 'Idioma',
    themeLabel: 'Tema',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    themeSystem: 'Sistema',
  },

  hero: {
    mastheadLabel: 'Don’t Panic',
    title:
      'Las decisiones de seguridad que una IA falla en silencio vienen ya tomadas, documentadas y probadas.',
    lead: 'DontPanic es un boilerplate SaaS full-stack — NestJS, Next.js, Prisma, Postgres con Row Level Security de verdad. Cada decisión de seguridad ya está tomada, está explicada en el `CLAUDE.md` que tu agente lee antes de escribir la primera línea, y tiene un test que falla cuando alguien la deshace. De paso, el contexto se gasta en tu producto y no en redescubrir cómo se hace la rotación de refresh tokens.',
    commandLabel: 'Comando del preset por defecto',
    commandNote: 'Necesita Node 24 y pnpm. Para elegir las partes, monta tu comando más abajo.',
    ctaConfigure: 'Montar mi comando',
    ctaProof: 'Ver los errores que evita',
    facts: [
      {
        value: '78.533',
        label: 'líneas de TypeScript que compilan, pasan el lint y pasan los tests',
      },
      {
        value: '5',
        label: 'recursos intercambiables por variable de entorno, sin tocar la lógica',
      },
      {
        value: '2 min',
        label: 'del npx a `pnpm dev`, con la base de datos migrada y el admin sembrado',
      },
    ],
  },

  proof: {
    title: 'La prueba',
    lead: 'Nada de esto es hipotético. Son errores que producen código que compila, pasa los tests y pasa el code review — y que aparece meses después, en un usuario que no eres tú. Cada uno está ya decidido en el boilerplate, con el motivo escrito al lado de la decisión.',
    labels: {
      surface: 'Dónde vive',
      code: 'El código que pasa el review',
      whyItPasses: 'Por qué nadie lo detecta',
      whatHappens: 'Qué ocurre',
      ours: 'En DontPanic',
    },
    items: [
      {
        id: 'oauth-identity',
        title: 'Vincular la identidad social por la dirección de correo',
        whyItPasses:
          'Compila, y funciona en todos los inicios de sesión de tu entorno de desarrollo. El test —que tiene un solo usuario— pasa. El review lo aprueba, porque así lo hace la mayoría de los tutoriales de OAuth.',
        whatHappens:
          'Las direcciones corporativas se reciclan. Ana se va, RR. HH. entrega `ana@empresa.com` al siguiente contratado, él entra con Google y **hereda la cuenta de Ana**: historial, permisos, todo. Nadie ha entrado por la fuerza: el sistema hizo exactamente lo que estaba escrito.',
        ours: 'La clave de la identidad es el `providerAccountId` inmutable — `sub` en Google y Apple, el id numérico en GitHub — con `@@unique([provider, providerAccountId])`. La columna `email` de `oauth_accounts` es para mostrar y puede estar desactualizada. Y una dirección que el proveedor no marcó como verificada no vincula nada: el callback devuelve `unverified_email`.',
      },
      {
        id: 'oauth-2fa',
        title: 'Emitir sesión en el callback de OAuth sin comprobar el segundo factor',
        whyItPasses:
          'El `TwoFactorGateGuard` existe y está registrado. Comprueba que el 2FA está *habilitado*, nunca que *esta* sesión haya pasado por él. El test de 2FA cubre el flujo de contraseña, y el flujo de contraseña es correcto.',
        whatHappens:
          'Quien activó TOTP a propósito descubre que «entrar con Google» nunca pide el código. El inicio de sesión social queda **estrictamente más débil** que escribir la contraseña, y el segundo factor pasa a ser opcional para quien sepa qué botón pulsar.',
        ours: 'Si `twoFactorEnabled`, el callback no emite sesión: crea el mismo ticket que crearía `POST /auth/login`, lo entrega en una cookie de cinco minutos y un solo uso, y redirige a `/login?twofactor=1`. Cookie y no query string: la query string acaba en el historial del navegador, en la cabecera `Referer` y en el log de todos los proxies del camino.',
      },
      {
        id: 'trust-proxy',
        title: 'Activar `trustProxy: true` para arreglar un 429 indebido',
        whyItPasses:
          'Arregla el síntoma al instante: el rate limit vuelve a distinguir clientes, el 429 desaparece y el deploy sale con el problema resuelto. Ningún test lo detecta, porque un test no falsifica cabeceras.',
        whatHappens:
          "Confiar en todos los hops es aceptar cualquier `X-Forwarded-For` — y `X-Forwarded-For` **no** está en la lista de forbidden headers de fetch, es decir, el navegador puede ponerla. Un `fetch('/api/auth/login', { headers: { 'x-forwarded-for': ipAleatoria() } })` consigue un cubo nuevo en cada petición, y el rate limit del login deja de existir. Contar hops desde la izquierda acaba igual: el load balancer hace append, así que en `X-Forwarded-For: <falsificada>, <real>` el primer elemento es lo que escribió el atacante.",
        ours: '`CLIENT_IP_HEADER` y `CLIENT_IP_TRUSTED_HOPS`, contados **desde la derecha**. El BFF borra toda cabecera de forwarding que venga del navegador y reescribe una sola, saneada. El valor por defecto es cero hops: no envía ninguna IP y trata a todos los que están detrás del proxy como un único cliente — limita demasiado, y no se puede eludir.',
      },
      {
        id: 'guard-scope',
        title: 'Leer la base de datos en un guard, antes de que exista el scope de tenant',
        whyItPasses:
          'Nest ejecuta los guards **antes** de los interceptors. Cuando el guard corre, el interceptor que abre la transacción con `SET LOCAL` todavía no ha corrido: `prisma.db` cae en el cliente base, sin scope, y la política de RLS devuelve cero filas. No lanza error. Cobertura verde, 200 OK, nada en los logs.',
        whatHappens:
          'El guard concluye «este usuario no tiene 2FA» y **deja pasar**. Así fue exactamente como el propio `TwoFactorGateGuard` de DontPanic se convirtió en un no-op silencioso: el bug está en el historial del repositorio, y la lección quedó escrita al lado.',
        ours: 'Un guard que lee la base de datos abre su propio scope, con `this.prisma.forTenant(tenantId, …)` o `asPlatform`, y **falla cerrado** cuando la lectura vuelve vacía. La regla, con la historia del bug al lado, está en la sección de multi-tenancy del `CLAUDE.md` — el archivo que tu agente lee antes de escribir el siguiente guard.',
      },
      {
        id: 'db-owner',
        title: 'Apuntar `DATABASE_URL` al propietario de la base de datos',
        whyItPasses:
          'Es lo que dice el tutorial y es el usuario que crea el `docker compose` de Postgres. Peor aún: tus tests de aislamiento pasan, porque ejercitan el filtro de la aplicación, que está ahí y está bien.',
        whatHappens:
          'Un SUPERUSER —y cualquier rol con `BYPASSRLS`— ignora Row Level Security incluso con `FORCE ROW LEVEL SECURITY`. **Toda política se vuelve decoración**, y el aislamiento entre empresas vuelve a depender de que ninguna consulta olvide un `where`, para siempre, en todo el código futuro.',
        ours: 'La aplicación se conecta con un rol restringido, creado `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`; el propietario queda solo en `DATABASE_ADMIN_URL`, para `migrate` y `seed`. La API **se niega a arrancar** en producción si detecta un superuser. Y la suite e2e corre con el rol restringido: es lo que hace que `tenant-isolation.e2e-spec.ts` demuestre algo en vez de repetir la intención del código.',
      },
    ],
    moreTitle: 'Tres más, con el mismo patrón',
    more: [
      'Enviar el correo de invitación dentro de la transacción. Un rollback entrega un enlace válido que apunta a una empresa que no existe, y no deja registro que el soporte pueda encontrar. Aquí, `issue()` escribe en el `tx` de quien lo llama y el envío ocurre después del commit.',
      'Responder «esta cuenta usa inicio de sesión social» en un login con contraseña. Eso es un oráculo: se puede enumerar, cronometrando el formulario, exactamente qué direcciones no tienen contraseña. Aquí el error es el genérico de siempre y paga el mismo coste de Argon2 — `verifyPassword(null, …)` verifica contra el hash de algo que nadie conoce antes de responder `false`.',
      'Contar plazas antes de crear el usuario. Dos peticiones simultáneas leen «queda una» y ambas crean: contar no bloquea nada. Aquí el `pg_advisory_xact_lock`, por empresa y por recurso, está dentro de la misma transacción que la escritura.',
    ],
  },

  configurator: {
    title: 'Monta el comando',
    lead: 'Aquí no se genera nada. Esta página compone una cadena de texto: el generador vive en el CLI, versionado junto con la plantilla, y es él quien decide qué entra en tu repositorio. Sin servidor, sin cola de build, sin un zip que caduque en una caché.',

    nameLegend: 'El nombre del proyecto',
    nameLabel: 'Nombre',
    namePlaceholder: 'Acme Corp',
    nameHelp: 'Cómo llamas al producto. Todo lo demás se deriva de aquí.',
    slugLabel: 'Slug',
    slugHelp: 'Directorio, paquete npm e identificadores. Minúsculas, dígitos y guion.',
    slugDerived: 'derivado del nombre',
    slugCustom: 'personalizado',
    slugReset: 'Volver al derivado',
    applySuggestion: 'Usar',

    derivedTitle: 'En qué se convierte ese nombre',
    derivedNote:
      'El rename no es un `sed` sobre el nombre de la carpeta: pasa por el SQL que crea el rol de Postgres, por el scope de pnpm y por nombres de base de datos y de bucket a la vez — donde SQL rechaza el guion y S3 rechaza el guion bajo.',
    derivedLabels: {
      dbName: 'base de datos de dev',
      dbNameE2e: 'base de datos de e2e',
      dbRole: 'rol restringido de Postgres',
      npmScope: 'scope de pnpm',
      seedAdminEmail: 'admin del seed',
      bucket: 'bucket de object storage',
      screaming: 'prefijo de env',
      pascal: 'clases y tipos',
    },

    presetLegend: 'Punto de partida',
    presetNote:
      'Un preset es un conjunto de valores por defecto. Todo lo de abajo sigue siendo editable, y el comando muestra solo lo que has cambiado.',
    presetReset: 'Descartar los cambios de este preset',

    featuresLegend: 'Qué entra',
    featuresNote:
      'El generador resta: la plantilla es el repositorio real, que compila y funciona, y desactivar una feature borra sus archivos. Sin `{{#if}}` en el código.',
    groups: {
      access: 'Acceso',
      tenancy: 'Empresas',
      ops: 'Operación',
      extras: 'Extras',
    },

    driversLegend: 'Adapters',
    driversNote:
      'Cambiar de proveedor es cambiar una variable de entorno: el dominio depende del port, no del proveedor. Estas decisiones acaban en el `.env` del proyecto generado.',
    driverLabels: {
      db: 'Base de datos',
      storage: 'Storage',
      mail: 'Correo',
      cache: 'Caché',
      queue: 'Cola',
      captcha: 'Captcha',
    },

    oauthLegend: 'Proveedores de inicio de sesión social',
    oauthNote:
      'La API y el web tienen que listar los mismos nombres, o el botón de más da 404. El generador escribe los dos lados.',

    localesLegend: 'Idiomas del proyecto',
    localesNote:
      'Los idiomas del producto que vas a generar. No tienen relación con el idioma de esta página.',
    defaultLocaleLabel: 'Idioma por defecto',

    optionsLegend: 'Al generar',
    optionLabels: {
      git: 'Ejecutar `git init` y el primer commit',
      install: 'Ejecutar `pnpm install` al final',
      docker: 'Emitir `docker-compose.yml` con los servicios usados',
      force: 'Sobrescribir el directorio de destino si ya existe',
    },

    issuesTitle: 'Combinación incoherente',
    issueError: 'Impide la generación',
    issueWarning: 'Permitido, con reservas',
    noIssues: 'Combinación coherente.',

    commandTitle: 'Tu comando',
    commandNote: 'Esto es la configuración. No vive en ningún otro sitio.',
    copy: 'Copiar comando',
    copied: 'Comando copiado',
    copyFailed: 'No se pudo copiar: selecciona el texto y cópialo',
    flagsTitle: 'Las flags',
    flagsNote: 'Solo lo que difiere del preset. Quita una para volver a su valor por defecto.',
    removeFlag: 'Quitar',
    shareTitle: 'Enlace de esta configuración',
    shareNote:
      'La configuración está en la URL, legible. Mándala por Slack y tu colega entiende qué es antes de abrirla.',
    shareCopy: 'Copiar enlace',
    shareCopied: 'Enlace copiado',
    blockedByName: 'Corrige el nombre antes de usar el comando.',

    features: {
      multiTenant: {
        label: 'Multi-tenancy',
        text: 'Aislamiento entre empresas en Postgres, por Row Level Security. Desactivado, el RLS se queda: el proyecto nace con un tenant fijo y sin selector de empresa en la interfaz.',
      },
      twoFactor: {
        label: '2FA por TOTP',
        text: 'Segundo factor con app de autenticación, códigos de respaldo y un ticket de un solo uso entre la contraseña y la sesión.',
      },
      oauth: {
        label: 'Inicio de sesión social',
        text: 'Google, Apple y GitHub, activados por proveedor. Identidad por `providerAccountId`, y el callback respeta el 2FA.',
      },
      invitations: {
        label: 'Invitaciones',
        text: 'La puerta a una empresa que ya existe: el invitado elige su propia contraseña, y el clic en el enlace es lo que prueba la dirección.',
      },
      publicSignup: {
        label: 'Registro público',
        text: 'El formulario que permite a un desconocido crear empresa y ser su primer admin. Desactivado, quedan la invitación y el seed.',
      },
      files: {
        label: 'Subida de archivos',
        text: 'Avatar y adjuntos por URL prefirmada, detrás del port de storage: S3, MinIO, R2 o disco local.',
      },
      platform: {
        label: 'Panel de plataforma',
        text: 'El área del SUPERADMIN en `/platform`: crea empresas, invita al primer admin y atraviesa tenants con su propio scope.',
      },
      audit: {
        label: 'Registro de auditoría',
        text: 'Quién hizo qué, escrito fuera de la transacción de la petición para que no desaparezca con un rollback.',
      },
      plans: {
        label: 'Planes y límites',
        text: '`maxUsers` y contadores con nombre por empresa, con advisory lock por recurso: contar antes de escribir no bloquea nada.',
      },
      i18n: {
        label: 'Internacionalización',
        text: 'Mensajes por idioma en ambos lados, con test de paridad de claves entre los archivos de traducción.',
      },
      queue: {
        label: 'Cola de jobs',
        text: 'BullMQ sobre Redis, con el worker en un proceso aparte. El tenant viaja con el job: sin él, el RLS devuelve cero filas y el job miente diciendo que fue bien.',
      },
      captcha: {
        label: 'Captcha',
        text: 'Turnstile o reCAPTCHA en las rutas que adivinan secretos, fallando en cerrado cuando el proveedor se cae.',
      },
      easterEggs: {
        label: 'Bromas de la Guía',
        text: 'La voz de Marvin en los márgenes, `GET /teapot` devolviendo 418 y el Konami en el dashboard. Nunca en un mensaje de seguridad.',
      },
      scaffolding: {
        label: 'Bloques de construcción',
        text: 'Grid de registros, tarjetas de dashboard y `sequence.service.ts`: listos, probados y sin que nada los importe — el punto de partida de tus pantallas CRUD.',
      },
    },

    presets: {
      minimal: {
        label: 'Mínimo',
        summary: 'Contraseña, multi-tenancy con RLS y la suite de tests. Nada más.',
        audience:
          'Para quien va a construir el producto entero y solo quiere la base de acceso ya probada.',
      },
      saas: {
        label: 'SaaS',
        summary:
          'Multiempresa de verdad: invitaciones, planes con límite de plazas, 2FA, inicio de sesión social y cola duradera.',
        audience:
          'Para un producto por suscripción, con más de una empresa cliente en la misma base de datos.',
      },
      complete: {
        label: 'Completo',
        summary: 'El boilerplate entero, sin restar nada — Marvin incluido.',
        audience: 'Para verlo todo funcionando antes de decidir qué quitar.',
      },
      internal: {
        label: 'Interno',
        summary:
          'Una sola empresa y ninguna puerta pública: se entra por invitación, con 2FA y auditoría.',
        audience:
          'Para herramienta de equipo, back office o ERP que nunca tendrá registro abierto.',
      },
    },
  },

  how: {
    title: 'Cómo funciona',
    lead: 'Cuatro pasos, y solo el tercero tarda algo.',
    steps: [
      {
        title: 'Elige las partes',
        body: 'Un preset como punto de partida y los toggles encima. La URL guarda la elección, así que puedes mandar el enlace a quien decide contigo antes de ejecutar nada.',
      },
      {
        title: 'Copia el comando',
        body: 'La página no genera nada: compone la cadena. Es el CLI, versionado junto con la plantilla, el que decide el contenido de tu repositorio — por eso la misma receta produce el mismo proyecto hoy y dentro de dos años.',
      },
      {
        title: 'Ejecuta el npx',
        body: 'El generador copia la plantilla, borra lo que no pediste, poda el schema de Prisma, compone la baseline de SQL, cambia el nombre en todas sus formas, escribe el `.env` con secretos generados y ejecuta `git init`.',
      },
      {
        title: '`pnpm dev`',
        body: 'Con Docker en marcha, la base de datos migrada y el admin sembrado. Dos minutos después del `npx` estás mirando la pantalla de login de tu producto.',
      },
    ],
    renameTitle: 'El rename se demuestra, no se revisa',
    renameLead:
      'El nombre del proyecto aparece en sitios que ninguna revisión humana cubre. La puerta es mecánica: el CI genera con un nombre de prueba, ejecuta `grep -ri` exigiendo cero apariciones del nombre antiguo y solo entonces instala, comprueba tipos y corre la suite completa, e2e incluido.',
    renameItems: [
      '531 apariciones en 199 archivos, en tres cajas distintas.',
      'Dentro del SQL que crea el rol restringido de Postgres, donde una sustitución parcial produce un rol sin GRANT — y el síntoma es «cero filas», no un error.',
      'En nombres de base de datos y de bucket a la vez, donde SQL rechaza el guion y S3 rechaza el guion bajo.',
    ],
  },

  inside: {
    title: 'Qué incluye',
    lead: 'La plantilla es el repositorio real de DontPanic, en la tag que declara el generador. No es una versión de demostración: es el código que ejecuta su propio CI.',
    stackTitle: 'El stack',
    stackRoles: [
      'API, con Fastify por debajo',
      'Web, con el BFF que habla con la API en lugar del navegador',
      'Base de datos, con driver adapters y Row Level Security',
      'Contratos de petición y respuesta, compartidos entre API y web',
      'Contraseña y sesión, con refresh rotativo y detección de reutilización',
      'Cola duradera, con el worker en un proceso aparte',
      'Tests: unitarios, de componente y e2e',
      'Monorepo, con caché de build',
    ],
    portsTitle: 'Ports & Adapters',
    portsLead:
      'Cinco recursos en los que cambiar de proveedor es cambiar una variable de entorno. El dominio depende de la interfaz; el proveedor es un detalle intercambiable.',
    portsHead: { resource: 'Recurso', adapters: 'Adapters', env: 'Variable' },
    portsResources: ['Archivos', 'Correo', 'Caché', 'Jobs', 'Captcha'],
    numbersTitle: 'Los números',
    numbers: [
      { value: '78.533', label: 'líneas de TypeScript' },
      {
        value: '~99%',
        label: 'de statements cubiertos en la API, con threshold aplicado en el CI',
      },
      { value: '100%', label: 'de statements cubiertos en el kit de UI del web' },
      {
        value: '531',
        label: 'apariciones del nombre sustituidas en 199 archivos, probadas por grep',
      },
    ],
  },

  faq: {
    title: 'Preguntas',
    lead: 'Las que merecen una respuesta honesta antes de ejecutar el comando.',
    items: [
      {
        q: '¿Qué se prueba exactamente?',
        a: 'La matriz de presets, íntegra: el CI genera un proyecto de cada preset, exige cero apariciones del nombre antiguo y ejecuta install, typecheck, unitarios y e2e. Más all-on, all-off y cada feature desactivada de forma aislada sobre el preset SaaS. Trece features booleanas son 8192 combinaciones, y el CI no prueba 8192 proyectos: las combinaciones fuera de esa matriz están permitidas y no probadas — y el CLI lo dice, en una línea, sin dramatismo. Un boilerplate que promete garantías que no verifica es peor que uno que declara el límite.',
      },
      {
        q: '¿Y si no quiero multi-tenancy?',
        a: '`--no-multi-tenant` lo esconde, no lo arranca. El proyecto nace con un tenant fijo creado en el seed, el scope siempre abierto en él, y el selector de empresa, el panel `/platform` y el SUPERADMIN fuera de la interfaz. Row Level Security se queda, y sigue demostrado por `tenant-isolation.e2e-spec.ts`; el coste es una columna indexada y un predicado que Postgres resuelve con una constante. Arrancarlo significaría mantener dos versiones de todo el acceso a datos — y la versión sin RLS es justamente la que no podemos demostrar segura.',
      },
      {
        q: '¿Puedo actualizar después?',
        a: 'El proyecto generado es tuyo, no una dependencia: no hay `pnpm update` que traiga novedades de DontPanic a su interior, y es a propósito — vas a editar ese código el primer día. Lo que sí hay es reproducibilidad: la misma receta con la misma versión de la plantilla genera el mismo proyecto hoy y dentro de dos años, así que puedes generar de nuevo y comparar diffs cuando quieras adoptar algo del upstream.',
      },
      {
        q: '¿Y la licencia?',
        a: 'MIT, en el generador y en la plantilla. Lo que sale del `npx` es tuyo: sin atribución obligatoria, sin royalties, sin cláusula que cambie de valor si tu producto crece. Puedes cerrar el código de lo que generes.',
      },
      {
        q: '¿Necesito Docker?',
        a: 'Para ejecutar la suite de tests, no: los adapters `memory`, `console` y `local` existen justamente para funcionar sin nada levantado. Para desarrollar de verdad necesitas un Postgres — y el `docker compose` del proyecto levanta Postgres, Redis, MinIO y Mailpit en puertos que no chocan con los tuyos. Si ya tienes esos servicios, apunta el `.env` hacia ellos y genera con `--no-docker`.',
      },
      {
        q: '¿Funciona con Claude Code, Cursor y similares?',
        a: 'El proyecto generado trae un `CLAUDE.md` podado a las features que elegiste: solo las secciones que existen en tu código. Ahí están las decisiones de seguridad y el motivo de cada una, en el formato que un agente lee antes de escribir. El efecto secundario es probablemente lo que te trajo aquí: el contexto se gasta en tu producto y no en redescubrir cómo se hace la rotación de refresh tokens.',
      },
    ],
  },

  footer: {
    tagline: 'Un boilerplate SaaS que ya tomó las decisiones aburridas.',
    repo: 'Código en GitHub',
    license: 'MIT',
    sourceNote:
      'Los números de esta página salen de `wc -l` y `grep` en el repositorio. Compruébalos.',
    marvin:
      'Aquí estoy yo, con un cerebro del tamaño de un planeta, montando una línea de comandos. A esto lo llaman satisfacción laboral.',
  },
};
