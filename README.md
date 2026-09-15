# Gunstig Fietsen

Een webapp die een fietsroute genereert op basis van een gewenste afstand,
rekening houdend met de actuele windrichting. De route is altijd een
volledige rondrit (nooit twee keer dezelfde weg): de heenweg wint per saldo
terrein tegen de wind in, de terugweg juist met de wind mee.

De app is klaar om te gebruiken als:

- **website / PWA** — direct in de browser, en installeerbaar op het
  beginscherm van een iPhone (werkt dan als een "echte" app);
- **native iOS-app** via een kant-en-klare [Capacitor](https://capacitorjs.com/)-wrapper,
  te builden met Xcode voor TestFlight/App Store.

## Projectstructuur

```
www/                  de webapp zelf (dit is de enige "bron van waarheid")
  index.html
  style.css
  app.js
  manifest.json       PWA-manifest
  sw.js                service worker (cachet de app-shell)
  icons/               app-iconen + splash (PNG's + SVG-bronbestanden)
capacitor.config.json  Capacitor-configuratie (wijst naar www/)
package.json           npm-scripts + Capacitor-afhankelijkheden
ios/                    gegenereerd native Xcode-project (na `cap add ios`)
```

## 1. Gebruiken als website / PWA

Serveer de map `www/` lokaal (nodig voor geolocatie, service worker en om
CORS-gedoe te voorkomen):

```bash
npm install
npm start          # serveert www/ op http://localhost:8080
```

Of zonder npm: `python3 -m http.server 8000 --directory www`.

1. Kies een startlocatie: zoek een plaats/adres, klik "Gebruik mijn
   locatie", of klik direct op de kaart (de pin is ook versleepbaar).
2. Vul de gewenste afstand in km in.
3. Klik op **Genereer route**.

### Installeren op een iPhone (geen App Store nodig)

1. Host `www/` ergens met **HTTPS** (bv. [GitHub Pages](https://pages.github.com/),
   Netlify of Vercel — allemaal gratis). Een PWA is alléén volledig
   installeerbaar/offline-vriendelijk over HTTPS (of `localhost`).
2. Open de site in **Safari** op de iPhone.
3. Tik op het deel-icoon → **"Zet op beginscherm"**.

De app krijgt dan een eigen icoon, opent zonder Safari-balken (`display:
standalone`), en de service worker (`sw.js`) zorgt dat de app-shell
(HTML/CSS/JS/iconen) ook bij een wankele verbinding snel laadt. De live
gegevens (kaart, wind, geocoding, route) blijven altijd een actieve
internetverbinding vereisen.

## 2. Bouwen als native iOS-app (Capacitor + Xcode)

Dit vereist een **Mac met Xcode en CocoaPods**, en voor TestFlight/App
Store een **Apple Developer-account**. Dat kan ik vanuit deze (Linux)
omgeving niet builden of testen — de onderstaande stappen zijn wat je zelf
op je Mac moet uitvoeren. Het `ios/`-project in deze repo is al
gegenereerd (`npx cap add ios`) en bevat:

- een Xcode-project (`ios/App/App.xcodeproj`) met het juiste app-icoon en
  een eigen splash screen (uit `www/icons/`);
- `NSLocationWhenInUseUsageDescription` in `Info.plist`, nodig voor de
  locatieknop;
- de `@capacitor/geolocation`-plugin, al gekoppeld in de Podfile —
  `app.js` gebruikt automatisch de native plugin zodra de app niet in een
  browser maar in de Capacitor-shell draait (zie `getCurrentPosition()` in
  `app.js`), met de gewone browser-Geolocation-API als fallback voor de
  PWA.

Stappen op je Mac:

```bash
npm install                 # als je dat nog niet had gedaan
npx cap sync ios            # kopieert www/ naar ios/, installeert pods
npx cap open ios            # opent het project in Xcode
```

In Xcode:

1. Kies je project → target **App** → tab **Signing & Capabilities** → zet
   je eigen **Team** (Apple Developer-account).
2. Verander de **Bundle Identifier** (nu `nl.gunstigfietsen.app`, in
   `capacitor.config.json`) naar iets unieks onder jouw eigen account —
   pas dat daarna ook aan in `capacitor.config.json` en run `npx cap sync
   ios` opnieuw.
3. Kies een simulator of aangesloten iPhone en druk op **Run** om te
   testen.
4. Voor TestFlight/App Store: **Product → Archive**, en volg de
   Organizer om te uploaden naar App Store Connect.

Wijzig je later iets in `www/` (de webapp), draai dan telkens `npx cap
sync ios` om die wijziging naar het Xcode-project te kopiëren.

### App-icoon en splash aanpassen

De bronvectoren staan in `www/icons/icon.svg`, `icon-maskable.svg` en
`splash.svg`. Pas ze aan en render opnieuw naar PNG (bv. met een
headless browser of een tool als `resvg`/Inkscape) naar dezelfde
bestandsnamen in `www/icons/`, en kopieer de resultaten handmatig naar
`ios/App/App/Assets.xcassets/AppIcon.appiconset/` en
`.../Splash.imageset/` (of vervang ze na een verse `npx cap add ios`).

## Gebruikte diensten

- **Kaart**: [OpenStreetMap](https://www.openstreetmap.org/) tiles
- **Zoeken/geocoding**: [Nominatim](https://nominatim.org/)
- **Wind**: [Open-Meteo](https://open-meteo.com/) forecast API
- **Routering**: [OSRM publieke demoserver](https://project-osrm.org/)
  (`router.project-osrm.org`, profiel `driving`)

Deze zijn allemaal gratis met een *fair-use*-beleid — prima voor
persoonlijk gebruik of testen, maar **niet geschikt voor een echt
gepubliceerde App Store-app** met onbekend/groter verkeersvolume: geen
SLA, agressieve rate-limits, en het gebruik van iemands anders z'n gratis
infrastructuur voor een commercieel/publiek product schendt hun
usage policy. Vervang ze vóór een echte release door:

- een eigen gehoste Nominatim/OSRM-instance, of een betaalde
  geocoding/routing-API (bv. [Mapbox](https://www.mapbox.com/),
  [OpenRouteService](https://openrouteservice.org/), Google);
- Open-Meteo mag doorgaans wel voor grotere volumes (heeft een ruimere
  gratis laag en een betaalde tier), maar controleer hun voorwaarden.

## Bekende beperkingen

- De OSRM-demoserver heeft alleen een `driving`-profiel; de route volgt dus
  het gewone wegennet en geen fietspaden-specifieke routering. Voor echte
  fietsrouting kun je `OSRM_BASE` in `www/app.js` vervangen door
  bijvoorbeeld OpenRouteService (profiel `cycling-regular`, gratis
  API-key) of een eigen OSRM-instance met het `bike`-profiel.
- De strategie gaat uit van de *huidige* wind op het startpunt; wind
  onderweg of bij vertrek in de toekomst kan afwijken.
- De lusvorm (`LOOP_ASPECT_RATIO` in `www/app.js`) is een benadering: hoe
  langgerekter de ellips, hoe minder zijwind maar hoe "dunner"/kunstmatiger
  de lus; hoe ronder, hoe natuurlijker maar hoe meer zijwind-aandeel.
- De werkelijke padlengte via het wegennetwerk wijkt altijd iets af van de
  theoretische ellipsomtrek (vandaar "gevraagde" vs. "werkelijke" afstand
  in de resultaten).

## Bestanden

- `www/index.html` — pagina-structuur + PWA/iOS meta-tags
- `www/style.css` — vormgeving, incl. safe-area-opvulling voor notch/home-indicator
- `www/app.js` — kaartlogica, geocoding, windophaal, routeberekening, geolocatie (web + native)
- `www/manifest.json`, `www/sw.js` — PWA-manifest en service worker
- `www/icons/` — app-iconen en splash (PNG's + SVG-bronnen)
- `capacitor.config.json`, `package.json` — Capacitor-configuratie
- `ios/` — gegenereerd native Xcode-project
