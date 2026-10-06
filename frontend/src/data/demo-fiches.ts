export interface DemoAttribute {
  label: string;
  current: string;
  proposed: string;
  score: number;
  src: string;
  accepted: null;
  statusInitial: string;
}

export interface DemoFiche {
  id: number;
  name: string;
  brand: string;
  city: string;
  source: string;
  score: number;
  statusInitial: string;
  statusLabelInitial: string;
  selected: boolean;
  attrs: DemoAttribute[];
}

/** Copie du JSON de docs/01-duplication-spec.md §7.6. Les champs statusInitial sont jetés au chargement. */
export const demoFiches: DemoFiche[] = [
  {
    "id": 1,
    "name": "Novotel Paris Centre Tour Eiffel",
    "brand": "Novotel",
    "city": "Paris, France",
    "source": "Booking.com",
    "score": 1,
    "statusInitial": "valide",
    "statusLabelInitial": "Validée",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "75015 Paris (code postal seul)",
        "proposed": "61 Quai de Grenelle, 75015 Paris — 48.8496, 2.2865",
        "score": 1,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Équipements & services",
        "current": "Wifi",
        "proposed": "Wifi gratuit, salle de sport, bar panoramique, room service, parking payant",
        "score": 1,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Hôtel 4★ avec vue sur la Seine, à 10 min à pied de la Tour Eiffel, idéal séjours affaires et loisirs.",
        "score": 0.98,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Classification (catégorie)",
        "current": "Non renseigné",
        "proposed": "4 étoiles",
        "score": 1,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+33 1 40 58 20 00 · h0367@accor.com",
        "score": 1,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Photo façade HD (vue Seine)",
        "score": 0.97,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      }
    ]
  },
  {
    "id": 2,
    "name": "ibis Lyon Part-Dieu",
    "brand": "ibis",
    "city": "Lyon, France",
    "source": "Expedia",
    "score": 0.92,
    "statusInitial": "haute",
    "statusLabelInitial": "Confiance haute",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "Lyon (ville seule)",
        "proposed": "28 Rue Maurice Flandin, 69003 Lyon — 45.7614, 4.8574",
        "score": 0.96,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Équipements & services",
        "current": "Non renseigné",
        "proposed": "Wifi gratuit, bar, distributeur snacking, parking privé sur réservation",
        "score": 0.9,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Hôtel économique proche gare Part-Dieu, accès direct métro et tramway.",
        "score": 0.9,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Classification (catégorie)",
        "current": "3 étoiles",
        "proposed": "3 étoiles",
        "score": 1,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "Téléphone seul",
        "proposed": "+33 4 72 68 31 00 · h1478@accor.com",
        "score": 0.92,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Photo de couverture",
        "current": "Photo basse résolution",
        "proposed": "Photo façade HD",
        "score": 0.85,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      }
    ]
  },
  {
    "id": 3,
    "name": "Mercure Marseille Vieux-Port",
    "brand": "Mercure",
    "city": "Marseille, France",
    "source": "Booking.com",
    "score": 0.88,
    "statusInitial": "haute",
    "statusLabelInitial": "Confiance haute",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "13001 Marseille",
        "proposed": "1 Rue Neuve Saint-Martin, 13001 Marseille — 43.2986, 5.3745",
        "score": 0.95,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Équipements & services",
        "current": "Wifi, Parking",
        "proposed": "Wifi gratuit, parking privé, bar, restaurant, salles de réunion (3)",
        "score": 0.86,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "À deux pas du Vieux-Port, hôtel 4★ au décor contemporain inspiré de la Méditerranée.",
        "score": 0.83,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Classification (catégorie)",
        "current": "Non renseigné",
        "proposed": "4 étoiles",
        "score": 0.88,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+33 4 96 17 22 22 · h0542@accor.com",
        "score": 0.9,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Photo hall d'accueil HD",
        "score": 0.84,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      }
    ]
  },
  {
    "id": 4,
    "name": "Sofitel Nice Riviera",
    "brand": "Sofitel",
    "city": "Nice, France",
    "source": "Salesforce - contact center",
    "score": 0.45,
    "statusInitial": "echec",
    "statusLabelInitial": "Échec",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "06000 Nice",
        "proposed": "12-14 Avenue Félix Faure, 06000 Nice — coordonnées non confirmées (conflit Booking/Expedia)",
        "score": 0.4,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Équipements & services",
        "current": "Non renseigné",
        "proposed": "Spa, piscine intérieure, 2 restaurants — liste partielle, doublons détectés",
        "score": 0.35,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Texte tronqué en cours de collecte, à retravailler avant publication.",
        "score": 0.3,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Classification (catégorie)",
        "current": "5 étoiles",
        "proposed": "4 étoiles (valeur contradictoire avec le PIM)",
        "score": 0.4,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Coordonnées de contact",
        "current": "Téléphone seul",
        "proposed": "+33 4 92 00 00 00 (email non confirmé)",
        "score": 0.55,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Aucune photo exploitable collectée",
        "score": 0.6,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      }
    ]
  },
  {
    "id": 5,
    "name": "Pullman Bordeaux Aquitania",
    "brand": "Pullman",
    "city": "Bordeaux, France",
    "source": "Expedia",
    "score": 0.95,
    "statusInitial": "haute",
    "statusLabelInitial": "Confiance haute",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "Bordeaux (ville seule)",
        "proposed": "Rue Jean Samazeuilh, 33300 Bordeaux — 44.8547, -0.5678",
        "score": 0.97,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Équipements & services",
        "current": "Wifi",
        "proposed": "Wifi gratuit, piscine extérieure, bar, restaurant panoramique, centre d'affaires",
        "score": 0.96,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Hôtel 4★ face au Parc des Expositions, vue sur la Garonne depuis le bar au 15ème étage.",
        "score": 0.94,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Classification (catégorie)",
        "current": "4 étoiles",
        "proposed": "4 étoiles",
        "score": 1,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+33 5 56 69 66 66 · h1445@accor.com",
        "score": 0.93,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Photo de couverture",
        "current": "Photo basse résolution",
        "proposed": "Photo vue Garonne HD",
        "score": 0.92,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      }
    ]
  },
  {
    "id": 6,
    "name": "MGallery Lille Vauban",
    "brand": "MGallery",
    "city": "Lille, France",
    "source": "Booking.com",
    "score": 0.62,
    "statusInitial": "revoir",
    "statusLabelInitial": "À revoir",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "59000 Lille",
        "proposed": "5 Square Daubenton, 59800 Lille — 50.6394, 3.0553",
        "score": 0.8,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Équipements & services",
        "current": "Non renseigné",
        "proposed": "Wifi gratuit, bar à vins, jardin intérieur — 2 équipements non confirmés",
        "score": 0.55,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Ancien couvent du 17ème siècle réhabilité, charme et caractère au cœur du Vieux-Lille.",
        "score": 0.75,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Classification (catégorie)",
        "current": "Non renseigné",
        "proposed": "4 étoiles (à confirmer)",
        "score": 0.5,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+33 3 20 06 58 58",
        "score": 0.6,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Photo façade historique HD",
        "score": 0.55,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      }
    ]
  },
  {
    "id": 7,
    "name": "Novotel Amsterdam City",
    "brand": "Novotel",
    "city": "Amsterdam, Pays-Bas",
    "source": "Booking.com",
    "score": 1,
    "statusInitial": "valide",
    "statusLabelInitial": "Validée",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "Amsterdam (ville seule)",
        "proposed": "Europaboulevard 10, 1083 AD Amsterdam — 52.3384, 4.8907",
        "score": 1,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Équipements & services",
        "current": "Wifi",
        "proposed": "Wifi gratuit, piscine, salle de sport, bar, parking privé",
        "score": 1,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Hôtel familial proche RAI Convention Centre, accès direct métro vers le centre-ville.",
        "score": 0.97,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Classification (catégorie)",
        "current": "Non renseigné",
        "proposed": "4 étoiles",
        "score": 1,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+31 20 541 1123 · h1121@accor.com",
        "score": 1,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Photo façade HD",
        "score": 0.98,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      }
    ]
  },
  {
    "id": 8,
    "name": "ibis Berlin Mitte",
    "brand": "ibis",
    "city": "Berlin, Allemagne",
    "source": "Expedia",
    "score": 0.7,
    "statusInitial": "revoir",
    "statusLabelInitial": "À revoir",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "Berlin (ville seule)",
        "proposed": "Prenzlauer Allee 4, 10405 Berlin — 52.5283, 13.4155",
        "score": 0.85,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Équipements & services",
        "current": "Non renseigné",
        "proposed": "Wifi gratuit, bar, distributeur snacking — équipements sport non confirmés",
        "score": 0.65,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Hôtel économique proche Alexanderplatz, accès rapide aux transports en commun.",
        "score": 0.72,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Classification (catégorie)",
        "current": "3 étoiles",
        "proposed": "3 étoiles",
        "score": 1,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "Téléphone seul",
        "proposed": "+49 30 443 1450 (email non confirmé)",
        "score": 0.5,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Photo de couverture",
        "current": "Photo basse résolution",
        "proposed": "Photo façade HD",
        "score": 0.68,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "revoir"
      }
    ]
  },
  {
    "id": 9,
    "name": "Mercure Milano Centro",
    "brand": "Mercure",
    "city": "Milan, Italie",
    "source": "Booking.com",
    "score": 0.83,
    "statusInitial": "haute",
    "statusLabelInitial": "Confiance haute",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "Milano (ville seule)",
        "proposed": "Via Napo Torriani 9, 20124 Milano — 45.4823, 9.2044",
        "score": 0.9,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Équipements & services",
        "current": "Wifi",
        "proposed": "Wifi gratuit, bar, salle de sport, salles de réunion (4)",
        "score": 0.85,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "À 200m de la gare centrale, hôtel 4★ au design contemporain pour voyageurs d'affaires.",
        "score": 0.8,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Classification (catégorie)",
        "current": "Non renseigné",
        "proposed": "4 étoiles",
        "score": 0.85,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+39 02 6749 9, h0319@accor.com",
        "score": 0.78,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Photo hall d'accueil HD",
        "score": 0.8,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      }
    ]
  },
  {
    "id": 10,
    "name": "Sofitel Barcelona Skipper",
    "brand": "Sofitel",
    "city": "Barcelone, Espagne",
    "source": "Salesforce - contact center",
    "score": 0.58,
    "statusInitial": "revoir",
    "statusLabelInitial": "À revoir",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "Barcelona (ville seule)",
        "proposed": "Carrer de la Marina 16-18, 08005 Barcelona — 41.3874, 2.1979",
        "score": 0.7,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Équipements & services",
        "current": "Non renseigné",
        "proposed": "Spa, piscine sur toit, restaurant gastronomique — liste à vérifier (source unique)",
        "score": 0.5,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Face à la plage de la Barceloneta, hôtel 5★ avec vue sur le port olympique.",
        "score": 0.55,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Classification (catégorie)",
        "current": "Non renseigné",
        "proposed": "5 étoiles (à confirmer)",
        "score": 0.5,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+34 932 21 10 00",
        "score": 0.6,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Aucune photo exploitable collectée",
        "score": 0.55,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      }
    ]
  },
  {
    "id": 11,
    "name": "Pullman Toulouse Centre",
    "brand": "Pullman",
    "city": "Toulouse, France",
    "source": "Expedia",
    "score": 0.91,
    "statusInitial": "haute",
    "statusLabelInitial": "Confiance haute",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "Toulouse (ville seule)",
        "proposed": "84 Allées Jean Jaurès, 31000 Toulouse — 43.6096, 1.4558",
        "score": 0.95,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Équipements & services",
        "current": "Wifi",
        "proposed": "Wifi gratuit, salle de sport, bar, restaurant, parking privé",
        "score": 0.92,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Hôtel 4★ au cœur de la Ville Rose, à 5 min à pied de la place du Capitole.",
        "score": 0.9,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Classification (catégorie)",
        "current": "4 étoiles",
        "proposed": "4 étoiles",
        "score": 1,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+33 5 61 10 23 10 · h1076@accor.com",
        "score": 0.88,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Photo de couverture",
        "current": "Photo basse résolution",
        "proposed": "Photo façade HD",
        "score": 0.85,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      }
    ]
  },
  {
    "id": 12,
    "name": "MGallery Strasbourg Cathédrale",
    "brand": "MGallery",
    "city": "Strasbourg, France",
    "source": "Booking.com",
    "score": 0.38,
    "statusInitial": "echec",
    "statusLabelInitial": "Échec",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "67000 Strasbourg",
        "proposed": "Adresse en conflit entre sources — non résolue automatiquement",
        "score": 0.3,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Équipements & services",
        "current": "Non renseigné",
        "proposed": "Liste quasi vide — collecte incomplète côté source",
        "score": 0.25,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Texte générique non spécifique à l'établissement, à réécrire.",
        "score": 0.35,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Classification (catégorie)",
        "current": "Non renseigné",
        "proposed": "Non déterminée",
        "score": 0.2,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "echec"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+33 3 88 32 10 10 (email non confirmé)",
        "score": 0.55,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Aucune photo exploitable collectée",
        "score": 0.6,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      }
    ]
  },
  {
    "id": 13,
    "name": "Novotel Nantes Centre Gare",
    "brand": "Novotel",
    "city": "Nantes, France",
    "source": "Expedia",
    "score": 1,
    "statusInitial": "valide",
    "statusLabelInitial": "Validée",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "44000 Nantes",
        "proposed": "1 Boulevard de Stalingrad, 44000 Nantes — 47.2158, -1.5410",
        "score": 1,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Équipements & services",
        "current": "Wifi",
        "proposed": "Wifi gratuit, bar, restaurant, parking privé, salles de réunion (2)",
        "score": 0.98,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Face à la gare SNCF, hôtel 4★ idéal pour une clientèle affaires et TGV.",
        "score": 0.97,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Classification (catégorie)",
        "current": "4 étoiles",
        "proposed": "4 étoiles",
        "score": 1,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "—",
        "proposed": "+33 2 40 12 91 91 · h0567@accor.com",
        "score": 1,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Photo de couverture",
        "current": "Image générique",
        "proposed": "Photo façade HD",
        "score": 0.98,
        "src": "Expedia",
        "accepted": null,
        "statusInitial": "haute"
      }
    ]
  },
  {
    "id": 14,
    "name": "ibis Rennes Centre Gare",
    "brand": "ibis",
    "city": "Rennes, France",
    "source": "Booking.com",
    "score": 0.76,
    "statusInitial": "revoir",
    "statusLabelInitial": "À revoir",
    "selected": false,
    "attrs": [
      {
        "label": "Adresse & géolocalisation",
        "current": "35000 Rennes",
        "proposed": "22 Boulevard Beaumont, 35000 Rennes — 48.1023, -1.6689",
        "score": 0.88,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "haute"
      },
      {
        "label": "Équipements & services",
        "current": "Non renseigné",
        "proposed": "Wifi gratuit, bar, distributeur snacking, parking payant",
        "score": 0.78,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Description commerciale",
        "current": "Non renseigné",
        "proposed": "Hôtel économique à 5 min à pied de la gare, proche du centre historique.",
        "score": 0.75,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Classification (catégorie)",
        "current": "3 étoiles",
        "proposed": "3 étoiles",
        "score": 1,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "valide"
      },
      {
        "label": "Coordonnées de contact",
        "current": "Téléphone seul",
        "proposed": "+33 2 99 30 28 28 (email non confirmé)",
        "score": 0.55,
        "src": "Salesforce",
        "accepted": null,
        "statusInitial": "revoir"
      },
      {
        "label": "Photo de couverture",
        "current": "Photo basse résolution",
        "proposed": "Photo façade HD",
        "score": 0.7,
        "src": "Booking.com",
        "accepted": null,
        "statusInitial": "revoir"
      }
    ]
  }
];
