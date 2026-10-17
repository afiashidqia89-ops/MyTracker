/* MyTracker — standalone app (no framework) for Android WebView */
'use strict'

// --- IndexedDB wrapper ---
const DB_NAME = 'mytracker-db'
const DB_VERSION = 1
let dbPromise = null
function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of ['placemarks', 'tracks', 'layers', 'projects', 'settings']) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}
async function dbPut(store, item) {
  const db = await openDb()
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(item)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}
async function dbGetAll(store) {
  const db = await openDb()
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAll()
    req.onsuccess = () => res(req.result || [])
    req.onerror = () => rej(req.error)
  })
}
async function dbDelete(store, id) {
  const db = await openDb()
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(id)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

// --- Settings ---
const DEFAULT_SETTINGS = {
  id: 'settings',
  coordFormat: 'dd',
  distanceUnit: 'metric',
  gpsTracking: true,   // auto-start GPS on app open
  highAccuracyGps: true,
  followGps: true,     // auto-center to GPS
  showCompass: true,
  pro: true,
  offlineFirst: true, // prefer offline base layer
}
let settings = { ...DEFAULT_SETTINGS }

// --- State ---
let map
let placemarks = []
let tracks = []
let overlayLayers = []
let projects = []
let currentProjectId = 'global'
let currentCoord = null
let gpsActive = false
let gpsAccuracy = null
let gpsSpeed = null
let gpsHeading = null
let gpsWatchId = null
let recordingTrackId = null
let recordingPoints = []
let recordingStart = 0
let selectedTool = 'pan'
let measurePoints = []
let selectedPlacemark = null
let selectedTrack = null
let activeTab = 'placemarks'
let markerLayer
let trackLayer
let measureLayer
let gpsMarker
let baseLayerInstances = {}
let overlayLayerInstances = {}
let compassHeading = null
let editingPlacemark = null
let pendingPlacemarkCoord = null

// --- Constants ---
const BUILTIN_LAYERS = [
  // Offline layer — bundled in app, works without internet
  { id: 'offline-world', name: 'World Map (Offline)', type: 'offline-geojson', dataUrl: 'data/world-land.geo.json', attribution: '© Natural Earth (public domain)', isBase: true, visible: true, opacity: 1 },
  // Online layers (need internet to load tiles)
  { id: 'osm', name: 'OpenStreetMap (Online)', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap', isBase: true, visible: false, opacity: 1 },
  { id: 'satellite', name: 'Esri Satellite (Online)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri', isBase: true, visible: false, opacity: 1 },
  { id: 'topo', name: 'OpenTopoMap (Online)', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '© OpenTopoMap', isBase: true, visible: false, opacity: 1 },
  { id: 'terrain', name: 'Esri Terrain', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri', isBase: false, visible: false, opacity: 0.6 },
]
let offlineWorldData = null // cached world GeoJSON loaded from data/world-land.geo.json
const COLORS = ['#dc2626', '#ea580c', '#facc15', '#16a34a', '#0891b2', '#2563eb', '#9333ea', '#ec4899']
const CATEGORIES = [
  { id: 'waypoint', label: 'Waypoint', icon: '📍' },
  { id: 'camp', label: 'Camping', icon: '⛺' },
  { id: 'food', label: 'Makan', icon: '🍽' },
  { id: 'water', label: 'Air', icon: '💧' },
  { id: 'viewpoint', label: 'Viewpoint', icon: '👁' },
  { id: 'parking', label: 'Parkir', icon: '🅿' },
  { id: 'danger', label: 'Bahaya', icon: '⚠' },
  { id: 'photo', label: 'Foto', icon: '📷' },
  { id: 'custom', label: 'Custom', icon: '✦' },
]
function getCatIcon(cat) { return (CATEGORIES.find(c => c.id === cat) || CATEGORIES[0]).icon }
function genId(p) { return p + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) }

// --- Utils: distance, format ---
const R = 6371000
const toRad = d => d * Math.PI / 180
function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2
  return 2 * R * Math.asin(Math.sqrt(h))
}
function polylineLength(coords) {
  let total = 0
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i-1], coords[i])
  return total
}
function polygonArea(coords) {
  if (coords.length < 3) return 0
  let total = 0
  const n = coords.length
  for (let i = 0; i < n; i++) {
    const a = coords[i], b = coords[(i+1) % n]
    total += toRad(b.lng - a.lng) * (2 + Math.sin(toRad(a.lat)) + Math.sin(toRad(b.lat)))
  }
  return Math.abs(total * R * R / 2)
}
function formatDistance(m) {
  if (settings.distanceUnit === 'imperial') {
    const ft = m * 3.28084
    if (ft < 1000) return ft.toFixed(0) + ' ft'
    return (ft / 5280).toFixed(2) + ' mi'
  }
  if (m < 1000) return m.toFixed(0) + ' m'
  return (m / 1000).toFixed(2) + ' km'
}
function formatArea(a) {
  if (settings.distanceUnit === 'imperial') {
    const sf = a * 10.7639
    if (sf < 43560) return sf.toFixed(0) + ' sq ft'
    return (sf / 43560).toFixed(2) + ' ac'
  }
  if (a < 10000) return a.toFixed(0) + ' m²'
  if (a < 1000000) return (a/10000).toFixed(2) + ' ha'
  return (a/1000000).toFixed(2) + ' km²'
}
function formatDuration(s) {
  if (!isFinite(s) || s < 0) s = 0
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60)
  const mm = String(m).padStart(2,'0'), ss = String(sec).padStart(2,'0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
function formatSpeed(kmh) {
  if (settings.distanceUnit === 'imperial') return (kmh * 0.621371).toFixed(1) + ' mph'
  return kmh.toFixed(1) + ' km/h'
}
function formatCoord(c) {
  if (!c) return ''
  switch (settings.coordFormat) {
    case 'dms': return `${toDMS(c.lat,'lat')} ${toDMS(c.lng,'lng')}`
    case 'utm': return `UTM ${toUTM(c.lat, c.lng)}`
    case 'mgrs': return `MGRS ${toUTM(c.lat, c.lng).slice(0, 12)}`
    case 'dd':
    default: return `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`
  }
}
function toDMS(v, k) {
  const abs = Math.abs(v)
  const d = Math.floor(abs), mf = (abs - d) * 60, m = Math.floor(mf), s = (mf - m) * 60
  const dir = k === 'lat' ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W')
  return `${d}°${String(m).padStart(2,'0')}'${s.toFixed(2).padStart(5,'0')}"${dir}`
}
function toUTM(lat, lng) {
  const zone = Math.floor((lng + 180) / 6) + 1
  const band = 'CDEFGHJKLMNPQRSTUVWXX'[Math.floor((lat + 80) / 8)]
  // simplified UTM via Karney series approximation
  const a = 6378137, f = 1/298.257223563, k0 = 0.9996
  const n = f / (2 - f)
  const A = a / (1 + n) * (1 + n*n/4 + n*n*n*n/64)
  const phi = toRad(lat), lam = toRad(lng), lam0 = toRad((zone - 1) * 6 - 180 + 3)
  const t = Math.sin(phi)
  const xiP = Math.sinh(Math.atanh(t) - (2 * Math.sqrt(n)) / (1 + n) * Math.atanh((2 * Math.sqrt(n) * t) / (1 + n * t * t)))
  const xiN = Math.atan2(xiP, Math.cos(lam - lam0))
  const etaN = Math.atanh(Math.sin(lam - lam0) / Math.sqrt(1 + xiP * xiP))
  const alpha = [n/2 - (2/3)*n*n, (13/48)*n*n - (3/5)*n*n*n, (61/240)*n*n*n]
  let xiN2 = xiN, etaN2 = etaN
  for (let j = 0; j < 3; j++) {
    xiN2 += alpha[j] * Math.sin(2 * (j+1) * xiN) * Math.cosh(2 * (j+1) * etaN)
    etaN2 += alpha[j] * Math.cos(2 * (j+1) * xiN) * Math.sinh(2 * (j+1) * etaN)
  }
  const e = k0 * A * etaN2 + 500000
  let nn = k0 * A * xiN2
  if (lat < 0) nn += 10000000
  return `${zone}${band} ${e.toFixed(0)} ${nn.toFixed(0)}`
}
function formatDate(ts) {
  const d = new Date(ts), p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function formatTime(ts) {
  const d = new Date(ts), p = n => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
function formatSize(b) {
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB'
  return (b/1048576).toFixed(1) + ' MB'
}

// --- GPX export ---
function esc(s) { return String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c])) }
function exportAllGpx() {
  let wpts = placemarks.map(p => `  <wpt lat="${p.coord.lat.toFixed(6)}" lon="${p.coord.lng.toFixed(6)}">
${p.coord.alt != null ? `    <ele>${p.coord.alt.toFixed(1)}</ele>` : ''}
    <name>${esc(p.name)}</name>
${p.description ? `    <desc>${esc(p.description)}</desc>` : ''}
    <sym>${p.category}</sym>
  </wpt>`).join('\n')
  let trks = tracks.map(t => {
    const pts = t.points.map(p => `      <trkpt lat="${p.coord.lat.toFixed(6)}" lon="${p.coord.lng.toFixed(6)}">${p.coord.alt != null ? `<ele>${p.coord.alt.toFixed(1)}</ele>` : ''}${p.coord.time ? `<time>${new Date(p.coord.time).toISOString()}</time>` : ''}</trkpt>`).join('\n')
    return `  <trk>
    <name>${esc(t.name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MyTracker" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Export ${new Date().toISOString()}</name></metadata>
${wpts}
${trks}
</gpx>`
}
function parseGpx(text) {
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.querySelector('parsererror')) throw new Error('GPX tidak valid')
  const waypoints = [], tracks = []
  xml.querySelectorAll('wpt').forEach(n => {
    waypoints.push({
      name: n.querySelector('name')?.textContent || `Waypoint ${waypoints.length+1}`,
      description: n.querySelector('desc')?.textContent || '',
      category: n.querySelector('sym')?.textContent || 'waypoint',
      coord: { lat: parseFloat(n.getAttribute('lat')), lng: parseFloat(n.getAttribute('lon')), alt: n.querySelector('ele')?.textContent ? parseFloat(n.querySelector('ele').textContent) : null }
    })
  })
  xml.querySelectorAll('trk').forEach(trk => {
    const points = []
    trk.querySelectorAll('trkseg > trkpt').forEach(pt => {
      points.push({ lat: parseFloat(pt.getAttribute('lat')), lng: parseFloat(pt.getAttribute('lon')), alt: pt.querySelector('ele')?.textContent ? parseFloat(pt.querySelector('ele').textContent) : null, time: pt.querySelector('time')?.textContent ? new Date(pt.querySelector('time').textContent).getTime() : undefined })
    })
    if (points.length > 0) tracks.push({ name: trk.querySelector('name')?.textContent || `Track ${tracks.length+1}`, description: trk.querySelector('desc')?.textContent || '', points })
  })
  return { waypoints, tracks }
}
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime || 'application/gpx+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// --- XLSX export (uses bundled SheetJS, fully offline) ---
function exportXlsx() {
  if (typeof XLSX === 'undefined') {
    alert('Library XLSX tidak tersedia. Pastikan file xlsx/xlsx.full.min.js sudah di-bundle.')
    return
  }
  const wb = XLSX.utils.book_new()

  // Sheet 1: Placemarks (tags)
  if (placemarks.length > 0) {
    const pmRows = placemarks.map((p, i) => ({
      No: i + 1,
      Nama: p.name,
      Kategori: p.category,
      Latitude: p.coord.lat,
      Longitude: p.coord.lng,
      'Altitude (m)': p.coord.alt != null ? p.coord.alt.toFixed(1) : '',
      Deskripsi: p.description || '',
      Warna: p.color,
      'Jumlah Foto': p.photos.length,
      'Dibuat': new Date(p.createdAt).toISOString(),
      'Diubah': new Date(p.updatedAt).toISOString(),
      'Project ID': p.projectId,
    }))
    const ws1 = XLSX.utils.json_to_sheet(pmRows)
    // set column widths
    ws1['!cols'] = [
      { wch: 4 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 22 }, { wch: 22 }
    ]
    XLSX.utils.book_append_sheet(wb, ws1, 'Placemarks')
  }

  // Sheet 2: Tracks summary
  if (tracks.length > 0) {
    const trkRows = tracks.map((t, i) => ({
      No: i + 1,
      Nama: t.name,
      'Jarak (m)': t.distance.toFixed(1),
      'Jarak (km)': (t.distance / 1000).toFixed(3),
      'Durasi (s)': Math.round(t.duration),
      'Durasi': formatDuration(t.duration),
      'Avg Speed (km/h)': t.avgSpeed.toFixed(2),
      'Max Speed (km/h)': t.maxSpeed.toFixed(2),
      'Ascent (m)': t.ascent.toFixed(0),
      'Descent (m)': t.descent.toFixed(0),
      'Max Elev (m)': t.maxAlt != null ? t.maxAlt.toFixed(0) : '',
      'Min Elev (m)': t.minAlt != null ? t.minAlt.toFixed(0) : '',
      'Jumlah Titik': t.points.length,
      'Dibuat': new Date(t.createdAt).toISOString(),
      'Project ID': t.projectId,
    }))
    const ws2 = XLSX.utils.json_to_sheet(trkRows)
    ws2['!cols'] = [
      { wch: 4 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 22 }, { wch: 22 }
    ]
    XLSX.utils.book_append_sheet(wb, ws2, 'Tracks')
  }

  // Sheet 3: Track Points (detail)
  if (tracks.length > 0) {
    const ptRows = []
    tracks.forEach((t, ti) => {
      t.points.forEach((p, pi) => {
        ptRows.push({
          Track_No: ti + 1,
          Track_Name: t.name,
          Point_No: pi + 1,
          Latitude: p.coord.lat,
          Longitude: p.coord.lng,
          'Altitude (m)': p.coord.alt != null ? p.coord.alt.toFixed(1) : '',
          'Time': p.coord.time ? new Date(p.coord.time).toISOString() : '',
          'Distance_from_Start (m)': p.distanceFromStart.toFixed(1),
          'Duration_from_Start (s)': p.durationFromStart.toFixed(1),
        })
      })
    })
    const ws3 = XLSX.utils.json_to_sheet(ptRows)
    ws3['!cols'] = [
      { wch: 8 }, { wch: 25 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 18 }
    ]
    XLSX.utils.book_append_sheet(wb, ws3, 'TrackPoints')
  }

  // Sheet 4: Projects summary
  if (projects.length > 0) {
    const prjRows = projects.map((p, i) => ({
      No: i + 1,
      Nama: p.name,
      Deskripsi: p.description || '',
      Warna: p.color,
      'Dibuat': new Date(p.createdAt).toISOString(),
      'Default': p.isDefault ? 'Yes' : 'No',
    }))
    const ws4 = XLSX.utils.json_to_sheet(prjRows)
    ws4['!cols'] = [{ wch: 4 }, { wch: 30 }, { wch: 40 }, { wch: 10 }, { wch: 22 }, { wch: 8 }]
    XLSX.utils.book_append_sheet(wb, ws4, 'Projects')
  }

  // Sheet 5: Settings summary (info)
  const settingsRows = Object.entries(settings).filter(([k]) => k !== 'id').map(([k, v]) => ({
    Setting: k,
    Value: typeof v === 'object' ? JSON.stringify(v) : String(v),
  }))
  const ws5 = XLSX.utils.json_to_sheet(settingsRows)
  ws5['!cols'] = [{ wch: 20 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, ws5, 'Settings')

  // Write to binary and trigger download
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mytracker-export-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
function readFileAsText(f) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result); r.onerror = () => rej(r.error)
    r.readAsText(f)
  })
}
function readFileAsDataUrl(f) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result); r.onerror = () => rej(r.error)
    r.readAsDataURL(f)
  })
}

// --- Elevation stats ---
function elevationStats(coords) {
  let ascent = 0, descent = 0, max = null, min = null
  coords.forEach(c => {
    if (c.alt == null) return
    if (max == null || c.alt > max) max = c.alt
    if (min == null || c.alt < min) min = c.alt
  })
  for (let i = 1; i < coords.length; i++) {
    const p = coords[i-1].alt, cur = coords[i].alt
    if (p == null || cur == null) continue
    const d = cur - p
    if (d > 0) ascent += d; else descent += -d
  }
  return { ascent, descent, max, min }
}

// --- Init map ---
function initMap() {
  map = L.map('map', { zoomControl: true, attributionControl: true, center: [-6.2, 106.8], zoom: 13 })
  markerLayer = L.layerGroup().addTo(map)
  trackLayer = L.layerGroup().addTo(map)
  measureLayer = L.layerGroup().addTo(map)
  applyLayers()
  map.on('click', onMapClick)
  map.on('mousemove', e => updateCoordDisplay({ lat: e.latlng.lat, lng: e.latlng.lng }))
}

function applyLayers() {
  // remove existing
  Object.values(baseLayerInstances).forEach(l => map.removeLayer(l))
  Object.values(overlayLayerInstances).forEach(l => map.removeLayer(l))
  baseLayerInstances = {}; overlayLayerInstances = {}
  const activeBase = BUILTIN_LAYERS.find(l => l.isBase && l.visible)
  if (activeBase) {
    if (activeBase.type === 'offline-geojson') {
      // Offline base layer: render world GeoJSON as background
      if (offlineWorldData) {
        baseLayerInstances[activeBase.id] = L.geoJSON(offlineWorldData, {
          style: { color: '#3f6212', weight: 1, fillColor: '#1e3a2f', fillOpacity: 0.8 }
        }).addTo(map)
      } else {
        // try to load it (will be loaded asynchronously later via initOfflineMap)
        console.log('Offline world data not loaded yet — falling back to grid background')
      }
    } else if (activeBase.url) {
      baseLayerInstances[activeBase.id] = L.tileLayer(activeBase.url, { attribution: activeBase.attribution, opacity: activeBase.opacity }).addTo(map)
    }
  }
  overlayLayers.filter(l => l.visible).forEach(l => {
    if (l.type === 'tile') {
      overlayLayerInstances[l.id] = L.tileLayer(l.url, { attribution: l.attribution, opacity: l.opacity }).addTo(map)
    } else if (l.type === 'geojson' && l.data) {
      overlayLayerInstances[l.id] = L.geoJSON(l.data, { style: { color: l.color || '#dc2626' }, pointToLayer: (f, latlng) => L.marker(latlng, { icon: makeIcon(l.color || '#dc2626', 'waypoint') }) }).addTo(map)
    }
  })
}

// Load world land geojson from bundled data file (offline)
async function initOfflineMap() {
  try {
    const res = await fetch('data/world-land.geo.json')
    offlineWorldData = await res.json()
    console.log('Offline world data loaded:', offlineWorldData.features?.length, 'features')
    // re-apply if the active base layer is offline
    const activeBase = BUILTIN_LAYERS.find(l => l.isBase && l.visible)
    if (activeBase && activeBase.id === 'offline-world') {
      applyLayers()
    }
  } catch (e) {
    console.warn('Failed to load offline world data:', e)
  }
}

function makeIcon(color, category) {
  const sym = getCatIcon(category)
  return L.divIcon({ className: '', html: `<div class="marker-pin" style="background:${color}">${sym}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] })
}

// --- Render placemarks on map ---
function renderPlacemarks() {
  markerLayer.clearLayers()
  placemarks.forEach(pm => {
    const m = L.marker([pm.coord.lat, pm.coord.lng], { icon: makeIcon(pm.color, pm.category) })
    m.on('click', () => selectPlacemark(pm))
    m.addTo(markerLayer)
  })
}

// --- Render tracks on map ---
function renderTracks() {
  trackLayer.clearLayers()
  tracks.forEach(t => {
    if (t.points.length < 2) return
    const line = L.polyline(t.points.map(p => [p.coord.lat, p.coord.lng]), {
      color: t.color, weight: selectedTrack?.id === t.id ? 5 : 3, opacity: 0.85
    })
    line.on('click', () => selectTrack(t))
    line.addTo(trackLayer)
  })
  if (recordingTrackId && recordingPoints.length > 1) {
    L.polyline(recordingPoints.map(c => [c.lat, c.lng]), { color: '#dc2626', weight: 4, opacity: 0.9, dashArray: '6,4' }).addTo(trackLayer)
  }
}

// --- Render measure ---
function renderMeasure() {
  measureLayer.clearLayers()
  if (measurePoints.length === 0) return
  if (selectedTool === 'measure-line' && measurePoints.length > 1) {
    L.polyline(measurePoints.map(c => [c.lat, c.lng]), { color: '#dc2626', weight: 3, dashArray: '6,4' }).addTo(measureLayer)
  }
  if (selectedTool === 'measure-area' && measurePoints.length >= 2) {
    L.polygon(measurePoints.map(c => [c.lat, c.lng]), { color: '#dc2626', weight: 3, fillColor: '#dc2626', fillOpacity: 0.2 }).addTo(measureLayer)
  }
  measurePoints.forEach(c => {
    L.marker([c.lat, c.lng], { icon: L.divIcon({ className: '', html: '<div style="width:10px;height:10px;border-radius:50%;background:#dc2626;border:2px solid white"></div>', iconSize: [10,10], iconAnchor: [5,5] }) }).addTo(measureLayer)
  })
  updateMeasureInfo()
}

function updateMeasureInfo() {
  const el = document.getElementById('measure-info')
  if (selectedTool === 'measure-line' && measurePoints.length > 1) {
    el.classList.remove('hidden')
    el.innerHTML = `Total: <b>${formatDistance(polylineLength(measurePoints))}</b> · ${measurePoints.length} titik`
  } else if (selectedTool === 'measure-area' && measurePoints.length >= 3) {
    el.classList.remove('hidden')
    el.innerHTML = `Luas: <b>${formatArea(polygonArea(measurePoints))}</b> · Keliling: <b>${formatDistance(polylineLength([...measurePoints, measurePoints[0]]))}</b>`
  } else if (selectedTool === 'measure-area' && measurePoints.length < 3) {
    el.classList.remove('hidden')
    el.innerHTML = `Klik untuk menambah titik (min 3 untuk luas) · ${measurePoints.length} titik`
  } else {
    el.classList.add('hidden')
  }
}

// --- Map click handler ---
function onMapClick(e) {
  const coord = { lat: e.latlng.lat, lng: e.latlng.lng }
  if (selectedTool === 'placemark') {
    addPlacemark({
      name: `Waypoint ${new Date().toLocaleTimeString('id-ID')}`,
      description: '',
      category: 'waypoint',
      coord, color: '#dc2626', photos: [], projectId: currentProjectId,
    })
  } else if (selectedTool === 'measure-line' || selectedTool === 'measure-area') {
    measurePoints.push(coord)
    renderMeasure()
  }
  updateCoordDisplay(coord)
}

// --- Placemarks CRUD ---
async function addPlacemark(data) {
  const pm = { id: genId('pm'), ...data, createdAt: Date.now(), updatedAt: Date.now() }
  await dbPut('placemarks', pm)
  placemarks.unshift(pm)
  renderPlacemarks()
  renderPlacemarksList()
  updateCounts()
  selectPlacemark(pm)
}
async function updatePlacemark(id, patch) {
  const pm = placemarks.find(p => p.id === id)
  if (!pm) return
  Object.assign(pm, patch, { updatedAt: Date.now() })
  await dbPut('placemarks', pm)
  renderPlacemarks()
  renderPlacemarksList()
}
async function deletePlacemark(id) {
  await dbDelete('placemarks', id)
  placemarks = placemarks.filter(p => p.id !== id)
  if (selectedPlacemark?.id === id) selectedPlacemark = null
  renderPlacemarks()
  renderPlacemarksList()
  updateCounts()
  closePlacemarkEditor()
}

// --- Tracks CRUD ---
async function addTrackFromRecording() {
  if (recordingPoints.length < 2) { stopRecording(); return }
  const points = recordingPoints
  const distance = polylineLength(points)
  const duration = (Date.now() - recordingStart) / 1000
  const { ascent, descent, max: maxAlt, min: minAlt } = elevationStats(points)
  const track = {
    id: recordingTrackId || genId('trk'),
    name: `Track ${new Date().toLocaleString('id-ID')}`,
    description: '',
    color: '#dc2626',
    points: points.map((c, i) => ({ coord: c, distanceFromStart: polylineLength(points.slice(0, i+1)), durationFromStart: c.time ? (c.time - recordingStart) / 1000 : 0 })),
    distance, duration, ascent, descent, maxAlt, minAlt,
    avgSpeed: distance / 1000 / (duration / 3600 || 1),
    maxSpeed: 0,
    createdAt: Date.now(),
    projectId: currentProjectId,
  }
  await dbPut('tracks', track)
  tracks.unshift(track)
  stopRecording()
  renderTracks()
  renderTracksList()
  updateCounts()
  selectTrack(track)
}
async function deleteTrack(id) {
  await dbDelete('tracks', id)
  tracks = tracks.filter(t => t.id !== id)
  if (selectedTrack?.id === id) selectedTrack = null
  renderTracks()
  renderTracksList()
  updateCounts()
  if (selectedTrack === null) document.getElementById('detail-panel').classList.add('hidden')
}

// --- Recording ---
async function startRecording() {
  recordingTrackId = genId('trk')
  recordingPoints = []
  recordingStart = Date.now()
  if (!settings.gpsTracking) toggleGps(true)
  document.getElementById('btn-record').innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="6" width="12" height="12"/></svg><span>Stop</span>'
  document.getElementById('btn-record').classList.add('recording-pulse')
  document.getElementById('recording-indicator').classList.remove('hidden')
  updateRecStats()
}
function stopRecording() {
  recordingTrackId = null
  recordingPoints = []
  recordingStart = 0
  document.getElementById('btn-record').innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><circle cx="12" cy="12" r="10"/></svg><span>Rekam</span>'
  document.getElementById('btn-record').classList.remove('recording-pulse')
  document.getElementById('recording-indicator').classList.add('hidden')
  renderTracks()
}
function appendRecordingPoint(c) {
  recordingPoints.push(c)
  updateRecStats()
  renderTracks()
}
function updateRecStats() {
  const el = document.getElementById('rec-stats')
  if (!recordingTrackId) return
  el.textContent = `${recordingPoints.length} pts · ${formatDistance(polylineLength(recordingPoints))}`
}

// --- GPS ---
function toggleGps(forceOn) {
  const wantOn = forceOn !== undefined ? forceOn : !settings.gpsTracking
  settings.gpsTracking = wantOn
  saveSettings()
  if (wantOn) startGps()
  else stopGps()
}
function startGps() {
  if (!('geolocation' in navigator)) return alert('GPS tidak didukung di perangkat ini')
  if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId)
  document.getElementById('btn-gps').classList.add('active-gps')
  gpsWatchId = navigator.geolocation.watchPosition(pos => {
    const coord = { lat: pos.coords.latitude, lng: pos.coords.longitude, alt: pos.coords.altitude, time: Date.now() }
    currentCoord = coord
    gpsAccuracy = pos.coords.accuracy
    gpsSpeed = pos.coords.speed
    gpsHeading = pos.coords.heading
    gpsActive = true
    updateGpsUI()
    if (gpsMarker) map.removeLayer(gpsMarker)
    gpsMarker = L.marker([coord.lat, coord.lng], { icon: L.divIcon({ className: '', html: '<div class="marker-gps"></div>', iconSize: [20,20], iconAnchor: [10,10] }) }).addTo(map)
    if (settings.followGps) map.setView([coord.lat, coord.lng], Math.max(map.getZoom(), 15), { animate: true })
    if (recordingTrackId) appendRecordingPoint(coord)
  }, err => {
    console.error('GPS error', err)
    gpsActive = false
    updateGpsUI()
  }, { enableHighAccuracy: settings.highAccuracyGps, maximumAge: 3000, timeout: 10000 })
}
function stopGps() {
  if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId)
  gpsWatchId = null
  gpsActive = false
  if (gpsMarker) { map.removeLayer(gpsMarker); gpsMarker = null }
  document.getElementById('btn-gps').classList.remove('active-gps')
  updateGpsUI()
}
function updateGpsUI() {
  const dot = document.getElementById('gps-dot')
  const text = document.getElementById('gps-text')
  const acc = document.getElementById('gps-accuracy')
  if (gpsActive) {
    dot.classList.add('active')
    text.textContent = 'GPS LOCK'
    if (gpsAccuracy != null) acc.textContent = `±${gpsAccuracy.toFixed(0)}m`
  } else {
    dot.classList.remove('active')
    text.textContent = 'GPS OFF'
    acc.textContent = ''
  }
  const speedEl = document.getElementById('speed-display')
  if (gpsActive && gpsSpeed != null) {
    speedEl.classList.remove('hidden')
    document.getElementById('speed-text').textContent = formatSpeed((gpsSpeed || 0) * 3.6)
  } else {
    speedEl.classList.add('hidden')
  }
}
function updateCoordDisplay(coord) {
  document.getElementById('coord-text').textContent = formatCoord(coord)
}

// --- Layers list rendering ---
function renderLayersList() {
  // base
  const baseEl = document.getElementById('base-layers')
  baseEl.innerHTML = ''
  BUILTIN_LAYERS.filter(l => l.isBase).forEach(l => {
    const row = document.createElement('div')
    row.className = 'layer-row'
    row.innerHTML = `
      <div class="layer-name">
        <span class="layer-icon ${l.visible ? 'on' : 'off'}">${l.visible ? '◉' : '○'}</span>
        <span>${l.name}</span>
      </div>
      <span class="layer-op" data-id="${l.id}" data-op="settings">⚙</span>
    `
    row.onclick = (e) => {
      if (e.target.dataset.op === 'settings') return
      BUILTIN_LAYERS.forEach(b => b.visible = b.id === l.id)
      applyLayers(); renderLayersList()
    }
    baseEl.appendChild(row)
  })
  // overlays
  const ovEl = document.getElementById('overlay-layers')
  if (overlayLayers.length === 0) {
    ovEl.innerHTML = '<p class="muted-hint">Belum ada layer overlay. Impor GPX/GeoJSON untuk menambah.</p>'
    return
  }
  ovEl.innerHTML = ''
  overlayLayers.forEach(l => {
    const row = document.createElement('div')
    row.className = 'layer-row'
    row.innerHTML = `
      <div class="layer-name">
        <span class="layer-icon ${l.visible ? 'on' : 'off'}">${l.visible ? '◉' : '○'}</span>
        <span>${l.name}</span>
      </div>
      <div class="layer-ops">
        <span class="layer-op" data-id="${l.id}" data-op="delete" title="Hapus">🗑</span>
      </div>
    `
    row.onclick = (e) => {
      if (e.target.dataset.op === 'delete') {
        deleteOverlayLayer(l.id)
        return
      }
      l.visible = !l.visible
      applyLayers(); renderLayersList()
    }
    ovEl.appendChild(row)
  })
}

async function deleteOverlayLayer(id) {
  overlayLayers = overlayLayers.filter(l => l.id !== id)
  await dbDelete('layers', id)
  applyLayers(); renderLayersList()
}

// --- Render placemarks/tracks list ---
function renderPlacemarksList() {
  const el = document.getElementById('placemarks-list')
  if (placemarks.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📍</div><p>Belum ada waypoint</p><p class="muted-hint">Pilih tool 'Waypoint' di toolbar, lalu klik di peta untuk menambah titik.</p></div>`
    return
  }
  el.innerHTML = placemarks.map(p => `
    <div class="item-row ${selectedPlacemark?.id === p.id ? 'selected' : ''}" data-id="${p.id}">
      <div class="item-icon" style="background:${p.color}">${getCatIcon(p.category)}</div>
      <div class="item-info">
        <div class="item-name">${esc(p.name)}</div>
        <div class="item-meta">
          <span>${p.coord.lat.toFixed(5)}, ${p.coord.lng.toFixed(5)}</span>
          ${p.photos.length > 0 ? `<span>📷 ${p.photos.length}</span>` : ''}
        </div>
      </div>
      <div class="item-actions">
        <span class="item-action" data-action="export" title="Export GPX">⬇</span>
        <span class="item-action danger" data-action="delete" title="Hapus">🗑</span>
      </div>
    </div>
  `).join('')
  el.querySelectorAll('.item-row').forEach(row => {
    row.onclick = (e) => {
      const pm = placemarks.find(p => p.id === row.dataset.id)
      if (e.target.dataset.action === 'export') return exportPlacemark(pm)
      if (e.target.dataset.action === 'delete') return deletePlacemark(pm.id)
      selectPlacemark(pm)
    }
  })
}

function renderTracksList() {
  const el = document.getElementById('tracks-list')
  if (tracks.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🥾</div><p>Belum ada track</p><p class="muted-hint">Klik tombol 'Rekam' di toolbar untuk mulai merekam perjalanan dengan GPS.</p></div>`
    return
  }
  el.innerHTML = tracks.map(t => `
    <div class="item-row ${selectedTrack?.id === t.id ? 'selected' : ''}" data-id="${t.id}">
      <div class="item-icon" style="background:${t.color}">🥾</div>
      <div class="item-info">
        <div class="item-name">${esc(t.name)}</div>
        <div class="item-meta">
          <span>📏 ${formatDistance(t.distance)}</span>
          <span>⏱ ${formatDuration(t.duration)}</span>
          <span>${t.points.length} pts</span>
        </div>
      </div>
      <div class="item-actions">
        <span class="item-action" data-action="export" title="Export GPX">⬇</span>
        <span class="item-action danger" data-action="delete" title="Hapus">🗑</span>
      </div>
    </div>
  `).join('')
  el.querySelectorAll('.item-row').forEach(row => {
    row.onclick = (e) => {
      const t = tracks.find(x => x.id === row.dataset.id)
      if (e.target.dataset.action === 'export') return exportTrack(t)
      if (e.target.dataset.action === 'delete') return deleteTrack(t.id)
      selectTrack(t)
    }
  })
}

function exportPlacemark(pm) {
  const xml = `<?xml version="1.0"?><gpx><wpt lat="${pm.coord.lat}" lon="${pm.coord.lng}"><name>${esc(pm.name)}</name></wpt></gpx>`
  downloadFile(`${pm.name.replace(/\s+/g, '_')}.gpx`, xml)
}
function exportTrack(t) {
  const pts = t.points.map(p => `      <trkpt lat="${p.coord.lat.toFixed(6)}" lon="${p.coord.lng.toFixed(6)}">${p.coord.alt != null ? `<ele>${p.coord.alt.toFixed(1)}</ele>` : ''}</trkpt>`).join('\n')
  const xml = `<?xml version="1.0"?><gpx><trk><name>${esc(t.name)}</name><trkseg>${pts}</trkseg></trk></gpx>`
  downloadFile(`${t.name.replace(/\s+/g, '_')}.gpx`, xml)
}

// --- Select handlers ---
function selectPlacemark(pm) {
  selectedPlacemark = pm
  selectedTrack = null
  map.setView([pm.coord.lat, pm.coord.lng], Math.max(map.getZoom(), 15), { animate: true })
  renderPlacemarksList(); renderTracks()
  openPlacemarkEditor(pm)
}
function selectTrack(t) {
  selectedTrack = t
  selectedPlacemark = null
  if (t.points.length > 0) map.setView([t.points[0].coord.lat, t.points[0].coord.lng], Math.max(map.getZoom(), 13), { animate: true })
  renderTracksList(); renderTracks()
  showTrackDetail(t)
}

function showTrackDetail(t) {
  const panel = document.getElementById('detail-panel')
  panel.classList.remove('hidden')
  panel.innerHTML = `
    <div class="detail-title">${esc(t.name)}</div>
    ${t.description ? `<div class="muted-hint">${esc(t.description)}</div>` : ''}
    <div class="muted-hint">Dibuat: ${formatDate(t.createdAt)}</div>
    <div class="detail-stats">
      <div class="stat-card"><div class="stat-label">Jarak</div><div class="stat-value">${formatDistance(t.distance)}</div></div>
      <div class="stat-card"><div class="stat-label">Durasi</div><div class="stat-value">${formatDuration(t.duration)}</div></div>
      <div class="stat-card"><div class="stat-label">Avg speed</div><div class="stat-value">${formatSpeed(t.avgSpeed)}</div></div>
      <div class="stat-card"><div class="stat-label">Max speed</div><div class="stat-value">${formatSpeed(t.maxSpeed)}</div></div>
      ${t.maxAlt != null ? `<div class="stat-card"><div class="stat-label">Max elev</div><div class="stat-value">${t.maxAlt.toFixed(0)} m</div></div>` : ''}
      ${t.minAlt != null ? `<div class="stat-card"><div class="stat-label">Min elev</div><div class="stat-value">${t.minAlt.toFixed(0)} m</div></div>` : ''}
      <div class="stat-card"><div class="stat-label">Ascent</div><div class="stat-value">${t.ascent.toFixed(0)} m</div></div>
      <div class="stat-card"><div class="stat-label">Descent</div><div class="stat-value">${t.descent.toFixed(0)} m</div></div>
    </div>
    <div class="muted-hint">${t.points.length} titik tercatat</div>
  `
}

function updateCounts() {
  document.getElementById('pm-count').textContent = placemarks.length
  document.getElementById('trk-count').textContent = tracks.length
  const total = placemarks.length + tracks.length
  document.getElementById('export-count').textContent = total
  document.getElementById('export-count-2').textContent = total
  document.getElementById('btn-export').disabled = total === 0
  document.getElementById('btn-export-xlsx').disabled = total === 0
}

// --- Projects ---
function renderProjectSelect() {
  const sel = document.getElementById('project-select')
  sel.innerHTML = projects.map(p => `<option value="${p.id}" ${p.id === currentProjectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')
  const cur = projects.find(p => p.id === currentProjectId)
  document.getElementById('project-name').textContent = cur?.name || 'Pilih'
}
function renderProjectList() {
  const list = document.getElementById('project-list')
  list.innerHTML = projects.map(p => `
    <div class="project-item ${p.id === currentProjectId ? 'active' : ''}" data-id="${p.id}">
      <div class="project-color" style="background:${p.color}"></div>
      <div><div>${esc(p.name)}</div>${p.description ? `<div class="muted-hint">${esc(p.description)}</div>` : ''}</div>
    </div>
  `).join('')
  list.querySelectorAll('.project-item').forEach(item => {
    item.onclick = () => {
      currentProjectId = item.dataset.id
      renderProjectSelect(); renderProjectList()
      document.getElementById('project-modal').classList.add('hidden')
    }
  })
}

// --- Placemark editor ---
function openPlacemarkEditor(pm) {
  editingPlacemark = pm
  document.getElementById('pm-name').value = pm.name
  document.getElementById('pm-desc').value = pm.description || ''
  document.getElementById('pm-coord').textContent = formatCoord(pm.coord) + (pm.coord.alt != null ? ` · ${pm.coord.alt.toFixed(0)}m` : '')
  // categories
  const catEl = document.getElementById('pm-categories')
  catEl.innerHTML = CATEGORIES.map(c => `<button class="category-btn ${c.id === pm.category ? 'active' : ''}" data-cat="${c.id}" title="${c.label}">${c.icon}</button>`).join('')
  catEl.querySelectorAll('.category-btn').forEach(b => b.onclick = () => {
    catEl.querySelectorAll('.category-btn').forEach(x => x.classList.remove('active'))
    b.classList.add('active')
  })
  // colors
  const colEl = document.getElementById('pm-colors')
  colEl.innerHTML = COLORS.map(c => `<button class="color-btn ${c === pm.color ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')
  colEl.querySelectorAll('.color-btn').forEach(b => b.onclick = () => {
    colEl.querySelectorAll('.color-btn').forEach(x => x.classList.remove('active'))
    b.classList.add('active')
  })
  renderPhotos(pm.photos)
  document.getElementById('placemark-modal').classList.remove('hidden')
}
function closePlacemarkEditor() {
  editingPlacemark = null
  document.getElementById('placemark-modal').classList.add('hidden')
}
function renderPhotos(photos) {
  const el = document.getElementById('pm-photos')
  document.getElementById('pm-photo-count').textContent = photos.length
  el.innerHTML = photos.map(p => `<div class="photo-cell"><img src="${p.dataUrl}" alt="" /><button class="photo-delete" data-id="${p.id}">×</button></div>`).join('')
  el.querySelectorAll('.photo-delete').forEach(b => b.onclick = async (e) => {
    e.stopPropagation()
    if (!editingPlacemark) return
    editingPlacemark.photos = editingPlacemark.photos.filter(x => x.id !== b.dataset.id)
    await updatePlacemark(editingPlacemark.id, { photos: editingPlacemark.photos })
    renderPhotos(editingPlacemark.photos)
  })
}

// --- Settings ---
async function saveSettings() {
  await dbPut('settings', settings)
}
function applySettingsToUI() {
  document.querySelector(`input[name="coord-format"][value="${settings.coordFormat}"]`).checked = true
  document.querySelector(`input[name="dist-unit"][value="${settings.distanceUnit}"]`).checked = true
  document.getElementById('set-gps-tracking').checked = settings.gpsTracking
  document.getElementById('set-high-acc').checked = settings.highAccuracyGps
  document.getElementById('set-follow-gps').checked = settings.followGps
  document.getElementById('set-compass').checked = settings.showCompass
  document.getElementById('set-pro').checked = settings.pro
  document.getElementById('coord-format').value = settings.coordFormat
  const compassEl = document.getElementById('compass-display')
  if (settings.showCompass) compassEl.classList.remove('hidden'); else compassEl.classList.add('hidden')
}

// --- Storage info ---
async function updateStorageInfo() {
  if (!navigator.storage?.estimate) return
  try {
    const est = await navigator.storage.estimate()
    const usage = est.usage || 0, quota = est.quota || 0
    document.getElementById('storage-text').textContent = formatSize(usage)
    document.getElementById('storage-text-2').textContent = formatSize(usage)
    const pct = quota ? Math.min(100, usage / quota * 100) : 0
    document.getElementById('storage-bar').style.width = pct + '%'
  } catch {}
}

// --- Compass ---
function initCompass() {
  if (typeof window === 'undefined' || !settings.showCompass) return
  const handler = e => {
    const heading = e.webkitCompassHeading ?? (e.alpha != null ? 360 - e.alpha : null)
    if (heading != null && isFinite(heading)) {
      compassHeading = heading
      const dir = ['N','NE','E','SE','S','SW','W','NW'][Math.round(heading / 45) % 8]
      document.getElementById('compass-text').textContent = `${Math.round(heading)}° ${dir}`
      document.getElementById('compass-icon').style.transform = `rotate(${heading}deg)`
    }
  }
  const anyDOE = DeviceOrientationEvent
  if (anyDOE && typeof anyDOE.requestPermission === 'function') {
    document.body.addEventListener('click', function once() {
      anyDOE.requestPermission().then(s => { if (s === 'granted') window.addEventListener('deviceorientation', handler, true) }).catch(() => {})
      document.body.removeEventListener('click', once)
    })
  } else {
    window.addEventListener('deviceorientation', handler, true)
    window.addEventListener('deviceorientationabsolute', handler, true)
  }
}

// --- Search ---
let searchTimer = null
function setupSearch() {
  const input = document.getElementById('search-input')
  const results = document.getElementById('search-results')
  input.oninput = () => {
    clearTimeout(searchTimer)
    const q = input.value.trim()
    if (!q) { results.classList.add('hidden'); return }
    searchTimer = setTimeout(async () => {
      // Offline-first: search in local placemarks + tracks first
      const localMatches = []
      const ql = q.toLowerCase()
      placemarks.forEach(p => {
        if (p.name.toLowerCase().includes(ql) || (p.description || '').toLowerCase().includes(ql)) {
          localMatches.push({ type: 'placemark', name: p.name, sub: 'Lokal · ' + p.coord.lat.toFixed(4) + ', ' + p.coord.lng.toFixed(4), lat: p.coord.lat, lng: p.coord.lng })
        }
      })
      tracks.forEach(t => {
        if (t.name.toLowerCase().includes(ql)) {
          const firstPt = t.points[0]?.coord
          if (firstPt) localMatches.push({ type: 'track', name: t.name, sub: 'Lokal · Track ' + formatDistance(t.distance), lat: firstPt.lat, lng: firstPt.lng })
        }
      })
      // Try online Nominatim (will fail if offline)
      let remoteMatches = []
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=8&addressdetails=1`, { signal: AbortSignal.timeout(3000) })
        if (res.ok) {
          const json = await res.json()
          remoteMatches = json.map(r => ({ type: 'remote', name: r.display_name.split(',')[0], sub: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }))
        }
      } catch (e) {
        console.log('Online search tidak tersedia (offline mode) — hanya menampilkan hasil lokal')
      }
      // Combine: local first, then remote
      const all = [...localMatches, ...remoteMatches]
      if (all.length === 0) {
        results.innerHTML = '<button disabled><div class="result-title">Tidak ada hasil (offline)</div><div class="result-sub">Cari di placemark/track lokal atau aktifkan internet</div></button>'
        results.classList.remove('hidden')
        return
      }
      results.innerHTML = all.map(r => {
        const label = r.type === 'placemark' ? '📍 ' : r.type === 'track' ? '🥾 ' : '🌐 '
        return `<button data-lat="${r.lat}" data-lng="${r.lng}"><div class="result-title">${label}${esc(r.name)}</div><div class="result-sub">${esc(r.sub)}</div></button>`
      }).join('')
      results.classList.remove('hidden')
      results.querySelectorAll('button[data-lat]').forEach(b => b.onclick = () => {
        const lat = parseFloat(b.dataset.lat), lng = parseFloat(b.dataset.lng)
        map.setView([lat, lng], 15, { animate: true })
        // Don't auto-add placemark if user clicked local result (just navigate)
        const firstText = b.querySelector('.result-title').textContent
        if (!firstText.startsWith('📍') && !firstText.startsWith('🥾')) {
          addPlacemark({ name: firstText.replace('🌐 ', ''), description: b.querySelector('.result-sub').textContent, category: 'waypoint', coord: { lat, lng }, color: '#0891b2', photos: [], projectId: currentProjectId })
        }
        results.classList.add('hidden'); input.value = ''
      })
    }, 600)
  }
}

// --- Event handlers ---
function setupHandlers() {
  // Tool buttons
  document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => {
    document.querySelectorAll('[data-tool]').forEach(x => x.classList.remove('active'))
    b.classList.add('active')
    selectedTool = b.dataset.tool
    measurePoints = []
    renderMeasure()
    const mapEl = document.getElementById('map')
    if (selectedTool === 'pan') mapEl.classList.remove('crosshair')
    else mapEl.classList.add('crosshair')
  })

  // Record button
  document.getElementById('btn-record').onclick = () => {
    if (recordingTrackId) addTrackFromRecording()
    else startRecording()
  }

  // GPS button
  document.getElementById('btn-gps').onclick = () => toggleGps()
  document.getElementById('btn-locate').onclick = () => {
    if (currentCoord) {
      settings.followGps = true
      saveSettings()
      map.setView([currentCoord.lat, currentCoord.lng], Math.max(map.getZoom(), 15), { animate: true })
    } else {
      toggleGps(true)
      settings.followGps = true; saveSettings()
    }
  }

  // Project button
  document.getElementById('btn-project').onclick = () => document.getElementById('project-modal').classList.remove('hidden')
  document.getElementById('close-projects').onclick = () => document.getElementById('project-modal').classList.add('hidden')
  document.getElementById('btn-cancel-project').onclick = () => document.getElementById('project-modal').classList.add('hidden')
  document.getElementById('btn-create-project').onclick = async () => {
    const name = document.getElementById('new-project-name').value.trim()
    if (!name) return
    const colors = ['#dc2626','#2563eb','#16a34a','#9333ea','#ea580c','#0891b2']
    const project = { id: genId('prj'), name, description: document.getElementById('new-project-desc').value.trim(), color: colors[Math.floor(Math.random() * colors.length)], createdAt: Date.now() }
    await dbPut('projects', project)
    projects.unshift(project)
    currentProjectId = project.id
    document.getElementById('new-project-name').value = ''
    document.getElementById('new-project-desc').value = ''
    renderProjectSelect(); renderProjectList()
    document.getElementById('project-modal').classList.add('hidden')
  }
  document.getElementById('project-select').onchange = (e) => { currentProjectId = e.target.value; renderProjectSelect(); renderProjectList() }

  // Settings button
  document.getElementById('btn-settings').onclick = () => document.getElementById('settings-modal').classList.remove('hidden')
  document.getElementById('close-settings').onclick = () => document.getElementById('settings-modal').classList.add('hidden')
  document.getElementById('btn-close-settings').onclick = () => document.getElementById('settings-modal').classList.add('hidden')
  document.getElementById('btn-reset').onclick = async () => {
    settings = { ...DEFAULT_SETTINGS }
    await saveSettings()
    applySettingsToUI()
  }
  document.querySelectorAll('input[name="coord-format"]').forEach(r => r.onchange = async (e) => { settings.coordFormat = e.target.value; await saveSettings(); document.getElementById('coord-format').value = e.target.value; updateCoordDisplay(currentCoord) })
  document.querySelectorAll('input[name="dist-unit"]').forEach(r => r.onchange = async (e) => { settings.distanceUnit = e.target.value; await saveSettings(); renderTracksList(); if (selectedTrack) showTrackDetail(selectedTrack) })
  document.getElementById('set-gps-tracking').onchange = async (e) => { settings.gpsTracking = e.target.checked; await saveSettings(); if (e.target.checked) startGps(); else stopGps() }
  document.getElementById('set-high-acc').onchange = async (e) => { settings.highAccuracyGps = e.target.checked; await saveSettings(); if (settings.gpsTracking) { stopGps(); startGps() } }
  document.getElementById('set-follow-gps').onchange = async (e) => { settings.followGps = e.target.checked; await saveSettings() }
  document.getElementById('set-compass').onchange = async (e) => { settings.showCompass = e.target.checked; await saveSettings(); if (e.target.checked) initCompass(); else document.getElementById('compass-display').classList.add('hidden') }
  document.getElementById('set-pro').onchange = async (e) => { settings.pro = e.target.checked; await saveSettings() }
  document.getElementById('coord-format').onchange = async (e) => { settings.coordFormat = e.target.value; await saveSettings(); document.querySelector(`input[name="coord-format"][value="${e.target.value}"]`).checked = true; updateCoordDisplay(currentCoord) }

  // Sidebar toggles
  document.getElementById('btn-toggle-left').onclick = () => {
    const sb = document.getElementById('left-sidebar')
    sb.style.display = sb.style.display === 'none' ? 'flex' : 'none'
  }
  document.getElementById('btn-toggle-right').onclick = () => {
    const sb = document.getElementById('right-sidebar')
    sb.style.display = sb.style.display === 'none' ? 'flex' : 'none'
  }

  // Tabs
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'))
    t.classList.add('active')
    activeTab = t.dataset.tab
    document.getElementById('tab-placemarks').classList.toggle('hidden', activeTab !== 'placemarks')
    document.getElementById('tab-tracks').classList.toggle('hidden', activeTab !== 'tracks')
  })

  // Import file
  document.getElementById('import-file').onchange = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const text = await readFileAsText(f)
    if (f.name.toLowerCase().endsWith('.gpx')) {
      try {
        const { waypoints, tracks: parsedTracks } = parseGpx(text)
        for (const w of waypoints) {
          await addPlacemark({ name: w.name, description: w.description, category: w.category, coord: w.coord, color: '#dc2626', photos: [], projectId: currentProjectId })
        }
        for (const t of parsedTracks) {
          const distance = polylineLength(t.points)
          const track = { id: genId('trk'), name: t.name, description: t.description, color: '#16a34a', points: t.points.map((c, i) => ({ coord: c, distanceFromStart: polylineLength(t.points.slice(0, i+1)), durationFromStart: 0 })), distance, duration: 0, ascent: 0, descent: 0, maxAlt: null, minAlt: null, avgSpeed: 0, maxSpeed: 0, createdAt: Date.now(), projectId: currentProjectId }
          await dbPut('tracks', track)
          tracks.unshift(track)
        }
        renderTracks(); renderTracksList(); updateCounts()
        alert(`Import selesai: ${waypoints.length} waypoints, ${parsedTracks.length} tracks`)
      } catch (err) { alert('GPX tidak valid: ' + err.message) }
    } else if (f.name.toLowerCase().endsWith('.geojson') || f.name.toLowerCase().endsWith('.json')) {
      try {
        const data = JSON.parse(text)
        const layer = { id: genId('lyr'), name: f.name.replace(/\.geojson$|\.json$/i, ''), type: 'geojson', data, opacity: 1, visible: true, isBase: false, color: '#dc2626', createdAt: Date.now() }
        await dbPut('layers', layer)
        overlayLayers.unshift(layer)
        applyLayers(); renderLayersList()
        alert('Layer GeoJSON berhasil diimpor')
      } catch (err) { alert('GeoJSON tidak valid') }
    }
    e.target.value = ''
  }

  // Export buttons
  document.getElementById('btn-export').onclick = () => {
    if (placemarks.length === 0 && tracks.length === 0) return
    downloadFile(`mytracker-export-${new Date().toISOString().slice(0, 10)}.gpx`, exportAllGpx())
  }
  document.getElementById('btn-export-xlsx').onclick = () => {
    if (placemarks.length === 0 && tracks.length === 0) return
    exportXlsx()
  }

  // Placemark editor
  document.getElementById('close-placemark').onclick = closePlacemarkEditor
  document.getElementById('btn-save-pm').onclick = async () => {
    if (!editingPlacemark) return closePlacemarkEditor()
    const name = document.getElementById('pm-name').value.trim() || editingPlacemark.name
    const description = document.getElementById('pm-desc').value.trim()
    const category = document.querySelector('.category-btn.active')?.dataset.cat || editingPlacemark.category
    const color = document.querySelector('.color-btn.active')?.dataset.color || editingPlacemark.color
    await updatePlacemark(editingPlacemark.id, { name, description, category, color })
    closePlacemarkEditor()
  }
  document.getElementById('btn-delete-pm').onclick = async () => {
    if (editingPlacemark && confirm('Hapus waypoint ini?')) deletePlacemark(editingPlacemark.id)
  }
  document.getElementById('pm-photo-input').onchange = async (e) => {
    const f = e.target.files?.[0]
    if (!f || !editingPlacemark) return
    const dataUrl = await readFileAsDataUrl(f)
    editingPlacemark.photos.push({ id: genId('photo'), dataUrl, takenAt: Date.now(), coord: editingPlacemark.coord, caption: '' })
    await updatePlacemark(editingPlacemark.id, { photos: editingPlacemark.photos })
    renderPhotos(editingPlacemark.photos)
    e.target.value = ''
  }

  // Click outside modal to close
  document.getElementById('settings-modal').onclick = e => { if (e.target.id === 'settings-modal') e.target.classList.add('hidden') }
  document.getElementById('project-modal').onclick = e => { if (e.target.id === 'project-modal') e.target.classList.add('hidden') }
  document.getElementById('placemark-modal').onclick = e => { if (e.target.id === 'placemark-modal') e.target.classList.add('hidden') }
}

// --- Init ---
async function init() {
  // Load settings
  try {
    const s = await new Promise((res, rej) => {
      const db = indexedDB.open(DB_NAME, DB_VERSION)
      db.onsuccess = async () => {
        try {
          const tx = db.result.transaction('settings', 'readonly')
          const req = tx.objectStore('settings').get('settings')
          req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error)
        } catch (e) { rej(e) }
      }
      db.onupgradeneeded = () => {
        for (const s of ['placemarks','tracks','layers','projects','settings']) {
          if (!db.result.objectStoreNames.contains(s)) db.result.createObjectStore(s, { keyPath: 'id' })
        }
      }
    })
    if (s) settings = { ...DEFAULT_SETTINGS, ...s }
  } catch {}

  // Load data
  placemarks = await dbGetAll('placemarks')
  tracks = await dbGetAll('tracks')
  overlayLayers = await dbGetAll('layers')
  projects = await dbGetAll('projects')
  if (projects.length === 0) {
    const def = { id: 'global', name: 'My Maps', description: 'Default project', color: '#2563eb', createdAt: Date.now(), isDefault: true }
    await dbPut('projects', def)
    projects.unshift(def)
    currentProjectId = 'global'
  } else {
    currentProjectId = projects[0].id
  }

  initMap()
  renderPlacemarks()
  renderTracks()
  renderLayersList()
  renderPlacemarksList()
  renderTracksList()
  renderProjectSelect()
  renderProjectList()
  updateCounts()
  applySettingsToUI()
  setupHandlers()
  setupSearch()
  initCompass()
  updateStorageInfo()
  // Load offline world map (bundled) for offline use
  initOfflineMap()
  // Auto-start GPS on app open (user-requested behavior).
  // Manual lock via GPS button in toolbar still preserved.
  if (settings.gpsTracking) {
    console.log('Auto-starting GPS on app open…')
    startGps()
    // Show notification that GPS is searching
    showGpsSearchingToast()
  }
}

// Show a toast indicating GPS is searching on startup
function showGpsSearchingToast() {
  const toast = document.createElement('div')
  toast.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#0a1e3c;color:#fff;padding:8px 16px;border-radius:8px;z-index:3000;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-size:13px;border:1px solid #2563eb'
  toast.innerHTML = '🛰️ <b>Mencari lokasi GPS…</b><br/><span style="font-size:11px;opacity:0.8">Pastikan GPS diaktifkan di pengaturan Android</span>'
  document.body.appendChild(toast)
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast)
  }, 5000)
}

// Run init on DOM ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
else init()
