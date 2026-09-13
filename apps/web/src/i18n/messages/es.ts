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
    lead: 'Elige lo que tu sistema necesita. Recibe un comando. El código llega con el nombre de tu proyecto en todo —paquetes, base de datos, variables de entorno— y con las decisiones difíciles ya tomadas como toca.',
    nameCta: 'Empezar',
    ctaNote: 'Diez preguntas en lenguaje llano. Puedes saltarte cualquiera.',
    commandLabel: 'Comando del preset por defecto',
    commandNote: 'Necesita Node 24 y pnpm.',
    ctaProof: 'Ver los cinco errores',
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

  cta: {
    title: 'Diez preguntas. Un comando al final.',
    text: 'Una pregunta por pantalla, en lenguaje llano, con lo que cambia en el sistema escrito debajo. Nada de catorce interruptores de golpe.',
    note: 'sin registro · puedes volver en cualquier paso',
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
        text: 'Avatar y adjuntos guardados fuera de la base de datos, detrás del port de storage: S3, MinIO, R2 o disco local, intercambiables con `STORAGE_DRIVER`.',
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
    whatChangesLabel: 'Qué cambia en tu sistema',
    steps: {
      name: {
        eyebrow: 'Nombre',
        question: '¿Cómo se va a llamar tu sistema?',
        help: 'Puede ser el nombre del producto o el de la empresa. Todo lo demás sale de ahí: la carpeta, el paquete, la base de datos y hasta el usuario que crea Postgres. Las formas derivadas aparecen aquí abajo mientras escribes.',
        whatChanges:
          'El nombre entra en 531 sitios, en tres cajas distintas: paquete, scope de pnpm, nombre de base de datos, prefijo de variable de entorno, bucket, y el SQL que crea el rol restringido de Postgres. El CI demuestra que no quedó ninguno: genera con un nombre de prueba y exige cero apariciones del antiguo en un `grep -ri`.',
      },
      preset: {
        eyebrow: 'Punto de partida',
        question: '¿Cuál de estos se parece más a lo que vas a construir?',
        help: 'Esto solo responde las siguientes preguntas por ti. Nada queda fijado: si una respuesta no encaja, cámbiala en su paso o en la revisión del final.',
        whatChanges:
          'El punto de partida solo rellena las respuestas siguientes. El CI prueba la matriz de los cuatro íntegra: genera un proyecto de cada uno, instala, comprueba tipos y ejecuta unitarios y e2e. Fuera de ella, la combinación está permitida y no probada — y el CLI lo dice, en una línea.',
      },
      tenancy: {
        eyebrow: 'Empresas',
        question:
          '¿Tu sistema va a atender a varias empresas distintas, cada una viendo solo sus propios datos?',
        help: 'Es la diferencia entre «el cliente A vio el dato del cliente B» y «la base de datos rechazó la fila antes de que la aplicación se enterara».',
        whatChanges:
          "La separación es de Postgres, no de la aplicación: cada petición declara su scope con `SET LOCAL` dentro de la transacción, y las políticas de Row Level Security comparan contra `current_setting('app.current_tenant_id', true)`. Sin scope, la comparación nunca es verdadera: el resultado llega vacío, nunca de la empresa equivocada. Una tabla nueva con `tenantId` se protege sola: `SELECT app.apply_tenant_rls();` al final de la migración.",
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
        help: 'Es la diferencia entre despertarte con mil cuentas de prueba y tener que crear a cada persona a mano. Quién puede crear una cuenta es la decisión que más cambia tu producto — y la que peor sale cuando se deja para después.',
        whatChanges:
          "La invitación guarda solo el SHA-256 del token: una base de datos filtrada no da un enlace utilizable. Un índice único parcial (`WHERE status = 'PENDING'`) permite como máximo una invitación viva por correo y por empresa, y cierra la carrera de dos admins invitando al mismo compañero en el mismo instante. El correo sale después del commit: dentro de la transacción, un rollback entregaría un enlace válido a una empresa que no existe.",
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
        help: 'Es la diferencia entre una contraseña más que tu usuario puede olvidar y un botón que ya usa en todas partes. A cambio, cada proveedor pide una clave que creas en su sitio.',
        whatChanges:
          'La cuenta se reconoce por el `providerAccountId` inmutable, con `@@unique([provider, providerAccountId])` — nunca por el correo, que se recicla cuando alguien se va de la empresa. Una dirección que el proveedor no marcó como verificada no vincula nada: el callback devuelve `unverified_email`. La lista de `OAUTH_PROVIDERS` y la del web tienen que coincidir, o el botón de más da 404; el generador escribe los dos lados.',
        choices: {
          yes: {
            label: 'Sí, quiero el botón',
            help: 'Google y GitHub activados, Apple disponible. Las claves las creas en la consola de cada uno y las pegas en el `.env`.',
          },
          no: {
            label: 'No, solo correo y contraseña',
            help: 'El código de los proveedores sale del proyecto: menos cosas que mantener. Para recuperarlo, genera otra vez con el inicio de sesión social activado.',
          },
        },
      },
      twoFactor: {
        eyebrow: 'Segundo factor',
        question: '¿Las personas deben poder exigir un código del móvil para entrar?',
        help: 'Es la diferencia entre «le robaron la contraseña» y «le robaron la contraseña y no entraron». La persona registra una app de autenticación una vez y luego escribe seis dígitos cuando el sistema se lo pide.',
        whatChanges:
          'El segundo factor vale en toda puerta de entrada, incluido el inicio de sesión social: el callback no emite sesión, entrega un ticket en la cookie `dp_2fa_ticket` — cinco minutos, quemado tras unos pocos intentos fallidos — y la sesión real solo nace después de los seis dígitos. Vienen códigos de recuperación de un solo uso, y `TWO_FACTOR_REQUIRED=true` pasa a exigir el factor a todo el mundo.',
        choices: {
          yes: {
            label: 'Sí, quiero segundo factor',
            help: 'Cada persona lo activa en su propia cuenta, con códigos de recuperación por si pierde el móvil. Para exigirlo a todo el mundo, el proyecto ya trae `TWO_FACTOR_REQUIRED`.',
          },
          no: {
            label: 'Ahora no',
            help: 'Entrar es solo contraseña. Se puede activar después — pero generando el proyecto de nuevo, porque responder no aquí elimina el código del segundo factor.',
          },
        },
      },
      languages: {
        eyebrow: 'Idiomas',
        question: '¿El sistema va a hablar más de un idioma?',
        help: 'Esto es sobre el producto que vas a generar, no sobre esta página.',
        whatChanges:
          'Cada idioma es un archivo de mensajes en ambos lados, API y web. Un test compara el conjunto de claves entre ellos y falla cuando falta una — que es exactamente como una pantalla aparece en inglés en medio del español, en producción.',
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
        help: 'Es la diferencia entre cobrar por plan y confiar en que nadie abuse. Es lo que separa un plan básico de uno avanzado dentro del propio sistema.',
        whatChanges:
          'El límite se comprueba en el momento que consume la plaza — la aceptación de la invitación —, dentro de la misma transacción que crea el usuario, con `pg_advisory_xact_lock` por empresa y por recurso. Contar antes de escribir no bloquea nada: dos aceptaciones en el mismo segundo pasarían del techo.',
        choices: {
          yes: {
            label: 'Sí, voy a vender planes',
            help: 'Cada empresa recibe un límite de personas y contadores por recurso, con las pantallas de uso y de cambio de plan.',
          },
          no: {
            label: 'No, todos iguales',
            help: 'Sin límites y sin contadores. A nadie se le corta por tamaño.',
          },
        },
      },
      files: {
        eyebrow: 'Archivos',
        question: '¿Las personas van a subir archivos: foto de perfil, adjuntos, documentos?',
        help: 'Cambia dónde se guardan los archivos y cómo llegan al navegador.',
        whatChanges:
          'El archivo sube por la API y va al almacenamiento por el port `StorageProvider`, que tiene tres operaciones: `putObject`, `deleteObject` y `getPublicUrl`. Cambiar S3 por MinIO, R2 o disco local es cambiar `STORAGE_DRIVER` en el `.env` — la lógica no sabe cuál está detrás.',
        choices: {
          yes: {
            label: 'Sí, van a subir archivos',
            help: 'Avatar y adjuntos guardados fuera de la base de datos. Funciona con Amazon S3, MinIO, Cloudflare R2 o el disco de la máquina, y cambiar entre ellos es una línea de configuración.',
          },
          no: {
            label: 'No hace falta',
            help: 'Sin subida de archivos y sin foto de perfil. Menos código, y ningún bucket que configurar.',
          },
        },
      },
      captcha: {
        eyebrow: 'Robots',
        question: '¿Las pantallas públicas necesitan protección contra robots?',
        help: 'Es la diferencia entre un robot probando mil contraseñas por minuto y que se pare en el primer rompecabezas. Vale para registro, login y recuperación de contraseña.',
        whatChanges:
          'El captcha entra en las rutas marcadas con `@RequireCaptcha`: registro, login, reenvío de verificación y recuperación de contraseña. `CAPTCHA_DRIVER` y `NEXT_PUBLIC_CAPTCHA_DRIVER` tienen que coincidir, o cada envío se convierte en un 400 por un token que la pantalla nunca tuvo forma de obtener — el generador escribe los dos. Un proveedor caído responde 503, no «que pase todo el mundo»: `CAPTCHA_FAIL_OPEN=false` es el valor por defecto.',
        choices: {
          yes: {
            label: 'Sí, quiero protección',
            help: 'Viene con Cloudflare Turnstile, y reCAPTCHA de Google como alternativa. Las claves las creas en el proveedor.',
          },
          no: {
            label: 'Ahora no',
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
    title: 'Cuatro pasos, y el cuarto es `pnpm dev`.',
    steps: [
      {
        title: 'Responde las preguntas',
        body: 'Aquí mismo, una por una. Cada una dice qué cambia en el código si respondes sí o no. Puedes saltártelas con «usar el recomendado».',
      },
      {
        title: 'Copia el comando',
        body: 'La última pantalla muestra un solo comando, con tus decisiones dentro. Hay enlace compartible, por si quieres discutir la configuración con el equipo antes.',
      },
      {
        title: 'Ejecútalo en la terminal',
        body: 'Baja el código, renombra todo a tu proyecto —paquetes, base de datos, variables, contenedores—, levanta Postgres y Redis en Docker y siembra la base de datos.',
      },
      {
        title: '`pnpm dev`',
        body: 'API en `:4201`, web en `:4200`, correo capturado por Mailpit en `:4207`. El acceso del admin sembrado está en el README.',
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
