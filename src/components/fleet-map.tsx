import { useEffect, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import leafletCss from 'leaflet/dist/leaflet.css?url'
import type { LocationState } from '~/lib/tracking'

// OpenStreetMap through Leaflet. Leaflet needs `window`, so it loads in the
// browser only; the server renders an empty box of the same size.

export interface MapPin {
  id: number
  latitude: number
  longitude: number
  /** Short text on the pin: the plate. */
  label: string
  state: LocationState
  /** Popup: a bold first line, then plain lines, then a link. */
  title: string
  lines: string[]
  href: string
}

/** Where the map opens before any car has a position: all of Australia. */
const HOME: [number, number] = [-27, 134]

export function FleetMap({ pins, focus, height = 480 }: { pins: MapPin[]; focus?: number | null; height?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const lib = useRef<typeof Leaflet | null>(null)
  const map = useRef<Leaflet.Map | null>(null)
  const layer = useRef<Leaflet.LayerGroup | null>(null)
  const markers = useRef(new Map<number, Leaflet.Marker>())
  const fitted = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void import('leaflet').then((mod) => {
      if (cancelled || !box.current) return
      const L = (mod as unknown as { default?: typeof Leaflet }).default ?? mod
      lib.current = L
      map.current = L.map(box.current, { scrollWheelZoom: false }).setView(HOME, 4)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map.current)
      layer.current = L.layerGroup().addTo(map.current)
      setReady(true)
    })
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
    }
  }, [])

  // Redraw the pins on every refresh; zoom to fit them only the first time,
  // so a refresh doesn't undo the user's panning.
  useEffect(() => {
    const L = lib.current
    if (!ready || !L || !map.current || !layer.current) return
    layer.current.clearLayers()
    markers.current.clear()
    for (const pin of pins) {
      const icon = L.divIcon({
        className: 'map-pin-icon',
        html: `<span class="map-pin loc-${pin.state}">${escapeHtml(pin.label)}</span>`,
        iconSize: [96, 28],
        iconAnchor: [48, 28],
        popupAnchor: [0, -26],
      })
      const marker = L.marker([pin.latitude, pin.longitude], { icon, title: pin.label })
        .bindPopup(() => popupContent(pin))
        .addTo(layer.current)
      markers.current.set(pin.id, marker)
    }
    if (!fitted.current && pins.length > 0) {
      map.current.fitBounds(L.latLngBounds(pins.map((p) => [p.latitude, p.longitude])), { padding: [48, 48], maxZoom: 15 })
      fitted.current = true
    }
  }, [ready, pins])

  useEffect(() => {
    const marker = focus == null ? undefined : markers.current.get(focus)
    if (!ready || !marker || !map.current) return
    map.current.flyTo(marker.getLatLng(), Math.max(map.current.getZoom(), 15), { duration: 0.6 })
    marker.openPopup()
  }, [ready, focus, pins])

  return (
    <>
      <link rel="stylesheet" href={leafletCss} precedence="default" />
      <div ref={box} className="map" style={{ height }} role="region" aria-label="Map of car locations" />
    </>
  )
}

function popupContent(pin: MapPin) {
  const root = document.createElement('div')
  root.className = 'map-popup'
  const title = document.createElement('strong')
  title.textContent = pin.title
  root.append(title)
  for (const line of pin.lines) {
    const p = document.createElement('div')
    p.textContent = line
    root.append(p)
  }
  const link = document.createElement('a')
  link.href = pin.href
  link.textContent = 'Open car →'
  root.append(link)
  return root
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
