# Famille : accueil, langues et services de l'hôtel

Champs de l'hôtel lui-même (`id_entite` = null). Sources utiles : Booking `check_in`, `check_out`, `general`,
`reception_services`, `services`, `languages_spoken`… ; Expedia `policies` (horaires), `important_info`.

- Check-in et check-out : l'heure de début du check-in (« From 15:00 » → 15:00) et l'heure limite du check-out
  (« Until 12:00 » → 12:00). Une plage « 15:00 - 23:00 » donne 15:00. Si Booking et Expedia diffèrent, propose Booking et signale l'écart.
- Langues : ajoute les langues de Booking `languages_spoken` absentes de `valeur_pim`, si elles sont dans la liste PIM.
- Non-fumeur : True seulement si la source dit que tout l'établissement est non-fumeur (« Non-smoking throughout »).
- Services gratuits ou payants : ne classe un service que si la source précise gratuit ou payant ; sinon, liste générale si elle existe.
