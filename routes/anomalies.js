const express = require('express');
const router = express.Router();
const Anomaly = require('../models/Anomaly');
const Container = require('../models/Container');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditEngine');
const { calculateContainerRisk } = require('../services/riskAnalysisEngine');

// List Anomalies (filter by status, severity, entityId)
router.get('/', async (req, res) => {
  try {
    const { status, severity, entityId, type } = req.query;
    const query = {};
    if (status && status.trim() && status !== 'undefined' && status !== 'null' && status !== 'All Statuses' && status !== 'All') {
      query.status = status.trim();
    }
    if (severity && severity.trim() && severity !== 'undefined' && severity !== 'null' && severity !== 'All') {
      query.severity = severity.trim();
    }
    if (entityId && entityId.trim() && entityId !== 'undefined' && entityId !== 'null' && entityId !== 'All') {
      query.entityId = new RegExp(entityId.trim(), 'i');
    }
    if (type && type.trim() && type !== 'undefined' && type !== 'null' && type !== 'All') {
      query.type = type.trim();
    }

    const anomalies = await Anomaly.find(query).sort({ detectedAt: -1 });
    res.json(anomalies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve anomalies' });
  }
});

// Resolve Anomaly
router.patch('/:anomalyId/resolve', requireAuth, requireRole('admin', 'port_manager', 'ship_manager'), async (req, res) => {
  try {
    const { resolutionNotes } = req.body;
    const anomaly = await Anomaly.findOne({ anomalyId: req.params.anomalyId });

    if (!anomaly) {
      return res.status(404).json({ error: 'Anomaly record not found' });
    }

    anomaly.status = 'Resolved';
    anomaly.resolvedAt = new Date();
    anomaly.resolvedBy = req.user.name;
    anomaly.resolutionNotes = resolutionNotes || 'Resolved after physical inspection and operator verification';

    await anomaly.save();

    // Create Audit Log
    await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'ANOMALY_RESOLVED',
      entityType: 'System',
      entityId: anomaly.anomalyId,
      containerId: anomaly.containerId,
      shipId: anomaly.shipId,
      location: req.user.assignedPort || 'Maritime Command Center',
      newValue: {
        status: 'Resolved',
        resolutionNotes: anomaly.resolutionNotes
      }
    });

    // If connected to a container, recalculate its risk score
    if (anomaly.containerId) {
      const container = await Container.findOne({ containerId: anomaly.containerId });
      if (container) {
        await calculateContainerRisk(container);
      }
    }

    res.json({ message: 'Anomaly resolved successfully', anomaly });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resolve anomaly' });
  }
});

module.exports = router;
