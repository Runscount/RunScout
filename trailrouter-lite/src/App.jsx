import React, { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ---- Inline SVG marker (no external assets) ---- */
const markerSvg = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>
     <circle cx='14' cy='14' r='9' fill='#2563eb' stroke='white' stroke-width='3'/>
   </svg>`
);
const markerIcon = new L.Icon({
  iconUrl: `data:image/svg+xml;charset=UTF-8,${markerSvg}`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/* ---- Distance helpers ---- */
const toRad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const R = 6371000; // meters
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function totalDistance(points) {
  if (!points || points.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversine(points[i - 1], points[i]);
  return sum;
}

/* ---- URL hash helpers (#wps=lat,lon|...) ---- */
function parseHashWaypoints(hash) {
  if (!hash) return [];
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  const wps = q.get("wps");
  if (!wps) return [];
  return wps
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [lat, lon] = p.split(",").map(parseFloat);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
      return null;
    })
    .filter(Boolean);
}
function buildHashFromWaypoints(points, extra = {}) {
  const wps = points.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join("|");
  const params = new URLSearchParams({ wps });
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null) params.set(k, String(v));
  }
  return `#${params.toString()}`;
}

/* ---- Map helpers ---- */
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points && points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [points, map]);
  return null;
}
function ClickAdd({ onAdd }) {
  useMapEvents({
    click(e) {
      onAdd([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}
function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const onResize = () => map.invalidateSize();
    const id = setTimeout(onResize, 0);
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(id);
      window.removeEventListener("resize", onResize);
    };
  }, [map]);
  return null;
}

/* ---- Simple Geocoder (OSM Nominatim) ---- */
function Geocoder({ onPick, addAsWaypoint = true }) {
  const map = useMap();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function search() {
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setErr("");
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          query
        )}&addressdetails=1&limit=5`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setErr("Search failed. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function selectResult(r) {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    map.flyTo([lat, lon], Math.max(15, map.getZoom()), { duration: 0.8 });
    if (addAsWaypoint && typeof onPick === "function") onPick([lat, lon]);
    setQ(r.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    setResults([]);
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 12, color: "#4b5563" }}>Search place / address</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 14 }}
          placeholder="e.g., Willis Tower, Chicago"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <button
          onClick={search}
          disabled={loading}
          style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 14, background: "#fff" }}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>
      {err && <div style={{ fontSize: 12, color: "#dc2626" }}>{err}</div>}
      {results.length > 0 && (
        <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => selectResult(r)}
              style={{ width: "100%", textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #f3f4f6", background: "#fff" }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.display_name?.split(",")[0] || "Result"}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.display_name}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Main App ---- */
export default function App() {
  const initPts = useMemo(() => {
    if (typeof window === "undefined") return [];
    return parseHashWaypoints(window.location.hash);
  }, []);

  const [points, setPoints] = useState(
    initPts.length
      ? initPts
      : [
          [41.88674, -87.63139],
          [41.88254, -87.61512],
          [41.88358, -87.61291],
          [41.89288, -87.61375],
          [41.90286, -87.62348],
          [41.93251, -87.63172],
          [41.88674, -87.63139],
        ]
  );

  const [snapping, setSnapping] = useState(false); // placeholder
  const [autoLink, setAutoLink] = useState(true);

  const total = useMemo(() => totalDistance(points), [points]);
  const km = (total / 1000).toFixed(2);
  const mi = (total / 1609.344).toFixed(2);

  useEffect(() => {
    if (!autoLink || typeof window === "undefined") return;
    const newHash = buildHashFromWaypoints(points, { td: Math.round(total / 10) * 10 });
    if (window.location.hash !== newHash) window.location.hash = newHash;
  }, [points, autoLink, total]);

  const updatePoint = (idx, latlng) =>
    setPoints((prev) => prev.map((p, i) => (i === idx ? [latlng.lat, latlng.lng] : p)));
  const addPoint = (p) => setPoints((prev) => [...prev, p]);
  const removeIdx = (idx) => setPoints((prev) => prev.filter((_, i) => i !== idx));
  const undo = () => setPoints((prev) => prev.slice(0, -1));
  const clearAll = () => setPoints([]);

  const downloadGPX = () => {
    if (points.length < 2) return;
    const trkpts = points
      .map((p) => `\n      <trkpt lat="${p[0]}" lon="${p[1]}"><ele>0</ele></trkpt>`)
      .join("");
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="TrailRouter-Lite" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk>\n    <name>TrailRouter-Lite Route</name>\n    <trkseg>${trkpts}\n    </trkseg>\n  </trk>\n</gpx>`;
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "route.gpx";
    a.click();
    URL.revokeObjectURL(url);
  };
  const copyLink = async () => {
    const link = `${window.location.origin}${window.location.pathname}${buildHashFromWaypoints(points)}`;
    try {
      await navigator.clipboard.writeText(link);
      alert("Link copied to clipboard!");
    } catch {
      prompt("Copy this link:", link);
    }
  };

  /* ---------- LAYOUT (fixed header height + main area with explicit height) ---------- */
  const HEADER_PX = 64;

  const S = {
    app: { width: "100%", height: "100vh", display: "grid", gridTemplateRows: "auto 1fr" },
    header: {
      height: HEADER_PX,
      padding: "12px 16px",
      borderBottom: "1px solid #e5e7eb",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      background: "rgba(255,255,255,0.9)",
      backdropFilter: "saturate(180%) blur(6px)",
    },
    mainGrid: {
      display: "grid",
      gridTemplateColumns: "360px 1fr",          // left sidebar 360px | right map
      height: `calc(100vh - ${HEADER_PX}px)`,    // ★ explicit height so % heights work
      minHeight: 0,
    },
    sidebar: {
      overflow: "auto",
      padding: 16,
      borderRight: "1px solid #e5e7eb",
      background: "rgba(255,255,255,0.7)",
      backdropFilter: "saturate(180%) blur(6px)",
    },
    mapCell: { position: "relative", height: "100%", minHeight: 0 },  // ★ inherits height
    mapFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" }, // ★ fills cell
    btn: {
      padding: "8px 12px",
      borderRadius: 16,
      border: "1px solid #e5e7eb",
      background: "#fff",
      cursor: "pointer",
      fontSize: 14,
    },
    btnPrimary: {
      padding: "8px 12px",
      borderRadius: 16,
      background: "#2563eb",
      color: "#fff",
      border: "none",
      cursor: "pointer",
      fontSize: 14,
      marginLeft: 8,
    },
    badge: {
      position: "absolute",
      top: 12,
      right: 12,
      background: "rgba(255,255,255,0.9)",
      padding: "6px 10px",
      borderRadius: 999,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      fontSize: 14,
    },
  };

  return (
    <div style={S.app}>
      {/* Header */}
      <header style={S.header}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#1f2937" }}>
          TrailRouter-Lite
        </h1>
        <div>
          <button onClick={downloadGPX} style={S.btn}>Export GPX</button>
          <button onClick={copyLink} style={S.btnPrimary}>Copy Link</button>
        </div>
      </header>

      {/* Main: Sidebar | Map */}
      <div style={S.mainGrid}>
        {/* Sidebar (left) */}
        <aside style={S.sidebar}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: "#6b7280", fontSize: 12 }}>Total Distance</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>
              {km} km <span style={{ color: "#9ca3af", fontSize: 14 }}>({mi} mi)</span>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>Waypoints ({points.length})</div>
            <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12 }}>
              {points.length === 0 && (
                <div style={{ padding: 12, color: "#6b7280", fontSize: 13 }}>Click the map to add waypoints…</div>
              )}
              {points.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                  <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                    {p[0].toFixed(5)}, {p[1].toFixed(5)}
                  </div>
                  <button onClick={() => removeIdx(i)} style={{ ...S.btn, color: "#dc2626" }}>Delete</button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button onClick={undo} disabled={points.length === 0} style={S.btn}>Undo</button>
              <button onClick={clearAll} style={S.btn}>Clear</button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ color: "#6b7280", fontSize: 12 }}>Options</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={snapping} onChange={(e) => setSnapping(e.target.checked)} />
              Snap to trails (placeholder)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={autoLink} onChange={(e) => setAutoLink(e.target.checked)} />
              Auto-update link
            </label>
            <p style={{ color: "#6b7280", fontSize: 12 }}>
              Import from TrailRouter: paste a URL with <code>#wps=...</code> into the address bar and this page will parse it.
            </p>
            <p style={{ color: "#6b7280", fontSize: 12 }}>
              Tip: Click the map to add waypoints; drag markers to fine-tune. Scroll or pinch to zoom.
            </p>
          </div>
        </aside>

        {/* Map (right) */}
        <div style={S.mapCell}>
          <MapContainer
            style={S.mapFill}
            center={[41.888, -87.626]}
            zoom={13}
            scrollWheelZoom
          >
            {/* Floating search box */}
            <div style={{
              position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
              zIndex: 1000, width: "min(560px, 90%)", background: "rgba(255,255,255,0.95)",
              backdropFilter: "saturate(180%) blur(6px)", borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)", padding: 12
            }}>
              <Geocoder onPick={addPoint} addAsWaypoint={true} />
            </div>

            <ResizeFix />
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ClickAdd onAdd={addPoint} />
            <FitBounds points={points} />

            {points.length > 0 && <Polyline positions={points} weight={5} opacity={0.9} />}

            {points.map((p, i) => (
              <Marker
                key={i}
                position={p}
                icon={markerIcon}
                draggable
                eventHandlers={{ dragend: (e) => updatePoint(i, e.target.getLatLng()) }}
              >
                <Popup>
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontWeight: 600 }}>Waypoint #{i + 1}</div>
                    <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
                      {p[0].toFixed(6)}, {p[1].toFixed(6)}
                    </div>
                    <button onClick={() => removeIdx(i)} style={{ ...S.btn, color: "#dc2626" }}>
                      Delete this point
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Distance badge */}
          <div style={S.badge}>{km} km · {mi} mi</div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ padding: 12, textAlign: "center", fontSize: 12, color: "#6b7280", borderTop: "1px solid #e5e7eb" }}>
        Built with React + Leaflet · Demo only
      </footer>
    </div>
  );
}