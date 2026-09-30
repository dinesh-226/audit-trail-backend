const express = require('express');
const router = express.Router();
const Ship = require('../models/Ship');
const Container = require('../models/Container');
const ReeferTemperature = require('../models/ReeferTemperature');

const MAJOR_PORTS = [
  { id: 'PORT-BOM', name: 'Mumbai Port (JNPT)', code: 'INBOM', lat: 18.948, lng: 72.835, country: 'India', status: 'Optimal' },
  { id: 'PORT-SIN', name: 'Singapore Port', code: 'SGSIN', lat: 1.264, lng: 103.820, country: 'Singapore', status: 'Congested' },
  { id: 'PORT-RTM', name: 'Rotterdam Port', code: 'NLRTM', lat: 51.924, lng: 4.477, country: 'Netherlands', status: 'Optimal' },
  { id: 'PORT-SHA', name: 'Shanghai Deepwater Port', code: 'CNSHA', lat: 31.230, lng: 121.473, country: 'China', status: 'High Throughput' },
  { id: 'PORT-DXB', name: 'Dubai Port (Jebel Ali)', code: 'AEDXB', lat: 25.011, lng: 55.061, country: 'UAE', status: 'Optimal' },
  { id: 'PORT-CMB', name: 'Colombo Port', code: 'LKCMB', lat: 6.949, lng: 79.845, country: 'Sri Lanka', status: 'Optimal' },
  { id: 'PORT-HAM', name: 'Hamburg Port', code: 'DEHAM', lat: 53.548, lng: 9.987, country: 'Germany', status: 'Optimal' },
  { id: 'PORT-NYC', name: 'New York / New Jersey Port', code: 'USNYC', lat: 40.712, lng: -74.006, country: 'USA', status: 'Optimal' },
  { id: 'PORT-SUE', name: 'Suez Canal Terminal', code: 'EGSUZ', lat: 29.973, lng: 32.559, country: 'Egypt', status: 'Transit Channel' },
  { id: 'PORT-PAN', name: 'Panama Canal Gateway', code: 'PAPTY', lat: 8.982, lng: -79.520, country: 'Panama', status: 'Transit Channel' }
];

// Helper to calculate lat/lng for containers
function getContainerCoordinates(c, shipMap, index) {
  // If assigned to a ship in transit, place on the ship
  if (c.assignedShipId && shipMap[c.assignedShipId]?.coordinates) {
    const sCoord = shipMap[c.assignedShipId].coordinates;
    const offsetLat = ((index % 5) - 2) * 0.008;
    const offsetLng = (Math.floor(index / 5) - 1) * 0.008;
    return {
      lat: Number((sCoord.lat + offsetLat).toFixed(4)),
      lng: Number((sCoord.lng + offsetLng).toFixed(4)),
      locationType: 'Onboard Vessel',
      vesselName: shipMap[c.assignedShipId].name
    };
  }

  // Location based on port / yard
  const loc = (c.currentLocation || '').toLowerCase();
  let basePort = MAJOR_PORTS[0]; // Default Mumbai
  if (loc.includes('singapore')) basePort = MAJOR_PORTS[1];
  else if (loc.includes('rotterdam')) basePort = MAJOR_PORTS[2];
  else if (loc.includes('shanghai')) basePort = MAJOR_PORTS[3];
  else if (loc.includes('dubai')) basePort = MAJOR_PORTS[4];
  else if (loc.includes('colombo')) basePort = MAJOR_PORTS[5];
  else if (loc.includes('hamburg')) basePort = MAJOR_PORTS[6];
  else if (loc.includes('new york')) basePort = MAJOR_PORTS[7];

  // Disperse slightly in the yard area
  const angle = (index * 45) * (Math.PI / 180);
  const radius = 0.006 + (index % 4) * 0.003;
  return {
    lat: Number((basePort.lat + Math.sin(angle) * radius).toFixed(4)),
    lng: Number((basePort.lng + Math.cos(angle) * radius).toFixed(4)),
    locationType: 'Port Yard / Terminal',
    portName: basePort.name
  };
}

// Get Live AIS Map Overview (Ships, Coordinates, Ports, Containers, Reefer Telemetry)
router.get('/live-map', async (req, res) => {
  try {
    const [ships, containers, reefers] = await Promise.all([
      Ship.find().select('shipId name imoNumber type capacityTEU status currentLocation departurePort arrivalPort captain flag coordinates eta routeWaypoints speedKnots headingDegrees seaConditions').lean(),
      Container.find().lean(),
      ReeferTemperature.find().lean()
    ]);

    const shipMap = {};
    const shipFleet = ships.map((s) => {
      shipMap[s.shipId] = s;
      const count = containers.filter(c => c.assignedShipId === s.shipId).length;
      return {
        ...s,
        containersOnboardCount: count
      };
    });

    const reeferMap = {};
    reefers.forEach(r => {
      reeferMap[r.containerId] = r;
    });

    // Map Containers with Real Coordinates & Telemetry
    const mapContainers = containers.map((c, idx) => {
      const coords = getContainerCoordinates(c, shipMap, idx);
      const reeferInfo = reeferMap[c.containerId] || null;

      return {
        containerId: c.containerId,
        type: c.type || 'Dry 40ft',
        size: c.size || '40ft',
        status: c.status || 'In Transit',
        weightKg: c.weightKg || 24000,
        cargoDescription: c.cargoDescription || 'Commercial Cargo',
        ownerCompany: c.ownerCompany || 'Global Freight Line',
        sealNumber: c.sealNumber || 'SEAL-0001',
        sealStatus: c.sealStatus || 'Intact',
        riskLevel: c.riskLevel || 'Low',
        riskScore: c.riskScore || 10,
        assignedShipId: c.assignedShipId,
        assignedShipName: c.assignedShipName || shipMap[c.assignedShipId]?.name || null,
        currentLocation: c.currentLocation || 'Mumbai Port',
        lat: coords.lat,
        lng: coords.lng,
        locationType: coords.locationType,
        portName: coords.portName,
        vesselName: coords.vesselName,
        isReefer: !!reeferInfo || c.type?.toLowerCase().includes('reefer'),
        temperatureCelsius: reeferInfo ? reeferInfo.currentTemperature : c.temperatureCelsius,
        targetTemperature: reeferInfo ? reeferInfo.targetTemperature : null,
        reeferStatus: reeferInfo ? reeferInfo.status : (c.temperatureCelsius !== null ? 'Normal' : 'Ambient'),
        powerStatus: reeferInfo ? reeferInfo.powerStatus : 'Grid',
        hasIncidents: reeferInfo?.incidents?.some(i => i.status !== 'Closed') || false
      };
    });

    res.json({
      timestamp: new Date().toISOString(),
      ports: MAJOR_PORTS,
      ships: shipFleet,
      containers: mapContainers,
      totalActiveVessels: ships.length,
      totalContainers: containers.length,
      totalReefers: reefers.length,
      mode: 'SIMULATED_AIS_TELEMETRY'
    });
  } catch (error) {
    console.error('Error fetching live map telemetry:', error);
    res.status(500).json({ error: 'Failed to retrieve live map telemetry' });
  }
});

// Simulation step tick: Advances coordinates of In-Transit vessels slightly along their route
router.post('/simulate-step', async (req, res) => {
  try {
    const ships = await Ship.find({ status: 'In Transit' });
    const updated = [];

    for (const ship of ships) {
      if (ship.coordinates) {
        // Slight simulated coordinate nudge
        const latDelta = (Math.random() - 0.45) * 0.08;
        const lngDelta = (Math.random() - 0.45) * 0.08;
        
        ship.coordinates.lat = Number((ship.coordinates.lat + latDelta).toFixed(4));
        ship.coordinates.lng = Number((ship.coordinates.lng + lngDelta).toFixed(4));
        ship.coordinates.speedKnots = Number((16 + Math.random() * 3).toFixed(1));
        
        await ship.save();
        updated.push({ shipId: ship.shipId, name: ship.name, coordinates: ship.coordinates });
      }
    }

    res.json({
      message: `Simulated AIS tick updated for ${updated.length} vessels in transit`,
      updated
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to advance simulation step' });
  }
});

module.exports = router;
