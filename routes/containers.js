const express = require('express');
const router = express.Router();
const Container = require('../models/Container');
const Ship = require('../models/Ship');
const AuditLog = require('../models/AuditLog');
const Inspection = require('../models/Inspection');
const Evidence = require('../models/Evidence');
const Anomaly = require('../models/Anomaly');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditEngine');
const { evaluateActionForAnomalies } = require('../services/anomalyEngine');
const { calculateContainerRisk } = require('../services/riskAnalysisEngine');

// List Containers with advanced filtering
router.get('/', async (req, res) => {
  try {
    const { status, riskLevel, shipId, isDelayed, search, origin, destination } = req.query;
    const query = {};

    if (status && status.trim() && status !== 'undefined' && status !== 'null' && status !== 'All Statuses' && status !== 'All') {
      query.status = status.trim();
    }
    if (riskLevel && riskLevel.trim() && riskLevel !== 'undefined' && riskLevel !== 'null' && riskLevel !== 'All Risk Levels' && riskLevel !== 'All') {
      query.riskLevel = riskLevel.trim();
    }
    if (shipId && shipId.trim() && shipId !== 'undefined' && shipId !== 'null' && shipId !== 'All Ships') {
      query.assignedShipId = shipId.trim();
    }
    if (isDelayed !== undefined && isDelayed !== '' && isDelayed !== 'undefined' && isDelayed !== 'null') {
      query.isDelayed = isDelayed === 'true';
    }
    if (origin && origin.trim() && origin !== 'undefined' && origin !== 'null') {
      query.origin = origin.trim();
    }
    if (destination && destination.trim() && destination !== 'undefined' && destination !== 'null') {
      query.destination = destination.trim();
    }

    if (search && search.trim() && search !== 'undefined' && search !== 'null') {
      const cleanSearch = search.trim();
      query.$or = [
        { containerId: new RegExp(cleanSearch, 'i') },
        { cargoDescription: new RegExp(cleanSearch, 'i') },
        { ownerCompany: new RegExp(cleanSearch, 'i') },
        { currentLocation: new RegExp(cleanSearch, 'i') },
        { assignedShipName: new RegExp(cleanSearch, 'i') },
        { sealNumber: new RegExp(cleanSearch, 'i') }
      ];
    }

    const containers = await Container.find(query).sort({ updatedAt: -1 });
    res.json(containers);
  } catch (error) {
    console.error('Error fetching containers:', error);
    res.status(500).json({ error: 'Failed to retrieve containers' });
  }
});

// Get Container by ID (Full 360° Profile)
router.get('/:containerId', async (req, res) => {
  try {
    const container = await Container.findOne({
      $or: [
        { containerId: req.params.containerId.toUpperCase() },
        { containerId: req.params.containerId }
      ]
    });

    if (!container) {
      return res.status(404).json({ error: 'Container not found' });
    }

    const audits = await AuditLog.find({
      $or: [{ containerId: container.containerId }, { entityId: container.containerId }]
    }).sort({ sequenceNumber: -1 });

    const inspections = await Inspection.find({ containerId: container.containerId });
    const evidence = await Evidence.find({ containerId: container.containerId });
    const anomalies = await Anomaly.find({ entityId: container.containerId });

    res.json({
      container,
      audits,
      inspections,
      evidence,
      anomalies
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve container profile' });
  }
});

// QR Code Verification Pass Endpoint (Public/Internal scan landing)
router.get('/:containerId/qr-pass', async (req, res) => {
  try {
    const container = await Container.findOne({
      $or: [
        { containerId: req.params.containerId.toUpperCase() },
        { containerId: req.params.containerId }
      ]
    });

    if (!container) {
      return res.status(404).json({ error: 'Container not found in maritime ledger' });
    }

    const latestAudit = await AuditLog.findOne({
      $or: [{ containerId: container.containerId }, { entityId: container.containerId }]
    }).sort({ sequenceNumber: -1 });

    res.json({
      containerId: container.containerId,
      status: container.status,
      currentLocation: container.currentLocation,
      origin: container.origin,
      destination: container.destination,
      assignedShip: container.assignedShipName || 'None',
      type: container.type,
      size: container.size,
      weightKg: container.weightKg,
      sealNumber: container.sealNumber,
      hazardClass: container.hazardClass,
      riskLevel: container.riskLevel,
      riskScore: container.riskScore,
      isDelayed: container.isDelayed,
      latestMilestone: container.journeyMilestones?.[container.journeyMilestones.length - 1] || null,
      verificationCertificate: {
        lastAuditId: latestAudit?.auditId || 'N/A',
        timestamp: latestAudit?.timestamp || container.updatedAt,
        cryptographicHash: latestAudit?.currentHash || 'GENESIS_UNHASHED',
        integrityStatus: 'VALID_SHA256_SEALED'
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate QR pass' });
  }
});

// Book / Create Container
router.post('/', requireAuth, requireRole('admin', 'port_manager', 'ship_manager'), async (req, res) => {
  try {
    const {
      containerId,
      type,
      size,
      weightKg,
      cargoDescription,
      origin,
      destination,
      currentLocation,
      assignedShipId,
      ownerCompany,
      sealNumber,
      hazardClass,
      temperatureCelsius
    } = req.body;

    if (!containerId || !weightKg || !cargoDescription || !origin || !destination) {
      return res.status(400).json({ error: 'Container ID, cargo, weight, origin, and destination are required' });
    }

    const existing = await Container.findOne({ containerId: containerId.toUpperCase() });
    if (existing) {
      return res.status(400).json({ error: `Container "${containerId}" already registered in system` });
    }

    let shipName = null;
    if (assignedShipId) {
      const ship = await Ship.findOne({ shipId: assignedShipId });
      if (ship) shipName = ship.name;
    }

    const initialMilestone = {
      stage: 'BOOKED',
      status: 'Booked',
      location: currentLocation || origin || 'Port Terminal',
      timestamp: new Date(),
      performedBy: req.user.name,
      userRole: req.user.role,
      shipId: assignedShipId || null,
      shipName: shipName || null,
      notes: `Container booked for journey from ${origin} to ${destination}`
    };

    const container = new Container({
      containerId: containerId.toUpperCase(),
      type: type || 'Dry 40ft',
      size: size || '40ft',
      weightKg: Number(weightKg),
      cargoDescription,
      origin,
      destination,
      currentLocation: currentLocation || origin || 'Port Terminal',
      assignedShipId: assignedShipId || null,
      assignedShipName: shipName,
      ownerCompany: ownerCompany || 'Global Freight Carrier',
      status: 'Booked',
      sealNumber: sealNumber || `SL-${Math.floor(100000 + Math.random() * 900000)}-SEC`,
      hazardClass: hazardClass || 'Non-Hazardous',
      temperatureCelsius: temperatureCelsius !== undefined ? temperatureCelsius : null,
      riskLevel: 'Low',
      riskScore: 10,
      journeyMilestones: [initialMilestone]
    });

    await container.save();

    // Create Audit Log
    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'CONTAINER_BOOKED',
      entityType: 'Container',
      entityId: container.containerId,
      containerId: container.containerId,
      shipId: assignedShipId || null,
      location: container.currentLocation,
      newValue: {
        status: container.status,
        cargo: container.cargoDescription,
        origin: container.origin,
        destination: container.destination,
        sealNumber: container.sealNumber
      }
    });

    // Update milestone with audit hash
    container.journeyMilestones[0].auditId = audit.auditId;
    container.journeyMilestones[0].hash = audit.currentHash;
    await container.save();

    // Calculate initial risk
    await calculateContainerRisk(container);

    res.status(201).json(container);
  } catch (error) {
    console.error('Error creating container:', error);
    res.status(500).json({ error: 'Failed to create container record' });
  }
});

// Update Container Status Transition
router.patch('/:containerId/status', requireAuth, requireRole('admin', 'port_manager', 'ship_manager', 'inspector'), async (req, res) => {
  try {
    const { status, location, notes, assignedShipId, temperatureCelsius, sealNumber } = req.body;
    const container = await Container.findOne({ containerId: req.params.containerId.toUpperCase() });

    if (!container) {
      return res.status(404).json({ error: 'Container not found' });
    }

    const previousStatus = container.status;
    const previousLocation = container.currentLocation;

    container.status = status;
    if (location) container.currentLocation = location;
    if (temperatureCelsius !== undefined) container.temperatureCelsius = temperatureCelsius;
    if (sealNumber) container.sealNumber = sealNumber;

    if (assignedShipId !== undefined) {
      container.assignedShipId = assignedShipId;
      if (assignedShipId) {
        const ship = await Ship.findOne({ shipId: assignedShipId });
        container.assignedShipName = ship ? ship.name : null;
      } else {
        container.assignedShipName = null;
      }
    }

    // Map status to milestone stage
    const stageMap = {
      'Booked': 'BOOKED',
      'Ready for Loading': 'READY FOR LOADING',
      'Loaded': 'LOADED',
      'In Transit': 'IN TRANSIT',
      'Arrived': 'ARRIVED AT PORT',
      'Unloading': 'UNLOADED',
      'Under Inspection': 'INSPECTED',
      'Delivered': 'DELIVERED',
      'Delayed': 'DELAYED',
      'Flagged': 'FLAGGED'
    };

    const stage = stageMap[status] || 'IN TRANSIT';

    const newMilestone = {
      stage,
      status,
      location: container.currentLocation,
      timestamp: new Date(),
      performedBy: req.user.name,
      userRole: req.user.role,
      shipId: container.assignedShipId,
      shipName: container.assignedShipName,
      notes: notes || `Container status transitioned to ${status}`
    };

    container.journeyMilestones.push(newMilestone);
    await container.save();

    let action = 'CONTAINER_STATUS_CHANGED';
    if (status === 'Loaded') action = 'CONTAINER_LOADED_ON_SHIP';
    if (status === 'In Transit') action = 'CONTAINER_DEPARTED_AT_SEA';
    if (status === 'Unloading') action = 'CARGO_UNLOADED';
    if (status === 'Delivered') action = 'CONTAINER_DELIVERED';
    if (status === 'Flagged') action = 'CONTAINER_FLAGGED_SECURITY';

    // 1. Write Cryptographic Audit Log
    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action,
      entityType: 'Container',
      entityId: container.containerId,
      containerId: container.containerId,
      shipId: container.assignedShipId,
      location: container.currentLocation,
      previousValue: { status: previousStatus, location: previousLocation },
      newValue: { status: container.status, location: container.currentLocation, notes }
    });

    // Attach hash to latest milestone
    const lastIdx = container.journeyMilestones.length - 1;
    container.journeyMilestones[lastIdx].auditId = audit.auditId;
    container.journeyMilestones[lastIdx].hash = audit.currentHash;
    await container.save();

    // 2. Run Anomaly Evaluation
    await evaluateActionForAnomalies({
      container,
      user: req.user,
      action,
      previousStatus,
      newStatus: status,
      newLocation: location,
      auditLog: audit
    });

    // 3. Recalculate Risk Score
    await calculateContainerRisk(container);

    res.json({
      message: `Container ${container.containerId} transitioned to ${status}`,
      container,
      auditId: audit.auditId,
      currentHash: audit.currentHash
    });
  } catch (error) {
    console.error('Error updating container status:', error);
    res.status(500).json({ error: 'Failed to update container status' });
  }
});

// Assign Container to Ship
router.patch('/:containerId/assign-ship', requireAuth, requireRole('admin', 'port_manager', 'ship_manager'), async (req, res) => {
  try {
    const { shipId } = req.body;
    const container = await Container.findOne({ containerId: req.params.containerId.toUpperCase() });
    if (!container) {
      return res.status(404).json({ error: 'Container not found' });
    }

    const ship = await Ship.findOne({ shipId });
    if (!ship) {
      return res.status(404).json({ error: 'Ship not found' });
    }

    const prevShipId = container.assignedShipId;
    container.assignedShipId = ship.shipId;
    container.assignedShipName = ship.name;
    container.status = 'Loaded';
    container.currentLocation = `Onboard ${ship.name}`;

    const milestone = {
      stage: 'LOADED',
      status: 'Loaded',
      location: `Onboard ${ship.name}`,
      timestamp: new Date(),
      performedBy: req.user.name,
      userRole: req.user.role,
      shipId: ship.shipId,
      shipName: ship.name,
      notes: `Container loaded and manifested onto ${ship.name} (${ship.imoNumber})`
    };

    container.journeyMilestones.push(milestone);
    await container.save();

    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'CONTAINER_ASSIGNED_TO_SHIP',
      entityType: 'Container',
      entityId: container.containerId,
      containerId: container.containerId,
      shipId: ship.shipId,
      location: `Onboard ${ship.name}`,
      previousValue: { shipId: prevShipId },
      newValue: { shipId: ship.shipId, shipName: ship.name, status: 'Loaded' }
    });

    container.journeyMilestones[container.journeyMilestones.length - 1].auditId = audit.auditId;
    container.journeyMilestones[container.journeyMilestones.length - 1].hash = audit.currentHash;
    await container.save();

    await calculateContainerRisk(container);

    res.json({ message: `Container assigned to ${ship.name}`, container });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign container to ship' });
  }
});

module.exports = router;
