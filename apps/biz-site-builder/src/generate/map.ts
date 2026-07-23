import type { Business, GeoPoint } from "../types.ts";
import { esc, jsStr } from "./util.ts";

/**
 * Self-hosted interactive map via Leaflet + OpenStreetMap tiles — no API key, no
 * tracking, works offline-of-Google. Added to a site's contact section whenever
 * the business has coordinates (either from the source or Nominatim geocoding).
 */

const LEAFLET_VERSION = "1.9.4";
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

/** <link>/<script> tags for the document head. */
export function leafletAssets(): string {
  return `<link rel="stylesheet" href="${LEAFLET_CSS}" crossorigin="" />
    <script src="${LEAFLET_JS}" crossorigin=""></script>`;
}

/**
 * A map container + init script for a location. `id` scopes multiple maps on a
 * page; the marker popup shows the business name. OSM attribution is required by
 * the tile usage policy and included.
 */
export function leafletMap(location: GeoPoint, name: string, id = "bsb-map"): string {
  const lat = location.lat;
  const lon = location.lon;
  return `<div id="${esc(id)}" class="bsb-map" style="height:360px;width:100%;border-radius:16px;overflow:hidden"></div>
<script>
  (function () {
    if (typeof L === "undefined") return;
    var map = L.map(${JSON.stringify(id)}).setView([${lat}, ${lon}], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    L.marker([${lat}, ${lon}]).addTo(map).bindPopup('${jsStr(name)}');
  })();
</script>`;
}

export function hasMap(business: Business): boolean {
  return business.location !== undefined;
}
