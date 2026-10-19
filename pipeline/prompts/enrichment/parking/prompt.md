# Famille : parking

Entités liées Parking. Source principale : Booking `parking`, de la forme
« [Private parking is possible on site (reservation is needed) and costs € 9 per day.] ; Parking garage ; Accessible parking ».
Expedia `policies` et `important_info` peuvent confirmer le tarif.

- Payant : « costs », « charge » → True ; « Free parking » → False.
- Type : « Private » ou « Public ». Emplacement : « on site » → sur place ; « at a location nearby » → à proximité.
- Tarif : le montant seul (« € 9 » → 9), la devise dans `alerte` ; mode de tarification : « per day », « per hour »…
- Services et accessibilité : voiturier (« Valet parking »), place accessible (« Accessible parking ») ; borne de recharge
  (« Electric vehicle charging station ») → True ; parking couvert (« Parking garage »).
- « No parking available » : ne propose rien, mets les cibles en `non_traitees` avec le motif « pas de parking selon Booking ».
