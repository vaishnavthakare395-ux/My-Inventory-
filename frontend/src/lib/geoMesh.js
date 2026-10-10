// Calculate Great Circle distance between two coordinate pairs in kilometers
export function getDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null
  const R = 6371 // Earth radius in km
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return parseFloat((R * c).toFixed(2))
}

// Universal coordinate extractor supporting lat/lon, lat/lng, and nested coordinates object
export function extractCoords(loc) {
  if (!loc) return null
  const rawLat = loc.lat ?? loc.coordinates?.lat
  const rawLon = loc.lon ?? loc.lng ?? loc.coordinates?.lon ?? loc.coordinates?.lng
  if (rawLat == null || rawLon == null) return null
  const lat = parseFloat(rawLat)
  const lon = parseFloat(rawLon)
  if (isNaN(lat) || isNaN(lon)) return null
  return { lat, lon }
}

// Generate mesh network edges interconnecting the central store and partner shops
export function generateMeshEdges(centerNode, partnerNodes = [], getDistFn = getDistanceKm) {
  if (!centerNode || !partnerNodes || !partnerNodes.length) return []
  const edges = []
  const edgeKeySet = new Set()

  const addEdge = (u, v) => {
    if (!u || !v || u.id === v.id) return
    const key = [u.id, v.id].sort().join('___')
    if (edgeKeySet.has(key)) return
    edgeKeySet.add(key)
    edges.push({ u, v })
  }

  // 1. Hub-and-spoke links: connect central shop to each partner shop
  partnerNodes.forEach((shop) => {
    addEdge(centerNode, shop)
  })

  // 2. Peer mesh links: interconnect partner shops to form a meshy network
  if (partnerNodes.length >= 2) {
    if (partnerNodes.length <= 5) {
      for (let i = 0; i < partnerNodes.length; i++) {
        for (let j = i + 1; j < partnerNodes.length; j++) {
          addEdge(partnerNodes[i], partnerNodes[j])
        }
      }
    } else {
      partnerNodes.forEach((shop, i) => {
        const peers = partnerNodes
          .filter((_, j) => i !== j)
          .map((peer) => ({
            peer,
            dist:
              getDistFn(
                shop.plotLat ?? shop.lat,
                shop.plotLon ?? shop.lon,
                peer.plotLat ?? peer.lat,
                peer.plotLon ?? peer.lon
              ) ?? 99999,
          }))
          .sort((a, b) => a.dist - b.dist)

        peers.slice(0, 2).forEach(({ peer }) => {
          addEdge(shop, peer)
        })
      })
    }
  }

  return edges
}
