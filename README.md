# Padel Group Manager – by Ben

Application de pilotage des groupes collectifs (Ace Padel Club) : tableau de bord, groupes, cycles, planning semaine/mois, feuilles de présence, forfaits individuels.

Stack : Next.js 16 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL + Auth + RLS) · Vercel.

---

## Mise en ligne (≈ 15 minutes)

### 1. Supabase – créer la base
1. Sur https://supabase.com → **New project** (région : *West EU (Paris)*).
2. Menu **SQL Editor** → **New query** → colle tout le contenu de `supabase/schema.sql` → **Run**.
   Le message « Success. No rows returned » confirme que tout est créé.
3. Menu **Project Settings → API** : note
   - **Project URL** (`https://xxxx.supabase.co`)
   - la clé **anon / public** (ou *publishable key*).

### 2. Vercel – déployer l'application
1. Mets le dossier sur un nouveau dépôt GitHub (tout le contenu de l'archive).
2. Sur https://vercel.com → **Add New → Project** → importe le dépôt.
3. Dans **Environment Variables**, ajoute :
   - `NEXT_PUBLIC_SUPABASE_URL` = ton Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = ta clé anon
4. **Deploy**.

### 3. Créer ton compte coach
1. Ouvre l'URL Vercel → « Première utilisation ? Créer le compte coach ».
2. Confirme ton email (lien reçu de Supabase), puis connecte-toi.
3. **Sécurité conseillée** : Supabase → **Authentication → Sign In / Providers** → désactive **Allow new users to sign up**. Personne d'autre ne pourra créer de compte.
4. Dans Supabase → **Authentication → URL Configuration**, mets ton URL Vercel dans **Site URL** (pour que le lien de confirmation renvoie au bon endroit).

### 4. Démarrer
- **Réglages → Charger la démo** pour explorer avec des données fictives.
- **Réglages → Tout supprimer** pour repartir de zéro, puis crée tes vrais groupes.

Astuce téléphone : ouvre l'app dans Safari/Chrome → « Ajouter à l'écran d'accueil ».

---

## Règles métier implémentées

| Règle | Où |
|---|---|
| Séances réalisées = séances **validées** par le coach (pas les dates passées) | vue `v_cycle_stats` |
| Annulée ≠ réalisée ; option de replanifier une séance en fin de cycle | `cancel_session` |
| Report : la séance garde son cycle et sa date d'origine | `reschedule_session` |
| Fin prévisionnelle recalculée après annulation / report / pause | vue `v_cycle_stats` |
| Séance exceptionnelle comptée dans le cycle uniquement si le coach le décide | `add_session`, `validate_session` |
| Présence et crédit indépendants ; crédit décompté seulement à la validation | `validate_session` |
| Correction d'une séance validée avec motif, historique conservé, crédits rééquilibrés | `correct_session`, `session_revisions` |
| Modifier une séance / toute la récurrence future sans toucher au passé | `reschedule_session`, `update_future_recurrence` |
| Pause vacances : séances décalées, nombre de séances du cycle inchangé | `pause_group` |
| Renouvellement avec conservation facultative des joueurs / du créneau / du nombre de séances | `renew_cycle` |
| Archivage sans perte d'historique | `archive_group` |
| Forfaits personnels utilisables dans tous les groupes (FIFO), solde négatif signalé | `credit_transactions`, `v_player_stats` |
| Opérations transactionnelles et idempotentes (clé d'opération, verrouillage de ligne) | `operation_requests` |
| Chaque coach ne voit que ses données | RLS sur toutes les tables |

Tous les compteurs sont **calculés** à partir des données réelles (aucun compteur stocké).
Crédit par défaut lors de la feuille de présence : présent ou absent → 1 crédit, excusé → 0 (modifiable joueur par joueur).

## Développement local
```bash
npm install
cp .env.example .env.local   # puis renseigne les 2 variables
npm run dev
```

## Évolutions prévues (architecture prête)
Les accès aux données sont centralisés dans `src/lib/api.ts` et la logique métier dans les fonctions SQL : une connexion future au calendrier Académie, à la plateforme pédagogique, à la réservation ou à la facturation se branchera sans toucher aux écrans.
