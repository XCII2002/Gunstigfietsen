# Gunstig Fietsen

Een kleine webapp die een fietsroute genereert op basis van een gewenste
afstand, rekening houdend met de actuele windrichting. De route is altijd
een volledige rondrit (nooit twee keer dezelfde weg): de heenweg wint per
saldo terrein tegen de wind in, de terugweg juist met de wind mee.

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

De app haalt de actuele windrichting/-snelheid op voor de startlocatie en
bouwt daarmee een ellipsvormige lus rond het startpunt, uitgerekt langs de
windrichting: het startpunt ligt op de "benedenwindse" pool, het verste
punt van de lus op de "bovenwindse" pool. OSRM berekent vervolgens via de
tussenliggende waypoints een fietsroute door het wegennetwerk die deze lus
volgt. De heenweg (oranje, eerste helft van de lus) wint zo per saldo
terrein tegen de wind in, de terugweg (groen, gestippeld, tweede helft) juist
met de wind mee. Onderweg is er, zoals bij elke rondrit, ook een stuk
zijwind — dat is onvermijdelijk zodra je niet dezelfde weg heen en terug
neemt.

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
- De lusvorm (`LOOP_ASPECT_RATIO` in `app.js`) is een benadering: hoe
  langgerekter de ellips, hoe minder zijwind maar hoe "dunner"/kunstmatiger
  de lus; hoe ronder, hoe natuurlijker maar hoe meer zijwind-aandeel.
- De werkelijke padlengte via het wegennetwerk wijkt altijd iets af van de
  theoretische ellipsomtrek (vandaar "gevraagde" vs. "werkelijke" afstand
  in de resultaten).

## Bestanden

- `index.html` — pagina-structuur
- `style.css` — vormgeving
- `app.js` — kaartlogica, geocoding, windophaal, routeberekening
