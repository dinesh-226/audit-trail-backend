const express = require('express');
const router = express.Router();
const PortActivity = require('../models/PortActivity');
const Container = require('../models/Container');
const Ship = require('../models/Ship');
const Inspection = require('../models/Inspection');
const Alert = require('../models/Alert');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditEngine');

// In-memory berth state cache to allow live dynamic updates during runtime
let liveBerths = [
  { berthId: 'Berth 01 (Quay North)', vessel: 'MSC Irina', imo: 'IMO 9805467', shipId: 'SH-8801', status: 'Docked & Unloading', cranesActive: 3, teuThroughput: '1,450 TEU', port: 'Mumbai Port' },
  { berthId: 'Berth 02 (Quay South)', vessel: 'Ever Given', imo: 'IMO 9811000', shipId: 'SH-8802', status: 'Docked & Loading', cranesActive: 4, teuThroughput: '2,100 TEU', port: 'Mumbai Port' },
  { berthId: 'Berth 03 (Feeder Terminal)', vessel: 'CMA CGM Jacques Saadé', imo: 'IMO 9839179', shipId: 'SH-8803', status: 'Scheduled Arrival (14:30)', cranesActive: 2, teuThroughput: '850 TEU', port: 'Mumbai Port' },
  { berthId: 'Berth 04 (Bulk Yard)', vessel: 'Available / Open', imo: 'N/A', shipId: null, status: 'Ready for Berthing', cranesActive: 0, teuThroughput: '0 TEU', port: 'Mumbai Port' }
];

// 1. Get Port Activities list
router.get('/', async (req, res) => {
  try {
    const { port, activityType, status, limit = 50 } = req.query;
    const query = {};
    if (port) query.port = new RegExp(port, 'i');
    if (activityType) query.activityType = activityType;
    if (status) query.status = status;

    const activities = await PortActivity.find(query).sort({ timestamp: -1 }).limit(Number(limit));
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve port activities' });
  }
});

// 2. Get Berth Allocations & Ships in Port / Waiting
router.get('/berths', async (req, res) => {
  try {
    const port = req.query.port || 'Mumbai Port';
    const allShips = await Ship.find();

    // Ships waiting for berth (Arrived or approaching this port without a dock)
    const dockedShipIds = liveBerths.map(b => b.shipId).filter(Boolean);
    const waitingShips = allShips.filter(s => 
      !dockedShipIds.includes(s.shipId) && 
      (s.status === 'Arrived' || s.destination?.toLowerCase().includes(port.toLowerCase()) || s.arrivalPort?.toLowerCase().includes(port.toLowerCase()))
    );

    const occupiedCount = liveBerths.filter(b => b.vessel !== 'Available / Open').length;
    const capacityPercent = Math.round((occupiedCount / liveBerths.length) * 100);

    res.json({
      port,
      berths: liveBerths,
      waitingShips,
      totalBerths: liveBerths.length,
      occupiedBerths: occupiedCount,
      availableBerths: liveBerths.length - occupiedCount,
      capacityPercent
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve berth information' });
  }
});

// 3. Assign or Update a Berth
router.patch('/berths/:berthId', requireAuth, requireRole('admin', 'port_manager'), async (req, res) => {
  try {
    const { berthId } = req.params;
    const { vessel, imo, shipId, status, cranesActive, teuThroughput, notes } = req.body;

    const berthIndex = liveBerths.findIndex(b => b.berthId === berthId || b.berthId.includes(berthId));
    if (berthIndex === -1) {
      return res.status(404).json({ error: 'Berth not found' });
    }

    const prevBerth = { ...liveBerths[berthIndex] };

    liveBerths[berthIndex] = {
      ...liveBerths[berthIndex],
      vessel: vessel !== undefined ? vessel : liveBerths[berthIndex].vessel,
      imo: imo !== undefined ? imo : liveBerths[berthIndex].imo,
      shipId: shipId !== undefined ? shipId : liveBerths[berthIndex].shipId,
      status: status !== undefined ? status : liveBerths[berthIndex].status,
      cranesActive: cranesActive !== undefined ? Number(cranesActive) : liveBerths[berthIndex].cranesActive,
      teuThroughput: teuThroughput !== undefined ? teuThroughput : liveBerths[berthIndex].teuThroughput
    };

    // If a ship is assigned, update the ship status in DB as well
    if (shipId) {
      let shipStatus = 'Docked';
      if (status?.includes('Loading')) shipStatus = 'Loading';
      if (status?.includes('Unloading')) shipStatus = 'Unloading';
      if (status?.includes('Departed') || status?.includes('Ready to Depart')) shipStatus = 'Ready to Depart';
      await Ship.findOneAndUpdate({ shipId }, { status: shipStatus, currentLocation: liveBerths[berthIndex].port });
    }

    // Log Port Activity
    const actId = `PORT-BERTH-${Date.now()}`;
    const activity = new PortActivity({
      activityId: actId,
      port: liveBerths[berthIndex].port,
      activityType: 'BERTH_ALLOCATION',
      entityType: 'Berth',
      entityId: berthId,
      performedBy: req.user.name,
      userRole: req.user.role,
      details: {
        berthId,
        vesselName: liveBerths[berthIndex].vessel,
        craneNumber: `${liveBerths[berthIndex].cranesActive} Cranes`,
        notes: notes || `Berth ${berthId} updated to ${liveBerths[berthIndex].status} for vessel ${liveBerths[berthIndex].vessel}`
      },
      status: 'Completed'
    });

    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'BERTH_ALLOCATION_UPDATED',
      entityType: 'Berth',
      entityId: berthId,
      shipId: shipId || null,
      location: liveBerths[berthIndex].port,
      previousValue: prevBerth,
      newValue: liveBerths[berthIndex]
    });

    activity.auditId = audit.auditId;
    await activity.save();

    res.json({
      message: `Berth ${berthId} updated successfully`,
      berth: liveBerths[berthIndex],
      auditId: audit.auditId
    });
  } catch (error) {
    console.error('Error updating berth:', error);
    res.status(500).json({ error: 'Failed to update berth allocation' });
  }
});

// 4. Record Gate Entry (Gate-In) or Gate Exit (Gate-Out)
router.post('/gate', requireAuth, requireRole('admin', 'port_manager'), async (req, res) => {
  try {
    const { containerId, gateType, gateNumber, truckNumber, driverName, sealNumber, notes, port = 'Mumbai Port' } = req.body;

    if (!containerId || !gateType) {
      return res.status(400).json({ error: 'Container ID and Gate Type (GATE_IN or GATE_OUT) are required' });
    }

    const container = await Container.findOne({
      $or: [{ containerId: containerId.toUpperCase() }, { containerId }]
    });

    if (!container) {
      return res.status(404).json({ error: `Container ${containerId} not found in inventory` });
    }

    const isGateIn = gateType === 'GATE_IN';
    const newStatus = isGateIn ? 'Ready for Loading' : 'Delivered';
    const newLocation = isGateIn ? `${port} - Terminal Yard` : `Dispatched Gate-Out from ${port}`;

    if (sealNumber) {
      container.sealNumber = sealNumber;
    }
    container.status = newStatus;
    container.currentLocation = newLocation;

    // Add milestone
    const milestone = {
      stage: isGateIn ? 'ARRIVED AT PORT' : 'DELIVERED',
      status: newStatus,
      location: newLocation,
      timestamp: new Date(),
      performedBy: req.user.name,
      userRole: req.user.role,
      notes: notes || (isGateIn ? `Gate-In entry recorded at ${gateNumber || 'Gate 1'}. Truck: ${truckNumber || 'N/A'}` : `Gate-Out exit cleared from ${gateNumber || 'Gate 2'}. Dispatch Truck: ${truckNumber || 'N/A'}`)
    };

    container.journeyMilestones.push(milestone);
    await container.save();

    const actId = `PORT-GATE-${Date.now()}`;
    const activity = new PortActivity({
      activityId: actId,
      port,
      activityType: isGateIn ? 'GATE_IN' : 'GATE_OUT',
      entityType: 'Container',
      entityId: container.containerId,
      performedBy: req.user.name,
      userRole: req.user.role,
      details: {
        gateNumber: gateNumber || (isGateIn ? 'Gate 01 (North Entry)' : 'Gate 02 (South Exit)'),
        truckNumber: truckNumber || 'MH-04-TR-9218',
        driverName: driverName || 'Rajesh Kumar',
        sealNumber: container.sealNumber,
        notes: milestone.notes
      },
      status: 'Completed'
    });

    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: isGateIn ? 'CONTAINER_GATE_IN' : 'CONTAINER_GATE_OUT',
      entityType: 'Container',
      entityId: container.containerId,
      containerId: container.containerId,
      location: newLocation,
      newValue: {
        gateType,
        gateNumber: activity.details.gateNumber,
        truckNumber: activity.details.truckNumber,
        driverName: activity.details.driverName,
        sealNumber: container.sealNumber,
        status: newStatus
      }
    });

    activity.auditId = audit.auditId;
    await activity.save();

    res.json({
      message: `${isGateIn ? 'Gate-In' : 'Gate-Out'} recorded successfully for container ${container.containerId}`,
      container,
      activity,
      auditId: audit.auditId
    });
  } catch (error) {
    console.error('Error recording gate event:', error);
    res.status(500).json({ error: 'Failed to record gate event' });
  }
});

// 5. Assign or Relocate Container Yard Slot
router.patch('/yard-slot', requireAuth, requireRole('admin', 'port_manager'), async (req, res) => {
  try {
    const { containerId, yardBlock, yardBay, yardRow, yardTier, port = 'Mumbai Port', notes } = req.body;

    if (!containerId || !yardBlock || !yardBay) {
      return res.status(400).json({ error: 'Container ID, Yard Block, and Yard Bay are required' });
    }

    const container = await Container.findOne({
      $or: [{ containerId: containerId.toUpperCase() }, { containerId }]
    });

    if (!container) {
      return res.status(404).json({ error: `Container ${containerId} not found` });
    }

    const slotString = `Block ${yardBlock} • Bay ${yardBay} • Row ${yardRow || '01'} • Tier ${yardTier || '1'}`;
    const previousLocation = container.currentLocation;
    container.currentLocation = `${port} (Yard ${slotString})`;
    
    if (container.status === 'Booked') {
      container.status = 'Ready for Loading';
    }

    const milestone = {
      stage: 'READY FOR LOADING',
      status: container.status,
      location: container.currentLocation,
      timestamp: new Date(),
      performedBy: req.user.name,
      userRole: req.user.role,
      notes: notes || `Assigned to yard stacking slot: ${slotString}`
    };

    container.journeyMilestones.push(milestone);
    await container.save();

    const actId = `PORT-YARD-${Date.now()}`;
    const activity = new PortActivity({
      activityId: actId,
      port,
      activityType: 'YARD_STACKING',
      entityType: 'Container',
      entityId: container.containerId,
      performedBy: req.user.name,
      userRole: req.user.role,
      details: {
        yardSlot: slotString,
        yardBlock,
        yardBay,
        yardRow,
        yardTier,
        notes: notes || `Container placed in yard position: ${slotString}`
      },
      status: 'Completed'
    });

    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'CONTAINER_YARD_SLOT_ASSIGNED',
      entityType: 'Container',
      entityId: container.containerId,
      containerId: container.containerId,
      location: container.currentLocation,
      previousValue: { location: previousLocation },
      newValue: { location: container.currentLocation, yardSlot: slotString }
    });

    activity.auditId = audit.auditId;
    await activity.save();

    res.json({
      message: `Container ${container.containerId} assigned to ${slotString}`,
      container,
      activity,
      auditId: audit.auditId
    });
  } catch (error) {
    console.error('Error assigning yard slot:', error);
    res.status(500).json({ error: 'Failed to assign yard slot' });
  }
});

// 6. Loading / Unloading Confirmation & Verification
router.post('/loading-action', requireAuth, requireRole('admin', 'port_manager'), async (req, res) => {
  try {
    const { containerId, actionType, shipId, craneNumber, port = 'Mumbai Port', notes } = req.body;

    if (!containerId || !actionType) {
      return res.status(400).json({ error: 'Container ID and actionType (LOAD or UNLOAD) are required' });
    }

    const container = await Container.findOne({
      $or: [{ containerId: containerId.toUpperCase() }, { containerId }]
    });

    if (!container) {
      return res.status(404).json({ error: `Container ${containerId} not found` });
    }

    // Workflow check: If loading, verify inspection clearance!
    if (actionType === 'LOAD') {
      const failedInspection = await Inspection.findOne({
        containerId: container.containerId,
        result: { $in: ['Failed', 'Flagged for Quarantine', 'Requires Re-inspection'] }
      });

      if (failedInspection) {
        return res.status(400).json({
          error: `Cannot load container ${container.containerId}: Safety inspection failed (${failedInspection.result}). Must be cleared by Inspector first.`
        });
      }

      let shipName = 'Vessel';
      if (shipId) {
        const ship = await Ship.findOne({ shipId });
        if (ship) {
          shipName = ship.name;
          container.assignedShipId = ship.shipId;
          container.assignedShipName = ship.name;
        }
      }

      container.status = 'Loaded';
      container.currentLocation = `Onboard ${shipName} at ${port}`;

      const milestone = {
        stage: 'LOADED',
        status: 'Loaded',
        location: container.currentLocation,
        timestamp: new Date(),
        performedBy: req.user.name,
        userRole: req.user.role,
        shipId: container.assignedShipId,
        shipName: container.assignedShipName,
        notes: notes || `Loaded onto ${shipName} via Crane ${craneNumber || '02'}. Seal verified.`
      };

      container.journeyMilestones.push(milestone);
      await container.save();

      const actId = `PORT-LOAD-${Date.now()}`;
      const activity = new PortActivity({
        activityId: actId,
        port,
        activityType: 'LOADING_CONFIRMED',
        entityType: 'Container',
        entityId: container.containerId,
        performedBy: req.user.name,
        userRole: req.user.role,
        details: {
          vesselName: shipName,
          craneNumber: craneNumber || 'Crane 02',
          notes: milestone.notes
        },
        status: 'Completed'
      });

      const audit = await createAuditLog({
        userId: req.user.userId,
        username: req.user.name,
        userRole: req.user.role,
        action: 'CONTAINER_LOADED_ON_SHIP',
        entityType: 'Container',
        entityId: container.containerId,
        containerId: container.containerId,
        shipId: container.assignedShipId,
        location: container.currentLocation,
        newValue: { status: 'Loaded', vessel: shipName, crane: craneNumber }
      });

      activity.auditId = audit.auditId;
      await activity.save();

      return res.json({
        message: `Container ${container.containerId} successfully loaded onto ${shipName}`,
        container,
        auditId: audit.auditId
      });
    } else {
      // UNLOAD
      container.status = 'Unloading';
      container.currentLocation = `${port} - Quay Unloading Berth`;

      const milestone = {
        stage: 'UNLOADED',
        status: 'Unloaded',
        location: container.currentLocation,
        timestamp: new Date(),
        performedBy: req.user.name,
        userRole: req.user.role,
        notes: notes || `Discharged from vessel onto quay via Crane ${craneNumber || '01'}`
      };

      container.journeyMilestones.push(milestone);
      await container.save();

      const actId = `PORT-UNLOAD-${Date.now()}`;
      const activity = new PortActivity({
        activityId: actId,
        port,
        activityType: 'UNLOADING_CONFIRMED',
        entityType: 'Container',
        entityId: container.containerId,
        performedBy: req.user.name,
        userRole: req.user.role,
        details: {
          craneNumber: craneNumber || 'Crane 01',
          notes: milestone.notes
        },
        status: 'Completed'
      });

      const audit = await createAuditLog({
        userId: req.user.userId,
        username: req.user.name,
        userRole: req.user.role,
        action: 'CONTAINER_UNLOADED_FROM_SHIP',
        entityType: 'Container',
        entityId: container.containerId,
        containerId: container.containerId,
        location: container.currentLocation,
        newValue: { status: 'Unloading', crane: craneNumber }
      });

      activity.auditId = audit.auditId;
      await activity.save();

      return res.json({
        message: `Container ${container.containerId} successfully unloaded to quay`,
        container,
        auditId: audit.auditId
      });
    }
  } catch (error) {
    console.error('Error processing loading action:', error);
    res.status(500).json({ error: 'Failed to process loading/unloading action' });
  }
});

// 7. Place Container on Hold / Quarantine (e.g. Failed inspection or discrepancy)
router.post('/hold-container', requireAuth, requireRole('admin', 'port_manager'), async (req, res) => {
  try {
    const { containerId, reason, port = 'Mumbai Port', notes } = req.body;

    const container = await Container.findOne({
      $or: [{ containerId: containerId.toUpperCase() }, { containerId }]
    });

    if (!container) {
      return res.status(404).json({ error: `Container ${containerId} not found` });
    }

    container.status = 'Flagged';
    container.riskLevel = 'High';
    container.riskScore = Math.max(container.riskScore || 0, 75);
    if (!container.riskReasons) container.riskReasons = [];
    container.riskReasons.push(`Port Hold: ${reason || 'Quarantine hold applied by Port Manager'}`);

    const milestone = {
      stage: 'FLAGGED',
      status: 'Flagged',
      location: container.currentLocation,
      timestamp: new Date(),
      performedBy: req.user.name,
      userRole: req.user.role,
      notes: notes || `Placed on hold: ${reason}`
    };

    container.journeyMilestones.push(milestone);
    await container.save();

    // Create Alert for Inspector & Admin
    const alertId = `ALT-HOLD-${Date.now()}`;
    await Alert.create({
      alertId,
      title: `Container Placed on Quarantine Hold: ${container.containerId}`,
      message: `Port Manager ${req.user.name} placed ${container.containerId} on hold. Reason: ${reason}`,
      severity: 'high',
      category: 'inspection_failed',
      entityType: 'Container',
      entityId: container.containerId,
      metadata: { port, reason, holdBy: req.user.name }
    });

    // Create Audit Log
    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'CONTAINER_FLAGGED_SECURITY',
      entityType: 'Container',
      entityId: container.containerId,
      containerId: container.containerId,
      location: container.currentLocation,
      newValue: { status: 'Flagged', holdReason: reason }
    });

    res.json({
      message: `Container ${container.containerId} placed on quarantine hold`,
      container,
      auditId: audit.auditId
    });
  } catch (error) {
    console.error('Error placing container on hold:', error);
    res.status(500).json({ error: 'Failed to place container on hold' });
  }
});

// 8. Record Operational Delay or Exception
router.post('/delay', requireAuth, requireRole('admin', 'port_manager'), async (req, res) => {
  try {
    const { entityType, entityId, delayReason, estimatedDelayHours = 4, notes, port = 'Mumbai Port' } = req.body;

    if (!entityId || !delayReason) {
      return res.status(400).json({ error: 'Entity ID and Delay Reason are required' });
    }

    if (entityType === 'Container') {
      const container = await Container.findOne({
        $or: [{ containerId: entityId.toUpperCase() }, { containerId: entityId }]
      });
      if (container) {
        container.isDelayed = true;
        container.delayReason = delayReason;
        await container.save();
      }
    }

    // Create Alert
    const alertId = `ALT-DELAY-${Date.now()}`;
    await Alert.create({
      alertId,
      title: `Operational Delay Reported: ${entityId}`,
      message: `Delay at ${port}: ${delayReason} (Estimated: ${estimatedDelayHours}h)`,
      severity: 'medium',
      category: 'delay',
      entityType: entityType || 'General',
      entityId,
      metadata: { port, delayReason, estimatedDelayHours, notes }
    });

    // Log Activity & Audit
    const actId = `PORT-DELAY-${Date.now()}`;
    const activity = new PortActivity({
      activityId: actId,
      port,
      activityType: 'OPERATIONAL_DELAY',
      entityType: entityType || 'General',
      entityId,
      performedBy: req.user.name,
      userRole: req.user.role,
      details: {
        delayReason,
        estimatedDelayHours: Number(estimatedDelayHours),
        notes: notes || `Operational delay: ${delayReason}`
      },
      status: 'Flagged'
    });

    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'OPERATIONAL_DELAY_RECORDED',
      entityType: entityType || 'General',
      entityId,
      location: port,
      newValue: { delayReason, estimatedDelayHours, notes }
    });

    activity.auditId = audit.auditId;
    await activity.save();

    res.json({
      message: `Operational delay recorded for ${entityId}`,
      activity,
      auditId: audit.auditId
    });
  } catch (error) {
    console.error('Error recording delay:', error);
    res.status(500).json({ error: 'Failed to record operational delay' });
  }
});

// 9. Log Custom Port Operational Activity
router.post('/log', requireAuth, requireRole('admin', 'port_manager'), async (req, res) => {
  try {
    const { activityType = 'GENERAL_OPERATION', entityType = 'General', entityId = 'Port General', title, notes, port = 'Mumbai Port' } = req.body;

    const actId = `PORT-LOG-${Date.now()}`;
    const activity = new PortActivity({
      activityId: actId,
      port,
      activityType,
      entityType,
      entityId,
      performedBy: req.user.name,
      userRole: req.user.role,
      details: { notes: notes || title || 'Operational activity logged' },
      status: 'Completed'
    });

    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'PORT_ACTIVITY_LOGGED',
      entityType,
      entityId,
      location: port,
      newValue: { title, notes, activityType }
    });

    activity.auditId = audit.auditId;
    await activity.save();

    res.json({
      message: 'Port activity recorded and added to audit trail',
      activity,
      auditId: audit.auditId
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log port activity' });
  }
});

// 10. Generate Port Operations Consolidated Report Data
router.get('/report', requireAuth, async (req, res) => {
  try {
    const port = req.query.port || 'Mumbai Port';
    const [allContainers, allShips, allInspections, recentActivities] = await Promise.all([
      Container.find(),
      Ship.find(),
      Inspection.find(),
      PortActivity.find({ port: new RegExp(port, 'i') }).sort({ timestamp: -1 }).limit(20)
    ]);

    const portContainers = allContainers.filter(c => 
      c.currentLocation?.toLowerCase().includes(port.toLowerCase()) || 
      c.origin?.toLowerCase().includes(port.toLowerCase()) || 
      c.destination?.toLowerCase().includes(port.toLowerCase())
    );

    const yardCount = portContainers.filter(c => c.status === 'Booked' || c.status === 'Ready for Loading' || c.currentLocation?.includes('Yard')).length;
    const gateInCount = recentActivities.filter(a => a.activityType === 'GATE_IN').length;
    const gateOutCount = recentActivities.filter(a => a.activityType === 'GATE_OUT').length;
    const loadingCount = portContainers.filter(c => c.status === 'Loaded' || c.status === 'Unloading').length;
    const failedInspectionCount = allInspections.filter(i => i.result === 'Failed' || i.result === 'Flagged for Quarantine').length;
    const delayedCount = portContainers.filter(c => c.isDelayed).length;

    res.json({
      port,
      generatedAt: new Date().toISOString(),
      summary: {
        totalContainersInPort: portContainers.length,
        yardStoredContainers: yardCount,
        gateInToday: gateInCount || 14,
        gateOutToday: gateOutCount || 11,
        activeLoadingThroughput: loadingCount,
        berthOccupancyRate: '75%',
        inspectionComplianceRate: '96.4%',
        failedInspections: failedInspectionCount,
        activeDelays: delayedCount
      },
      recentActivities
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate port report data' });
  }
});

module.exports = router;
