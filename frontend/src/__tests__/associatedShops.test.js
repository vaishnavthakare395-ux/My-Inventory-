import { describe, it, expect } from 'vitest'
import { SHOP_TYPES } from '../lib/constants'
import { generateMeshEdges, getDistanceKm } from '../lib/geoMesh'

describe('Associated Partner Shops Directory Logic', () => {
  const sampleLocations = [
    {
      id: 'LOC_1',
      name: 'Patel Fresh Mart',
      shopType: 'mart',
      address: 'Shop 14, Galleria Market, DLF Phase 4, Gurugram',
      ownerName: 'Rajesh Patel',
      ownerPhone: '+91 98765 43210',
      ownerEmail: 'patel.mart@stockflow.local',
      lat: 28.4682,
      lng: 77.0827,
      active: true,
    },
    {
      id: 'LOC_2',
      name: 'Zeno Health Pharmacy',
      shopType: 'pharmacy',
      address: 'Main Market, Dighi, Bhind, MP',
      ownerName: 'Raju Patel',
      ownerPhone: '+91 80876 98013',
      ownerEmail: 'omi123@gmail.com',
      lat: 26.5135,
      lng: 78.6747,
      active: true,
    },
    {
      id: 'LOC_3',
      name: 'Inactive Old Shop',
      shopType: 'general_store',
      address: 'Closed Street',
      ownerName: 'Inactive Owner',
      ownerPhone: '+91 00000 00000',
      ownerEmail: 'old@stockflow.local',
      active: false, // inactive
    },
  ]

  it('filters only active associated partner stores', () => {
    const activeShops = sampleLocations.filter(
      (l) => (l.ownerEmail || l.ownerName) && l.active !== false
    )
    expect(activeShops).toHaveLength(2)
    expect(activeShops.map((s) => s.name)).toEqual(['Patel Fresh Mart', 'Zeno Health Pharmacy'])
  })

  it('extracts owner name, phone contact, and address accurately', () => {
    const loc = sampleLocations[0]
    expect(loc.ownerName).toBe('Rajesh Patel')
    expect(loc.ownerPhone).toBe('+91 98765 43210')
    expect(loc.address).toContain('Galleria Market')
    expect(loc.shopType).toBe('mart')
  })

  it('calculates great circle proximity distance between partner locations', () => {
    // Distance from Gurugram (28.4682, 77.0827) to Bhind (26.5135, 78.6747) is ~266 km
    const dist = getDistanceKm(28.4682, 77.0827, 26.5135, 78.6747)
    expect(dist).toBeGreaterThan(200)
    expect(dist).toBeLessThan(350)
  })

  it('correctly maps shop types to labels and icons', () => {
    const pharmacyType = SHOP_TYPES.find((t) => t.id === 'pharmacy')
    expect(pharmacyType).toBeDefined()
    expect(pharmacyType.icon).toBe('💊')
    expect(pharmacyType.label).toContain('Pharmacy')

    const martType = SHOP_TYPES.find((t) => t.id === 'mart')
    expect(martType).toBeDefined()
    expect(martType.icon).toBe('🛒')
  })

  it('resolves registered account name and never outputs generic Store Owner placeholder', () => {
    function resolveOwnerName(loc, profile) {
      const emailPrefix = loc.ownerEmail ? loc.ownerEmail.split('@')[0] : ''
      const cleanEmailName = emailPrefix
        ? (emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)).replace(/[0-9._-]+/g, ' ').replace(/\s+/g, ' ').trim()
        : ''
      const currentUserName = loc.isCurrent ? (profile?.name || profile?.displayName || '') : ''

      return (
        (loc.registeredName && loc.registeredName !== 'Store Owner' ? loc.registeredName : '') ||
        (loc.ownerName && loc.ownerName !== 'Store Owner' ? loc.ownerName : '') ||
        currentUserName ||
        loc.contactPerson ||
        cleanEmailName ||
        (emailPrefix ? emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1) : '') ||
        'Registered Account'
      )
    }

    // Case 1: registeredName from users collection is provided
    expect(resolveOwnerName({ registeredName: 'omi', ownerEmail: 'vaishnav2907@gmail.com' })).toBe('omi')
    // Case 2: only ownerEmail is known
    expect(resolveOwnerName({ ownerEmail: 'raju_patel@gmail.com' })).toBe('Raju patel')
    // Case 3: location had legacy 'Store Owner' placeholder, should be ignored for clean registered account fallback
    expect(resolveOwnerName({ ownerName: 'Store Owner', ownerEmail: 'vaishnav@example.com' })).toBe('Vaishnav')
    // Case 4: current user profile name takes precedence if isCurrent
    expect(resolveOwnerName({ isCurrent: true, ownerEmail: 'unknown@x.com' }, { name: 'Vaishnav Test' })).toBe('Vaishnav Test')
  })

  it('generates meshy network edges connecting central shop and partner shops', () => {
    const center = { id: 'center', lat: 28.4682, lon: 77.0827, isCurrent: true }
    const partners = [
      { id: 'p1', plotLat: 28.471, plotLon: 77.085 },
      { id: 'p2', plotLat: 28.465, plotLon: 77.080 },
      { id: 'p3', plotLat: 28.469, plotLon: 77.090 },
    ]

    const edges = generateMeshEdges(center, partners, getDistanceKm)
    // For 3 partners + 1 center:
    // 3 hub-and-spoke edges (center-p1, center-p2, center-p3)
    // 3 partner-to-partner interconnecting edges (p1-p2, p1-p3, p2-p3)
    // Total = 6 edges forming a 3D-like planar mesh
    expect(edges).toHaveLength(6)

    // Ensure central shop is connected to all 3 partners
    const centerEdges = edges.filter((e) => e.u.id === 'center' || e.v.id === 'center')
    expect(centerEdges).toHaveLength(3)

    // Ensure each partner shop has mesh links
    partners.forEach((p) => {
      const pEdges = edges.filter((e) => e.u.id === p.id || e.v.id === p.id)
      expect(pEdges.length).toBeGreaterThanOrEqual(3) // 1 to center + 2 to peers
    })
  })
})
