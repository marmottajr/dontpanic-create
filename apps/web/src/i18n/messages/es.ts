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
    nameCta: 'Empezar',
    commandLabel: 'Comando del preset por defecto',
    commandNote:
      'Necesita Node 24 y pnpm. Para elegir las partes, responde al asistente: son doce preguntas.',
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
    eyebrow: 'Errores que pasan el review',
    title: 'La prueba',
    lead: 'Nada de esto es hipotético. Son errores que producen código que compila, pasa los tests y pasa el code review — y que aparece meses después, en un usuario que no eres tú. Cada uno está ya decidido en el boilerplate, con el motivo al lado de la decisión y el test nombrado debajo.',
    labels: {
      whatHappens: 'Qué ocurre',
      ours: 'En DontPanic',
      seal: 'cubierto por tests',
      cases: 'casos',
    },
    items: [
      {
        id: 'oauth-identity',
        eyebrow: 'Inicio de sesión social',
        title: 'La identidad social vinculada por la dirección de correo',
        whatHappens:
          'Las direcciones corporativas se reciclan. Ana se va, RR. HH. entrega `ana@empresa.com` al siguiente contratado, él entra con Google y **hereda la cuenta de Ana**: historial, permisos, todo. Nadie ha entrado por la fuerza: el sistema hizo exactamente lo que estaba escrito, y el test, que tenía un solo usuario, pasó.',
        ours: 'La clave de la identidad es el `providerAccountId` inmutable — `sub` en Google y Apple, el id numérico en GitHub — con `@@unique([provider, providerAccountId])`. La columna `email` de `oauth_accounts` es para mostrar y puede estar desactualizada. Y una dirección que el proveedor no marcó como verificada no vincula nada: el callback devuelve `unverified_email`.',
      },
      {
        id: 'oauth-2fa',
        eyebrow: 'Segundo factor',
        title: 'La sesión emitida en el callback de OAuth sin comprobar el segundo factor',
        whatHappens:
          'Quien activó el código de seis dígitos a propósito descubre que «entrar con Google» nunca lo pide. El inicio de sesión social queda **estrictamente más débil** que escribir la contraseña, y el segundo factor pasa a ser opcional para quien sepa qué botón pulsar. El `TwoFactorGateGuard` no lo detecta: comprueba que el 2FA está *habilitado*, nunca que *esta* sesión haya pasado por él.',
        ours: 'Si `twoFactorEnabled`, el callback no emite sesión: crea el mismo ticket que crearía `POST /auth/login`, lo entrega en una cookie de cinco minutos y un solo uso, y redirige a `/login?twofactor=1`. Cookie y no query string: la query string acaba en el historial del navegador, en la cabecera `Referer` y en el log de todos los proxies del camino.',
      },
      {
        id: 'rls-where',
        eyebrow: 'Aislamiento',
        title: 'El aislamiento entre empresas confiado al `where` de la aplicación',
        whatHappens:
          'La garantía se ha vuelto disciplina humana, repetida en cada consulta, por todos los que entren al equipo después de ti. El primer `findUnique({ where: { id } })` por clave primaria — escrito con prisa, o por un agente que no conocía la regla — devuelve la fila de otra empresa. Y no falla: **devuelve datos, con estado 200**.',
        ours: 'El aislamiento es de Postgres, no de la aplicación: Row Level Security, con el scope declarado por `SET LOCAL` dentro de la transacción de la petición. Sin scope alguno, `current_setting(…, true)` devuelve NULL y la política no coincide — olvidar el scope da un resultado **vacío**, nunca la fila de la empresa equivocada. El filtro de la aplicación sigue ahí, como comodidad; la garantía es la de abajo.',
      },
      {
        id: 'password-reset',
        eyebrow: 'Sesiones',
        title: 'El restablecimiento de contraseña que no cierra las sesiones abiertas',
        whatHappens:
          'La persona cambia la contraseña precisamente porque sospecha que alguien entró. El hash nuevo no invalida nada: el refresh token del intruso **sigue renovándose solo**, y él se queda dentro de la cuenta mucho después del cambio — indefinidamente, mientras siga usando el sistema.',
        ours: '`resetPassword` graba la contraseña nueva y consume el token en la misma transacción y, después del commit, llama a `revokeAllForUser`: toda sesión existente muere, registrada en la auditoría como un cierre de sesión deliberado. El refresh rotativo cierra el resto: un token antiguo presentado de nuevo revoca la familia entera.',
      },
      {
        id: 'db-owner',
        eyebrow: 'Base de datos',
        title: 'La `DATABASE_URL` apuntando al propietario de la base de datos',
        whatHappens:
          'Un SUPERUSER —y cualquier rol con `BYPASSRLS`— ignora Row Level Security incluso con `FORCE ROW LEVEL SECURITY`. **Toda política se vuelve decoración**, y el aislamiento vuelve a depender de que ninguna consulta olvide un `where`. Peor aún: tus tests de aislamiento pasan, porque ejercitan el filtro de la aplicación, que está ahí y está bien.',
        ours: 'La aplicación se conecta con un rol restringido, creado `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`; el propietario queda solo en `DATABASE_ADMIN_URL`, para `migrate` y `seed`. La API **se niega a arrancar** en producción si detecta un superuser. Y la suite e2e corre con el rol restringido: es lo que hace que el test de aislamiento demuestre algo en vez de repetir la intención del código.',
      },
    ],
    moreTitle: 'Cinco más, con el mismo patrón',
    more: [
      'Activar `trustProxy: true` para quitarse de encima un 429 indebido. Confiar en todos los hops es aceptar cualquier `X-Forwarded-For` — y el navegador **puede** ponerla, porque no está en la lista de forbidden headers de fetch: un cubo nuevo de rate limit en cada petición. Aquí la IP se cuenta desde la derecha, con `CLIENT_IP_TRUSTED_HOPS`, y el BFF borra toda cabecera de forwarding que venga del navegador.',
      'Leer la base de datos en un guard, antes de que exista el scope de tenant. Nest ejecuta los guards **antes** de los interceptors, así que la política de RLS devuelve cero filas, el guard concluye «este usuario no tiene 2FA» y deja pasar — sin error y sin log. Aquí, un guard que lee la base de datos abre su propio scope y falla cerrado.',
      'Enviar el correo de invitación dentro de la transacción. Un rollback entrega un enlace válido que apunta a una empresa que no existe, y no deja registro que el soporte pueda encontrar. Aquí, `issue()` escribe en el `tx` de quien lo llama y el envío ocurre después del commit.',
      'Responder «esta cuenta usa inicio de sesión social» en un login con contraseña. Eso es un oráculo: se puede enumerar, cronometrando el formulario, exactamente qué direcciones no tienen contraseña. Aquí el error es el genérico de siempre y paga el mismo coste de Argon2 — `verifyPassword(null, …)` verifica contra el hash de algo que nadie conoce antes de responder `false`.',
      'Contar plazas antes de crear el usuario. Dos peticiones simultáneas leen «queda una» y ambas crean: contar no bloquea nada. Aquí el `pg_advisory_xact_lock`, por empresa y por recurso, está dentro de la misma transacción que la escritura.',
    ],
  },

  configurator: {
    nameLabel: 'Nombre',
    namePlaceholder: 'Acme Corp',
    nameHelp: 'Cómo llamas al producto. Todo lo demás se deriva de aquí.',
    slugLabel: 'Slug',
    slugHelp: 'Directorio, paquete npm e identificadores. Minúsculas, dígitos y guion.',
    slugDerived: 'derivado del nombre',
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

    driverLabels: {
      db: 'Base de datos',
      storage: 'Storage',
      mail: 'Correo',
      cache: 'Caché',
      queue: 'Cola',
      captcha: 'Captcha',
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
    flagsNote: 'Solo lo que difiere del punto de partida.',
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
        summary: 'Contraseña, aislamiento en la base de datos y la suite de tests. Nada más.',
        audience:
          'Para quien va a construir el producto entero y solo quiere la base de acceso ya probada.',
      },
      saas: {
        label: 'SaaS',
        summary:
          'Multiempresa de verdad: invitaciones, planes con límite de plazas, 2FA y cola duradera.',
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

  wizard: {
    open: 'Montar',
    openHero: 'Montar mi sistema',
    close: 'Cerrar',
    next: 'Continuar',
    back: 'Volver',
    finish: 'Ver el comando',
    recommended: 'Usar el recomendado',
    progress: 'Paso {n} de {total}',
    yes: 'Sí',
    no: 'No',
    edit: 'Editar',
    steps: {
      name: {
        eyebrow: 'Nombre',
        question: '¿Cómo se va a llamar tu sistema?',
        help: 'Puede ser el nombre del producto o el de la empresa. Todo lo demás sale de ahí: la carpeta, el paquete, la base de datos y hasta el usuario que crea Postgres. Las formas derivadas aparecen aquí abajo mientras escribes.',
      },
      preset: {
        eyebrow: 'Punto de partida',
        question: '¿Cuál de estos se parece más a lo que vas a construir?',
        help: 'Esto solo responde las siguientes preguntas por ti. Nada queda fijado: si una respuesta no encaja, cámbiala en su paso o en la revisión del final.',
      },
      tenancy: {
        eyebrow: 'Empresas',
        question:
          '¿Tu sistema va a atender a varias empresas distintas, cada una viendo solo sus propios datos?',
        help: 'Es la diferencia entre un producto que vendes a muchos clientes y un sistema que funciona para una sola empresa.',
        choices: {
          yes: {
            label: 'Sí, varias empresas',
            help: 'Cada empresa queda separada dentro de la base de datos por Postgres mismo, no por un filtro que alguien puede olvidar escribir. Viene con panel de administración y cambio de empresa.',
          },
          no: {
            label: 'No, una sola empresa',
            help: 'El sistema nace con una empresa fija y las pantallas de cambio se quedan fuera. La separación sigue dentro de la base de datos: solo no aparece en pantalla, porque no hay nada que cambiar.',
          },
        },
      },
      entry: {
        eyebrow: 'Entrada',
        question: '¿Cómo van a conseguir entrar las personas en el sistema?',
        help: 'Quién puede crear una cuenta es la decisión que más cambia tu producto — y la que peor sale cuando se deja para después.',
        choices: {
          open: {
            label: 'Cualquiera puede registrarse',
            help: 'Hay formulario de registro abierto, y quien se registra crea su propia empresa. Es lo que necesita un producto vendido por internet.',
          },
          invite: {
            label: 'Solo por invitación',
            help: 'Un administrador invita por correo y el invitado elige su propia contraseña. Nadie llega a saber la contraseña de otra persona, y el clic en el enlace es lo que prueba que esa dirección existe.',
          },
          seed: {
            label: 'Solo las cuentas que yo cree',
            help: 'Sin registro y sin invitaciones: la única cuenta es la que el sistema crea al instalarse. Sirve para uso interno — y significa que a las demás personas las creas a mano.',
          },
        },
      },
      social: {
        eyebrow: 'Inicio de sesión social',
        question: '¿Quieres el botón de entrar con Google, Apple o GitHub?',
        help: 'Le ahorra un paso al usuario, y ahorra también la contraseña olvidada. A cambio, cada proveedor necesita una clave que creas en su web.',
        choices: {
          yes: {
            label: 'Sí',
            help: 'La cuenta se reconoce por el identificador que da el proveedor, nunca por el correo: las direcciones de trabajo se reciclan, y vincular por correo es como alguien hereda la cuenta de quien se fue de la empresa.',
          },
          no: {
            label: 'No',
            help: 'Solo correo y contraseña, y el código de los proveedores sale del proyecto: menos cosas que mantener. Para recuperarlo, genera otra vez con el inicio de sesión social activado.',
          },
        },
      },
      twoFactor: {
        eyebrow: 'Segundo factor',
        question: '¿Las personas deben poder exigir un código del móvil para entrar?',
        help: 'Es el código de seis dígitos de una app como Google Authenticator. Quien lo activa protege la cuenta incluso si se filtra la contraseña.',
        choices: {
          yes: {
            label: 'Sí',
            help: 'Cada persona lo activa en su propia cuenta, con códigos de respaldo por si pierde el móvil. El inicio de sesión social lo respeta: con el segundo factor activado, entrar con Google no se salta el paso.',
          },
          no: {
            label: 'No',
            help: 'Entrar es solo contraseña. Se van el código, la pantalla de configuración y los códigos de respaldo.',
          },
        },
      },
      languages: {
        eyebrow: 'Idiomas',
        question: '¿El sistema va a hablar más de un idioma?',
        help: 'Esto es sobre el producto que vas a generar, no sobre esta página.',
        choices: {
          one: {
            label: 'Un idioma',
            help: 'Las pantallas y los correos salen en un solo idioma. La fontanería de traducción sigue en el código, así que añadir un segundo después no es rehacer las pantallas.',
          },
          many: {
            label: 'Más de uno',
            help: 'Tú eliges cuáles. Un test garantiza que a ningún idioma le falte una frase — que es como una pantalla aparece en inglés en medio del español.',
          },
        },
      },
      plans: {
        eyebrow: 'Planes',
        question: '¿Vas a vender planes con límite, del tipo «hasta 10 usuarios»?',
        help: 'Es lo que separa un plan básico de uno avanzado dentro del propio sistema.',
        choices: {
          yes: {
            label: 'Sí',
            help: 'Cada empresa recibe un límite de personas y contadores por recurso. El límite se comprueba en el momento de escribir, con bloqueo en la base de datos: dos invitaciones aceptadas en el mismo segundo no pasan del techo.',
          },
          no: {
            label: 'No',
            help: 'Sin límites y sin contadores. A nadie se le corta por tamaño.',
          },
        },
      },
      files: {
        eyebrow: 'Archivos',
        question: '¿Las personas van a subir archivos: foto de perfil, adjuntos, documentos?',
        help: 'Cambia dónde se guardan los archivos y cómo llegan al navegador.',
        choices: {
          yes: {
            label: 'Sí',
            help: 'La subida va directa al almacenamiento, por un enlace firmado. Funciona con Amazon S3, MinIO, Cloudflare R2 o el disco de la máquina, y cambiar entre ellos es una línea de configuración.',
          },
          no: {
            label: 'No',
            help: 'Sin subida de archivos y sin foto de perfil. Menos código, y ningún bucket que configurar.',
          },
        },
      },
      captcha: {
        eyebrow: 'Robots',
        question: '¿Las pantallas públicas necesitan protección contra robots?',
        help: 'Vale para registro, login y recuperación de contraseña — las pantallas que un robot intenta al por mayor.',
        choices: {
          yes: {
            label: 'Sí',
            help: 'Viene con Cloudflare Turnstile, y reCAPTCHA de Google como alternativa. Si el proveedor se cae, el sistema rechaza en vez de dejar pasar a todos — lo contrario es como un formulario se queda abierto sin que nadie lo note.',
          },
          no: {
            label: 'No',
            help: 'Sin rompecabezas en pantalla. El límite de intentos por dirección de red sigue valiendo, así que no es «sin protección»: es sin esa capa.',
          },
        },
      },
      review: {
        eyebrow: 'Revisión',
        question: 'Compruébalo antes de ejecutarlo.',
        help: 'Cada línea vuelve a la pregunta que la generó. El comando es exactamente lo que va a recibir el generador.',
      },
      done: {
        eyebrow: 'Listo',
        question: 'Solo cópialo y ejecútalo.',
        help: 'Pégalo en la terminal, en la carpeta donde quieres el proyecto. Dos minutos después estás mirando su pantalla de login.',
      },
    },
  },

  how: {
    title: 'Cómo funciona',
    lead: 'Cuatro pasos, y solo el tercero tarda algo.',
    steps: [
      {
        title: 'Responde al asistente',
        body: 'Doce preguntas en lenguaje llano, y el punto de partida ya responde la mayoría. La URL guarda la elección, así que puedes mandar el enlace a quien decide contigo antes de ejecutar nada.',
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
    stackHead: { tech: 'Tecnología', solves: 'Qué resuelve' },
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
    factoryTitle: 'De fábrica',
    factory: [
      {
        label: 'Acceso y sesión',
        text: 'Contraseña con Argon2, sesión en cookie httpOnly, refresh rotativo con detección de reutilización — un token robado tira la familia entera. Cambiar la contraseña cierra las demás sesiones.',
      },
      {
        label: 'Aislamiento en la base de datos',
        text: 'Row Level Security en Postgres, con el scope declarado por petición. Una tabla nueva con `tenantId` se protege sola: `SELECT app.apply_tenant_rls();` al final de la migración.',
      },
      {
        label: 'Invitaciones y onboarding',
        text: 'Token guardado solo como hash, como máximo una invitación pendiente por correo (índice único parcial) y el correo saliendo después del commit — nunca dentro de la transacción.',
      },
      {
        label: 'Cinco cambios por variable',
        text: 'Storage, correo, caché, cola y captcha detrás de interfaces: `STORAGE_DRIVER`, `MAIL_DRIVER`, `CACHE_DRIVER`, `QUEUE_DRIVER`, `CAPTCHA_DRIVER`.',
      },
      {
        label: 'Trabajo en segundo plano',
        text: 'BullMQ sobre Redis, con el worker en un proceso aparte y el tenant viajando junto al job. Sin él, el job vería una base de datos vacía y diría que fue bien.',
      },
      {
        label: 'Tests que lo demuestran',
        text: 'Unitarios con la base de datos simulada, e2e contra un Postgres real con el rol restringido, y el kit de UI del web en Vitest.',
      },
    ],
    decisionsTitle: 'La parte que nadie escribe',
    decisionsText:
      'Cada decisión de seguridad tiene un archivo en `docs/decisions/` y una sección en `CLAUDE.md`, con el motivo y lo que pasa si alguien la deshace. Es lo que un agente lee antes de escribir — y lo que tú lees seis meses después, cuando no recuerdas por qué está así.',
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
        a: 'La matriz de presets, íntegra: el CI genera un proyecto de cada preset, exige cero apariciones del nombre antiguo y ejecuta install, typecheck, unitarios y e2e. Más all-on, all-off y cada feature desactivada de forma aislada sobre el preset SaaS. Catorce features booleanas son 16.384 combinaciones, y el CI no prueba 16.384 proyectos: las combinaciones fuera de esa matriz están permitidas y no probadas — y el CLI lo dice, en una línea, sin dramatismo. Un boilerplate que promete garantías que no verifica es peor que uno que declara el límite.',
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
    brandNote:
      'Generador de proyectos a partir del boilerplate DontPanic. Tú eliges las partes; el comando genera el repositorio.',
    sourceNote:
      'Los números de esta página salen de `wc -l` y `grep` en el repositorio. Compruébalos.',
    license: 'MIT',
    productTitle: 'Producto',
    docsTitle: 'Documentación',
    contactTitle: 'Contacto',
    joke: 'Este pie de página fue montado por una inteligencia del tamaño de un planeta. Contiene cuatro listas de enlaces. Que no cunda el pánico: el resto del código es más interesante.',
  },
};
