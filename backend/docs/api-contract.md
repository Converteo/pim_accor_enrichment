# Contrat d'API back ↔ front — PIM Accor (v1, 21/10/2026)

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
  Curseur propre à une liste (`view=review`, `view=pending`, `/matches`) : réutilisé sur une autre → 400 `invalid_cursor`.
  La clé de tri contient des compteurs (priorité, score moyen, nombre de champs) : une fiche modifiée entre deux pages peut
  revenir dans la page suivante → **le front dédoublonne par `rid`** (par `rid|source|sourceHash` pour `/matches`).
- 500 `internal_error` : erreur du back lui-même (502 reste réservé aux erreurs BigQuery/GCP).
- Codes des éléments refusés (`rejected[].code`, message FR prêt à afficher) : `duplicate` (élément répété dans la demande,
  rien n'est écrit pour lui), `invalid_decision`, `not_found` (valeur ré-enrichie ou page de rapprochement changée :
  recharger), `invalid_status`, `match_not_approved`, `corrected_value_required`, `invalid_corrected_value`.
- Autres codes d'erreur : `invalid_request` (400), `invalid_cursor` (400), `author_required`, `author_invalid` (401), `author_forbidden` (403), `hotel_not_found`,
  `field_not_found`, `execution_not_found`, `file_not_found` (404), `export_blocked` (409), `payload_too_large` (413,
  corps > 2 Mo : découper le lot), `upstream_error` (502).

## Types
```ts
type ValueStatus = 'pending_enrichment'|'needs_review'|'auto_approved'|'auto_rejected'|'human_approved'|'human_rejected'|'human_corrected';
type MatchStatus = 'pending_judgment'|'needs_review'|'auto_approved'|'auto_rejected'|'human_approved'|'human_rejected';
type Family = 'general'|'accessibility_safety'|'dining'|'pool'|'parking'|'wellness_fitness';
type Priority = 'P1'|'P2'|'P3';

interface HotelSummary {
  rid: string; name: string; brand: string|null; city: string|null; country: string|null;
  sources: string[];            // sources validées ayant des valeurs à relire
  toReviewCount: number;        // valeurs needs_review sur rapprochement validé
  avgScore: number|null;        // moyenne des scores à relire, 0-100
  pendingCount: number;         // champs pending_enrichment
  conflictCount: number;        // auto_rejected reason=pim_conflict
  families: Family[];
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
  lastDecision: Decision|null;
}

interface HotelDetail {
  hotel: Omit<HotelSummary,'toReviewCount'|'avgScore'|'pendingCount'|'conflictCount'|'families'>;
  toReview: EnrichmentValue[];  // needs_review, rapprochement validé, tri priorité puis score desc
  pending: EnrichmentValue[];   // pending_enrichment
  conflicts: EnrichmentValue[]; // auto_rejected / pim_conflict
  decided: EnrichmentValue[];   // human_* (historique)
}

interface MatchItem {
  rid: string; source: string; sourceHash: string;
  pim: { name: string|null; city: string|null; country: string|null; brand: string|null; address: string|null };
  page: { scrapedName: string|null; pageName: string|null; url: string|null; country: string|null };
  preVerdict: string|null; preReason: string|null;
  score: number|null; confidence: string|null; judgeReason: string|null; justification: string|null;
  status: MatchStatus; lastDecision: Decision|null;
}

interface Stats { hotelsToReview: number; hotelsPending: number; valuesToReview: number; matchesToReview: number; valuesPending: number; valuesApproved: number; pendingForExport: number; }

interface FieldValues { pimField: string; dataType: string; multivalue: boolean; values: { key: string; label: string }[]; }
```

## Endpoints
| Méthode | Chemin | Réponse | Notes |
|---|---|---|---|
| GET | `/healthz` | `{status:'ok'}` | |
| GET | `/stats` | `Stats` | `pendingForExport` = compte du job d'export ; il peut inclure des champs `pending_enrichment` d'hôtels dont plus aucun rapprochement n'est validé (invisibles dans les listes) |
| GET | `/hotels?view&brand&source&family&priority&search&limit&cursor` | `{items: HotelSummary[], nextCursor}` | `view=review` (défaut) : fiches avec ≥1 valeur à relire ; filtre `EXISTS v_approved_matches` obligatoire ; tri priorité min puis avgScore desc. `view=pending` : fiches avec ≥1 champ `pending_enrichment` (filtres `family`/`priority` appliqués à ces champs, `source` aux sources validées), tri pendingCount desc |
| GET | `/hotels/facets` | `{brands: string[], sources: string[]}` | listes des filtres |
| GET | `/hotels/:rid` | `HotelDetail` | 404 si inconnu ; `hotel.sources` = toutes les sources dont le rapprochement est validé (PIM-19), pas seulement celles qui ont des valeurs à relire |
| POST | `/decisions/enrichments` | `{accepted: string[], rejected: {enrichmentId, code, message}[]}` | corps `{items: {enrichmentId, decision: 'human_approved'|'human_rejected'|'human_corrected', correctedValue?, comment?}[]}` ; contrôles du contrat § 3.2-3.3 ; un seul INSERT |
| GET | `/fields/:pimField/values` | `FieldValues` | codes autorisés (vue `enhanced.v_field_allowed_values`, livrée par la session infra) |
| GET | `/matches?source&limit&cursor` | `{items: MatchItem[], nextCursor}` | `final_status = 'needs_review'` |
| POST | `/decisions/matches` | `{accepted: string[], rejected: {key, code, message}[]}` | corps `{items: {rid, source, sourceHash, decision: 'human_approved'|'human_rejected', comment?}[]}` ; `key` = `rid|source|sourceHash` |
| GET | `/export/status` | `{pendingCount: number, canExport: boolean, history: {exportId, path, rowCount, hotelCount, files: string[], triggeredBy, exportedAt}[]}` | |
| POST | `/export` | `{executionId}` | lance `gcrj-<base>-export` (Cloud Run jobs.run) ; 409 si pendingCount > 0 |
| GET | `/export/executions/:id` | `{state: 'running'|'succeeded'|'failed', message?}` | |
| GET | `/exports/:exportId/files/:name` | flux du fichier (Content-Disposition) | lecture du bucket exports |

## Modifications proposées
- 21/10 [front] ✅ acceptée par back (11:50), intégrée ci-dessus : `GET /hotels?view=pending` et `Stats.hotelsPending` (fiches ayant ≥1 champ `pending_enrichment`), pour l'onglet « En cours » de PIM-17. Tant que le back ne les sert pas, le front affiche l'onglet vide avec un message.
