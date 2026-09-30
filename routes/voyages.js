const express = require('express');
const router = express.Router();
const Voyage = require('../models/Voyage');
const Ship = require('../models/Ship');
const Container = require('../models/Container');
const Alert = require('../models/Alert');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditEngine');

// 1. List Voyages
router.get('/', async (req, res) => {
  try {
    const { shipId, status, port } = req.query;
    const query = {};
    if (shipId) query.shipId = shipId;
    if (status) query.status = status;
    if (port) {
      query.$or = [{ departurePort: new RegExp(port, 'i') }, { arrivalPort: new RegExp(port, 'i') }];
    }

    let voyages = await Voyage.find(query).sort({ updatedAt: -1 });

    // If no voyages exist yet in DB, create initial demo voyages
    if (voyages.length === 0) {
      const ships = await Ship.find();
      const demoVoyages = [
        {
          voyageId: 'VOY-2026-081',
          shipId: ships[0]?.shipId || 'SH-8801',
          shipName: ships[0]?.name || 'MSC Irina',
          imoNumber: ships[0]?.imoNumber || 'IMO 9805467',
          departurePort: 'Singapore Port',
          arrivalPort: 'Mumbai Port',
          status: 'In Transit',
          plannedDepartureDate: new Date(Date.now() - 4 * 24 * 3600 * 1000),
          actualDepartureDate: new Date(Date.now() - 4 * 24 * 3600 * 1000),
          estimatedArrivalTime: new Date(Date.now() + 18 * 3600 * 1000), // ~18 hours from now
          speedKnots: 19.8,
          headingDegrees: 312,
          currentCoordinates: { lat: 14.82, lng: 74.15 },
          cargoContainersCount: 2450,
          totalCargoWeightKg: 48200000,
          waypoints: [
            { name: 'Singapore Keppel Fairway', lat: 1.25, lng: 103.82, passed: true, passedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000) },
            { name: 'Malacca Strait Traffic Separation', lat: 3.12, lng: 100.55, passed: true, passedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) },
            { name: 'Andaman Sea Deep Water Route', lat: 7.50, lng: 94.20, passed: true, passedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) },
            { name: 'Arabian Sea Corridor (Laccadive)', lat: 12.10, lng: 75.30, passed: true, passedAt: new Date(Date.now() - 12 * 3600 * 1000) },
            { name: 'Mumbai Harbour Pilot Station', lat: 18.94, lng: 72.83, passed: false }
          ],
          seaConditions: { waveMeters: 1.8, windKnots: 14, condition: 'Fair Seas' },
          portCoordination: {
            requestedBerth: 'Berth 01 (Quay North)',
            berthingConfirmed: true,
            portNotes: 'Berth 01 prepared by Mumbai Port Manager with 3 quay cranes assigned.'
          },
          voyageNotes: 'Carrying high-priority dry cargo and reefer units from East Asia.'
        },
        {
          voyageId: 'VOY-2026-082',
          shipId: ships[1]?.shipId || 'SH-8802',
          shipName: ships[1]?.name || 'Ever Given',
          imoNumber: ships[1]?.imoNumber || 'IMO 9811000',
          departurePort: 'Port of Rotterdam',
          arrivalPort: 'Mumbai Port',
          status: 'In Transit',
          plannedDepartureDate: new Date(Date.now() - 8 * 24 * 3600 * 1000),
          actualDepartureDate: new Date(Date.now() - 8 * 24 * 3600 * 1000),
          estimatedArrivalTime: new Date(Date.now() + 48 * 3600 * 1000),
          speedKnots: 17.5,
          headingDegrees: 125,
          currentCoordinates: { lat: 21.40, lng: 64.20 },
          cargoContainersCount: 3100,
          totalCargoWeightKg: 62000000,
          waypoints: [
            { name: 'Rotterdam Maasvlakte', lat: 51.95, lng: 4.02, passed: true },
            { name: 'Gibraltar Strait', lat: 35.95, lng: -5.60, passed: true },
            { name: 'Suez Canal Convoy Southbound', lat: 29.97, lng: 32.55, passed: true },
            { name: 'Bab-el-Mandeb Strait', lat: 12.58, lng: 43.33, passed: true },
            { name: 'Mumbai Port Approach', lat: 18.94, lng: 72.83, passed: false }
          ],
          seaConditions: { waveMeters: 2.1, windKnots: 16, condition: 'Moderate Swell' },
          portCoordination: {
            requestedBerth: 'Berth 02 (Quay South)',
            berthingConfirmed: true,
            portNotes: 'Scheduled arrival confirmed with Mumbai dock master.'
          },
          voyageNotes: 'European industrial exports and manufactured machinery.'
        }
      ];

      voyages = await Voyage.insertMany(demoVoyages);
    }

    res.json(voyages);
  } catch (error) {
    console.error('Error fetching voyages:', error);
    res.status(500).json({ error: 'Failed to retrieve voyages' });
  }
});

// 2. Get Single Voyage
router.get('/:voyageId', async (req, res) => {
  try {
    const voyage = await Voyage.findOne({
      $or: [{ voyageId: req.params.voyageId }, { voyageId: req.params.voyageId.toUpperCase() }]
    });

    if (!voyage) {
      return res.status(404).json({ error: 'Voyage record not found' });
    }

    const ship = await Ship.findOne({ shipId: voyage.shipId });
    const containers = await Container.find({
      $or: [{ assignedShipId: voyage.shipId }, { assignedShipName: voyage.shipName }]
    });

    res.json({ voyage, ship, containers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve voyage profile' });
  }
});

// 3. Create New Voyage
router.post('/', requireAuth, requireRole('admin', 'ship_manager'), async (req, res) => {
  try {
    const { shipId, departurePort, arrivalPort, plannedDepartureDate, estimatedArrivalTime, waypoints, requestedBerth, voyageNotes } = req.body;

    if (!shipId || !departurePort || !arrivalPort || !estimatedArrivalTime) {
      return res.status(400).json({ error: 'Ship, origin port, destination port, and ETA are required' });
    }

    const ship = await Ship.findOne({ shipId });
    if (!ship) {
      return res.status(404).json({ error: 'Ship not found' });
    }

    const voyageCount = await Voyage.countDocuments();
    const voyageId = `VOY-2026-${String(voyageCount + 101).padStart(3, '0')}`;

    const voyage = new Voyage({
      voyageId,
      shipId: ship.shipId,
      shipName: ship.name,
      imoNumber: ship.imoNumber,
      departurePort,
      arrivalPort,
      status: 'In Transit',
      plannedDepartureDate: plannedDepartureDate ? new Date(plannedDepartureDate) : new Date(),
      actualDepartureDate: new Date(),
      estimatedArrivalTime: new Date(estimatedArrivalTime),
      speedKnots: ship.coordinates?.speedKnots || 18.5,
      headingDegrees: ship.coordinates?.heading || 90,
      currentCoordinates: { lat: ship.coordinates?.lat || 18.94, lng: ship.coordinates?.lng || 72.83 },
      waypoints: waypoints || [
        { name: `${departurePort} Departure Channel`, lat: ship.coordinates?.lat || 18.9, lng: ship.coordinates?.lng || 72.8, passed: true, passedAt: new Date() },
        { name: `${arrivalPort} Outer Anchorage`, lat: 18.94, lng: 72.83, passed: false }
      ],
      portCoordination: {
        requestedBerth: requestedBerth || 'Berth 01 (Quay North)',
        berthingConfirmed: false,
        portNotes: `Voyage initialized for ${ship.name}`
      },
      voyageNotes: voyageNotes || `Scheduled voyage from ${departurePort} to ${arrivalPort}`
    });

    await voyage.save();

    // Update ship status and route
    ship.status = 'In Transit';
    ship.departurePort = departurePort;
    ship.arrivalPort = arrivalPort;
    ship.destination = arrivalPort;
    ship.eta = new Date(estimatedArrivalTime);
    await ship.save();

    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'VOYAGE_CREATED',
      entityType: 'Ship',
      entityId: voyage.voyageId,
      shipId: ship.shipId,
      location: departurePort,
      newValue: {
        voyageId: voyage.voyageId,
        vessel: ship.name,
        route: `${departurePort} ➔ ${arrivalPort}`,
        eta: voyage.estimatedArrivalTime
      }
    });

    voyage.auditId = audit.auditId;
    await voyage.save();

    res.status(201).json(voyage);
  } catch (error) {
    console.error('Error creating voyage:', error);
    res.status(500).json({ error: 'Failed to create voyage record' });
  }
});

// 4. Update ETA (with reason and notification to Port Manager)
router.patch('/:voyageId/eta', requireAuth, requireRole('admin', 'ship_manager'), async (req, res) => {
  try {
    const { estimatedArrivalTime, reason, notes } = req.body;
    const voyage = await Voyage.findOne({ voyageId: req.params.voyageId });

    if (!voyage) {
      return res.status(404).json({ error: 'Voyage record not found' });
    }

    const previousEta = voyage.estimatedArrivalTime;
    voyage.estimatedArrivalTime = new Date(estimatedArrivalTime);

    if (reason) {
      voyage.delays.push({
        reason,
        delayHours: Math.max(1, Math.round((new Date(estimatedArrivalTime) - new Date(previousEta)) / (1000 * 3600))),
        reportedAt: new Date(),
        mitigation: notes || 'Speed optimization adjusted to recover schedule',
        reportedBy: req.user.name
      });
    }

    await voyage.save();

    // Update Ship model ETA
    await Ship.findOneAndUpdate({ shipId: voyage.shipId }, { eta: voyage.estimatedArrivalTime });

    // Send Alert to Port Manager
    const alertId = `ALT-ETA-${Date.now()}`;
    await Alert.create({
      alertId,
      title: `ETA Updated: ${voyage.shipName} (${voyage.voyageId})`,
      message: `Ship Manager ${req.user.name} updated ETA to ${new Date(estimatedArrivalTime).toLocaleString()}. Reason: ${reason || 'Schedule adjustment'}. Port Manager please prepare berth.`,
      severity: 'medium',
      category: 'delay',
      entityType: 'Ship',
      entityId: voyage.shipId,
      metadata: { voyageId: voyage.voyageId, port: voyage.arrivalPort, previousEta, newEta: voyage.estimatedArrivalTime }
    });

    // Write to Audit Trail
    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'VOYAGE_ETA_UPDATED',
      entityType: 'Ship',
      entityId: voyage.voyageId,
      shipId: voyage.shipId,
      location: `${voyage.shipName} en route to ${voyage.arrivalPort}`,
      previousValue: { eta: previousEta },
      newValue: { eta: voyage.estimatedArrivalTime, reason, notes }
    });

    res.json({
      message: `ETA for ${voyage.shipName} updated to ${new Date(estimatedArrivalTime).toLocaleString()}`,
      voyage,
      auditId: audit.auditId
    });
  } catch (error) {
    console.error('Error updating ETA:', error);
    res.status(500).json({ error: 'Failed to update voyage ETA' });
  }
});

// 5. Update Telemetry (Speed, Heading, Sea Condition, Waypoint progress)
router.patch('/:voyageId/telemetry', requireAuth, requireRole('admin', 'ship_manager'), async (req, res) => {
  try {
    const { speedKnots, headingDegrees, coordinates, seaConditions, waypointIndex } = req.body;
    const voyage = await Voyage.findOne({ voyageId: req.params.voyageId });

    if (!voyage) {
      return res.status(404).json({ error: 'Voyage record not found' });
    }

    if (speedKnots !== undefined) voyage.speedKnots = Number(speedKnots);
    if (headingDegrees !== undefined) voyage.headingDegrees = Number(headingDegrees);
    if (coordinates) voyage.currentCoordinates = coordinates;
    if (seaConditions) voyage.seaConditions = seaConditions;

    if (waypointIndex !== undefined && voyage.waypoints[waypointIndex]) {
      voyage.waypoints[waypointIndex].passed = true;
      voyage.waypoints[waypointIndex].passedAt = new Date();
    }

    await voyage.save();

    // Update ship model coordinates
    if (coordinates || speedKnots || headingDegrees) {
      await Ship.findOneAndUpdate({ shipId: voyage.shipId }, {
        coordinates: {
          lat: coordinates?.lat || voyage.currentCoordinates.lat,
          lng: coordinates?.lng || voyage.currentCoordinates.lng,
          speedKnots: voyage.speedKnots,
          heading: voyage.headingDegrees
        }
      });
    }

    res.json({ message: 'Live voyage telemetry updated', voyage });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update voyage telemetry' });
  }
});

// 6. Record Voyage Delay / Route Diversion
router.post('/:voyageId/delay', requireAuth, requireRole('admin', 'ship_manager'), async (req, res) => {
  try {
    const { reason, delayHours = 4, mitigation, isDiversion, portOfDiversion } = req.body;
    const voyage = await Voyage.findOne({ voyageId: req.params.voyageId });

    if (!voyage) {
      return res.status(404).json({ error: 'Voyage record not found' });
    }

    voyage.status = isDiversion ? 'Diverted' : 'Delayed';
    voyage.delays.push({
      reason,
      delayHours: Number(delayHours),
      reportedAt: new Date(),
      mitigation: mitigation || 'Course adjusted with safety margin',
      reportedBy: req.user.name
    });

    if (isDiversion && portOfDiversion) {
      voyage.arrivalPort = portOfDiversion;
    }

    await voyage.save();

    // Create Alert
    const alertId = `ALT-VOYDELAY-${Date.now()}`;
    await Alert.create({
      alertId,
      title: `${isDiversion ? 'Voyage Diverted' : 'Voyage Delay Reported'}: ${voyage.shipName}`,
      message: `${voyage.shipName} reported ${delayHours}h delay en route to ${voyage.arrivalPort}. Reason: ${reason}`,
      severity: 'high',
      category: 'delay',
      entityType: 'Ship',
      entityId: voyage.shipId,
      metadata: { voyageId: voyage.voyageId, reason, delayHours, mitigation }
    });

    // Write to Audit Trail
    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: isDiversion ? 'VOYAGE_ROUTE_DIVERTED' : 'VOYAGE_DELAY_RECORDED',
      entityType: 'Ship',
      entityId: voyage.voyageId,
      shipId: voyage.shipId,
      location: `${voyage.shipName} Sea Route`,
      newValue: { reason, delayHours, mitigation, status: voyage.status }
    });

    res.json({
      message: `Delay recorded for ${voyage.shipName}`,
      voyage,
      auditId: audit.auditId
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record voyage delay' });
  }
});

// 7. Coordinate with Port Manager (Berthing Schedule)
router.post('/:voyageId/coordinate-port', requireAuth, requireRole('admin', 'ship_manager'), async (req, res) => {
  try {
    const { requestedBerth, pilotStationETA, notes } = req.body;
    const voyage = await Voyage.findOne({ voyageId: req.params.voyageId });

    if (!voyage) {
      return res.status(404).json({ error: 'Voyage record not found' });
    }

    voyage.portCoordination.requestedBerth = requestedBerth || voyage.portCoordination.requestedBerth;
    if (pilotStationETA) voyage.portCoordination.pilotBoardingTime = new Date(pilotStationETA);
    voyage.portCoordination.portNotes = notes || 'Arrival coordination transmitted to Port Manager.';
    await voyage.save();

    // Create notification alert for Port Manager
    const alertId = `ALT-PORTCOORD-${Date.now()}`;
    await Alert.create({
      alertId,
      title: `Berth Coordination Request: ${voyage.shipName}`,
      message: `Ship Manager ${req.user.name} requested ${voyage.portCoordination.requestedBerth} at ${voyage.arrivalPort}. Expected arrival: ${new Date(voyage.estimatedArrivalTime).toLocaleTimeString()}`,
      severity: 'info',
      category: 'status_change',
      entityType: 'Ship',
      entityId: voyage.shipId,
      metadata: { port: voyage.arrivalPort, berth: voyage.portCoordination.requestedBerth }
    });

    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'PORT_BERTH_COORDINATED',
      entityType: 'Ship',
      entityId: voyage.voyageId,
      shipId: voyage.shipId,
      location: voyage.arrivalPort,
      newValue: { requestedBerth: voyage.portCoordination.requestedBerth, eta: voyage.estimatedArrivalTime }
    });

    res.json({
      message: `Arrival notice & berth request sent to ${voyage.arrivalPort} Manager`,
      voyage,
      auditId: audit.auditId
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to coordinate with port' });
  }
});

// 8. Record Departure or Arrival
router.patch('/:voyageId/status', requireAuth, requireRole('admin', 'ship_manager'), async (req, res) => {
  try {
    const { status, actualArrivalTime } = req.body;
    const voyage = await Voyage.findOne({ voyageId: req.params.voyageId });

    if (!voyage) {
      return res.status(404).json({ error: 'Voyage record not found' });
    }

    voyage.status = status;
    if (status === 'Arrived' || status === 'Completed') {
      voyage.actualArrivalTime = actualArrivalTime ? new Date(actualArrivalTime) : new Date();
    }

    await voyage.save();

    // Update ship
    let shipStatus = status === 'Arrived' ? 'Arrived' : status === 'In Transit' ? 'In Transit' : 'Docked';
    await Ship.findOneAndUpdate({ shipId: voyage.shipId }, { status: shipStatus });

    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: status === 'Arrived' ? 'SHIP_PORT_ARRIVED' : 'SHIP_VOYAGE_DEPARTED',
      entityType: 'Ship',
      entityId: voyage.voyageId,
      shipId: voyage.shipId,
      location: status === 'Arrived' ? voyage.arrivalPort : voyage.departurePort,
      newValue: { status, actualArrivalTime: voyage.actualArrivalTime }
    });

    res.json({
      message: `Voyage status updated to ${status}`,
      voyage,
      auditId: audit.auditId
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update voyage status' });
  }
});

// 9. Voyage Performance Comparison (Planned vs Actual)
router.get('/:voyageId/performance', requireAuth, async (req, res) => {
  try {
    const voyage = await Voyage.findOne({ voyageId: req.params.voyageId });
    if (!voyage) {
      return res.status(404).json({ error: 'Voyage not found' });
    }

    const plannedDurationHours = Math.round((new Date(voyage.estimatedArrivalTime) - new Date(voyage.plannedDepartureDate)) / (1000 * 3600));
    const arrivalTime = voyage.actualArrivalTime || new Date();
    const actualDurationHours = Math.round((new Date(arrivalTime) - new Date(voyage.actualDepartureDate)) / (1000 * 3600));
    const varianceHours = actualDurationHours - plannedDurationHours;

    res.json({
      voyageId: voyage.voyageId,
      shipName: voyage.shipName,
      route: `${voyage.departurePort} ➔ ${voyage.arrivalPort}`,
      plannedDurationHours,
      actualDurationHours,
      varianceHours,
      onSchedule: varianceHours <= 0,
      averageSpeedKnots: voyage.speedKnots,
      delaysCount: voyage.delays.length,
      delays: voyage.delays
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate voyage performance' });
  }
});

module.exports = router;
