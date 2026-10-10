import { useEffect, useRef, useState, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { SHOP_TYPES } from '../lib/constants'
import { getDistanceKm, extractCoords, generateMeshEdges } from '../lib/geoMesh'

export default function NearbyShopsMap({ locations = [], currentShop, currentProfile }) {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersLayerRef = useRef(null)
  const circleLayerRef = useRef(null)
  const meshLinesLayerRef = useRef(null)

  const [radiusKm, setRadiusKm] = useState(10) // default 10 km
  const [selectedShopId, setSelectedShopId] = useState(null)

  // Determine current shop reference point
  const currentCoords = useMemo(() => {
    // 1. Try active currentShop
    const fromShop = extractCoords(currentShop)
    if (fromShop) {
      return {
        ...fromShop,
        name: currentShop.name || 'Your Shop',
      }
    }
    // 2. Try currentProfile
    const fromProfile = extractCoords(currentProfile)
    if (fromProfile) {
      return {
        ...fromProfile,
        name: currentProfile.shopName || 'Your Shop',
      }
    }
    // 3. Find any location with coordinates
    const anyLoc = locations.find((l) => extractCoords(l) !== null)
    if (anyLoc) {
      const c = extractCoords(anyLoc)
      return {
        ...c,
        name: anyLoc.name,
      }
    }
    // 4. Default fallback
    return {
      lat: 28.4682,
      lon: 77.0864,
      name: currentShop?.name || 'Your Shop',
    }
  }, [currentShop, currentProfile, locations])

  // Map shop types to emoji icon
  const getShopIcon = (typeId) => {
    const found = SHOP_TYPES.find((t) => t.id === typeId)
    return found ? found.icon : '🏪'
  }

  // Calculate distance for all locations associated with us
  const parsedShops = useMemo(() => {
    return locations
      .filter((loc) => {
        const isAssociated = (loc.ownerEmail || loc.mapVerified) && loc.active !== false
        return isAssociated && extractCoords(loc) !== null
      })
      .map((loc) => {
        const coords = extractCoords(loc)
        const lat = coords.lat
        const lon = coords.lon

        // Only mark current if it matches the current shop ID or current profile assignment!
        // DO NOT mark other shops in the same town as current by coordinates!
        const isCurrent =
          Boolean(currentShop?.id && loc.id === currentShop.id) ||
          Boolean(currentProfile?.shopLocationId && loc.id === currentProfile.shopLocationId) ||
          Boolean(
            loc.ownerEmail &&
            currentProfile?.email &&
            loc.ownerEmail.toLowerCase() === currentProfile.email.toLowerCase() &&
            loc.id === (currentShop?.id || currentProfile?.shopLocationId)
          )

        const dist = isCurrent ? 0 : getDistanceKm(currentCoords.lat, currentCoords.lon, lat, lon)

        const emailPrefix = loc.ownerEmail ? loc.ownerEmail.split('@')[0] : ''
        const cleanEmailName = emailPrefix
          ? (emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)).replace(/[0-9._-]+/g, ' ').replace(/\s+/g, ' ').trim()
          : ''
        const currentUserName = isCurrent ? (currentProfile?.name || currentProfile?.displayName || '') : ''
        const ownerName =
          (loc.registeredName && loc.registeredName !== 'Store Owner' ? loc.registeredName : '') ||
          (loc.ownerName && loc.ownerName !== 'Store Owner' ? loc.ownerName : '') ||
          currentUserName ||
          loc.contactPerson ||
          cleanEmailName ||
          (emailPrefix ? emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1) : '') ||
          ''

        return {
          ...loc,
          lat,
          lon,
          isCurrent,
          distanceKm: dist,
          ownerName: ownerName || loc.ownerName || '',
          iconEmoji: getShopIcon(loc.shopType || loc.type),
        }
      })
      .filter((loc) => {
        // If it's not marked current, but shares the exact same name and coordinates (< 50m) as current shop,
        // ignore it to prevent showing duplicates of the user's own store.
        if (!loc.isCurrent && currentShop) {
          const sameName = loc.name?.trim().toLowerCase() === currentShop.name?.trim().toLowerCase()
          if (sameName && loc.distanceKm !== null && loc.distanceKm < 0.05) {
            return false
          }
        }
        return true
      })
      .sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999))
  }, [locations, currentShop, currentProfile, currentCoords])

  // Filter nearby shops within the selected radius
  const nearbyShops = useMemo(() => {
    return parsedShops.filter((s) => s.isCurrent || (s.distanceKm != null && s.distanceKm <= radiusKm))
  }, [parsedShops, radiusKm])

  const otherShopsInRadius = useMemo(() => {
    return nearbyShops.filter((s) => !s.isCurrent)
  }, [nearbyShops])

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [currentCoords.lat, currentCoords.lon],
        zoom: 12,
        zoomControl: true,
        scrollWheelZoom: false,
      })

      // Add clean OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)

      circleLayerRef.current = L.layerGroup().addTo(map)
      meshLinesLayerRef.current = L.layerGroup().addTo(map)
      markersLayerRef.current = L.layerGroup().addTo(map)
      mapInstanceRef.current = map

      // Reset selection when clicking map canvas
      map.on('click', () => setSelectedShopId(null))
    }

    return () => {
      // Keep instance for performance or cleanup if unmounted
    }
  }, [])

  // Update Markers, Mesh Network Lines, and Radius Circle when data or radius changes
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    // Center map on current shop
    map.setView([currentCoords.lat, currentCoords.lon], radiusKm <= 5 ? 13 : radiusKm <= 10 ? 12 : 11)

    // Clear previous markers, circle, and mesh lines
    if (circleLayerRef.current) circleLayerRef.current.clearLayers()
    if (meshLinesLayerRef.current) meshLinesLayerRef.current.clearLayers()
    if (markersLayerRef.current) markersLayerRef.current.clearLayers()

    // 1. Draw radius circle
    const circle = L.circle([currentCoords.lat, currentCoords.lon], {
      radius: radiusKm * 1000, // convert km to meters
      color: '#6366f1',
      weight: 2,
      dashArray: '6, 8',
      fillColor: '#6366f1',
      fillOpacity: 0.07,
    })

    circle.bindTooltip(`${radiusKm} km Radius Area`, { permanent: false, direction: 'top' })
    circle.addTo(circleLayerRef.current)

    // 2. Add Current Shop Marker (glowing indigo beacon)
    const currentShopHtml = `
      <div style="
        background: #6366f1;
        color: #fff;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 19px;
        border: 3px solid #ffffff;
        box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.4), 0 4px 12px rgba(0,0,0,0.5);
      ">
        📍
      </div>
    `
    const currentIcon = L.divIcon({
      className: 'current-shop-icon',
      html: currentShopHtml,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -22],
    })

    const curMarker = L.marker([currentCoords.lat, currentCoords.lon], { icon: currentIcon })
    curMarker.bindPopup(`
      <div style="font-family: inherit; min-width: 200px; padding: 4px;">
        <div style="font-size: 11px; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 0.5px;">Your Location</div>
        <div style="font-size: 15px; font-weight: 700; margin: 2px 0 4px; color: #111;">${currentShop?.name || currentCoords.name}</div>
        <div style="font-size: 12px; color: #555; line-height: 1.4;">${currentShop?.address || currentProfile?.verifiedAddress || 'Registered shop address'}</div>
      </div>
    `)
    curMarker.addTo(markersLayerRef.current)

    // 3. Precalculate plotted coordinates for partner shops within radius
    const plottedPartners = otherShopsInRadius.map((shop, index) => {
      let plotLat = shop.lat
      let plotLon = shop.lon
      if (Math.abs(shop.lat - currentCoords.lat) < 0.0003 && Math.abs(shop.lon - currentCoords.lon) < 0.0003) {
        const angle = ((index + 1) * 2 * Math.PI) / (otherShopsInRadius.length + 1)
        plotLat += Math.cos(angle) * 0.0018 // ~150 meters offset so pins don't overlap
        plotLon += Math.sin(angle) * 0.0018
      }
      return {
        ...shop,
        plotLat,
        plotLon,
      }
    })

    // 4. Draw Mesh Network Lines: lightly visible lines interconnecting partner shops
    const centerNode = {
      id: currentShop?.id || 'current_user_shop',
      name: currentShop?.name || currentCoords.name,
      plotLat: currentCoords.lat,
      plotLon: currentCoords.lon,
      isCurrent: true,
    }

    const meshEdges = generateMeshEdges(centerNode, plottedPartners, getDistanceKm)

    meshEdges.forEach(({ u, v }) => {
      const isConnectedToSelected =
        selectedShopId && (u.id === selectedShopId || v.id === selectedShopId)

      const line = L.polyline(
        [
          [u.plotLat, u.plotLon],
          [v.plotLat, v.plotLon],
        ],
        {
          color: isConnectedToSelected ? '#10b981' : '#059669',
          weight: isConnectedToSelected ? 2.5 : 1.5,
          opacity: isConnectedToSelected ? 0.8 : 0.35,
          dashArray: isConnectedToSelected ? null : '5, 7',
          smoothFactor: 1,
          interactive: false,
          className: 'mesh-network-line',
        }
      )
      line.addTo(meshLinesLayerRef.current)
    })

    // 5. Add Associated Partner Shops within Radius
    plottedPartners.forEach((shop) => {
      const isSelected = selectedShopId === shop.id
      const markerColor = isSelected ? '#ec4899' : '#10b981'
      const partnerShopHtml = `
        <div style="
          background: ${markerColor};
          color: #fff;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          transition: transform 0.15s ease;
          ${isSelected ? 'transform: scale(1.2); box-shadow: 0 0 0 4px rgba(236, 72, 153, 0.4);' : ''}
        ">
          ${shop.iconEmoji}
        </div>
      `
      const partnerIcon = L.divIcon({
        className: 'partner-shop-icon',
        html: partnerShopHtml,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -20],
      })

      const distLabel = shop.distanceKm < 0.1 ? '< 0.1 km (Local)' : `${shop.distanceKm} km away`

      const marker = L.marker([shop.plotLat, shop.plotLon], { icon: partnerIcon })
      marker.bindPopup(`
        <div style="font-family: inherit; min-width: 210px; padding: 4px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span style="font-size: 11px; font-weight: 700; color: #10b981; text-transform: uppercase;">Associated Partner</span>
            <span style="background: rgba(16, 185, 129, 0.15); color: #059669; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">
              ${distLabel}
            </span>
          </div>
          <div style="font-size: 14.5px; font-weight: 700; margin: 4px 0 2px; color: #111;">
            ${shop.iconEmoji} ${shop.name}
          </div>
          <div style="font-size: 11.5px; color: #666; margin-bottom: 6px;">
            ${shop.address || 'Address registered on network'}
          </div>
          ${shop.phone ? `<div style="font-size: 11.5px; color: #444; margin-bottom: 6px;">📞 ${shop.phone}</div>` : ''}
          <div style="margin-top: 6px; border-top: 1px solid #eee; padding-top: 6px;">
            <a
              href="https://www.google.com/maps/dir/?api=1&origin=${currentCoords.lat},${currentCoords.lon}&destination=${shop.lat},${shop.lon}"
              target="_blank"
              rel="noopener noreferrer"
              style="font-size: 11.5px; color: #6366f1; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"
            >
              Get Directions ↗
            </a>
          </div>
        </div>
      `)
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        setSelectedShopId(shop.id)
      })
      marker.addTo(markersLayerRef.current)
    })
  }, [currentCoords, otherShopsInRadius, radiusKm, selectedShopId])

  // Focus on a shop
  const panToShop = (shop) => {
    setSelectedShopId(shop.id)
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([shop.lat, shop.lon], 14, { animate: true })
    }
  }

  return (
    <div className="nearby-map-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header controls & radius filter */}
      <div className="row spread wrap" style={{ gap: 8, alignItems: 'center' }}>
        <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge green sm" style={{ fontWeight: 600 }}>
            {otherShopsInRadius.length} partner shop(s) within {radiusKm} km
          </span>
          <span
            className="badge sm purple"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 11 }}
            title="Mesh network links interconnecting your partner stores"
          >
            🕸️ Mesh Network Active
          </span>
          <span className="faint" style={{ fontSize: 12 }}>
            from {currentShop?.name || currentCoords.name}
          </span>
        </div>

        {/* Radius Pills */}
        <div className="row" style={{ gap: 4 }}>
          <span className="faint" style={{ fontSize: 12, marginRight: 2 }}>Radius:</span>
          {[5, 10, 15, 20].map((r) => (
            <button
              key={r}
              className={`btn sm ${radiusKm === r ? 'primary' : ''}`}
              style={{ padding: '2px 8px', fontSize: 11.5, minWidth: 38 }}
              onClick={() => setRadiusKm(r)}
            >
              {r} km
            </button>
          ))}
        </div>
      </div>

      {/* Map Container */}
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: 360,
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.2)',
          zIndex: 1,
        }}
      />

      {/* List of associated partner shops in radius */}
      <div style={{ marginTop: 4 }}>
        <div className="row spread" style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Shops in Your Area ({otherShopsInRadius.length})
          </span>
          {otherShopsInRadius.length > 0 && (
            <span className="faint" style={{ fontSize: 11.5 }}>
              Sorted by proximity
            </span>
          )}
        </div>

        {otherShopsInRadius.length === 0 ? (
          <div
            style={{
              padding: '16px 14px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed var(--border)',
              textAlign: 'center',
              fontSize: 12.5,
              color: 'var(--muted)',
            }}
          >
            No other partner shops detected within <strong>{radiusKm} km</strong> of your location. Try selecting a larger radius (15 or 20 km) to discover nearby partner stores.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 8,
              maxHeight: 180,
              overflowY: 'auto',
              paddingRight: 2,
            }}
          >
            {otherShopsInRadius.map((shop) => {
              const isSelected = selectedShopId === shop.id
              return (
                <div
                  key={shop.id}
                  onClick={() => panToShop(shop)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: isSelected ? '1px solid #10b981' : '1px solid var(--border)',
                    background: isSelected ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div className="row spread" style={{ alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {shop.iconEmoji} {shop.name}
                    </div>
                    <span className="badge sm green" style={{ fontSize: 10.5, flexShrink: 0, padding: '1px 5px' }}>
                      {shop.distanceKm < 0.1 ? '< 0.1 km' : `${shop.distanceKm} km`}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    <span className="badge sm" style={{ fontSize: 10, background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '1px 5px' }}>
                      {shop.shopType ? shop.shopType.toUpperCase() : 'RETAIL'}
                    </span>
                    {shop.ownerName && (
                      <span className="badge sm" style={{ fontSize: 10, background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '1px 5px' }}>
                        👤 {shop.ownerName}
                      </span>
                    )}
                  </div>

                  <div
                    className="faint"
                    style={{
                      fontSize: 11,
                      marginTop: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={shop.address}
                  >
                    📍 {shop.address || 'Address registered'}
                  </div>

                  {(shop.ownerPhone || shop.phone) && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                      <a href={`tel:${shop.ownerPhone || shop.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        📞 {shop.ownerPhone || shop.phone}
                      </a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
