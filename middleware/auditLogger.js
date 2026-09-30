const logAudit = require('../utils/auditLogger');

/**
 * Compatibility wrapper for recordAuditLog & middleware
 */
async function recordAuditLog(options = {}) {
  const { req, action, actionCategory, entity = {}, details = '', severity = 'LOW', status = 'SUCCESS' } = options;

  return await logAudit({
    userId: req?.user?._id || null,
    userEmail: req?.user?.email || 'compliance@auditflow.io',
    userName: req?.user?.name || 'System Auditor',
    userRole: req?.user?.role || 'auditor',
    action: action || 'CREATE',
    entityType: entity.type || 'Report',
    entityId: entity.id || 'SYS-REP-01',
    entityName: entity.name || details || 'System Report',
    reason: details || `${actionCategory || 'SYSTEM'} event`,
    riskLevel: (severity || 'LOW').toLowerCase(),
    isRisky: severity === 'CRITICAL' || severity === 'HIGH',
    req
  });
}

module.exports = {
  recordAuditLog,
  logAudit
};
