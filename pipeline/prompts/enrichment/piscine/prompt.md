# Famille : piscines

Champs de l'hôtel (nombre de piscines, piscine disponible) et entités liées Pool. Sources utiles : Booking `nb_piscines`
et `piscine_1` à `piscine_15` (une colonne par piscine : « outdoor, Open all year, Heated pool… »), fichier piscines `nb_pool`,
Expedia points forts.

- Nombre de piscines : Booking `nb_piscines`, ou `nb_pool` du fichier piscines ; s'ils diffèrent, propose Booking et signale l'écart.
- Une piscine Booking = une entité : type intérieur ou extérieur (« indoor », « outdoor »), chauffée (« Heated pool »),
  à débordement (« Infinity pool »), payante (« Additional charge »), eau salée (« Salt-water pool »).
- Hôtel sans piscine dans le PIM : une entité `nouvelle_<n>` par piscine décrite sur Booking.
