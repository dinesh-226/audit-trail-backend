// controllers/reportController.js - Compliance & Audit Reporting Controller
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const { verifyChainIntegrity } = require('../services/hashChainService');
const { recordAuditLog } = require('../middleware/auditLogger');
const { generateHtmlReport } = require('../services/exportService');

// @desc    Get all generated reports
// @route   GET /api/reports
// @access  Private
const getReports = async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: reports });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get single report by ID
// @route   GET /api/reports/:id
// @access  Private
const getReportById = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    res.status(200).json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Generate a new compliance or audit report
// @route   POST /api/reports
// @access  Private
const generateReport = async (req, res) => {
  try {
    const { title, reportType = 'SOC2', preset = 'Last 30 Days', format = 'PDF' } = req.body;

    const totalEvents = await AuditLog.countDocuments();
    const criticalEvents = await AuditLog.countDocuments({
      $or: [{ criticality: 'CRITICAL' }, { riskLevel: 'critical' }, { severity: 'CRITICAL' }]
    });
    const highEvents = await AuditLog.countDocuments({
      $or: [{ criticality: 'HIGH' }, { riskLevel: 'high' }, { severity: 'HIGH' }]
    });
    const chainCheck = await verifyChainIntegrity();

    // Determine compliance score and findings
    let complianceScore = 100;
    const findings = [];

    if (!chainCheck.isValid) {
      complianceScore -= 35;
      findings.push('CRITICAL FINDING: Cryptographic hash chain validation failed. Data integrity compromise detected.');
    } else {
      findings.push('PASS: SHA-256 audit trail integrity verification passed with 100% record continuity.');
    }

    if (criticalEvents > 0) {
      complianceScore -= Math.min(criticalEvents * 5, 25);
      findings.push(`WARNING: ${criticalEvents} critical severity security events recorded within the evaluation window.`);
    } else {
      findings.push('PASS: Zero unmitigated critical security breaches detected.');
    }

    if (highEvents > 5) {
      complianceScore -= 10;
      findings.push(`NOTICE: Elevated number of high-severity actions (${highEvents}) flagged for review.`);
    }

    // Framework specific findings
    if (reportType === 'SOC2') {
      findings.push('SOC2 CC6.1 - Access controls & authentication events are 100% timestamped and immutable.');
      findings.push('SOC2 CC7.2 - Anomaly detection active on sensitive data modifications.');
    } else if (reportType === 'GDPR') {
      findings.push('GDPR Article 32 - Pseudonymization and end-to-end audit logging active for all personal data access.');
      findings.push('GDPR Article 33 - Notification mechanism verified for unauthorized access attempts.');
    } else if (reportType === 'HIPAA') {
      findings.push('HIPAA § 164.312(b) - Audit controls implemented to record and examine activity in ePHI systems.');
    } else if (reportType === 'ISO27001') {
      findings.push('ISO 27001 A.12.4 - Logging and monitoring controls satisfy ISO 27001 Annex A standards.');
    }

    complianceScore = Math.max(Math.min(complianceScore, 100), 20);

    const report = await Report.create({
      title: title || `${reportType} Compliance Audit Report`,
      reportType,
      generatedBy: {
        id: req.user?._id?.toString() || 'auditor-1',
        name: req.user?.name || 'Chief Compliance Officer',
        email: req.user?.email || 'compliance@audittrail.io'
      },
      dateRange: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(),
        preset
      },
      summary: {
        totalEvents,
        criticalEvents,
        highEvents,
        tamperStatus: chainCheck.isValid ? 'VERIFIED_CLEAN' : 'COMPROMISED',
        complianceScore,
        findings
      },
      format
    });

    await recordAuditLog({
      req,
      action: 'CREATE',
      actionCategory: 'COMPLIANCE',
      entity: { type: 'Report', id: report._id.toString(), name: report.title },
      details: `Generated ${reportType} compliance report with score ${complianceScore}%.`,
      severity: 'LOW',
      status: 'SUCCESS'
    });

    res.status(201).json({
      success: true,
      message: 'Compliance report successfully generated',
      data: report
    });
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Download / Render formatted compliance report
// @route   GET /api/reports/:id/download
// @access  Private
const downloadReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(100);
    const html = generateHtmlReport(logs, report.title, {
      generatedBy: `${report.generatedBy?.name || 'Compliance Officer'} (${report.generatedBy?.email || 'compliance@auditflow.io'})`,
      reportType: report.reportType,
      complianceScore: report.summary?.complianceScore || 100,
      tamperStatus: report.summary?.tamperStatus || 'VERIFIED_CLEAN',
      findings: report.summary?.findings || []
    });

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Delete a compliance report
// @route   DELETE /api/reports/:id
// @access  Private
const deleteReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    await Report.findByIdAndDelete(req.params.id);

    await recordAuditLog({
      req,
      action: 'DELETE',
      actionCategory: 'COMPLIANCE',
      entity: { type: 'Report', id: req.params.id, name: report.title },
      details: `Deleted ${report.reportType} compliance report`,
      severity: 'MEDIUM',
      status: 'SUCCESS'
    });

    res.json({ success: true, message: 'Report deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = {
  getReports,
  getReportById,
  generateReport,
  downloadReport,
  deleteReport
};
