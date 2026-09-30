const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const Container = require('../models/Container');
const Ship = require('../models/Ship');
const Anomaly = require('../models/Anomaly');
const { requireAuth, requireRole } = require('../middleware/auth');
const { verifyAuditChain } = require('../services/auditEngine');
const { generateMaritimeHtmlReport, generateAuditCsv } = require('../services/exportService');

// List Generated Reports
router.get('/', async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve reports' });
  }
});

// Generate New Formal Audit Report
router.post('/generate', requireAuth, requireRole('admin', 'port_manager', 'ship_manager', 'inspector', 'viewer'), async (req, res) => {
  try {
    const { title, reportType, startDate, endDate, format = 'PDF' } = req.body;

    const query = {};
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(query).sort({ sequenceNumber: 1 });
    const totalContainers = await Container.countDocuments();
    const totalShips = await Ship.countDocuments();
    const anomaliesCount = await Anomaly.countDocuments({ status: 'Active' });
    const highRiskContainers = await Container.countDocuments({ riskLevel: { $in: ['High', 'Critical'] } });

    // Verify audit trail integrity for this report
    const integrityResult = await verifyAuditChain();

    const count = await Report.countDocuments();
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const reportId = `RPT-${datePrefix}-${String(count + 1).padStart(4, '0')}`;

    const report = new Report({
      reportId,
      title: title || `${reportType || 'Comprehensive'} Audit & Operations Report`,
      reportType: reportType || 'Comprehensive Audit Trail',
      dateRange: {
        startDate: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86400000),
        endDate: endDate ? new Date(endDate) : new Date()
      },
      generatedBy: req.user.name,
      generatedByRole: req.user.role,
      format,
      metricsSummary: {
        totalAudits: logs.length,
        totalContainers,
        totalShips,
        anomaliesFound: anomaliesCount,
        highRiskContainers,
        integrityVerified: integrityResult.verified
      },
      integrityStatus: integrityResult.verified ? 'VERIFIED' : 'COMPROMISED',
      tamperCheckDetails: integrityResult.message,
      dataSnapshot: {
        latestBlockHash: integrityResult.latestHash || '0000',
        sampleLogCount: logs.length
      }
    });

    await report.save();

    res.status(201).json({
      message: 'Formal maritime audit report generated successfully',
      report
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate audit report' });
  }
});

// Export Report HTML/PDF format
router.get('/:reportId/export-html', async (req, res) => {
  try {
    const report = await Report.findOne({ reportId: req.params.reportId });
    if (!report) {
      return res.status(404).send('Report not found');
    }

    const logs = await AuditLog.find().sort({ sequenceNumber: 1 }).limit(100);
    const integrityResult = await verifyAuditChain();

    const html = generateMaritimeHtmlReport(logs, report.title, {
      generatedBy: `${report.generatedBy} (${report.generatedByRole})`,
      reportType: report.reportType,
      tamperStatus: integrityResult.verified ? 'VERIFIED_SECURE' : 'COMPROMISED',
      latestHash: integrityResult.latestHash
    });

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Failed to generate HTML report export');
  }
});

// Export CSV Audit Trail
router.get('/export/csv', async (req, res) => {
  try {
    const { containerId, shipId, startDate, endDate } = req.query;
    const query = {};
    if (containerId) query.containerId = new RegExp(containerId, 'i');
    if (shipId) query.shipId = shipId;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(query).sort({ sequenceNumber: 1 });
    const csvContent = generateAuditCsv(logs);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=maritime_audit_trail_${Date.now()}.csv`);
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

module.exports = router;
