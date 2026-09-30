const Project = require('../models/Project');
const logAudit = require('../utils/auditLogger');

// POST /api/webhooks/jira - Ingest external Jira Issue event
exports.ingestJiraWebhook = async (req, res) => {
  try {
    const {
      issueKey = 'PROJ-992',
      summary = 'Updated API rate limits',
      user = 'jira-service-account@atlassian.com',
      userName = 'Jira Automation Cloud',
      action = 'UPDATE',
      projectId,
      field = 'status',
      fromValue = 'In Progress',
      toValue = 'Ready for Staging',
      comment = 'Merged Pull Request #145 from develop branch'
    } = req.body;

    let project = null;
    if (projectId) {
      project = await Project.findById(projectId);
    } else {
      project = await Project.findOne();
    }

    const log = await logAudit({
      userId: null,
      userName: userName,
      userEmail: user,
      userRole: 'system',
      action: action.toUpperCase(),
      entityType: 'Task',
      entityId: issueKey,
      entityName: `Jira Issue: ${issueKey} - ${summary}`,
      projectId: project?._id || null,
      projectName: project?.name || 'External Integration',
      fieldName: field,
      oldValue: fromValue,
      newValue: toValue,
      reason: comment || 'Automated transition via Jira Webhook sync',
      source: 'integration_jira',
      isRisky: false,
      riskLevel: 'low',
      req
    });

    res.json({
      success: true,
      message: 'Jira webhook processed and audit record created',
      auditId: log?._id
    });
  } catch (error) {
    console.error('Jira webhook error:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
};

// POST /api/webhooks/generic - Generic REST API audit ingestion
exports.ingestGenericWebhook = async (req, res) => {
  try {
    const {
      source = 'api',
      actorName = 'External API Service',
      actorEmail = 'api-client@cloud.io',
      action = 'UPDATE',
      entityType = 'Document',
      entityId = 'DOC-900',
      entityName = 'API Ingestion File',
      projectId,
      fieldName = 'state',
      oldValue = 'Pending',
      newValue = 'Verified',
      reason = 'External system verification webhook triggered'
    } = req.body;

    const log = await logAudit({
      userId: null,
      userName: actorName,
      userEmail: actorEmail,
      userRole: 'system',
      action: action.toUpperCase(),
      entityType: entityType,
      entityId: entityId,
      entityName: entityName,
      projectId: projectId || null,
      fieldName,
      oldValue,
      newValue,
      reason,
      source: source || 'api',
      req
    });

    res.json({ success: true, log });
  } catch (error) {
    res.status(500).json({ error: 'Failed to ingest API event' });
  }
};
