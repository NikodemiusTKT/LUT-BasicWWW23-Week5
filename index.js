"use strict";
// URLs for fetching immigration, emigration, and geographical data
const URLs = {
  immigration:
    "https://statfin.stat.fi/PxWeb/sq/4bb2c735-1dc3-4c5e-bde7-2165df85e65f",
  emigration:
    "https://statfin.stat.fi/PxWeb/sq/944493ca-ea4d-4fd9-a75c-4975192f7b6e",
  geoJson:
    "https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:kunta4500k&outputFormat=json&srsName=EPSG:4326",
};

// On window load, fetch data and draw the map
window.onload = async () => {
  const { geoJsonData, migrationData } = await getData();
  drawMap(geoJsonData, migrationData);
};

/**
 * Fetches JSON data from a given URL.
 * @param {string} url - The URL to fetch data from.
 * @returns {Promise<Object|null>} - The fetched JSON data or null if an error occurs.
 */
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

/**
 * Retrieves geographical and migration data, either from session storage or by fetching it.
 * @returns {Promise<{geoJsonData: Object|null, migrationData: Object|null}>} - An object containing geoJsonData and migrationData.
 */
async function getData() {
  const geoJsonData = JSON.parse(sessionStorage.getItem("geoJsonData"));
  const migrationData = JSON.parse(sessionStorage.getItem("migrationData"));

  if (geoJsonData && migrationData) {
    return { geoJsonData, migrationData };
  }

  // Fetch data if not available in session storage
  const [immigrationData, emigrationData, geoJson] = await Promise.all(
    fetchJsonData(URLs.immigration),
    fetchJsonData(URLs.emigration),
    fetchJsonData(URLs.geoJson)
  );

  // if data fetching fails set returned data entries to null
  if (!immigrationData || !emigrationData || !geoJsonData)
    return { geoJsonData: null, migrationData: null };

  const formattedMigrationData = formatMigrationData(
    immigrationData,
    emigrationData
  );
  sessionStorage.setItem("geoJsonData", JSON.stringify(geoJson));
  sessionStorage.setItem(
    "migrationData",
    JSON.stringify(formattedMigrationData)
  );
  return { geoJsonData: geoJson, migrationData: formattedMigrationData };
}
/**
 * Formats immigration and emigration data into a more usable structure.
 * @param {Object} immigrationData - The immigration data object.
 * @param {Object} emigrationData - The emigration data object.
 * @returns {Object} - An object mapping region labels to their immigration and emigration values.
 */
function formatMigrationData(immigrationData, emigrationData) {
  const immigrationValues = immigrationData.dataset.value;
  const immigrationIndexes =
    immigrationData.dataset.dimension["Tuloalue"].category.index;
  const emigrationValues = emigrationData.dataset.value;
  const emigrationIndexes =
    emigrationData.dataset.dimension["Lähtöalue"].category.index;

  return Object.entries(immigrationIndexes).reduce(
    (accumulator, [key, value]) => {
      const label = key.replace(/^KU/, ""); // Remove "KU" prefix from the key
      const emgIndex = emigrationIndexes[key]; // Get corresponding emigration index
      accumulator[label] = {
        immigration: immigrationValues[value],
        emigration: emigrationValues[emgIndex],
      };
      return accumulator;
    },
    {}
  );
}

/**
 * Draws the map using Leaflet.js and adds GeoJSON data to it.
 * @param {Object} geoJsonData - The GeoJSON data for the geographical regions.
 * @param {Object} migrationData - The formatted migration data.
 */
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
/**
 * Binds interactivity to each feature on the map, including tooltips and popups.
 * @param {Object} feature - The GeoJSON feature being processed.
 * @param {Object} layer - The Leaflet layer corresponding to the feature.
 * @param {Object} migrationData - The formatted migration data for regions.
 */
function onEachFunction(feature, layer, migrationData) {
  // Bind a tooltip to the layer that displays the name of the region
  if (feature.properties?.name) {
    layer.bindTooltip(feature.properties.name).openTooltip();
  }
  // Bind a popup to the layer that displays immigration and emigration data
  if (feature.properties?.kunta) {
    const { immigration, emigration } = migrationData[
      feature.properties.kunta
    ] || { immigration: 0, emigration: 0 };
    const popUpTemplate = `<p>Positive migration: ${immigration}</p><p>Negative migration: ${emigration}</p>`;
    layer.bindPopup(popUpTemplate);
  }
}

/**
 * Determines the style of each feature on the map based on migration data.
 * @param {Object} feature - The GeoJSON feature being styled.
 * @param {Object} migrationData - The formatted migration data for regions.
 * @returns {Object} - An object containing the style properties for the feature.
 */
function styleFunction(feature, migrationData) {
  // Check if the feature has a 'kunta' property to style it based on migration data
  if (feature.properties?.kunta) {
    const { immigration, emigration } =
      migrationData[feature.properties.kunta] || {};
    const hue = calcHue(immigration, emigration); // Calculate the hue based on migration data
    return { color: `hsl(${hue},75%,50%)`, weight: 2 }; // Return style properties
  }
  // Default style for features without migration data
  return {
    color: "#ccc", // Light gray color for regions without data
    weight: 1, // Default weight for the border
  };
}

/**
 * Calculates the hue for the color representation of migration data.
 * @param {number} positiveMigration - The positive migration value.
 * @param {number} negativeMigration - The negative migration value.
 * @returns {number} - The calculated hue value, capped at 120.
 */
function calcHue(positiveMigration, negativeMigration) {
  const hue = Math.pow(positiveMigration / (negativeMigration || 1), 3) * 60;
  return Math.min(hue, 120);
}
