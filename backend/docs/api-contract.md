# Contrat d'API back ↔ front — PIM Accor (v3, 27/10/2026)

Source de vérité partagée par les sessions `back` et `front` (le back le recopie dans `backend/docs/api-contract.md`).
Toute modification : la session qui la propose l'écrit ici, puis prévient l'autre session et la tour de contrôle.

Références métier : `pipeline/docs/contrat-back.md`, `pipeline/docs/tables-et-validation.md` (statuts, requêtes, INSERT).
Datasets : `cvto_accor_pim_enrichment_<env>_euw1_{matching,enhanced,validation}`.

## Conventions
- JSON, `camelCase` dans l'API (le back mappe depuis les colonnes `snake_case`).
- Statuts : valeurs brutes du pipeline (`needs_review`, `pending_enrichment`, `pending_judgment`, `auto_approved`, `auto_rejected`, `human_approved`, `human_rejected`, `human_corrected`). Le front ne calcule jamais de statut depuis le score.
- `score` : entier 0-100 (null si non noté).
- Auteur : en-tête `X-PIM-Author: <email>` posé par le relais Next.js (jamais par le navigateur). Obligatoire sur toutes les écritures : 401 s'il manque ou n'est pas un e-mail, 403 si l'adresse n'est pas `@converteo.com` (`test@converteo.com` accepté). Le back l'enregistre en minuscules. En dev local / sans IAP : `DEV_AUTHOR` côté front.
- Le back n'est appelable que par le SA du front (jeton d'identité Google, audience = URL du back). Le navigateur appelle uniquement le relais `/api/*` du front, même chemin que le back (préfixe `/api` retiré).
- Erreurs : `{ "error": { "code": "string", "message": "texte FR" } }` ; 400 validation, 401 auteur manquant, 404, 409 conflit d'état, 502 erreur BigQuery/GCP.
- Pagination : `?limit=50&cursor=<opaque>` → `{ items, nextCursor }` (`nextCursor` null en fin de liste).
  Curseur propre à une liste (chaque `view` de `/hotels`, chaque `status` de `/matches`) : réutilisé sur une autre → 400 `invalid_cursor`.
  La clé de tri contient des compteurs (priorité, score moyen, nombre de champs) : une fiche modifiée entre deux pages peut
  revenir dans la page suivante → **le front dédoublonne par `rid`** (par `rid|source|sourceHash` pour `/matches`).
- 500 `internal_error` : erreur du back lui-même (502 reste réservé aux erreurs BigQuery/GCP).
- Codes des éléments refusés (`rejected[].code`, message FR prêt à afficher) : `duplicate` (élément répété dans la demande,
  rien n'est écrit pour lui), `invalid_decision`, `not_found` (valeur ré-enrichie ou page de rapprochement changée :
  recharger), `invalid_status`, `match_not_approved`, `corrected_value_required`, `invalid_corrected_value`,
  `invalid_value` (validation d'une valeur `auto_rejected` sans valeur ou hors format PIM : la corriger).
- Autres codes d'erreur : `invalid_request` (400), `invalid_cursor` (400), `author_required`, `author_invalid` (401), `author_forbidden` (403), `hotel_not_found`,
  `field_not_found`, `execution_not_found`, `file_not_found` (404), `export_blocked`, `export_running` (409), `payload_too_large` (413,
  corps > 2 Mo : découper le lot), `upstream_error` (502).

## Types
```ts
type ValueStatus = 'pending_enrichment'|'needs_review'|'auto_approved'|'auto_rejected'|'human_approved'|'human_rejected'|'human_corrected';
type MatchStatus = 'pending_judgment'|'needs_review'|'auto_approved'|'auto_rejected'|'human_approved'|'human_rejected';
type Family = 'general'|'accessibility_safety'|'dining'|'pool'|'parking'|'wellness_fitness';
type Priority = 'P1'|'P2'|'P3';

type HotelView = 'review'|'pending'|'auto_approved'|'auto_rejected'|'human';

interface HotelSummary {
  rid: string; name: string; brand: string|null; city: string|null; country: string|null;
  sources: string[];            // sources validées ayant des valeurs dans la liste (view=pending : à relire)
  count: number;                // valeurs de la fiche dans la liste demandée (view) ; = toReviewCount pour review
  lastDecidedAt: string|null;   // view=human : décision la plus récente parmi ces valeurs ; sinon null
  toReviewCount: number;        // valeurs needs_review sur rapprochement validé
  outdatedCount: number;        // parmi toReviewCount, valeurs signalées « non prioritaire, à vérifier » (outdated)
  avgScore: number|null;        // moyenne des scores des valeurs de la liste (view=pending : à relire), 0-100
  pendingCount: number;         // champs pending_enrichment
  conflictCount: number;        // auto_rejected reason=pim_conflict
  families: Family[];            // familles des valeurs de la liste
}

interface Decision { decision: string; author: string; decidedAt: string; comment: string|null; correctedValue: string|null; }

interface EnrichmentValue {
  enrichmentId: string|null;    // null pour pending_enrichment
  family: Family; priority: Priority;
  entity: string; entityId: string|null; pimField: string; label: string;
  pimValue: string|null;
  value: string|null; valueLabel: string|null;
  method: 'extracted'|'converted'|'inferred'|null;
  source: string|null; sourceField: string|null; sourceExcerpt: string|null;
  score: number|null; confidence: string|null; warning: string|null;
  status: ValueStatus; reason: string|null; reasonDetail: string|null;
  finalValue: string|null;
  outdated: string|null;        // motif FR si « non prioritaire, à vérifier », sinon null (règle : § Valeurs signalées)
  lastDecision: Decision|null;
}

interface HotelDetail {
  hotel: Omit<HotelSummary,'toReviewCount'|'outdatedCount'|'avgScore'|'pendingCount'|'conflictCount'|'families'>;
  toReview: EnrichmentValue[];  // needs_review, rapprochement validé, tri priorité puis score desc
  pending: EnrichmentValue[];   // pending_enrichment
  conflicts: EnrichmentValue[]; // auto_rejected / pim_conflict
  decided: EnrichmentValue[];   // human_* (historique)
  values?: EnrichmentValue[];   // avec ?view= seulement : valeurs comptées dans HotelSummary.count de cette liste
}

interface MatchItem {
  rid: string; source: string; sourceHash: string;
  pim: { name: string|null; city: string|null; country: string|null; brand: string|null; address: string|null };
  page: { scrapedName: string|null; pageName: string|null; url: string|null; country: string|null };
  preVerdict: string|null; preReason: string|null;
  score: number|null; confidence: string|null; judgeReason: string|null; justification: string|null;
  verdict: string|null;         // avis brut du juge : 'same_hotel'|'different_hotel'|'undetermined' ; null si pas encore jugé
  status: MatchStatus; lastDecision: Decision|null;
}

interface Stats {
  hotelsToReview: number; hotelsPending: number; valuesToReview: number; matchesToReview: number; matchesPending: number;
  matchesAutoApproved: number; matchesAutoRejected: number; matchesHuman: number;   // étape 1 : human = human_approved + human_rejected
  valuesAutoApproved: number; hotelsAutoApproved: number; hotelsAutoRejected: number; hotelsHuman: number;
  valuesAutoRejected: number; valuesHuman: number;                                  // étape 2 : human = human_*
  valuesPending: number; valuesApproved: number; pendingForExport: number;
}
// Une valeur (sur rapprochement validé) ou un rapprochement est dans un seul tableau : les compteurs `values*` d'une
// étape s'additionnent sans recouvrement (de même `matches*`). Les compteurs `hotels*` se recouvrent : une fiche a des
// valeurs dans plusieurs tableaux.

interface AutoApprovedValue { hotel: Pick<HotelSummary,'rid'|'name'|'brand'|'city'|'country'>; value: EnrichmentValue; approveThreshold: number|null; }

type AutoValidationStep = 'match'|'enrichment';
interface AutoValidationChange { approveThreshold: number|null; rejectThreshold: number|null; comment: string|null; author: string; setAt: string; }
interface ScoreBucket { score: number|null; approvable: number; total: number; }  // éléments sans décision humaine auxquels les seuils s'appliquent
interface AutoValidationStepState {
  step: AutoValidationStep;
  approveThreshold: number|null; rejectThreshold: number|null;   // en vigueur (null seulement dans d'anciens réglages)
  isDefault: boolean;                                             // aucun réglage : valeurs par défaut de Terraform
  distribution: ScoreBucket[];
  history: AutoValidationChange[];                                // du plus récent au plus ancien
}
interface AutoValidation { canEdit: boolean; steps: AutoValidationStepState[]; }

interface FieldValues { pimField: string; dataType: string; multivalue: boolean; values: { key: string; label: string }[]; }
```

## Endpoints
| Méthode | Chemin | Réponse | Notes |
|---|---|---|---|
| GET | `/healthz` | `{status:'ok'}` | |
| GET | `/stats` | `Stats` | `pendingForExport` = compte du job d'export ; il peut inclure des champs `pending_enrichment` d'hôtels dont plus aucun rapprochement n'est validé (invisibles dans les listes) |
| GET | `/hotels?view&brand&source&family&priority&search&outdated&limit&cursor` | `{items: HotelSummary[], nextCursor}` | Une ligne = une fiche ayant ≥1 valeur dans la liste `view` (`count`), sur un rapprochement validé. `view=auto_approved`, `auto_rejected` (tous motifs : `reason`) : tri `count` desc ; `view=human` (`human_approved`, `human_rejected`, `human_corrected`) : tri `lastDecidedAt` desc. `search` : nom, ville ou RID, sans casse ni accents. `source`/`family`/`priority`/`outdated` portent sur les valeurs de la liste. `view=review` (défaut) : fiches avec ≥1 valeur à relire ; filtre `EXISTS v_approved_matches` obligatoire ; tri : fiches dont toutes les valeurs à relire sont signalées (`outdatedCount = toReviewCount`) en dernier, puis priorité min puis avgScore desc. `outdated=hide` : fiches avec ≥1 valeur à relire non signalée ; `outdated=only` : fiches avec ≥1 valeur à relire signalée (combiné aux filtres `source`/`family`/`priority` sur les mêmes valeurs ; ignoré pour `view=pending`). `view=pending` (plus utilisé par le front) : fiches avec ≥1 champ `pending_enrichment` (filtres `family`/`priority` appliqués à ces champs, `source` aux sources validées), tri pendingCount desc |
| GET | `/hotels/facets` | `{brands: string[], sources: string[], verdicts: string[]}` | listes des filtres ; `verdicts` = avis du juge présents dans `v_matches` |
| GET | `/hotels/:rid?view` | `HotelDetail` | 404 si inconnu ; avec `view` (mêmes valeurs que `/hotels`) : `values` = les valeurs de la fiche dans cette liste (même règle que `count`), `lastDecision` (auteur, date, commentaire) et `finalValue` pour les décisions humaines ; `hotel.sources` = toutes les sources dont le rapprochement est validé (PIM-19), pas seulement celles qui ont des valeurs à relire |
| POST | `/decisions/enrichments` | `{accepted: string[], rejected: {enrichmentId, code, message}[]}` | corps `{items: {enrichmentId, decision: 'human_approved'|'human_rejected'|'human_corrected', correctedValue?, comment?}[]}` ; contrôles du contrat § 3.2-3.3 ; un seul INSERT. Statuts décidables : `needs_review`, `auto_approved` et `auto_rejected` (revenir sur la décision automatique, PIM-55), `human_*`. Valider (`human_approved`) une valeur `auto_rejected` exige une valeur au format PIM (sinon `invalid_value` : `already_in_pim` n'a pas de valeur, `not_in_pim_list`/`invalid_format` sont hors format) ; elle part alors à l'export telle quelle |
| GET | `/fields/:pimField/values` | `FieldValues` | codes autorisés (vue `enhanced.v_field_allowed_values`, livrée par la session infra) |
| GET | `/matches?status&source&brand&verdict&search&limit&cursor` | `{items: MatchItem[], nextCursor}` | `status=needs_review` (défaut, « À vérifier »), `auto_approved` (« Confirmé auto », score croissant), `auto_rejected` (« Rejeté auto », score décroissant : cas limites d'abord), `human` (« Validé manuellement » : `human_approved` + `human_rejected`, décision la plus récente d'abord, `lastDecision` toujours renseigné), `pending_judgment` (plus utilisé par le front) ; curseur propre à chaque statut ; `brand` (égalité sur `pim.brand`, valeurs de `Facets.brands`), `verdict` (valeurs de `Facets.verdicts`) et `search` (nom PIM, ville ou RID, sans casse ni accents) pour tous les statuts ; `Stats` non filtrés |
| GET | `/enrichments/auto-approved?brand&source&family&priority&search&limit&cursor` | `{items: AutoApprovedValue[], nextCursor}` | valeurs `auto_approved` sur un rapprochement validé, score croissant (cas limites d'abord) ; lecture seule |
| POST | `/decisions/matches` | `{accepted: string[], rejected: {key, code, message}[]}` | corps `{items: {rid, source, sourceHash, decision: 'human_approved'|'human_rejected', comment?}[]}` ; `key` = `rid|source|sourceHash` ; statuts décidables : `needs_review`, `auto_approved` (contrôle de l'onglet « Validés automatiquement »), `auto_rejected` (confirmer quand même, PIM-54 : le rapprochement entre dans `v_approved_matches`, sa source est lue au prochain enrichissement de la fiche), `human_*` (revenir sur une décision). Un rejet sort le rapprochement de `v_approved_matches` : ses valeurs (statut inchangé dans `v_enrichments`) quittent la relecture, l'onglet « Validés automatiquement », les compteurs et l'export, et ne sont plus décidables (`match_not_approved`) |
| GET | `/export/status` | `{pendingCount: number, canExport: boolean, runningExecutionId: string\|null, history: {exportId, path, rowCount, hotelCount, files: string[], triggeredBy, exportedAt}[]}` | `canExport` faux tant qu'il reste des éléments en attente ou qu'une exécution tourne ; `runningExecutionId` pour reprendre le suivi |
| POST | `/export` | `{executionId}` | lance `gcrj-<base>-export` (Cloud Run jobs.run) ; 409 `export_blocked` si pendingCount > 0, 409 `export_running` si une exécution tourne déjà |
| GET | `/export/executions/:id` | `{state: 'running'|'succeeded'|'failed', message?}` | `succeeded` sans nouvelle ligne dans `history` = le job n'avait rien à exporter (aucune valeur validée) ou a refusé (attente apparue entre-temps) |
| GET | `/exports/:exportId/files/:name` | flux du fichier (Content-Disposition) | lecture du bucket exports |
| GET | `/settings/auto-validation` | `AutoValidation` | seuils en vigueur des deux étapes, répartition des scores (simulation côté front), historique ; `canEdit` d'après `X-PIM-Author` et `SETTINGS_EDITORS` |
| POST | `/settings/auto-validation/:step` | `AutoValidation` | `step` = `match` ou `enrichment` ; corps `{approveThreshold: int 0-100, rejectThreshold: int 0-100, comment?}` (toujours activés), rejet ≤ validation ; 403 `settings_forbidden` hors `SETTINGS_EDITORS` ; un INSERT dans `validation.auto_validation_settings`, appliqué tout de suite par les vues |

## Valeurs signalées « non prioritaire, à vérifier » (PIM-50)
Une valeur est signalée (`outdated` non null) quand le rapprochement validé de sa source (rid × source) a été jugé
`judge_reason` ∈ {`former_brand`, `rebranding`} : la page est publiée sous un ancien nom ou une ancienne enseigne, ses
valeurs peuvent décrire l'ancien établissement. Motif : « Page source sous un ancien nom : <pageName, sinon scrapedName> ».
Calculé par le back à la lecture (`v_approved_matches`), sans changer les vues. Les extraits et `warning` ne citent pas le
nom de l'hôtel : ils ne permettent pas ce repérage (analyse du 22/10 en dev : 739 valeurs à relire sur 6 265, 433 fiches).

## Modifications proposées
- 27/10 [back] intégrée ci-dessus (contrat v3, PIM-54, 55, 59) : `GET /matches?status=auto_rejected|human&search`, `GET /hotels?view=auto_approved|auto_rejected|human`, `HotelSummary.count` et `lastDecidedAt`, `GET /hotels/:rid?view` (`values`), compteurs `Stats` des 4 tableaux de chaque étape, décisions humaines sur `auto_rejected` (rapprochements, valeurs) et `auto_approved` (valeurs), code `invalid_value`. Recherche sans accents aussi pour `/hotels` et `/enrichments/auto-approved`.
- 22/10 [back] intégrée ci-dessus (contrat v2, PIM-46 à 50) : `GET /matches?brand&verdict` pour tous les statuts, `MatchItem.verdict`, `Facets.verdicts` ; décision humaine sur un rapprochement `auto_approved` ; `EnrichmentValue.outdated`, `HotelSummary.outdatedCount`, `GET /hotels?outdated=hide|only` et tri des fiches entièrement signalées en fin de liste.
- 22/10 [pipeline] intégrée ci-dessus : seuils de validation automatique réglables dans l'interface (`/settings/auto-validation`), `GET /matches?status=pending_judgment` et `Stats.matchesPending` pour l'onglet « En cours de traitement » ; onglet « Validés automatiquement » (`GET /matches?status=auto_approved`, `GET /enrichments/auto-approved`, `Stats.matchesAutoApproved` et `valuesAutoApproved`), en lecture seule.
- 21/10 [front] ✅ acceptée par back (11:50), intégrée ci-dessus : `GET /hotels?view=pending` et `Stats.hotelsPending` (fiches ayant ≥1 champ `pending_enrichment`), pour l'onglet « En cours » de PIM-17. Tant que le back ne les sert pas, le front affiche l'onglet vide avec un message.
- 21/10 [front] ✅ acceptée par back, intégrée ci-dessus : `POST /export` : refuser en 409 (`export_running`) quand une exécution du job est déjà en cours, et indiquer `runningExecutionId: string|null` dans `GET /export/status`. Le front ne protège que son propre onglet (sessionStorage) : deux relecteurs, ou deux onglets, peuvent sinon lancer deux jobs.
