"use client";

// The actual react-leaflet render. Loaded ONLY via next/dynamic({ssr:false})
// from MapBlock so leaflet (which touches `window`) never runs during SSR or
// `next build`. Mirrors v1 buildMap() in public/chat-render.js.

import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapConfig } from "./MapBlock";

// Self-drawn teardrop pin via divIcon — Leaflet's default marker-icon.png 404s
// when the library is vendored/bundled offline (same reason as v1).
function placeIcon() {
  const svg =
    '<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M13 0C5.82 0 0 5.82 0 13c0 9.2 11.1 21.2 12.3 22.5a1 1 0 0 0 1.4 0C14.9 34.2 26 22.2 26 13 26 5.82 20.18 0 13 0z" fill="#36a6d6"/>' +
    '<circle cx="13" cy="13" r="5.1" fill="#fff"/></svg>';
  return L.divIcon({ className: "chat-map-pin", html: svg, iconSize: [26, 36], iconAnchor: [13, 36], popupAnchor: [0, -32] });
}

export default function LeafletMap({ config }: { config: MapConfig }) {
  const { center, zoom, markers, route } = config;
  const icon = placeIcon();
  return (
    <MapContainer center={center} zoom={zoom} style={{ height: 320, width: "100%" }} scrollWheelZoom={false}>
      <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {markers.map((m, i) => (
        <Marker key={i} position={[m.lat, m.lng]} icon={icon}>
          {m.label ? <Popup>{m.label}</Popup> : null}
        </Marker>
      ))}
      {route && route.length > 1 ? <Polyline positions={route} pathOptions={{ color: "#36a6d6", weight: 4 }} /> : null}
    </MapContainer>
  );
}
