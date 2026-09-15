# Gunstig Fietsen

Een kleine webapp die een fietsroute genereert op basis van een gewenste
afstand, rekening houdend met de actuele windrichting: de heenweg gaat
tegen de wind in, de terugweg met de wind mee.

## Gebruik

1. Open `index.html` in een browser, of serveer de map lokaal (aanbevolen
   i.v.m. geolocatie/CORS in sommige browsers):

   ```bash
   python3 -m http.server 8000
   # of: npx serve
   ```

   en ga naar `http://localhost:8000`.

2. Kies een startlocatie: zoek een plaats/adres, klik "Gebruik mijn
   locatie", of klik direct op de kaart (de pin is ook versleepbaar).
3. Vul de gewenste afstand in km in.
4. Klik op **Genereer route**.

De app haalt de actuele windrichting/-snelheid op voor de startlocatie,
berekent een keerpunt op de helft van de afstand pal richting de bron van
de wind, en laat OSRM een fietsroute daarheen en terug berekenen. De
heenweg (oranje) is dus tegenwind, de terugweg (groen, gestippeld) is
meewind.

## Gebruikte diensten (geen API-key nodig)

- **Kaart**: [OpenStreetMap](https://www.openstreetmap.org/) tiles
- **Zoeken/geocoding**: [Nominatim](https://nominatim.org/)
- **Wind**: [Open-Meteo](https://open-meteo.com/) forecast API
- **Routering**: [OSRM publieke demoserver](https://project-osrm.org/)
  (`router.project-osrm.org`, profiel `driving`)

Dit zijn allemaal gratis publieke diensten met een *fair-use*-beleid — prima
voor persoonlijk gebruik, maar niet bedoeld voor veel verkeer/productie.

## Bekende beperkingen

- De OSRM-demoserver heeft alleen een `driving`-profiel; de route volgt dus
  het gewone wegennet en geen fietspaden-specifieke routering. Voor echte
  fietsrouting kun je `OSRM_BASE` in `app.js` vervangen door bijvoorbeeld
  [OpenRouteService](https://openrouteservice.org/) (profiel
  `cycling-regular`, gratis API-key vereist) of een eigen OSRM-instance met
  het `bike`-profiel.
- De strategie gaat uit van de *huidige* wind op het startpunt; wind
  onderweg of bij vertrek in de toekomst kan afwijken.
- Het is een heen-en-terugroute (out-and-back), geen rondrit.

## Bestanden

- `index.html` — pagina-structuur
- `style.css` — vormgeving
- `app.js` — kaartlogica, geocoding, windophaal, routeberekening
