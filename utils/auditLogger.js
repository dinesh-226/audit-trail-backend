const AuditLog = require('../models/AuditLog');
const Project = require('../models/Project');

/**
 * Centralized Audit Logging Utility
 * Captures user context, IP, User-Agent, diffs, and risk analysis
 */
async function logAudit({
  userId,
  userEmail,
  userName,
  userRole,
  action,
  entityType,
  entityId,
  entityName = '',
  projectId = null,
  projectName = '',
  fieldName = null,
  oldValue = null,
  newValue = null,
  reason = '',
  source = 'web',
  req = null,
  isRisky = false,
  riskLevel = 'low',
  episodeId = null,
  episodeTitle = null
}) {
  try {
    // Extract metadata from request if available
    let ip = '';
    let userAgent = '';

    if (req) {
      ip = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '127.0.0.1';
      userAgent = req.get ? (typeof req.get === 'function' ? req.get('user-agent') : '') : (req.headers ? req.headers['user-agent'] : '');
      
      // Auto-fill user information from req.user if not explicitly passed
      if (req.user) {
        if (!userId) userId = req.user._id;
        if (!userEmail) userEmail = req.user.email;
        if (!userName) userName = req.user.name;
        if (!userRole) userRole = req.user.role;
      }
    }

    // Lookup project name if projectId provided but projectName empty
    if (projectId && !projectName) {
      try {
        const proj = await Project.findById(projectId).select('name');
        if (proj) projectName = proj.name;
      } catch (e) {
        // Continue if project lookup fails
      }
    }

    // Automatic Risk Assessment:
    // 1. Critical budget changes (>50k or >50% increase)
    // 2. High/Critical task status changes to Blocked
    // 3. Project deletions or budget cuts
    let calculatedIsRisky = isRisky;
    let calculatedRiskLevel = riskLevel;

    if (entityType === 'Budget' && fieldName === 'amount') {
      const oldNum = Number(oldValue) || 0;
      const newNum = Number(newValue) || 0;
      const diff = Math.abs(newNum - oldNum);
      if (diff >= 50000 || (oldNum > 0 && diff / oldNum >= 0.5)) {
        calculatedIsRisky = true;
        calculatedRiskLevel = diff >= 100000 ? 'critical' : 'high';
      }
    } else if (action === 'DELETE') {
      calculatedIsRisky = true;
      calculatedRiskLevel = 'high';
    } else if (action === 'REJECT') {
      calculatedIsRisky = true;
      calculatedRiskLevel = 'medium';
    }

    const entry = new AuditLog({
      timestamp: new Date(),
      userId,
      userName: userName || userEmail?.split('@')[0] || 'System Operator',
      userEmail: userEmail || 'system@auditflow.io',
      userRole: userRole || 'member',
      action,
      entityType,
      entityId: String(entityId),
      entityName: entityName || `${entityType} #${entityId}`,
      projectId: projectId || null,
      projectName: projectName || '',
      fieldName,
      oldValue,
      newValue,
      status: req?.status || (calculatedRiskLevel === 'critical' ? 'WARNING' : 'SUCCESS'),
      criticality: (calculatedRiskLevel || 'low').toUpperCase(),
      reason: reason || '',
      source: source || 'web',
      ipAddress: ip || '127.0.0.1',
      userAgent: userAgent || 'AuditFlow-Client/1.0',
      isRisky: calculatedIsRisky,
      riskLevel: calculatedRiskLevel,
      episodeId: episodeId || null,
      episodeTitle: episodeTitle || null
    });

    await entry.save();
    return entry;
  } catch (error) {
    console.error('Failed to write audit log entry:', error);
    // Audit logging should not crash the main business transaction, but be logged to stderr
    return null;
  }
}

module.exports = logAudit;
