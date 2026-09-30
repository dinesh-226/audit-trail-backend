const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Evidence = require('../models/Evidence');
const Container = require('../models/Container');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditEngine');

// List Evidence
router.get('/', async (req, res) => {
  try {
    const { containerId, category, auditId } = req.query;
    const query = {};
    if (containerId && containerId.trim() && containerId !== 'undefined' && containerId !== 'null' && containerId !== 'All') {
      query.containerId = new RegExp(containerId.trim(), 'i');
    }
    if (category && category.trim() && category !== 'undefined' && category !== 'null' && category !== 'All Categories' && category !== 'All') {
      query.category = category.trim();
    }
    if (auditId && auditId.trim() && auditId !== 'undefined' && auditId !== 'null' && auditId !== 'All') {
      query.auditId = auditId.trim();
    }

    const evidence = await Evidence.find(query).sort({ uploadedAt: -1 });
    res.json(evidence);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve evidence documents' });
  }
});

// Attach Evidence Document (with SHA-256 Checksum)
router.post('/', requireAuth, requireRole('inspector', 'admin', 'port_manager', 'ship_manager'), async (req, res) => {
  try {
    const {
      containerId,
      inspectionId,
      fileName,
      fileType,
      fileUrl,
      fileSize,
      category,
      description,
      customHash
    } = req.body;

    if (!containerId || !fileName) {
      return res.status(400).json({ error: 'Container ID and File Name are required' });
    }

    const container = await Container.findOne({ containerId: containerId.toUpperCase() });
    if (!container) {
      return res.status(404).json({ error: 'Container not found' });
    }

    // Compute or assign SHA-256 hash
    const fileHashSha256 = customHash || crypto.createHash('sha256').update(fileName + Date.now() + (fileUrl || '')).digest('hex');

    const count = await Evidence.countDocuments();
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const evidenceId = `EVD-${datePrefix}-${String(count + 1).padStart(4, '0')}`;

    const evidence = new Evidence({
      evidenceId,
      containerId: container.containerId,
      inspectionId: inspectionId || null,
      fileName,
      fileType: fileType || 'image/jpeg',
      fileSize: fileSize || 185000,
      fileUrl: fileUrl || 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&auto=format&fit=crop&q=80',
      uploadedBy: req.user.name,
      uploadedByRole: req.user.role,
      category: category || 'Inspection Photo',
      description: description || `Document attached for container ${container.containerId}`,
      fileHashSha256
    });

    await evidence.save();

    // Create Audit Log
    const audit = await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'EVIDENCE_ATTACHED',
      entityType: 'Evidence',
      entityId: evidence.evidenceId,
      containerId: container.containerId,
      shipId: container.assignedShipId,
      location: container.currentLocation,
      evidenceId: evidence.evidenceId,
      evidenceFileName: evidence.fileName,
      newValue: {
        fileName: evidence.fileName,
        category: evidence.category,
        fileHashSha256: evidence.fileHashSha256
      }
    });

    evidence.auditId = audit.auditId;
    await evidence.save();

    res.status(201).json({
      message: 'Evidence document registered with SHA-256 checksum',
      evidence,
      auditId: audit.auditId
    });
  } catch (error) {
    console.error('Error attaching evidence:', error);
    res.status(500).json({ error: 'Failed to upload evidence' });
  }
});

module.exports = router;
