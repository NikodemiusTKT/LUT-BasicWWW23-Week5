"use strict";
const urls = {
  immigrationUrl:
    "https://statfin.stat.fi/PxWeb/sq/4bb2c735-1dc3-4c5e-bde7-2165df85e65f",
  emigrationUrl:
    "https://statfin.stat.fi/PxWeb/sq/944493ca-ea4d-4fd9-a75c-4975192f7b6e",
  geoJsonUrl:
    "https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:kunta4500k&outputFormat=json&srsName=EPSG:4326",
};
window.onload = async () => {
  const { geoJsonData, migrationData } = await getData();
  drawMap(geoJsonData, migrationData);
};
async function fetchJsonData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new TypeError("Fetched dataset isn't JSON!");
    }
    return await response.json();
  } catch (err) {
    console.error(
      `Error occurred in fetch function | ${err.name}: ${err.message}`
    );
    return null;
  }
}
async function getData() {
  let geoJsonData = JSON.parse(sessionStorage.getItem("geoJsonData"));
  let migrationData = JSON.parse(sessionStorage.getItem("migrationData"));
  if (geoJsonData === null || migrationData === null) {
    const [immigrationData, emigrationData, geoJsonData] = await Promise.all(
      fetchJsonData(urls.immigrationUrl),
      fetchJsonData(urls.emigrationUrl),
      fetchJsonData(urls.geoJsonUrl)
    );

    if (!immigrationData || !emigrationData || !geoJsonData)
      return { geoJsonData: null, migrationData: null };

    migrationData = formatMigrationData(immigrationData, emigrationData);
    sessionStorage.setItem("geoJsonData", JSON.stringify(geoJsonData));
    sessionStorage.setItem("migrationData", JSON.stringify(migrationData));
  }
  return { geoJsonData, migrationData };
}
function formatMigrationData(immigrationData, emigrationData) {
  const immigrationValues = immigrationData.dataset.value;
  const immigrationIndexes =
    immigrationData.dataset.dimension["Tuloalue"].category.index;
  const emigrationValues = emigrationData.dataset.value;
  const emigrationIndexes =
    emigrationData.dataset.dimension["Lähtöalue"].category.index;

  return Object.entries(immigrationIndexes).reduce((accumulator, [key, value]) => {
    const label = key.replace(/^KU/, "");
    const emgIndex = emigrationIndexes[key];
    accumulator[label] = {
      immigration: immigrationValues[value],
      emigration: emigrationValues[emgIndex],
    };
    return accumulator;
  }, {});
}

function drawMap(geoJsonData, migrationData) {
  const map = L.map("map").setView({ lon: 0, lat: 0 }, 2);
  L.tileLayer(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, {
    minZoom: -3,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  const geoFeature = L.geoJson(geoJsonData, {
    style: (feature) => styleFunction(feature, migrationData),
    onEachFeature: (feature, layer) =>
      onEachFunction(feature, layer, migrationData),
  }).addTo(map);
  map.fitBounds(geoFeature.getBounds());
}
function onEachFunction(feature, layer, migrationData) {
  if (feature.properties?.name) {
    layer.bindTooltip(feature.properties.name).openTooltip();
  }
  if (feature.properties?.kunta) {
    const { immigration, emigration } = migrationData[
      feature.properties.kunta
    ] || { immigration: 0, emigration: 0 };
    const popUpTemplate = `<p>Positive migration: ${immigration}</p><p>Negative migration: ${emigration}</p>`;
    layer.bindPopup(popUpTemplate);
  }
}
function styleFunction(feature, migrationData) {
  if (feature.properties?.kunta) {
    const { immigration, emigration } =
      migrationData[feature.properties.kunta] || {};
    const hue = calcHue(immigration, emigration);
    return { color: `hsl(${hue},75%,50%)`, weight: 2 };
  }
  return {
    color: "#ccc",
    weight: 1,
  };
}
function calcHue(posMig, negMig) {
  const hue = Math.pow(posMig / (negMig || 1), 3) * 60;
  return Math.min(hue, 120);
}
