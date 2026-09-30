const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/auth');
const { verifyAuditChain, simulateTamper, repairChain } = require('../services/auditEngine');

// Advanced Search & Filter Audit Logs
router.get('/', async (req, res) => {
  try {
    const {
      search,
      containerId,
      shipId,
      userId,
      userRole,
      action,
      entityType,
      location,
      ipAddress,
      startDate,
      endDate,
      limit = 50,
      skip = 0
    } = req.query;

    const query = {};

    if (containerId && containerId.trim() && containerId !== 'undefined' && containerId !== 'null' && containerId !== 'All') {
      query.containerId = new RegExp(containerId.trim(), 'i');
    }
    if (shipId && shipId.trim() && shipId !== 'undefined' && shipId !== 'null' && shipId !== 'All') {
      query.shipId = shipId.trim();
    }
    if (userId && userId.trim() && userId !== 'undefined' && userId !== 'null' && userId !== 'All') {
      query.userId = userId.trim();
    }
    if (userRole && userRole.trim() && userRole !== 'undefined' && userRole !== 'null' && userRole !== 'All Roles' && userRole !== 'All') {
      query.userRole = userRole.trim();
    }
    if (action && action.trim() && action !== 'undefined' && action !== 'null' && action !== 'All Actions' && action !== 'All') {
      query.action = action.trim();
    }
    if (entityType && entityType.trim() && entityType !== 'undefined' && entityType !== 'null' && entityType !== 'All Entities' && entityType !== 'All') {
      query.entityType = entityType.trim();
    }
    if (location && location.trim() && location !== 'undefined' && location !== 'null' && location !== 'All Locations' && location !== 'All') {
      query.location = new RegExp(location.trim(), 'i');
    }
    if (ipAddress && ipAddress.trim() && ipAddress !== 'undefined' && ipAddress !== 'null' && ipAddress !== 'All') {
      query.ipAddress = new RegExp(ipAddress.trim(), 'i');
    }

    if ((startDate && startDate !== 'undefined' && startDate !== 'null') || (endDate && endDate !== 'undefined' && endDate !== 'null')) {
      query.timestamp = {};
      if (startDate && startDate !== 'undefined' && startDate !== 'null') query.timestamp.$gte = new Date(startDate);
      if (endDate && endDate !== 'undefined' && endDate !== 'null') query.timestamp.$lte = new Date(endDate);
    }

    if (search && search.trim() && search !== 'undefined' && search !== 'null') {
      const cleanSearch = search.trim();
      query.$or = [
        { auditId: new RegExp(cleanSearch, 'i') },
        { containerId: new RegExp(cleanSearch, 'i') },
        { shipId: new RegExp(cleanSearch, 'i') },
        { entityId: new RegExp(cleanSearch, 'i') },
        { username: new RegExp(cleanSearch, 'i') },
        { action: new RegExp(cleanSearch, 'i') },
        { location: new RegExp(cleanSearch, 'i') },
        { ipAddress: new RegExp(cleanSearch, 'i') }
      ];
    }

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ sequenceNumber: -1 })
      .skip(Number(skip))
      .limit(Number(limit));

    res.json({
      total,
      limit: Number(limit),
      skip: Number(skip),
      logs
    });
  } catch (error) {
    console.error('Error querying audit logs:', error);
    res.status(500).json({ error: 'Failed to search audit logs' });
  }
});

// Audit Trail Statistics Overview
router.get('/stats/summary', async (req, res) => {
  try {
    const totalLogs = await AuditLog.countDocuments();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayCount = await AuditLog.countDocuments({ timestamp: { $gte: startOfToday } });

    const actionCounts = await AuditLog.aggregate([
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]);

    const userActivity = await AuditLog.aggregate([
      { $group: { _id: '$username', role: { $first: '$userRole' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 }
    ]);

    const latestBlock = await AuditLog.findOne().sort({ sequenceNumber: -1 });

    res.json({
      totalLogs,
      todayCount,
      latestBlockSequence: latestBlock ? latestBlock.sequenceNumber : 0,
      latestBlockHash: latestBlock ? latestBlock.currentHash : null,
      actionCounts,
      userActivity
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit statistics' });
  }
});

// Run Cryptographic Audit Trail Integrity Verification
router.get('/verify-integrity', async (req, res) => {
  try {
    const result = await verifyAuditChain();
    res.json(result);
  } catch (error) {
    console.error('Error during integrity verification:', error);
    res.status(500).json({ error: 'Failed to verify ledger integrity', details: error.message });
  }
});

// Simulate Database Record Tampering (Admin demo testing tool)
router.post('/simulate-tamper', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { auditId, fieldName = 'location', fakeValue = 'UNAUTHORIZED_MOCK_LOCATION' } = req.body;

    let targetAuditId = auditId;
    if (!targetAuditId) {
      // Pick a random middle log
      const logs = await AuditLog.find().sort({ sequenceNumber: 1 });
      if (logs.length > 2) {
        targetAuditId = logs[Math.floor(logs.length / 2)].auditId;
      } else if (logs.length > 0) {
        targetAuditId = logs[0].auditId;
      } else {
        return res.status(400).json({ error: 'No audit records available to tamper' });
      }
    }

    const tamperedLog = await simulateTamper(targetAuditId, fieldName, fakeValue);

    res.json({
      message: `Simulated illicit database modification on audit record #${tamperedLog.sequenceNumber} (${tamperedLog.auditId})`,
      targetAuditId,
      alteredField: fieldName,
      fakeValue,
      instruction: 'Run "Verify Audit Integrity" now to observe the cryptographic hash check immediately flag the tampering.'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute tamper simulation', details: error.message });
  }
});

// Repair / Restore Cryptographic Hash Continuity
router.post('/repair-chain', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await repairChain();
    res.json({
      message: `Audit trail hash chain successfully repaired across ${result.repairedCount} entries.`,
      result
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to repair audit trail chain' });
  }
});

// Get Audit Log by ID
router.get('/:auditId', async (req, res) => {
  try {
    const log = await AuditLog.findOne({ auditId: req.params.auditId });
    if (!log) {
      return res.status(404).json({ error: 'Audit log not found' });
    }
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit log details' });
  }
});

module.exports = router;
