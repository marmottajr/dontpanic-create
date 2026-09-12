import type { Messages } from './types';

export const fr: Messages = {
  meta: {
    title: 'DontPanic — le boilerplate SaaS où les décisions de sécurité sont déjà prises',
    description:
      'Générez un SaaS full-stack en NestJS et Next.js avec un multi-tenancy garanti par Row Level Security, 2FA, invitations et connexion sociale. Les décisions qu’une IA rate en silence sont déjà prises, documentées et testées.',
  },

  nav: {
    skipToContent: 'Aller au contenu',
    proof: 'La preuve',
    configure: 'Composer la commande',
    how: 'Comment ça marche',
    inside: 'Ce qu’il y a dedans',
    faq: 'Questions',
    repo: 'Dépôt',
    languageLabel: 'Langue',
    themeLabel: 'Thème',
    themeLight: 'Clair',
    themeDark: 'Sombre',
    themeSystem: 'Système',
  },

  hero: {
    mastheadLabel: 'Don’t Panic',
    title:
      'Les décisions de sécurité qu’une IA rate en silence sont déjà prises, documentées et testées.',
    lead: 'DontPanic est un boilerplate SaaS full-stack — NestJS, Next.js, Prisma, Postgres avec un vrai Row Level Security. Chaque choix de sécurité est déjà fait, expliqué dans le `CLAUDE.md` que votre agent lit avant la première ligne, et couvert par un test qui échoue dès que quelqu’un le défait. Effet de bord : le contexte part dans votre produit au lieu de redécouvrir comment on fait la rotation des refresh tokens.',
    commandLabel: 'Commande du preset par défaut',
    commandNote:
      'Nécessite Node 24 et pnpm. Pour choisir les parties, composez votre commande plus bas.',
    ctaConfigure: 'Composer ma commande',
    ctaProof: 'Voir les erreurs évitées',
    facts: [
      {
        value: '78 533',
        label: 'lignes de TypeScript qui compilent, passent le lint et passent les tests',
      },
      {
        value: '5',
        label:
          'ressources interchangeables par variable d’environnement, sans toucher à la logique',
      },
      {
        value: '2 min',
        label: 'du npx à `pnpm dev`, base migrée et admin créé par le seed',
      },
    ],
  },

  proof: {
    title: 'La preuve',
    lead: 'Rien ici n’est hypothétique. Ce sont des erreurs qui produisent du code qui compile, passe les tests et passe la revue — et qui ressort des mois plus tard, chez un utilisateur qui n’est pas vous. Chacune est déjà tranchée dans le boilerplate, avec la raison écrite à côté de la décision.',
    labels: {
      surface: 'Où ça vit',
      code: 'Le code qui passe la revue',
      whyItPasses: 'Pourquoi personne ne le voit',
      whatHappens: 'Ce qui arrive',
      ours: 'Dans DontPanic',
    },
    items: [
      {
        id: 'oauth-identity',
        title: 'Rapprocher l’identité sociale par l’adresse e-mail',
        whyItPasses:
          'Ça compile, et ça fonctionne à chaque connexion sur votre environnement de développement. Le test — qui n’a qu’un utilisateur — passe. La revue approuve, parce que c’est ainsi que font la plupart des tutoriels OAuth.',
        whatHappens:
          'Les adresses professionnelles sont recyclées. Ana quitte l’entreprise, les RH donnent `ana@societe.com` au suivant, il se connecte avec Google et **hérite du compte d’Ana** : historique, permissions, tout. Personne n’a rien forcé — le système a fait exactement ce qui était écrit.',
        ours: 'La clé d’identité est le `providerAccountId` immuable — `sub` chez Google et Apple, l’id numérique chez GitHub — avec `@@unique([provider, providerAccountId])`. La colonne `email` de `oauth_accounts` sert à l’affichage et peut être périmée. Et une adresse que le fournisseur n’a pas marquée comme vérifiée ne rattache rien : le callback renvoie `unverified_email`.',
      },
      {
        id: 'oauth-2fa',
        title: 'Émettre une session dans le callback OAuth sans vérifier le second facteur',
        whyItPasses:
          'Le `TwoFactorGateGuard` existe et est enregistré. Il vérifie que la 2FA est *activée* — jamais que *cette* session est passée par elle. Le test de 2FA couvre le flux mot de passe, et le flux mot de passe est correct.',
        whatHappens:
          'Celui qui a activé TOTP volontairement découvre que « se connecter avec Google » ne demande jamais le code. La connexion sociale devient **strictement plus faible** que la saisie du mot de passe, et le second facteur devient optionnel pour qui sait sur quel bouton cliquer.',
        ours: 'Si `twoFactorEnabled`, le callback n’émet pas de session : il crée le même ticket que `POST /auth/login` créerait, le livre dans un cookie de cinq minutes à usage unique, et redirige vers `/login?twofactor=1`. Un cookie et pas une query string — la query string finit dans l’historique du navigateur, dans l’en-tête `Referer` et dans les logs de tous les proxys du trajet.',
      },
      {
        id: 'trust-proxy',
        title: 'Activer `trustProxy: true` pour régler un 429 injustifié',
        whyItPasses:
          'Ça règle le symptôme immédiatement : le rate limit distingue à nouveau les clients, le 429 disparaît, et le déploiement part avec le problème résolu. Aucun test ne l’attrape, parce qu’un test ne forge pas d’en-tête.',
        whatHappens:
          "Faire confiance à tous les hops, c’est accepter n’importe quel `X-Forwarded-For` — et `X-Forwarded-For` n’est **pas** dans la liste des forbidden headers de fetch : le navigateur peut donc le définir. Un `fetch('/api/auth/login', { headers: { 'x-forwarded-for': ipAleatoire() } })` obtient un nouveau seau à chaque requête, et le rate limit du login cesse d’exister. Compter les hops depuis la gauche mène au même endroit : le load balancer fait un append, donc dans `X-Forwarded-For: <forgé>, <réel>` le premier élément est ce que l’attaquant a écrit.",
        ours: '`CLIENT_IP_HEADER` et `CLIENT_IP_TRUSTED_HOPS`, comptés **depuis la droite**. Le BFF supprime tout en-tête de forwarding venant du navigateur et en réécrit un seul, assaini. La valeur par défaut est zéro hop : il n’envoie aucune IP et traite tout le monde derrière le proxy comme un seul client — trop restrictif, et non contournable.',
      },
      {
        id: 'guard-scope',
        title: 'Lire la base dans un guard, avant que le scope de tenant existe',
        whyItPasses:
          'Nest exécute les guards **avant** les interceptors. Quand le guard tourne, l’interceptor qui ouvre la transaction avec `SET LOCAL` n’a pas encore tourné : `prisma.db` retombe sur le client de base, sans scope, et la policy RLS renvoie zéro ligne. Aucune exception. Couverture verte, 200 OK, rien dans les logs.',
        whatHappens:
          'Le guard conclut « cet utilisateur n’a pas la 2FA » et **laisse passer**. C’est exactement comme ça que le `TwoFactorGateGuard` de DontPanic est devenu un no-op silencieux — le bug est dans l’historique du dépôt, et la leçon a été écrite à côté.',
        ours: 'Un guard qui lit la base ouvre son propre scope, avec `this.prisma.forTenant(tenantId, …)` ou `asPlatform`, et **échoue fermé** quand la lecture revient vide. La règle, avec l’histoire du bug à côté, est dans la section multi-tenancy du `CLAUDE.md` — le fichier que votre agent lit avant d’écrire le guard suivant.',
      },
      {
        id: 'db-owner',
        title: 'Pointer `DATABASE_URL` vers le propriétaire de la base',
        whyItPasses:
          'C’est ce que dit le tutoriel, et c’est l’utilisateur que crée le `docker compose` de Postgres. Pire : vos tests d’isolation passent, parce qu’ils exercent le filtre applicatif — qui est bien là, et qui est juste.',
        whatHappens:
          'Un SUPERUSER — et tout rôle avec `BYPASSRLS` — ignore Row Level Security même avec `FORCE ROW LEVEL SECURITY`. **Toute policy devient décorative**, et l’isolation entre entreprises redevient dépendante du fait qu’aucune requête n’oublie jamais un `where`, pour toujours, dans tout le code à venir.',
        ours: 'L’application se connecte avec un rôle restreint, créé `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS` ; le propriétaire ne vit que dans `DATABASE_ADMIN_URL`, pour `migrate` et `seed`. L’API **refuse de démarrer** en production si elle détecte un superuser. Et la suite e2e tourne sous le rôle restreint — c’est ce qui fait que `tenant-isolation.e2e-spec.ts` prouve quelque chose au lieu de répéter l’intention du code.',
      },
    ],
    moreTitle: 'Trois autres, même schéma',
    more: [
      'Envoyer l’e-mail d’invitation à l’intérieur de la transaction. Un rollback livre un lien valide pointant vers une entreprise qui n’existe pas, et ne laisse aucune trace que le support puisse retrouver. Ici, `issue()` écrit dans le `tx` de l’appelant et l’envoi a lieu après le commit.',
      'Répondre « ce compte utilise la connexion sociale » sur un login par mot de passe. C’est un oracle : en chronométrant le formulaire, on énumère exactement les adresses sans mot de passe. Ici l’erreur est la même erreur générique et paie le même coût Argon2 — `verifyPassword(null, …)` vérifie contre le hash de quelque chose que personne ne connaît avant de renvoyer `false`.',
      'Compter les sièges avant d’écrire l’utilisateur. Deux requêtes simultanées lisent « il en reste un » et créent toutes les deux : compter ne verrouille rien. Ici, `pg_advisory_xact_lock`, par entreprise et par ressource, est dans la même transaction que l’écriture.',
    ],
  },

  configurator: {
    title: 'Composez la commande',
    lead: 'Rien n’est généré ici. Cette page assemble une chaîne — le générateur vit dans le CLI, versionné avec le template, et c’est lui qui décide de ce qui entre dans votre dépôt. Pas de serveur, pas de file de build, pas d’archive à périmer dans un cache.',

    nameLegend: 'Le nom du projet',
    nameLabel: 'Nom',
    namePlaceholder: 'Acme Corp',
    nameHelp: 'Comme vous appelez le produit. Tout le reste en est dérivé.',
    slugLabel: 'Slug',
    slugHelp: 'Répertoire, paquet npm et identifiants. Minuscules, chiffres et tiret.',
    slugDerived: 'dérivé du nom',
    slugCustom: 'personnalisé',
    slugReset: 'Revenir au dérivé',
    applySuggestion: 'Utiliser',

    derivedTitle: 'Ce que ce nom devient',
    derivedNote:
      'Le renommage n’est pas un `sed` sur le nom du dossier : il traverse le SQL qui crée le rôle Postgres, le scope pnpm, et des noms de base et de bucket en même temps — là où SQL refuse le tiret et S3 refuse le souligné.',
    derivedLabels: {
      dbName: 'base de dev',
      dbNameE2e: 'base e2e',
      dbRole: 'rôle Postgres restreint',
      npmScope: 'scope pnpm',
      seedAdminEmail: 'admin du seed',
      bucket: 'bucket de stockage objet',
      screaming: 'préfixe d’env',
      pascal: 'classes et types',
    },

    presetLegend: 'Point de départ',
    presetNote:
      'Un preset n’est qu’un jeu de valeurs par défaut. Tout ce qui suit reste modifiable, et la commande n’affiche que ce que vous avez changé.',
    presetReset: 'Abandonner les changements de ce preset',

    featuresLegend: 'Ce qui entre',
    featuresNote:
      'Le générateur soustrait : le template est le vrai dépôt, qui compile et tourne, et désactiver une feature supprime ses fichiers. Pas de `{{#if}}` dans le code.',
    groups: {
      access: 'Accès',
      tenancy: 'Entreprises',
      ops: 'Exploitation',
      extras: 'Extras',
    },

    driversLegend: 'Adapters',
    driversNote:
      'Changer de fournisseur, c’est changer une variable d’environnement — le domaine dépend du port, pas du prestataire. Ces choix atterrissent dans le `.env` du projet généré.',
    driverLabels: {
      db: 'Base de données',
      storage: 'Stockage',
      mail: 'E-mail',
      cache: 'Cache',
      queue: 'File',
      captcha: 'Captcha',
    },

    oauthLegend: 'Fournisseurs de connexion sociale',
    oauthNote:
      'L’API et le web doivent lister les mêmes noms, sinon le bouton en trop renvoie un 404. Le générateur écrit les deux côtés.',

    localesLegend: 'Langues du projet',
    localesNote:
      'Les langues du produit que vous allez générer. Sans rapport avec la langue de cette page.',
    defaultLocaleLabel: 'Langue par défaut',

    optionsLegend: 'À la génération',
    optionLabels: {
      git: 'Lancer `git init` et le premier commit',
      install: 'Lancer `pnpm install` à la fin',
      docker: 'Émettre `docker-compose.yml` avec les services utilisés',
      force: 'Écraser le répertoire cible s’il existe déjà',
    },

    issuesTitle: 'Combinaison incohérente',
    issueError: 'Empêche la génération',
    issueWarning: 'Autorisé, sous réserve',
    noIssues: 'Combinaison cohérente.',

    commandTitle: 'Votre commande',
    commandNote: 'Ceci est la configuration. Elle ne vit nulle part ailleurs.',
    copy: 'Copier la commande',
    copied: 'Commande copiée',
    copyFailed: 'Copie impossible — sélectionnez le texte et copiez-le',
    flagsTitle: 'Les flags',
    flagsNote: 'Seulement ce qui diffère du preset. Retirez-en un pour revenir à sa valeur.',
    removeFlag: 'Retirer',
    shareTitle: 'Lien de cette configuration',
    shareNote:
      'La configuration est dans l’URL, lisible. Envoyez-la sur Slack : le collègue comprend ce que c’est avant de l’ouvrir.',
    shareCopy: 'Copier le lien',
    shareCopied: 'Lien copié',
    blockedByName: 'Corrigez le nom avant d’utiliser la commande.',

    features: {
      multiTenant: {
        label: 'Multi-tenancy',
        text: 'Isolation entre entreprises dans Postgres, par Row Level Security. Désactivé, le RLS reste : le projet naît avec un tenant fixe et sans sélecteur d’entreprise dans l’interface.',
      },
      twoFactor: {
        label: '2FA par TOTP',
        text: 'Second facteur avec application d’authentification, codes de secours et ticket à usage unique entre le mot de passe et la session.',
      },
      oauth: {
        label: 'Connexion sociale',
        text: 'Google, Apple et GitHub, activés fournisseur par fournisseur. Identité par `providerAccountId`, et le callback respecte la 2FA.',
      },
      invitations: {
        label: 'Invitations',
        text: 'La porte vers une entreprise qui existe déjà : l’invité choisit son propre mot de passe, et le clic sur le lien est ce qui prouve l’adresse.',
      },
      publicSignup: {
        label: 'Inscription publique',
        text: 'Le formulaire qui laisse un inconnu créer une entreprise et en devenir le premier admin. Désactivé, il reste l’invitation et le seed.',
      },
      files: {
        label: 'Envoi de fichiers',
        text: 'Avatar et pièces jointes par URL pré-signée, derrière le port de stockage : S3, MinIO, R2 ou disque local.',
      },
      platform: {
        label: 'Panneau plateforme',
        text: 'L’espace SUPERADMIN sur `/platform` : crée des entreprises, invite le premier admin, traverse les tenants dans son propre scope.',
      },
      audit: {
        label: 'Journal d’audit',
        text: 'Qui a fait quoi, écrit en dehors de la transaction de la requête pour ne pas disparaître avec un rollback.',
      },
      plans: {
        label: 'Plans et limites',
        text: '`maxUsers` et compteurs nommés par entreprise, avec un advisory lock par ressource — compter avant d’écrire ne verrouille rien.',
      },
      i18n: {
        label: 'Internationalisation',
        text: 'Messages par langue des deux côtés, avec un test de parité des clés entre les fichiers de traduction.',
      },
      queue: {
        label: 'File de jobs',
        text: 'BullMQ sur Redis, avec le worker dans un processus séparé. Le tenant voyage avec le job : sans lui, le RLS renvoie zéro ligne et le job prétend avoir réussi.',
      },
      captcha: {
        label: 'Captcha',
        text: 'Turnstile ou reCAPTCHA sur les routes qui devinent un secret, en échouant fermé quand le fournisseur tombe.',
      },
      easterEggs: {
        label: 'Blagues du Guide',
        text: 'La voix de Marvin dans les marges, `GET /teapot` qui renvoie 418, et le Konami sur le dashboard. Jamais dans un message de sécurité.',
      },
      scaffolding: {
        label: 'Blocs de construction',
        text: 'Grille d’enregistrements, cartes de dashboard et `sequence.service.ts` : prêts, testés et importés par rien — le point de départ de vos écrans CRUD.',
      },
    },

    presets: {
      minimal: {
        label: 'Minimal',
        summary: 'Mot de passe, multi-tenancy avec RLS et la suite de tests. Rien d’autre.',
        audience:
          'Pour qui va construire tout le produit et ne veut que la couche d’accès déjà prouvée.',
      },
      saas: {
        label: 'SaaS',
        summary:
          'Vraiment multi-entreprise : invitations, plans avec limite de sièges, 2FA, connexion sociale et file durable.',
        audience:
          'Pour un produit vendu par abonnement, avec plusieurs entreprises clientes dans la même base.',
      },
      complete: {
        label: 'Complet',
        summary: 'Le boilerplate entier, rien de soustrait — Marvin compris.',
        audience: 'Pour tout voir fonctionner avant de décider ce qu’on enlève.',
      },
      internal: {
        label: 'Interne',
        summary:
          'Une seule entreprise et aucune porte publique : on entre sur invitation, avec 2FA et audit.',
        audience:
          'Pour un outil d’équipe, un back-office ou un ERP qui n’aura jamais d’inscription ouverte.',
      },
    },
  },

  how: {
    title: 'Comment ça marche',
    lead: 'Quatre étapes, et seule la troisième prend du temps.',
    steps: [
      {
        title: 'Choisissez les parties',
        body: 'Un preset comme point de départ et les toggles par-dessus. L’URL retient le choix : vous pouvez envoyer le lien à celui qui décide avec vous avant de rien lancer.',
      },
      {
        title: 'Copiez la commande',
        body: 'La page ne génère rien : elle assemble la chaîne. C’est le CLI, versionné avec le template, qui décide du contenu de votre dépôt — d’où le fait que la même recette produise le même projet aujourd’hui et dans deux ans.',
      },
      {
        title: 'Lancez le npx',
        body: 'Le générateur copie le template, supprime ce que vous n’avez pas demandé, taille le schema Prisma, assemble la baseline SQL, remplace le nom sous toutes ses formes, écrit le `.env` avec des secrets générés, puis lance `git init`.',
      },
      {
        title: '`pnpm dev`',
        body: 'Docker démarré, base migrée, admin créé par le seed. Deux minutes après le `npx`, vous regardez l’écran de connexion de votre produit.',
      },
    ],
    renameTitle: 'Le renommage est prouvé, pas relu',
    renameLead:
      'Le nom du projet apparaît là où aucune relecture humaine ne va. La porte est mécanique : la CI génère avec un nom de test, lance `grep -ri` en exigeant zéro occurrence de l’ancien nom, et seulement ensuite installe, vérifie les types et lance toute la suite, e2e inclus.',
    renameItems: [
      '531 occurrences dans 199 fichiers, en trois casses différentes.',
      'Dans le SQL qui crée le rôle Postgres restreint, où un remplacement partiel donne un rôle sans GRANT — et le symptôme est « zéro ligne », pas une erreur.',
      'Dans des noms de base et de bucket à la fois, là où SQL refuse le tiret et S3 refuse le souligné.',
    ],
  },

  inside: {
    title: 'Ce qu’il y a dedans',
    lead: 'Le template est le vrai dépôt DontPanic, au tag que le générateur déclare. Ce n’est pas une version de démonstration : c’est le code qui fait tourner sa propre CI.',
    stackTitle: 'La stack',
    stackRoles: [
      'API, avec Fastify dessous',
      'Web, avec le BFF qui parle à l’API à la place du navigateur',
      'Base de données, avec driver adapters et Row Level Security',
      'Contrats de requête et de réponse, partagés entre l’API et le web',
      'Mot de passe et session, avec refresh rotatif et détection de réutilisation',
      'File durable, avec le worker dans un processus séparé',
      'Tests : unitaires, de composant et e2e',
      'Monorepo, avec cache de build',
    ],
    portsTitle: 'Ports & Adapters',
    portsLead:
      'Cinq ressources où changer de fournisseur revient à changer une variable d’environnement. Le domaine dépend de l’interface ; le prestataire est un détail remplaçable.',
    portsHead: { resource: 'Ressource', adapters: 'Adapters', env: 'Variable' },
    portsResources: ['Fichiers', 'E-mail', 'Cache', 'Jobs', 'Captcha'],
    numbersTitle: 'Les chiffres',
    numbers: [
      { value: '78 533', label: 'lignes de TypeScript' },
      { value: '~99 %', label: 'de statements couverts sur l’API, seuils imposés en CI' },
      { value: '100 %', label: 'de statements couverts sur le kit d’UI du web' },
      { value: '531', label: 'occurrences du nom remplacées dans 199 fichiers, prouvées par grep' },
    ],
  },

  faq: {
    title: 'Questions',
    lead: 'Celles qui méritent une réponse honnête avant de lancer la commande.',
    items: [
      {
        q: 'Qu’est-ce qui est testé, exactement ?',
        a: 'La matrice des presets, intégralement : la CI génère un projet par preset, exige zéro occurrence de l’ancien nom, puis lance install, typecheck, tests unitaires et e2e. Plus all-on, all-off, et chaque feature désactivée isolément par-dessus le preset SaaS. Treize features booléennes font 8 192 combinaisons, et la CI ne teste pas 8 192 projets : les combinaisons hors de cette matrice sont autorisées et non testées — et le CLI le dit, en une ligne, sans drame. Un boilerplate qui promet des garanties qu’il ne vérifie pas est pire qu’un qui annonce la limite.',
      },
      {
        q: 'Et si je ne veux pas de multi-tenancy ?',
        a: '`--no-multi-tenant` le cache, il ne l’arrache pas. Le projet naît avec un tenant fixe créé par le seed, le scope toujours ouvert sur lui, et le sélecteur d’entreprise, le panneau `/platform` et le SUPERADMIN hors de l’interface. Row Level Security reste, et reste prouvé par `tenant-isolation.e2e-spec.ts` ; le coût est une colonne indexée et un prédicat que Postgres résout en constante. L’arracher voudrait dire maintenir deux versions de tout l’accès aux données — et la version sans RLS est précisément celle qu’on ne peut pas prouver sûre.',
      },
      {
        q: 'Puis-je mettre à jour plus tard ?',
        a: 'Le projet généré est le vôtre, pas une dépendance : aucun `pnpm update` n’y fera entrer des nouveautés de DontPanic, et c’est volontaire — vous allez éditer ce code dès le premier jour. Ce que vous avez, c’est la reproductibilité : la même recette sur la même version du template génère le même projet aujourd’hui et dans deux ans, donc vous pouvez régénérer et comparer les diffs quand vous voulez adopter quelque chose de l’upstream.',
      },
      {
        q: 'Et la licence ?',
        a: 'MIT, sur le générateur et sur le template. Ce qui sort du `npx` est à vous : pas d’attribution obligatoire, pas de royalties, pas de clause qui change de valeur si votre produit grandit. Vous pouvez fermer le code de ce que vous générez.',
      },
      {
        q: 'Ai-je besoin de Docker ?',
        a: 'Pour lancer la suite de tests, non : les adapters `memory`, `console` et `local` existent justement pour tourner sans rien d’autre. Pour développer sérieusement il vous faut un Postgres — et le `docker compose` du projet monte Postgres, Redis, MinIO et Mailpit sur des ports qui n’entreront pas en collision avec les vôtres. Si vous avez déjà ces services, pointez le `.env` dessus et générez avec `--no-docker`.',
      },
      {
        q: 'Est-ce que ça marche avec Claude Code, Cursor et compagnie ?',
        a: 'Le projet généré embarque un `CLAUDE.md` taillé aux features que vous avez choisies — seulement les sections qui existent dans votre code. C’est là que vivent les décisions de sécurité, chacune avec sa raison, dans la forme qu’un agent lit avant d’écrire. L’effet de bord est probablement ce qui vous a amené ici : le contexte part dans votre produit au lieu de redécouvrir comment on fait la rotation des refresh tokens.',
      },
    ],
  },

  footer: {
    tagline: 'Un boilerplate SaaS qui a déjà pris les décisions ennuyeuses.',
    repo: 'Code sur GitHub',
    license: 'MIT',
    sourceNote: 'Les chiffres de cette page sortent de `wc -l` et `grep` sur le dépôt. Vérifiez.',
    marvin:
      'Me voilà, un cerveau de la taille d’une planète, occupé à assembler une ligne de commande. Ils appellent ça l’épanouissement professionnel.',
  },
};
