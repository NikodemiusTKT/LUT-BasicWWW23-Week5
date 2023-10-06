'use strict';
const urls = {
  immigrationUrl:
    'https://statfin.stat.fi/PxWeb/sq/4bb2c735-1dc3-4c5e-bde7-2165df85e65f',
  emigrationUrl:
    'https://statfin.stat.fi/PxWeb/sq/944493ca-ea4d-4fd9-a75c-4975192f7b6e',
  geoJsonUrl:
    'https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:kunta4500k&outputFormat=json&srsName=EPSG:4326',
};
window.onload = async () => {
  let geoJsonData = JSON.parse(sessionStorage.getItem('geoJsonData'));
  let migrationData = JSON.parse(sessionStorage.getItem('migrationData'));
  if (geoJsonData === null || migrationData === null) {
    let immigrationData;
    let emigrationData;
    [immigrationData, emigrationData, geoJsonData] = await fetchDataSources(
      urls
    );
    migrationData = formatMigrationData(immigrationData, emigrationData);
    sessionStorage.setItem('geoJsonData', JSON.stringify(geoJsonData));
    sessionStorage.setItem('migrationData', JSON.stringify(migrationData));
  }
  drawMap(geoJsonData);
};
async function fetchJsonData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new TypeError("Fetched dataset isn't JSON!");
    }
    return await response.json();
  } catch (err) {
    console.error(
      `Error occurred in fetch function | ${err.name}: ${err.message}`
    );
  }
}
async function fetchDataSources(urls) {
  const promises = Object.values(urls).map((url) => fetchJsonData(url));
  const results = await Promise.all(promises);
  return results;
}
function formatMigrationData(immigrationData, emigrationData) {
  const immigrationValues = immigrationData.dataset.value;
  const immigrationIndexes =
    immigrationData.dataset.dimension['Tuloalue'].category.index;
  const emigrationValues = emigrationData.dataset.value;
  const emigrationIndexes =
    emigrationData.dataset.dimension['Lähtöalue'].category.index;

  let formattedMigration = {};
  for (let [key, value] of Object.entries(immigrationIndexes)) {
    const regex = /^KU/;
    const label = key.replace(regex, '');
    const emgIndex = emigrationIndexes[key];
    formattedMigration[label] = {
      immigration: immigrationValues[value],
      emigration: emigrationValues[emgIndex],
    };
  }
  return formattedMigration;
}

function drawMap(geoJsonData) {
  var map = L.map('map').setView({ lon: 0, lat: 0 }, 2);
  L.tileLayer(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, {
    minZoom: -3,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  let geoFeature = L.geoJson(geoJsonData, {
    style: styleFunction,
    onEachFeature: onEachFunction,
  }).addTo(map);
  map.fitBounds(geoFeature.getBounds());
}
function onEachFunction(feature, layer) {
  if (feature.properties && feature.properties.name) {
    layer.bindTooltip(feature.properties.name).openTooltip();
  }
  if (feature.properties && feature.properties.kunta) {
    const kunta = feature.properties.kunta;
    const migrationData = JSON.parse(sessionStorage.getItem('migrationData'));
    const { immigration, emigration } = migrationData[kunta];
    const popUpTemplate = `<p>Positive migration: ${immigration}</p><p>Negative migration: ${emigration}</p>`;
    layer.bindPopup(popUpTemplate);
  }
}
function styleFunction(feature) {
  if (feature.properties && feature.properties.kunta) {
    const kunta = feature?.properties?.kunta;
    const migrationData = JSON.parse(sessionStorage.getItem('migrationData'));
    const { immigration, emigration } = migrationData[kunta];
    const hue = calcHue(immigration, emigration);
    return { color: `hsl(${hue},75%,50%)`, weight: 2 };
  }
}
function calcHue(posMig, negMig) {
  const hue = Math.pow(posMig / negMig, 3) * 60;
  return hue < 120 ? hue : 120;
}
