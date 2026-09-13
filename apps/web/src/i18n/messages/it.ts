import type { Messages } from './types';

export const it: Messages = {
  meta: {
    title: 'DontPanic — il boilerplate SaaS con le decisioni di sicurezza già prese',
    description:
      'Genera un progetto nuovo — un SaaS full-stack in NestJS e Next.js, da zero — con multi-tenancy tramite Row Level Security, 2FA, inviti e login social. Le decisioni che una IA sbaglia in silenzio sono già prese, documentate e testate.',
  },

  nav: {
    skipToContent: 'Vai al contenuto',
    proof: 'La prova',
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
      'Comincia un SaaS nuovo con le decisioni di sicurezza già prese — quelle che una IA sbaglia in silenzio.',
    lead: 'Rispondi a dieci domande, copi un comando e ricevi **un repository nuovo**: vuoto del tuo prodotto e pieno di tutto il resto — login, 2FA, inviti, aziende isolate dentro il database, coda di job e test. Con il nome del tuo progetto ovunque: pacchetti, database, variabili d’ambiente.',
    notThis:
      'Non è un analizzatore: DontPanic **non guarda il codice che hai già**. È il punto di partenza di un progetto da zero.',
    nameCta: 'Inizia',
    ctaNote: 'Dieci domande in lingua corrente. Puoi saltarne qualunque.',
    commandLabel: 'Comando del preset predefinito',
    commandNote: 'Servono Node 24 e pnpm.',
    ctaProof: 'Vedere le cinque decisioni',
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

  cta: {
    title: 'Dieci domande. Un comando alla fine.',
    text: 'Una domanda per schermata, in lingua corrente, con quello che cambia nel sistema scritto sotto. Niente quattordici interruttori tutti insieme.',
    note: 'senza registrazione · si può tornare indietro in ogni passo',
  },

  proof: {
    eyebrow: 'Cinque errori, già decisi qui',
    title: 'La prova',
    lead: 'Niente di tutto questo è ipotetico. Sono errori che producono codice che compila, passa i test e passa la code review — e che salta fuori mesi dopo, su un utente che non sei tu. Non siamo noi a trovarli nel tuo codice: **ognuno è già deciso nel codice che ricevi**, con la ragione accanto alla decisione e il test nominato sotto.',
    labels: {
      whatHappens: 'Cosa succede',
      ours: 'In DontPanic',
      seal: 'coperto da test',
      cases: 'casi',
    },
    items: [
      {
        id: 'oauth-identity',
        eyebrow: 'Login social',
        title: 'L’identità social collegata tramite l’indirizzo e-mail',
        whatHappens:
          'Gli indirizzi aziendali vengono riciclati. Ana se ne va, le risorse umane assegnano `ana@azienda.it` al nuovo assunto, lui entra con Google ed **eredita l’account di Ana**: storico, permessi, tutto. Nessuno ha forzato niente — il sistema ha fatto esattamente quello che c’era scritto, e il test, che aveva un solo utente, è passato.',
        ours: 'La chiave dell’identità è il `providerAccountId` immutabile — `sub` su Google e Apple, l’id numerico su GitHub — con `@@unique([provider, providerAccountId])`. La colonna `email` di `oauth_accounts` serve per la visualizzazione e può essere vecchia. E un indirizzo che il provider non ha marcato come verificato non collega nulla: il callback restituisce `unverified_email`.',
      },
      {
        id: 'oauth-2fa',
        eyebrow: 'Secondo fattore',
        title: 'La sessione emessa nel callback OAuth senza controllare il secondo fattore',
        whatHappens:
          'Chi ha attivato il codice a sei cifre di proposito scopre che «entra con Google» non lo chiede mai. Il login social diventa **strettamente più debole** che digitare la password, e il secondo fattore diventa opzionale per chi sa quale bottone premere. Il `TwoFactorGateGuard` non lo prende: verifica che la 2FA sia *abilitata*, mai che *questa* sessione ci sia passata.',
        ours: 'Se `twoFactorEnabled`, il callback non emette sessione: crea lo stesso ticket che creerebbe `POST /auth/login`, lo consegna in un cookie da cinque minuti e a uso singolo, e reindirizza a `/login?twofactor=1`. Cookie e non query string — la query string finisce nella cronologia del browser, nell’header `Referer` e nei log di ogni proxy sul percorso.',
      },
      {
        id: 'rls-where',
        eyebrow: 'Isolamento',
        title: 'L’isolamento tra aziende affidato al `where` dell’applicazione',
        whatHappens:
          'La garanzia è diventata disciplina umana, ripetuta in ogni query, da tutti quelli che entreranno nel team dopo di te. Il primo `findUnique({ where: { id } })` per chiave primaria — scritto di fretta, o da un agente che non conosceva la regola — restituisce la riga di un’altra azienda. E non fallisce: **restituisce dati, con stato 200**.',
        ours: 'L’isolamento è di Postgres, non dell’applicazione: Row Level Security, con lo scope dichiarato da `SET LOCAL` dentro la transazione della richiesta. Senza alcuno scope, `current_setting(…, true)` restituisce NULL e la policy non combacia — dimenticare lo scope dà un risultato **vuoto**, mai la riga dell’azienda sbagliata. Il filtro nell’applicazione resta, come comodità; la garanzia è quella sotto.',
      },
      {
        id: 'password-reset',
        eyebrow: 'Sessioni',
        title: 'Il reset della password che non chiude le sessioni aperte',
        whatHappens:
          'La persona cambia la password proprio perché sospetta che qualcuno sia entrato. Il nuovo hash non invalida niente: il refresh token dell’intruso **continua a rinnovarsi da solo**, e lui resta dentro l’account molto dopo il cambio — indefinitamente, finché continua a usare il sistema.',
        ours: '`resetPassword` scrive la password nuova e consuma il token nella stessa transazione e poi, dopo il commit, chiama `revokeAllForUser`: ogni sessione esistente muore, registrata nell’audit come logout deliberato. Il refresh rotativo chiude il resto: un token vecchio ripresentato revoca l’intera famiglia.',
      },
      {
        id: 'db-owner',
        eyebrow: 'Database',
        title: 'La `DATABASE_URL` puntata al proprietario del database',
        whatHappens:
          'Un SUPERUSER — e qualunque role con `BYPASSRLS` — ignora Row Level Security anche con `FORCE ROW LEVEL SECURITY`. **Ogni policy diventa decorazione**, e l’isolamento torna a dipendere dal fatto che nessuna query dimentichi un `where`. Peggio: i tuoi test di isolamento passano, perché esercitano il filtro applicativo, che c’è ed è corretto.',
        ours: 'L’applicazione si collega con un role ristretto, creato `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`; il proprietario vive solo in `DATABASE_ADMIN_URL`, per `migrate` e `seed`. L’API **rifiuta di partire** in produzione se rileva un superuser. E la suite e2e gira con il role ristretto — è questo che fa sì che il test di isolamento dimostri qualcosa invece di ripetere l’intenzione del codice.',
      },
    ],
    moreTitle: 'Altri cinque, con lo stesso schema',
    more: [
      'Attivare `trustProxy: true` per far sparire un 429 indebito. Fidarsi di tutti gli hop significa accettare qualunque `X-Forwarded-For` — e il browser **può** impostarlo, perché non è nella lista dei forbidden headers di fetch: un secchio nuovo di rate limit a ogni richiesta. Qui l’IP è contato da destra, con `CLIENT_IP_TRUSTED_HOPS`, e il BFF cancella ogni header di forwarding che arriva dal browser.',
      'Leggere il database in un guard, prima che lo scope del tenant esista. Nest esegue i guard **prima** degli interceptor, quindi la policy di RLS restituisce zero righe, il guard conclude «questo utente non ha la 2FA» e lascia passare — senza errore e senza log. Qui un guard che legge il database apre uno scope proprio e fallisce chiuso.',
      'Spedire l’e-mail di invito dentro la transazione. Un rollback consegna un link valido che punta a un’azienda che non esiste, e non lascia nessun record che il supporto possa trovare. Qui `issue()` scrive nel `tx` del chiamante e l’invio avviene dopo il commit.',
      'Rispondere «questo account usa il login social» a un login con password. È un oracolo: cronometrando il form si enumera esattamente quali indirizzi non hanno password. Qui l’errore è lo stesso generico di sempre e paga lo stesso costo di Argon2 — `verifyPassword(null, …)` verifica contro l’hash di qualcosa che nessuno conosce prima di restituire `false`.',
      'Contare i posti prima di scrivere l’utente. Due richieste simultanee leggono «ne resta uno» ed entrambe creano: contare non blocca niente. Qui il `pg_advisory_xact_lock`, per azienda e per risorsa, sta nella stessa transazione della scrittura.',
    ],
  },

  configurator: {
    nameLabel: 'Nome',
    namePlaceholder: 'Acme Corp',
    nameHelp: 'Come chiami il prodotto. Tutto il resto è derivato da qui.',
    slugLabel: 'Slug',
    slugHelp: 'Directory, pacchetto npm e identificatori. Minuscole, cifre e trattino.',
    slugDerived: 'derivato dal nome',
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

    driverLabels: {
      db: 'Database',
      storage: 'Storage',
      mail: 'E-mail',
      cache: 'Cache',
      queue: 'Coda',
      captcha: 'Captcha',
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
    flagsNote: 'Solo ciò che differisce dal punto di partenza.',
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
        text: 'Avatar e allegati tenuti fuori dal database, dietro il port di storage: S3, MinIO, R2 o disco locale, scambiabili con `STORAGE_DRIVER`.',
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
        summary: 'Password, isolamento nel database e la suite di test. Nient’altro.',
        audience:
          'Per chi costruirà l’intero prodotto e vuole solo lo strato di accesso già dimostrato.',
      },
      saas: {
        label: 'SaaS',
        summary: 'Multi-azienda davvero: inviti, piani con limite di posti, 2FA e coda durevole.',
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

  wizard: {
    open: 'Componi',
    openHero: 'Componi il mio sistema',
    close: 'Chiudi',
    next: 'Continua',
    back: 'Indietro',
    finish: 'Vedi il comando',
    recommended: 'Usa il consigliato',
    progress: 'Passo {n} di {total}',
    yes: 'Sì',
    no: 'No',
    edit: 'Modifica',
    whatChangesLabel: 'Cosa cambia nel tuo sistema',
    steps: {
      name: {
        eyebrow: 'Nome',
        question: 'Come si chiamerà il tuo sistema?',
        help: 'Può essere il nome del prodotto o quello dell’azienda. Tutto il resto viene da lì: la cartella, il pacchetto, il database e perfino l’utente che Postgres crea. Le forme derivate compaiono qui sotto mentre scrivi.',
        whatChanges:
          'Il nome entra in 531 punti, in tre forme di maiuscole diverse: pacchetto, scope di pnpm, nome del database, prefisso delle variabili d’ambiente, bucket, e l’SQL che crea il role ristretto di Postgres. La CI dimostra che non ne è rimasto nessuno — genera con un nome di prova e pretende zero occorrenze del vecchio da un `grep -ri`.',
      },
      preset: {
        eyebrow: 'Punto di partenza',
        question: 'Quale di questi assomiglia più a ciò che stai per costruire?',
        help: 'Questo risponde soltanto alle domande successive al posto tuo. Niente resta bloccato: se una risposta non va, cambiala nel suo passo o nella revisione finale.',
        whatChanges:
          'Il punto di partenza si limita a riempire le risposte successive. La CI testa per intero la matrice dei quattro: genera un progetto per ciascuno, installa, controlla i tipi ed esegue unitari ed e2e. Fuori da lì la combinazione è permessa e non testata — e il CLI lo dice, in una riga.',
      },
      tenancy: {
        eyebrow: 'Aziende',
        question: 'Il tuo sistema servirà più aziende diverse, ognuna che vede solo i propri dati?',
        help: 'È la differenza tra «il cliente A ha visto il dato del cliente B» e «il database ha rifiutato la riga prima che l’applicazione se ne accorgesse».',
        whatChanges:
          "La separazione è di Postgres, non dell’applicazione: ogni richiesta dichiara il proprio scope con `SET LOCAL` dentro la transazione, e le policy di Row Level Security confrontano con `current_setting('app.current_tenant_id', true)`. Senza scope il confronto non è mai vero — il risultato torna vuoto, mai dall’azienda sbagliata. Una tabella nuova con `tenantId` si protegge da sola: `SELECT app.apply_tenant_rls();` alla fine della migration.",
        choices: {
          yes: {
            label: 'Sì, più aziende',
            help: 'Ogni azienda resta separata dentro il database da Postgres stesso, non da un filtro che qualcuno può dimenticare di scrivere. Arriva con pannello di amministrazione e cambio di azienda.',
          },
          no: {
            label: 'No, una sola azienda',
            help: 'Il sistema nasce con un’azienda fissa e le schermate di cambio restano fuori. La separazione resta dentro il database: solo, non compare a schermo, perché non c’è nulla da cambiare.',
          },
        },
      },
      entry: {
        eyebrow: 'Accesso',
        question: 'Come faranno le persone a entrare nel sistema?',
        help: 'È la differenza tra svegliarsi con mille account di prova e dover creare ogni persona a mano. Chi può creare un account è la decisione che cambia di più il tuo prodotto — e quella che va peggio quando la si rimanda.',
        whatChanges:
          "L’invito conserva solo lo SHA-256 del token: un database trafugato non produce un link utilizzabile. Un indice unico parziale (`WHERE status = 'PENDING'`) consente al massimo un invito vivo per e-mail e per azienda, e chiude la corsa di due admin che invitano lo stesso collega nello stesso istante. L’e-mail parte dopo il commit — dentro la transazione, un rollback consegnerebbe un link valido a un’azienda che non esiste.",
        choices: {
          open: {
            label: 'Chiunque può registrarsi',
            help: 'C’è un form di registrazione aperto, e chi si registra crea la propria azienda. È quello che serve a un prodotto venduto su internet.',
          },
          invite: {
            label: 'Solo su invito',
            help: 'Un amministratore invita per e-mail e l’invitato sceglie la propria password. Nessuno viene a sapere la password di un altro, e il clic sul link è ciò che prova che quell’indirizzo esiste.',
          },
          seed: {
            label: 'Solo gli account che creo io',
            help: 'Nessuna registrazione e nessun invito: l’unico account è quello che il sistema crea all’installazione. Va bene per uso interno — e significa che le altre persone le crei a mano.',
          },
        },
      },
      social: {
        eyebrow: 'Login social',
        question: 'Vuoi il bottone per entrare con Google, Apple o GitHub?',
        help: 'È la differenza tra una password in più che il tuo utente può dimenticare e un bottone che usa già ovunque. In cambio ogni provider chiede una chiave che crei sul suo sito.',
        whatChanges:
          'L’account è riconosciuto dal `providerAccountId` immutabile, con `@@unique([provider, providerAccountId])` — mai dall’e-mail, che viene riciclata quando qualcuno lascia l’azienda. Un indirizzo che il provider non ha marcato come verificato non collega nulla: il callback restituisce `unverified_email`. L’elenco di `OAUTH_PROVIDERS` e quello del web devono coincidere, altrimenti il bottone in più dà 404; il generatore scrive entrambi i lati.',
        choices: {
          yes: {
            label: 'Sì, voglio il bottone',
            help: 'Google e GitHub attivi, Apple disponibile. Le chiavi le crei nella console di ciascuno e le incolli nel `.env`.',
          },
          no: {
            label: 'No, solo e-mail e password',
            help: 'Il codice dei provider esce dal progetto: meno cose da mantenere. Per riaverlo, rigenera con il login social attivo.',
          },
        },
      },
      twoFactor: {
        eyebrow: 'Secondo fattore',
        question: 'Le persone devono poter richiedere un codice dal telefono per entrare?',
        help: 'È la differenza tra «le hanno rubato la password» e «le hanno rubato la password e non sono entrati». La persona registra un’app di autenticazione una volta e poi digita sei cifre quando il sistema lo chiede.',
        whatChanges:
          'Il secondo fattore vale a ogni porta d’ingresso, login social compreso: il callback non emette sessione, consegna un ticket nel cookie `dp_2fa_ticket` — cinque minuti, bruciato dopo pochi tentativi sbagliati — e la sessione vera nasce solo dopo le sei cifre. Arrivano codici di recupero a uso singolo, e `TWO_FACTOR_REQUIRED=true` passa a pretendere il fattore da tutti.',
        choices: {
          yes: {
            label: 'Sì, voglio il secondo fattore',
            help: 'Ognuno lo attiva sul proprio account, con codici di recupero nel caso perda il telefono. Per pretenderlo da tutti, il progetto porta `TWO_FACTOR_REQUIRED`.',
          },
          no: {
            label: 'Non ora',
            help: 'Entrare è solo password. Si può attivare dopo — ma rigenerando il progetto, perché rispondere no qui rimuove il codice del secondo fattore.',
          },
        },
      },
      languages: {
        eyebrow: 'Lingue',
        question: 'Il sistema parlerà più di una lingua?',
        help: 'Questo riguarda il prodotto che genererai, non questa pagina.',
        whatChanges:
          'Ogni lingua è un file di messaggi su entrambi i lati, API e web. Un test confronta gli insiemi di chiavi e fallisce quando ne manca una — che è esattamente il modo in cui una schermata compare in inglese in mezzo all’italiano, in produzione.',
        choices: {
          one: {
            label: 'Una lingua',
            help: 'Schermate ed e-mail escono in una sola lingua. L’impianto di traduzione resta nel codice, quindi aggiungerne una seconda dopo non significa rifare le schermate.',
          },
          many: {
            label: 'Più di una',
            help: 'Scegli tu quali. Un test garantisce che a nessuna lingua manchi una frase — che è il modo in cui una schermata compare in inglese in mezzo all’italiano.',
          },
        },
      },
      plans: {
        eyebrow: 'Piani',
        question: 'Venderai piani con limite, del tipo «fino a 10 utenti»?',
        help: 'È la differenza tra far pagare a piano e sperare che nessuno abusi. È ciò che separa un piano base da uno avanzato dentro il sistema stesso.',
        whatChanges:
          'Il limite è controllato nel momento che consuma il posto — l’accettazione dell’invito —, dentro la stessa transazione che crea l’utente, con `pg_advisory_xact_lock` per azienda e per risorsa. Contare prima di scrivere non blocca niente: due accettazioni nello stesso secondo supererebbero il tetto.',
        choices: {
          yes: {
            label: 'Sì, venderò piani',
            help: 'Ogni azienda riceve un limite di persone e contatori per risorsa, con le schermate di utilizzo e di cambio piano.',
          },
          no: {
            label: 'No, tutti uguali',
            help: 'Nessun limite e nessun contatore. Nessuno viene bloccato per dimensione.',
          },
        },
      },
      files: {
        eyebrow: 'File',
        question: 'Le persone caricheranno file — foto profilo, allegati, documenti?',
        help: 'Cambia dove stanno i file e come arrivano al browser.',
        whatChanges:
          'Il file sale attraverso l’API e va nello storage tramite il port `StorageProvider`, che ha tre operazioni: `putObject`, `deleteObject` e `getPublicUrl`. Scambiare S3 con MinIO, R2 o il disco locale è cambiare `STORAGE_DRIVER` nel `.env` — la logica non sa cosa ci sia dietro.',
        choices: {
          yes: {
            label: 'Sì, caricheranno file',
            help: 'Avatar e allegati tenuti fuori dal database. Funziona con Amazon S3, MinIO, Cloudflare R2 o il disco della macchina, e passare dall’uno all’altro è una riga di configurazione.',
          },
          no: {
            label: 'Non serve',
            help: 'Nessun caricamento e nessuna foto profilo. Meno codice, e nessun bucket da configurare.',
          },
        },
      },
      captcha: {
        eyebrow: 'Robot',
        question: 'Le schermate pubbliche hanno bisogno di protezione contro i robot?',
        help: 'È la differenza tra un robot che prova mille password al minuto e uno che si ferma al primo rompicapo. Vale per registrazione, login e recupero password.',
        whatChanges:
          'Il captcha entra nelle rotte marcate con `@RequireCaptcha`: registrazione, login, rinvio della verifica e recupero password. `CAPTCHA_DRIVER` e `NEXT_PUBLIC_CAPTCHA_DRIVER` devono combaciare, altrimenti ogni invio diventa un 400 per un token che la schermata non ha mai potuto ottenere — il generatore scrive entrambi. Un provider giù risponde 503, non «passano tutti»: `CAPTCHA_FAIL_OPEN=false` è il valore predefinito.',
        choices: {
          yes: {
            label: 'Sì, voglio la protezione',
            help: 'Arriva con Cloudflare Turnstile, e reCAPTCHA di Google come alternativa. Le chiavi le crei dal provider.',
          },
          no: {
            label: 'Non ora',
            help: 'Nessun rompicapo a schermo. Il limite di tentativi per indirizzo di rete resta valido, quindi non è «senza protezione»: è senza quello strato.',
          },
        },
      },
      review: {
        eyebrow: 'Revisione',
        question: 'Controlla prima di eseguire.',
        help: 'Ogni riga torna alla domanda che l’ha prodotta. Il comando è esattamente quello che riceverà il generatore.',
      },
      done: {
        eyebrow: 'Pronto',
        question: 'Non resta che copiare ed eseguire.',
        help: 'Incollalo nel terminale, nella cartella dove vuoi il progetto. Due minuti dopo stai guardando la sua schermata di login.',
      },
    },
  },

  how: {
    title: 'Quattro passi, e il quarto è `pnpm dev`.',
    steps: [
      {
        title: 'Rispondi alle domande',
        body: 'Qui, una alla volta. Ognuna dice cosa cambia nel codice se rispondi sì o no. Si può saltare con «usa il consigliato».',
      },
      {
        title: 'Copia il comando',
        body: 'L’ultima schermata mostra un comando solo, con le tue scelte dentro. C’è un link condivisibile, se vuoi discutere la configurazione col team prima.',
      },
      {
        title: 'Eseguilo nel terminale',
        body: 'Scarica il codice, rinomina tutto sul tuo progetto — pacchetti, database, variabili, container —, tira su Postgres e Redis in Docker e popola il database.',
      },
      {
        title: '`pnpm dev`',
        body: 'API su `:4201`, web su `:4200`, e-mail catturata da Mailpit su `:4207`. Le credenziali dell’admin creato dal seed sono nel README.',
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
    stackHead: { tech: 'Tecnologia', solves: 'Cosa risolve' },
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
    factoryTitle: 'Di serie',
    factory: [
      {
        label: 'Accesso e sessione',
        text: 'Password con Argon2, sessione in cookie httpOnly, refresh rotativo con rilevamento del riuso — un token rubato tira giù l’intera famiglia. Cambiare la password chiude le altre sessioni.',
      },
      {
        label: 'Isolamento nel database',
        text: 'Row Level Security in Postgres, con lo scope dichiarato per richiesta. Una tabella nuova con `tenantId` si protegge da sola: `SELECT app.apply_tenant_rls();` alla fine della migration.',
      },
      {
        label: 'Inviti e onboarding',
        text: 'Token salvato solo come hash, al massimo un invito in sospeso per e-mail (indice unico parziale) e l’e-mail che parte dopo il commit — mai dentro la transazione.',
      },
      {
        label: 'Cinque scambi per variabile',
        text: 'Storage, e-mail, cache, coda e captcha dietro interfacce: `STORAGE_DRIVER`, `MAIL_DRIVER`, `CACHE_DRIVER`, `QUEUE_DRIVER`, `CAPTCHA_DRIVER`.',
      },
      {
        label: 'Lavoro in background',
        text: 'BullMQ su Redis, con il worker in un processo separato e il tenant che viaggia insieme al job. Senza di lui, il job vedrebbe un database vuoto e direbbe che è andato bene.',
      },
      {
        label: 'Test che lo dimostrano',
        text: 'Unitari con il database simulato, e2e contro un Postgres vero con il role ristretto, e il kit di UI del web in Vitest.',
      },
    ],
    decisionsTitle: 'La parte che nessuno scrive',
    decisionsText:
      'Ogni decisione di sicurezza ha un file in `docs/decisions/` e una sezione nel `CLAUDE.md`, con la ragione e cosa succede se qualcuno la disfa. È quello che un agente legge prima di scrivere — e quello che leggi tu sei mesi dopo, quando non ricordi perché è così.',
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
        q: 'Questo analizza l’app che ho già?',
        a: 'No. DontPanic non legge, non controlla e non corregge codice esistente: **genera un progetto nuovo**, da zero, con queste decisioni già prese dentro. Se la tua app è già in piedi, qui serve la lettura: genera un progetto di esempio e confrontalo con il tuo, oppure ripassa «La prova» e verifica, nel tuo codice, se ognuno dei cinque casi è risolto. Il comando non tocca nulla di ciò che hai scritto.',
      },
      {
        q: 'Cosa viene testato, esattamente?',
        a: 'La matrice dei preset, per intero: la CI genera un progetto per ogni preset, pretende zero occorrenze del nome vecchio ed esegue install, typecheck, unitari ed e2e. Più all-on, all-off e ogni feature spenta singolarmente sopra il preset SaaS. Quattordici feature booleane sono 16.384 combinazioni, e la CI non testa 16.384 progetti: le combinazioni fuori da quella matrice sono permesse e non testate — e il CLI lo dice, in una riga, senza drammi. Un boilerplate che promette garanzie che non verifica è peggio di uno che dichiara il limite.',
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
    brandNote:
      'Generatore di progetti a partire dal boilerplate DontPanic. Tu scegli le parti; il comando genera il repository.',
    sourceNote:
      'I numeri di questa pagina vengono da `wc -l` e `grep` sul repository. Controllali.',
    license: 'MIT',
    productTitle: 'Prodotto',
    docsTitle: 'Documentazione',
    contactTitle: 'Contatti',
    joke: 'Questo footer è stato assemblato da un’intelligenza grande come un pianeta. Contiene quattro liste di link. Niente panico: il resto del codice è più interessante.',
  },
};
