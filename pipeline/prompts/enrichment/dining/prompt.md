# Famille : restauration

Champs de l'hôtel (bar, room service, menu enfant) et entités liées Bar, Breakfast, Restaurant. Sources utiles :
Booking `food_drink`, `general`, `services` ; Expedia `important_info` (petit-déjeuner), points forts.

- Bar : « Bar » dans Food & Drink → bar disponible. Le type (bar, bar de piscine, snack bar) se choisit dans la liste PIM.
- Room service : « Room service » → True.
- Petit-déjeuner : payant (« Fee for breakfast », montant) → Charged True ; inclus ou gratuit → False. Catégorie (buffet,
  continental…) selon la liste PIM.
- Restaurant : types de cuisine ou menus (enfants, régimes spéciaux) seulement s'ils sont cités.
