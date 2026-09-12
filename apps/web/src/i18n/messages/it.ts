import type { Messages } from './types';

export const it: Messages = {
  meta: {
    title: 'DontPanic — il boilerplate SaaS con le decisioni di sicurezza già prese',
    description:
      'Genera un SaaS full-stack in NestJS e Next.js con multi-tenancy garantito da Row Level Security, 2FA, inviti e login social. Le decisioni che una IA sbaglia in silenzio sono già prese, documentate e testate.',
  },

  nav: {
    skipToContent: 'Vai al contenuto',
    proof: 'La prova',
    configure: 'Comporre il comando',
    how: 'Come funziona',
    inside: 'Cosa c’è dentro',
    faq: 'Domande',
    repo: 'Repository',
    languageLabel: 'Lingua',
    themeLabel: 'Tema',
    themeLight: 'Chiaro',
    themeDark: 'Scuro',
    themeSystem: 'Sistema',
  },

  hero: {
    mastheadLabel: 'Don’t Panic',
    title:
      'Le decisioni di sicurezza che una IA sbaglia in silenzio sono già prese, documentate e testate.',
    lead: 'DontPanic è un boilerplate SaaS full-stack — NestJS, Next.js, Prisma, Postgres con Row Level Security vero. Ogni scelta di sicurezza è già stata fatta, è spiegata nel `CLAUDE.md` che il tuo agente legge prima della prima riga, e ha un test che fallisce quando qualcuno la disfa. Effetto collaterale: il contesto va nel tuo prodotto invece di riscoprire come si fa la rotazione dei refresh token.',
    commandLabel: 'Comando del preset predefinito',
    commandNote:
      'Servono Node 24 e pnpm. Per scegliere le parti, componi il tuo comando più sotto.',
    ctaConfigure: 'Comporre il mio comando',
    ctaProof: 'Vedere gli errori che evita',
    facts: [
      {
        value: '78.533',
        label: 'righe di TypeScript che compilano, passano il lint e passano i test',
      },
      {
        value: '5',
        label: 'risorse sostituibili con una variabile d’ambiente, senza toccare la logica',
      },
      {
        value: '2 min',
        label: 'dall’npx a `pnpm dev`, con il database migrato e l’admin creato dal seed',
      },
    ],
  },

  proof: {
    title: 'La prova',
    lead: 'Niente di tutto questo è ipotetico. Sono errori che producono codice che compila, passa i test e passa la code review — e che salta fuori mesi dopo, su un utente che non sei tu. Ognuno è già deciso nel boilerplate, con la ragione scritta accanto alla decisione.',
    labels: {
      surface: 'Dove vive',
      code: 'Il codice che passa la review',
      whyItPasses: 'Perché nessuno lo vede',
      whatHappens: 'Cosa succede',
      ours: 'In DontPanic',
    },
    items: [
      {
        id: 'oauth-identity',
        title: 'Collegare l’identità social tramite l’indirizzo e-mail',
        whyItPasses:
          'Compila, e funziona a ogni login nel tuo ambiente di sviluppo. Il test — che ha un solo utente — passa. La review approva, perché è così che fa la maggior parte dei tutorial su OAuth.',
        whatHappens:
          'Gli indirizzi aziendali vengono riciclati. Ana se ne va, le risorse umane assegnano `ana@azienda.it` al nuovo assunto, lui entra con Google ed **eredita l’account di Ana**: storico, permessi, tutto. Nessuno ha forzato niente — il sistema ha fatto esattamente quello che c’era scritto.',
        ours: 'La chiave dell’identità è il `providerAccountId` immutabile — `sub` su Google e Apple, l’id numerico su GitHub — con `@@unique([provider, providerAccountId])`. La colonna `email` di `oauth_accounts` serve per la visualizzazione e può essere vecchia. E un indirizzo che il provider non ha marcato come verificato non collega nulla: il callback restituisce `unverified_email`.',
      },
      {
        id: 'oauth-2fa',
        title: 'Emettere la sessione nel callback OAuth senza controllare il secondo fattore',
        whyItPasses:
          'Il `TwoFactorGateGuard` esiste ed è registrato. Verifica che la 2FA sia *abilitata* — mai che *questa* sessione ci sia passata. Il test della 2FA copre il flusso con password, e il flusso con password è corretto.',
        whatHappens:
          'Chi ha attivato TOTP di proposito scopre che «entra con Google» non chiede mai il codice. Il login social diventa **strettamente più debole** che digitare la password, e il secondo fattore diventa opzionale per chi sa quale bottone premere.',
        ours: 'Se `twoFactorEnabled`, il callback non emette sessione: crea lo stesso ticket che creerebbe `POST /auth/login`, lo consegna in un cookie da cinque minuti e a uso singolo, e reindirizza a `/login?twofactor=1`. Cookie e non query string — la query string finisce nella cronologia del browser, nell’header `Referer` e nei log di ogni proxy sul percorso.',
      },
      {
        id: 'trust-proxy',
        title: 'Attivare `trustProxy: true` per risolvere un 429 indebito',
        whyItPasses:
          'Risolve il sintomo subito: il rate limit torna a distinguere i client, il 429 scompare e il deploy esce con il problema risolto. Nessun test lo prende, perché un test non falsifica header.',
        whatHappens:
          "Fidarsi di tutti gli hop significa accettare qualunque `X-Forwarded-For` — e `X-Forwarded-For` **non** è nella lista dei forbidden headers di fetch, quindi il browser può impostarlo. Un `fetch('/api/auth/login', { headers: { 'x-forwarded-for': ipCasuale() } })` ottiene un secchio nuovo a ogni richiesta, e il rate limit del login smette di esistere. Contare gli hop da sinistra finisce allo stesso punto: il load balancer fa append, quindi in `X-Forwarded-For: <falsificato>, <reale>` il primo elemento è quello che ha scritto l’attaccante.",
        ours: '`CLIENT_IP_HEADER` e `CLIENT_IP_TRUSTED_HOPS`, contati **da destra**. Il BFF cancella ogni header di forwarding che arriva dal browser e ne riscrive uno solo, sanificato. Il valore predefinito è zero hop: non manda nessun IP e tratta tutti quelli dietro al proxy come un unico client — limita troppo, e non è aggirabile.',
      },
      {
        id: 'guard-scope',
        title: 'Leggere il database in un guard, prima che lo scope del tenant esista',
        whyItPasses:
          'Nest esegue i guard **prima** degli interceptor. Quando il guard gira, l’interceptor che apre la transazione con `SET LOCAL` non è ancora girato: `prisma.db` ricade sul client base, senza scope, e la policy di RLS restituisce zero righe. Non solleva errori. Copertura verde, 200 OK, niente nei log.',
        whatHappens:
          'Il guard conclude «questo utente non ha la 2FA» e **lascia passare**. È esattamente così che il `TwoFactorGateGuard` di DontPanic è diventato un no-op silenzioso — il bug è nella storia del repository, e la lezione è stata scritta accanto.',
        ours: 'Un guard che legge il database apre uno scope proprio, con `this.prisma.forTenant(tenantId, …)` o `asPlatform`, e **fallisce chiuso** quando la lettura torna vuota. La regola, con la storia del bug di fianco, è nella sezione multi-tenancy del `CLAUDE.md` — il file che il tuo agente legge prima di scrivere il guard successivo.',
      },
      {
        id: 'db-owner',
        title: 'Puntare `DATABASE_URL` al proprietario del database',
        whyItPasses:
          'È quello che dice il tutorial ed è l’utente che crea il `docker compose` di Postgres. Peggio: i tuoi test di isolamento passano, perché esercitano il filtro applicativo — che c’è, ed è corretto.',
        whatHappens:
          'Un SUPERUSER — e qualunque role con `BYPASSRLS` — ignora Row Level Security anche con `FORCE ROW LEVEL SECURITY`. **Ogni policy diventa decorazione**, e l’isolamento tra aziende torna a dipendere dal fatto che nessuna query dimentichi mai un `where`, per sempre, in tutto il codice futuro.',
        ours: 'L’applicazione si collega con un role ristretto, creato `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`; il proprietario vive solo in `DATABASE_ADMIN_URL`, per `migrate` e `seed`. L’API **rifiuta di partire** in produzione se rileva un superuser. E la suite e2e gira con il role ristretto — è questo che fa sì che `tenant-isolation.e2e-spec.ts` dimostri qualcosa invece di ripetere l’intenzione del codice.',
      },
    ],
    moreTitle: 'Altri tre, con lo stesso schema',
    more: [
      'Spedire l’e-mail di invito dentro la transazione. Un rollback consegna un link valido che punta a un’azienda che non esiste, e non lascia nessun record che il supporto possa trovare. Qui `issue()` scrive nel `tx` del chiamante e l’invio avviene dopo il commit.',
      'Rispondere «questo account usa il login social» a un login con password. È un oracolo: cronometrando il form si enumera esattamente quali indirizzi non hanno password. Qui l’errore è lo stesso generico di sempre e paga lo stesso costo di Argon2 — `verifyPassword(null, …)` verifica contro l’hash di qualcosa che nessuno conosce prima di restituire `false`.',
      'Contare i posti prima di scrivere l’utente. Due richieste simultanee leggono «ne resta uno» ed entrambe creano: contare non blocca niente. Qui il `pg_advisory_xact_lock`, per azienda e per risorsa, sta nella stessa transazione della scrittura.',
    ],
  },

  configurator: {
    title: 'Componi il comando',
    lead: 'Qui non si genera nulla. Questa pagina compone una stringa — il generatore vive nel CLI, versionato insieme al template, ed è lui che decide cosa entra nel tuo repository. Nessun server, nessuna coda di build, nessuno zip che scada in una cache.',

    nameLegend: 'Il nome del progetto',
    nameLabel: 'Nome',
    namePlaceholder: 'Acme Corp',
    nameHelp: 'Come chiami il prodotto. Tutto il resto è derivato da qui.',
    slugLabel: 'Slug',
    slugHelp: 'Directory, pacchetto npm e identificatori. Minuscole, cifre e trattino.',
    slugDerived: 'derivato dal nome',
    slugCustom: 'personalizzato',
    slugReset: 'Torna al derivato',
    applySuggestion: 'Usa',

    derivedTitle: 'Cosa diventa quel nome',
    derivedNote:
      'Il rename non è un `sed` sul nome della cartella: passa dall’SQL che crea il role di Postgres, dallo scope di pnpm e da nomi di database e di bucket allo stesso tempo — dove l’SQL rifiuta il trattino e S3 rifiuta il trattino basso.',
    derivedLabels: {
      dbName: 'database di dev',
      dbNameE2e: 'database e2e',
      dbRole: 'role ristretto di Postgres',
      npmScope: 'scope di pnpm',
      seedAdminEmail: 'admin del seed',
      bucket: 'bucket di object storage',
      screaming: 'prefisso di env',
      pascal: 'classi e tipi',
    },

    presetLegend: 'Punto di partenza',
    presetNote:
      'Un preset è solo un insieme di valori predefiniti. Tutto quello che segue resta modificabile, e il comando mostra soltanto ciò che hai cambiato.',
    presetReset: 'Scarta le modifiche a questo preset',

    featuresLegend: 'Cosa entra',
    featuresNote:
      'Il generatore sottrae: il template è il repository reale, che compila e gira, e spegnere una feature cancella i suoi file. Nessun `{{#if}}` nel codice.',
    groups: {
      access: 'Accesso',
      tenancy: 'Aziende',
      ops: 'Esercizio',
      extras: 'Extra',
    },

    driversLegend: 'Adapter',
    driversNote:
      'Cambiare fornitore è cambiare una variabile d’ambiente — il dominio dipende dal port, non dal fornitore. Queste scelte finiscono nel `.env` del progetto generato.',
    driverLabels: {
      db: 'Database',
      storage: 'Storage',
      mail: 'E-mail',
      cache: 'Cache',
      queue: 'Coda',
      captcha: 'Captcha',
    },

    oauthLegend: 'Provider di login social',
    oauthNote:
      'API e web devono elencare gli stessi nomi, altrimenti il bottone in più restituisce 404. Il generatore scrive entrambi i lati.',

    localesLegend: 'Lingue del progetto',
    localesNote:
      'Le lingue del prodotto che stai per generare. Non hanno relazione con la lingua di questa pagina.',
    defaultLocaleLabel: 'Lingua predefinita',

    optionsLegend: 'Alla generazione',
    optionLabels: {
      git: 'Eseguire `git init` e il primo commit',
      install: 'Eseguire `pnpm install` alla fine',
      docker: 'Emettere `docker-compose.yml` con i servizi usati',
      force: 'Sovrascrivere la directory di destinazione se esiste già',
    },

    issuesTitle: 'Combinazione incoerente',
    issueError: 'Impedisce la generazione',
    issueWarning: 'Permesso, con riserva',
    noIssues: 'Combinazione coerente.',

    commandTitle: 'Il tuo comando',
    commandNote: 'Questa è la configurazione. Non vive in nessun altro posto.',
    copy: 'Copia il comando',
    copied: 'Comando copiato',
    copyFailed: 'Impossibile copiare — seleziona il testo e copialo',
    flagsTitle: 'Le flag',
    flagsNote: 'Solo ciò che differisce dal preset. Rimuovine una per tornare al suo valore.',
    removeFlag: 'Rimuovi',
    shareTitle: 'Link di questa configurazione',
    shareNote:
      'La configurazione è nell’URL, leggibile. Mandalo su Slack e il collega capisce cos’è prima di aprirlo.',
    shareCopy: 'Copia il link',
    shareCopied: 'Link copiato',
    blockedByName: 'Correggi il nome prima di usare il comando.',

    features: {
      multiTenant: {
        label: 'Multi-tenancy',
        text: 'Isolamento tra aziende in Postgres, tramite Row Level Security. Spento, l’RLS resta: il progetto nasce con un tenant fisso e senza selettore di azienda nell’interfaccia.',
      },
      twoFactor: {
        label: '2FA con TOTP',
        text: 'Secondo fattore con app di autenticazione, codici di backup e ticket a uso singolo tra la password e la sessione.',
      },
      oauth: {
        label: 'Login social',
        text: 'Google, Apple e GitHub, attivabili per provider. Identità tramite `providerAccountId`, e il callback rispetta la 2FA.',
      },
      invitations: {
        label: 'Inviti',
        text: 'La porta verso un’azienda che esiste già: l’invitato sceglie la propria password, e il clic sul link è ciò che prova l’indirizzo.',
      },
      publicSignup: {
        label: 'Registrazione pubblica',
        text: 'Il form che permette a uno sconosciuto di creare un’azienda e diventarne il primo admin. Spento, restano l’invito e il seed.',
      },
      files: {
        label: 'Upload di file',
        text: 'Avatar e allegati tramite URL pre-firmato, dietro il port di storage: S3, MinIO, R2 o disco locale.',
      },
      platform: {
        label: 'Pannello di piattaforma',
        text: 'L’area SUPERADMIN su `/platform`: crea aziende, invita il primo admin e attraversa i tenant con uno scope proprio.',
      },
      audit: {
        label: 'Audit trail',
        text: 'Chi ha fatto cosa, scritto fuori dalla transazione della richiesta per non sparire con un rollback.',
      },
      plans: {
        label: 'Piani e limiti',
        text: '`maxUsers` e contatori con nome per azienda, con advisory lock per risorsa — contare prima di scrivere non blocca niente.',
      },
      i18n: {
        label: 'Internazionalizzazione',
        text: 'Messaggi per lingua su entrambi i lati, con test di parità delle chiavi tra i file di traduzione.',
      },
      queue: {
        label: 'Coda di job',
        text: 'BullMQ su Redis, con il worker in un processo separato. Il tenant viaggia col job: senza di lui l’RLS restituisce zero righe e il job mente dicendo di essere andato bene.',
      },
      captcha: {
        label: 'Captcha',
        text: 'Turnstile o reCAPTCHA sulle rotte che indovinano segreti, con fail-closed quando il provider cade.',
      },
      easterEggs: {
        label: 'Battute della Guida',
        text: 'La voce di Marvin ai margini, `GET /teapot` che risponde 418 e il Konami nella dashboard. Mai in un messaggio di sicurezza.',
      },
      scaffolding: {
        label: 'Blocchi di costruzione',
        text: 'Griglia di record, card di dashboard e `sequence.service.ts`: pronti, testati e importati da nulla — il punto di partenza per le tue schermate CRUD.',
      },
    },

    presets: {
      minimal: {
        label: 'Minimo',
        summary: 'Password, multi-tenancy con RLS e la suite di test. Nient’altro.',
        audience:
          'Per chi costruirà l’intero prodotto e vuole solo lo strato di accesso già dimostrato.',
      },
      saas: {
        label: 'SaaS',
        summary:
          'Multi-azienda davvero: inviti, piani con limite di posti, 2FA, login social e coda durevole.',
        audience:
          'Per un prodotto in abbonamento, con più di un’azienda cliente nello stesso database.',
      },
      complete: {
        label: 'Completo',
        summary: 'Il boilerplate intero, senza sottrarre nulla — Marvin incluso.',
        audience: 'Per vedere tutto funzionare prima di decidere cosa rimuovere.',
      },
      internal: {
        label: 'Interno',
        summary: 'Una sola azienda e nessuna porta pubblica: si entra su invito, con 2FA e audit.',
        audience:
          'Per uno strumento di team, un back office o un ERP che non avrà mai registrazione aperta.',
      },
    },
  },

  how: {
    title: 'Come funziona',
    lead: 'Quattro passi, e solo il terzo richiede tempo.',
    steps: [
      {
        title: 'Scegli le parti',
        body: 'Un preset come punto di partenza e i toggle sopra. L’URL conserva la scelta, così puoi mandare il link a chi decide con te prima di eseguire qualunque cosa.',
      },
      {
        title: 'Copia il comando',
        body: 'La pagina non genera niente: compone la stringa. È il CLI, versionato insieme al template, che decide il contenuto del tuo repository — per questo la stessa ricetta produce lo stesso progetto oggi e tra due anni.',
      },
      {
        title: 'Esegui l’npx',
        body: 'Il generatore copia il template, cancella quello che non hai chiesto, pota lo schema di Prisma, compone la baseline SQL, sostituisce il nome in ogni forma, scrive il `.env` con segreti generati ed esegue `git init`.',
      },
      {
        title: '`pnpm dev`',
        body: 'Con Docker su, il database migrato e l’admin creato dal seed. Due minuti dopo l’`npx` stai guardando la schermata di login del tuo prodotto.',
      },
    ],
    renameTitle: 'Il rename è dimostrato, non riletto',
    renameLead:
      'Il nome del progetto compare in posti che nessuna revisione umana copre. Il cancello è meccanico: la CI genera con un nome di prova, esegue `grep -ri` pretendendo zero occorrenze del nome vecchio e solo allora installa, controlla i tipi ed esegue tutta la suite, e2e compresa.',
    renameItems: [
      '531 occorrenze in 199 file, in tre diverse forme di maiuscole.',
      'Dentro l’SQL che crea il role ristretto di Postgres, dove una sostituzione parziale produce un role senza GRANT — e il sintomo è «zero righe», non un errore.',
      'In nomi di database e di bucket insieme, dove l’SQL rifiuta il trattino e S3 rifiuta il trattino basso.',
    ],
  },

  inside: {
    title: 'Cosa c’è dentro',
    lead: 'Il template è il repository reale di DontPanic, al tag che il generatore dichiara. Non è una versione dimostrativa: è il codice che fa girare la propria CI.',
    stackTitle: 'Lo stack',
    stackRoles: [
      'API, con Fastify sotto',
      'Web, con il BFF che parla con l’API al posto del browser',
      'Database, con driver adapter e Row Level Security',
      'Contratti di richiesta e risposta, condivisi tra API e web',
      'Password e sessione, con refresh rotativo e rilevamento del riuso',
      'Coda durevole, con il worker in un processo separato',
      'Test: unitari, di componente ed e2e',
      'Monorepo, con cache di build',
    ],
    portsTitle: 'Ports & Adapters',
    portsLead:
      'Cinque risorse dove cambiare fornitore significa cambiare una variabile d’ambiente. Il dominio dipende dall’interfaccia; il fornitore è un dettaglio sostituibile.',
    portsHead: { resource: 'Risorsa', adapters: 'Adapter', env: 'Variabile' },
    portsResources: ['File', 'E-mail', 'Cache', 'Job', 'Captcha'],
    numbersTitle: 'I numeri',
    numbers: [
      { value: '78.533', label: 'righe di TypeScript' },
      { value: '~99%', label: 'di statement coperti nell’API, con soglie imposte in CI' },
      { value: '100%', label: 'di statement coperti nel kit di UI del web' },
      { value: '531', label: 'occorrenze del nome sostituite in 199 file, provate con grep' },
    ],
  },

  faq: {
    title: 'Domande',
    lead: 'Quelle che meritano una risposta onesta prima di eseguire il comando.',
    items: [
      {
        q: 'Cosa viene testato, esattamente?',
        a: 'La matrice dei preset, per intero: la CI genera un progetto per ogni preset, pretende zero occorrenze del nome vecchio ed esegue install, typecheck, unitari ed e2e. Più all-on, all-off e ogni feature spenta singolarmente sopra il preset SaaS. Tredici feature booleane sono 8192 combinazioni, e la CI non testa 8192 progetti: le combinazioni fuori da quella matrice sono permesse e non testate — e il CLI lo dice, in una riga, senza drammi. Un boilerplate che promette garanzie che non verifica è peggio di uno che dichiara il limite.',
      },
      {
        q: 'E se non volessi il multi-tenancy?',
        a: '`--no-multi-tenant` lo nasconde, non lo strappa. Il progetto nasce con un tenant fisso creato dal seed, lo scope sempre aperto su di lui, e il selettore di azienda, il pannello `/platform` e il SUPERADMIN fuori dall’interfaccia. Row Level Security resta, e resta dimostrato da `tenant-isolation.e2e-spec.ts`; il costo è una colonna indicizzata e un predicato che Postgres risolve con una costante. Strapparlo significherebbe mantenere due versioni di tutto l’accesso ai dati — e la versione senza RLS è proprio quella che non possiamo dimostrare sicura.',
      },
      {
        q: 'Posso aggiornare dopo?',
        a: 'Il progetto generato è tuo, non una dipendenza: non esiste un `pnpm update` che porti dentro le novità di DontPanic, ed è voluto — modificherai quel codice il primo giorno. Quello che c’è è la riproducibilità: la stessa ricetta con la stessa versione del template genera lo stesso progetto oggi e tra due anni, quindi puoi rigenerare e confrontare i diff quando vuoi adottare qualcosa dall’upstream.',
      },
      {
        q: 'E la licenza?',
        a: 'MIT, sul generatore e sul template. Quello che esce dall’`npx` è tuo: nessuna attribuzione obbligatoria, nessuna royalty, nessuna clausola che cambia valore se il tuo prodotto cresce. Puoi chiudere il codice di ciò che generi.',
      },
      {
        q: 'Mi serve Docker?',
        a: 'Per eseguire la suite di test, no: gli adapter `memory`, `console` e `local` esistono proprio perché funzioni senza niente in piedi. Per sviluppare seriamente ti serve un Postgres — e il `docker compose` del progetto tira su Postgres, Redis, MinIO e Mailpit su porte che non collidono con le tue. Se hai già quei servizi, punta il `.env` su di loro e genera con `--no-docker`.',
      },
      {
        q: 'Funziona con Claude Code, Cursor e simili?',
        a: 'Il progetto generato porta un `CLAUDE.md` potato sulle feature che hai scelto — solo le sezioni che esistono nel tuo codice. È lì che stanno le decisioni di sicurezza e la ragione di ciascuna, nella forma che un agente legge prima di scrivere. L’effetto collaterale è probabilmente ciò che ti ha portato qui: il contesto va nel tuo prodotto invece di riscoprire come si fa la rotazione dei refresh token.',
      },
    ],
  },

  footer: {
    tagline: 'Un boilerplate SaaS che ha già preso le decisioni noiose.',
    repo: 'Codice su GitHub',
    license: 'MIT',
    sourceNote:
      'I numeri di questa pagina vengono da `wc -l` e `grep` sul repository. Controllali.',
    marvin:
      'Ed eccomi qui, con un cervello grande come un pianeta, a comporre una riga di comando. Lo chiamano soddisfazione sul lavoro.',
  },
};
