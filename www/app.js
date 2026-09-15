"use strict";

/*
 * Gunstig Fietsen — windgerichte routeplanner.
 *
 * Strategie: bij een fietstocht is het prettiger om de tegenwind op de
 * heenweg te hebben (als je nog fris bent) en de meewind op de terugweg.
 * Deze app genereert daarom altijd een volledige rondrit (geen twee keer
 * dezelfde weg): een ellipsvormige lus, uitgerekt langs de windrichting,
 * met het startpunt op één van de polen. De eerste helft van de lus
 * (de heenweg) legt daardoor steeds per saldo afstand af tegen de wind
 * in; de tweede helft (de terugweg) juist met de wind mee. Onderweg is
 * er onvermijdelijk ook wat zijwind — dat hoort bij elke rondrit.
 */

const DEFAULT_CENTER = [52.0907, 5.1214]; // Utrecht, NL
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
// Publieke OSRM-demoserver (alleen "driving"-profiel beschikbaar zonder
// eigen server; volgt gewoon wegennetwerk, geen fietspaden-specifiek).
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

// Vorm van de rondrit-lus: hoe kleiner LOOP_ASPECT_RATIO, hoe langgerekter
// de ellips (meer pure tegenwind/meewind, minder zijwind), hoe dichter bij
// 1, hoe ronder/natuurlijker de lus (meer zijwind-gedeelte).
const LOOP_ASPECT_RATIO = 0.55;

let map;
let startMarker = null;
let startLatLng = null;
let routeLayers = [];

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  bindUI();
  registerServiceWorker();
});

function registerServiceWorker() {
  // Alleen relevant voor de PWA/web-variant; in een native Capacitor-app
  // wordt de webview al vanaf schijf geladen en is dit niet nodig.
  if (!("serviceWorker" in navigator) || (window.Capacitor && window.Capacitor.isNativePlatform())) {
    return;
  }
  navigator.serviceWorker.register("sw.js").catch(() => {
    /* geen kritieke functionaliteit; stil negeren als registratie faalt */
  });
}

function initMap() {
  map = L.map("map").setView(DEFAULT_CENTER, 8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers',
  }).addTo(map);

  map.on("click", (e) => setStart(e.latlng.lat, e.latlng.lng));
}

function bindUI() {
  document.getElementById("search-btn").addEventListener("click", handleSearch);
  document.getElementById("location-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  });
  document.getElementById("geolocate-btn").addEventListener("click", handleGeolocate);
  document.getElementById("generate-btn").addEventListener("click", handleGenerate);
}

function setStatus(message, type) {
  const el = document.getElementById("status");
  el.textContent = message || "";
  el.className = "status" + (type ? " " + type : "");
}

function setStart(lat, lng, label) {
  startLatLng = { lat, lng };

  if (startMarker) {
    map.removeLayer(startMarker);
  }
  startMarker = L.marker([lat, lng], { draggable: true }).addTo(map);
  startMarker.on("dragend", () => {
    const p = startMarker.getLatLng();
    startLatLng = { lat: p.lat, lng: p.lng };
    setStatus(`Startpunt verplaatst naar ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`, "success");
  });

  map.setView([lat, lng], 12);
  setStatus(
    label ? `Startpunt: ${label}` : `Startpunt ingesteld op ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    "success"
  );
}

async function handleSearch() {
  const query = document.getElementById("location-input").value.trim();
  if (!query) {
    setStatus("Vul een plaats of adres in.", "error");
    return;
  }
  setStatus("Zoeken...");
  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Zoekdienst gaf een fout.");
    const results = await res.json();
    if (!results.length) {
      setStatus("Geen locatie gevonden. Probeer een andere zoekterm.", "error");
      return;
    }
    const { lat, lon, display_name } = results[0];
    setStart(parseFloat(lat), parseFloat(lon), display_name);
  } catch (err) {
    setStatus("Zoeken mislukt: " + err.message, "error");
  }
}

async function handleGeolocate() {
  setStatus("Locatie bepalen...");
  try {
    const pos = await getCurrentPosition();
    setStart(pos.coords.latitude, pos.coords.longitude, "Mijn locatie");
  } catch (err) {
    setStatus("Kon locatie niet bepalen: " + (err.message || err), "error");
  }
}

/**
 * Haalt de huidige positie op. In een native Capacitor-app (iOS/Android)
 * via de Geolocation-plugin (die de systeem-permissiedialoog toont); in de
 * browser/PWA via de standaard Geolocation Web API. Beide geven een object
 * met dezelfde vorm terug: { coords: { latitude, longitude, ... } }.
 */
function getCurrentPosition() {
  const capacitorGeolocation = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.Geolocation;
  if (capacitorGeolocation) {
    return capacitorGeolocation.getCurrentPosition();
  }
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Geolocatie wordt niet ondersteund door deze browser."));
  }
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject));
}

async function handleGenerate() {
  if (!startLatLng) {
    setStatus("Kies eerst een startlocatie (zoek, gebruik je locatie, of klik op de kaart).", "error");
    return;
  }
  const distanceKm = parseFloat(document.getElementById("distance-input").value);
  if (!distanceKm || distanceKm <= 0) {
    setStatus("Vul een geldige afstand in (km).", "error");
    return;
  }

  const generateBtn = document.getElementById("generate-btn");
  generateBtn.disabled = true;
  setStatus("Windgegevens ophalen...");
  clearRoute();

  try {
    const wind = await fetchWind(startLatLng.lat, startLatLng.lng);

    // Bouw een gesloten lus rond het startpunt: de heenweg (eerste helft)
    // wint per saldo terrein tegen de wind in, de terugweg (tweede helft)
    // juist met de wind mee — zonder ooit dezelfde weg twee keer te rijden.
    const { outboundPoints, inboundPoints } = buildLoopWaypoints(startLatLng, wind.directionDeg, distanceKm);

    setStatus("Route berekenen...");
    const [legOut, legBack] = await Promise.all([
      fetchRouteThrough(outboundPoints),
      fetchRouteThrough(inboundPoints),
    ]);

    drawRoute(legOut, legBack);

    const actualKm = (legOut.distanceMeters + legBack.distanceMeters) / 1000;
    showResult(wind, distanceKm, actualKm);
    setStatus("Route gegenereerd.", "success");
  } catch (err) {
    setStatus("Route genereren mislukt: " + err.message, "error");
  } finally {
    generateBtn.disabled = false;
  }
}

async function fetchWind(lat, lng) {
  const url = `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Windgegevens ophalen mislukt.");
  const data = await res.json();
  if (!data.current) throw new Error("Geen actuele windgegevens beschikbaar voor deze locatie.");
  return {
    directionDeg: data.current.wind_direction_10m,
    speedKmh: data.current.wind_speed_10m,
  };
}

/** Bereken één route die achtereenvolgens langs alle `points` ({lat,lng}) gaat. */
async function fetchRouteThrough(points) {
  const coordsParam = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `${OSRM_BASE}/${coordsParam}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Routeservice gaf een fout.");
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes || !data.routes.length) {
    throw new Error("Geen route gevonden tussen deze punten.");
  }
  const route = data.routes[0];
  return {
    coords: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    distanceMeters: route.distance,
  };
}

/**
 * Genereer de waypoints voor een gesloten rondrit rond `start`: een ellips
 * uitgerekt langs de windrichting, met `start` op de pool aan de
 * "benedenwindse" kant. De eerste helft van de waypoints (heenweg) wint zo
 * steeds terrein tegen de wind in, de tweede helft (terugweg) juist mee.
 */
function buildLoopWaypoints(start, windDirDeg, distanceKm) {
  const k = LOOP_ASPECT_RATIO;
  const a = distanceKm / ellipseCircumferenceFactor(k); // halve lengteas (km)
  const b = k * a; // halve breedteas (km)
  const N = distanceKm > 60 ? 12 : 8; // aantal segmenten van de lus (even)

  const waypoints = [];
  for (let i = 1; i < N; i++) {
    const theta = Math.PI + (i * 2 * Math.PI) / N;
    const x = a + a * Math.cos(theta); // afstand tegen de wind in vanaf start (>= 0)
    const y = b * Math.sin(theta); // zijwaartse afstand (+/-)
    waypoints.push(ellipsePoint(start, windDirDeg, x, y));
  }

  const half = N / 2;
  const outboundPoints = [start, ...waypoints.slice(0, half)];
  const inboundPoints = [...waypoints.slice(half - 1), start];
  return { outboundPoints, inboundPoints };
}

/** Ramanujan-benadering van de omtrek van een ellips (semi-assen 1 en k), als factor. */
function ellipseCircumferenceFactor(k) {
  const h = Math.pow((1 - k) / (1 + k), 2);
  return Math.PI * (1 + k) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/**
 * Punt op `x` km tegen de windrichting in en `y` km zijwaarts (+ of -)
 * daarvandaan, vanaf `start`. Gebruikt twee loodrechte stappen als
 * benadering van de 2D-verplaatsing.
 */
function ellipsePoint(start, windDirDeg, x, y) {
  const upwindStep = destinationPoint(start.lat, start.lng, windDirDeg, x);
  const sideBearing = windDirDeg + (y >= 0 ? 90 : -90);
  return destinationPoint(upwindStep.lat, upwindStep.lng, sideBearing, Math.abs(y));
}

function drawRoute(legOut, legBack) {
  const outLine = L.polyline(legOut.coords, { color: "#d9642f", weight: 5, opacity: 0.9 }).addTo(map);
  const backLine = L.polyline(legBack.coords, { color: "#2f7a4f", weight: 5, opacity: 0.9, dashArray: "8 6" }).addTo(
    map
  );
  routeLayers.push(outLine, backLine);

  const bounds = outLine.getBounds().extend(backLine.getBounds());
  map.fitBounds(bounds, { padding: [30, 30] });
}

function clearRoute() {
  routeLayers.forEach((layer) => map.removeLayer(layer));
  routeLayers = [];
}

function showResult(wind, requestedKm, actualKm) {
  document.getElementById("result-box").classList.remove("hidden");
  document.getElementById("wind-value").textContent =
    `${Math.round(wind.speedKmh)} km/u uit het ${degToCompass(wind.directionDeg)} (${Math.round(wind.directionDeg)}°)`;
  document.getElementById("strategy-value").textContent = "Rondrit: heen tegenwind, terug meewind";
  document.getElementById("requested-distance-value").textContent = `${requestedKm} km`;
  document.getElementById("actual-distance-value").textContent = `${actualKm.toFixed(1)} km`;
}

function degToCompass(deg) {
  const dirs = ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return dirs[idx];
}

/** Bereken het punt op `distanceKm` afstand vanaf (lat,lng) in richting `bearingDeg`. */
function destinationPoint(lat, lng, bearingDeg, distanceKm) {
  const R = 6371; // aardstraal in km
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const brng = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);
  const angDist = distanceKm / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) + Math.cos(lat1) * Math.sin(angDist) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}
