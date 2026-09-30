const Anomaly = require('../models/Anomaly');
const Alert = require('../models/Alert');
const AuditLog = require('../models/AuditLog');
const Container = require('../models/Container');
const Ship = require('../models/Ship');
const Inspection = require('../models/Inspection');

const EXPECTED_LIFECYCLE_ORDER = [
  'Booked',
  'Ready for Loading',
  'Loaded',
  'In Transit',
  'Arrived',
  'Unloading',
  'Under Inspection',
  'Delivered'
];

/**
 * Creates and registers an anomaly & triggers a real-time alert
 */
async function registerAnomaly(params) {
  const {
    type,
    severity,
    entityType = 'Container',
    entityId,
    containerId,
    shipId,
    title,
    description,
    rootCause,
    recommendedAction,
    relatedAuditId
  } = params;

  // Check if an identical active anomaly already exists
  const existing = await Anomaly.findOne({
    type,
    entityId,
    status: 'Active'
  });

  if (existing) {
    return existing;
  }

  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await Anomaly.countDocuments();
  const anomalyId = `ANM-${datePrefix}-${String(count + 1).padStart(4, '0')}`;

  const anomaly = new Anomaly({
    anomalyId,
    type,
    severity,
    entityType,
    entityId,
    containerId: containerId || (entityType === 'Container' ? entityId : null),
    shipId: shipId || (entityType === 'Ship' ? entityId : null),
    title,
    description,
    rootCause,
    recommendedAction,
    relatedAuditId,
    status: 'Active',
    detectedAt: new Date()
  });

  await anomaly.save();

  // Create corresponding notification alert
  const alertId = `ALT-${datePrefix}-${String(count + 1).padStart(4, '0')}`;
  const alert = new Alert({
    alertId,
    title: `🚨 ${severity.toUpperCase()}: ${title}`,
    message: description,
    severity: severity.toLowerCase(),
    category: 'anomaly',
    entityType,
    entityId,
    metadata: {
      anomalyId,
      rootCause,
      recommendedAction,
      relatedAuditId
    }
  });

  await alert.save();

  return anomaly;
}

/**
 * Evaluates operational action for all 7 anomaly scenarios
 */
async function evaluateActionForAnomalies({ container, ship, user, action, previousStatus, newStatus, newLocation, auditLog }) {
  const detected = [];

  if (container) {
    const cId = container.containerId;

    // Case 5: Out of sequence status transition
    if (newStatus && previousStatus && newStatus !== previousStatus) {
      const prevIdx = EXPECTED_LIFECYCLE_ORDER.indexOf(previousStatus);
      const newIdx = EXPECTED_LIFECYCLE_ORDER.indexOf(newStatus);

      if (prevIdx !== -1 && newIdx !== -1) {
        // Skipping critical steps (e.g. from Booked directly to In Transit or Delivered)
        if (newIdx - prevIdx > 2 || (previousStatus === 'Booked' && newStatus === 'Delivered')) {
          const anm = await registerAnomaly({
            type: 'OUT_OF_SEQUENCE_STATUS',
            severity: 'High',
            entityType: 'Container',
            entityId: cId,
            containerId: cId,
            shipId: container.assignedShipId,
            title: `Out-of-Sequence Lifecycle Jump on Container ${cId}`,
            description: `Container status changed directly from "${previousStatus}" to "${newStatus}" bypassing mandatory intermediary stages.`,
            rootCause: `Operational protocol bypassed: Container skipped physical loading and transit verification events.`,
            recommendedAction: `Halt gate clearance. Review physical container yard presence and inspect physical seal.`,
            relatedAuditId: auditLog?.auditId
          });
          detected.push(anm);
        }
      }
    }

    // Case 1: Unloaded without prior arrival event
    if (newStatus === 'Unloading' || newStatus === 'Delivered' || action === 'CARGO_UNLOADED') {
      if (container.assignedShipId) {
        const assignedShip = await Ship.findOne({ shipId: container.assignedShipId });
        if (assignedShip && assignedShip.status === 'In Transit') {
          const anm = await registerAnomaly({
            type: 'UNLOADED_WITHOUT_ARRIVAL',
            severity: 'Critical',
            entityType: 'Container',
            entityId: cId,
            containerId: cId,
            shipId: assignedShip.shipId,
            title: `Premature Unloading Event on ${cId}`,
            description: `Container was registered as unloaded while assigned ship "${assignedShip.name}" is still recorded as "In Transit" at sea.`,
            rootCause: `Missing port arrival handshake or false unloading scan recorded.`,
            recommendedAction: `Verify AIS ship coordinates and port crane manifest before releasing cargo.`,
            relatedAuditId: auditLog?.auditId
          });
          detected.push(anm);
        }
      }
    }

    // Case 3: Teleportation / Impossible Location Jump
    if (newLocation && container.currentLocation && newLocation !== container.currentLocation) {
      const portLocations = ['Mumbai Port', 'Singapore Port', 'Rotterdam Port', 'Shanghai Port', 'Dubai Port', 'New York Port'];
      const isCrossPortJump = portLocations.some(p => p === newLocation) && 
                              portLocations.some(p => p === container.currentLocation) &&
                              !container.assignedShipId &&
                              container.status !== 'In Transit';

      if (isCrossPortJump) {
        const anm = await registerAnomaly({
          type: 'TELEPORTATION_LOCATION_JUMP',
          severity: 'Critical',
          entityType: 'Container',
          entityId: cId,
          containerId: cId,
          title: `Impossible Location Jump on Container ${cId}`,
          description: `Container location changed from "${container.currentLocation}" to "${newLocation}" without any assigned carrier voyage record.`,
          rootCause: `Location updated without intermediate bill of lading or sea freight dispatch log.`,
          recommendedAction: `Initiate cargo containment protocol and inspect customs manifest at destination port.`,
          relatedAuditId: auditLog?.auditId
        });
        detected.push(anm);
      }
    }

    // Case 6: Delivery before inspection is completed
    if (newStatus === 'Delivered') {
      const passedInspection = await Inspection.findOne({
        containerId: cId,
        result: 'Passed'
      });

      if (!passedInspection) {
        const anm = await registerAnomaly({
          type: 'DELIVERY_BEFORE_INSPECTION',
          severity: 'Critical',
          entityType: 'Container',
          entityId: cId,
          containerId: cId,
          title: `Delivery Without Mandatory Inspection on ${cId}`,
          description: `Container ${cId} marked as Delivered without a registered passing safety & customs inspection report.`,
          rootCause: `Customs and safety clearance check omitted prior to terminal gate out.`,
          recommendedAction: `Recall container dispatch and notify customs inspector immediately.`,
          relatedAuditId: auditLog?.auditId
        });
        detected.push(anm);
      }
    }

    // Case 7: Reefer temperature excursion
    if (container.type === 'Reefer 40ft' && container.temperatureCelsius !== null) {
      if (container.temperatureCelsius > -10) {
        const anm = await registerAnomaly({
          type: 'TEMPERATURE_ANOMALY',
          severity: 'High',
          entityType: 'Container',
          entityId: cId,
          containerId: cId,
          title: `Reefer Temperature Excursion on ${cId}`,
          description: `Reefer cargo temperature recorded at ${container.temperatureCelsius}°C (exceeds cold-chain maximum tolerance of -15°C).`,
          rootCause: `Reefer power disconnection or compressor malfunction onboard ship.`,
          recommendedAction: `Deploy marine technician for auxiliary power connection and check perishable cargo integrity.`,
          relatedAuditId: auditLog?.auditId
        });
        detected.push(anm);
      }
    }
  }

  // Case 4: Burst Operations Tampering Check by single user
  if (user && user.userId) {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const recentOpsCount = await AuditLog.countDocuments({
      userId: user.userId,
      timestamp: { $gte: twoMinutesAgo }
    });

    if (recentOpsCount >= 6) {
      const anm = await registerAnomaly({
        type: 'BURST_OPERATION_TAMPERING',
        severity: 'Medium',
        entityType: 'User',
        entityId: user.userId,
        title: `High-Velocity Burst Operations by User "${user.name || user.userId}"`,
        description: `User performed ${recentOpsCount} audit-logged actions within 120 seconds. Potential automated script manipulation or unauthorized bulk modification.`,
        rootCause: `Rapid succession of API calls outside normal human operator velocity.`,
        recommendedAction: `Review user session token, verify client IP address, and review recent audit timestamps.`,
        relatedAuditId: auditLog?.auditId
      });
      detected.push(anm);
    }
  }

  return detected;
}

module.exports = {
  registerAnomaly,
  evaluateActionForAnomalies
};
