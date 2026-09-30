const ChangeRequest = require('../models/ChangeRequest');
const Project = require('../models/Project');
const logAudit = require('../utils/auditLogger');

// GET /api/change-requests - List change requests
exports.getChangeRequests = async (req, res) => {
  try {
    const { projectId, status, requestedBy } = req.query;
    const filter = {};

    if (projectId && projectId !== 'all') filter.projectId = projectId;
    if (status && status !== 'all') filter.status = status.toUpperCase();
    if (requestedBy && requestedBy !== 'all') filter.requestedBy = requestedBy;

    // Developers only see requests for projects they are assigned to or requests they submitted
    if (req.user && ['developer', 'member'].includes(req.user.role)) {
      // Find projects where user is a member
      const userProjects = await Project.find({ members: req.user._id }).select('_id');
      const projectIds = userProjects.map(p => p._id);
      
      filter.$or = [
        { requestedBy: req.user._id },
        { projectId: { $in: projectIds } }
      ];
    }

    const requests = await ChangeRequest.find(filter)
      .populate('projectId', 'name code budget status')
      .populate('requestedBy', 'name email role avatar department')
      .populate('reviewedBy', 'name email role avatar')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error('Fetch change requests error:', error);
    res.status(500).json({ error: 'Failed to fetch change requests' });
  }
};

// GET /api/change-requests/stats - Metric counts for dashboard badges
exports.getChangeRequestStats = async (req, res) => {
  try {
    const [pendingCount, approvedCount, rejectedCount, totalCount] = await Promise.all([
      ChangeRequest.countDocuments({ status: 'PENDING' }),
      ChangeRequest.countDocuments({ status: 'APPROVED' }),
      ChangeRequest.countDocuments({ status: 'REJECTED' }),
      ChangeRequest.countDocuments()
    ]);

    res.json({
      pendingCount,
      approvedCount,
      rejectedCount,
      totalCount
    });
  } catch (error) {
    console.error('Change request stats error:', error);
    res.status(500).json({ error: 'Failed to fetch change request stats' });
  }
};

// POST /api/change-requests - Submit a sensitive change request (Developer / Member)
exports.createChangeRequest = async (req, res) => {
  try {
    const {
      projectId,
      changeType = 'BUDGET_INCREASE',
      title,
      fieldName = 'budget',
      oldValue,
      newValue,
      currency = '₹',
      reason
    } = req.body;

    if (!projectId || !title || !reason || newValue === undefined) {
      return res.status(400).json({
        error: 'Project, title, target new value, and justification reason are required.'
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Associated project not found' });
    }

    // Determine current old value if not passed
    const actualOldValue = oldValue !== undefined ? oldValue : (project[fieldName] || project.budget || 0);

    const changeRequest = await ChangeRequest.create({
      projectId: project._id,
      projectName: project.name,
      requestedBy: req.user._id,
      requestedByName: req.user.name,
      requestedByEmail: req.user.email,
      requestedByRole: req.user.role,
      changeType,
      title,
      fieldName,
      oldValue: actualOldValue,
      newValue,
      currency,
      reason,
      status: 'PENDING'
    });

    // Write audit log for Change Request Submission
    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE',
      entityType: 'Approval',
      entityId: changeRequest._id.toString(),
      entityName: `Change Request: ${title}`,
      projectId: project._id,
      projectName: project.name,
      fieldName,
      oldValue: actualOldValue,
      newValue: newValue,
      reason: `Submitted sensitive change request: ${reason}`,
      source: 'web',
      isRisky: true,
      riskLevel: 'medium',
      req
    });

    const populated = await ChangeRequest.findById(changeRequest._id)
      .populate('projectId', 'name code budget')
      .populate('requestedBy', 'name email role department');

    res.status(201).json({
      success: true,
      message: 'Sensitive change request submitted successfully. Awaiting Administrator approval.',
      data: populated
    });
  } catch (error) {
    console.error('Create change request error:', error);
    res.status(500).json({ error: 'Failed to submit change request' });
  }
};

// PUT /api/change-requests/:id/review - Review (Approve / Reject) change request (Admin only)
exports.reviewChangeRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, reviewComment = '' } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(decision?.toUpperCase())) {
      return res.status(400).json({ error: 'Decision must be either APPROVED or REJECTED' });
    }

    const changeRequest = await ChangeRequest.findById(id);
    if (!changeRequest) {
      return res.status(404).json({ error: 'Change request not found' });
    }

    if (changeRequest.status !== 'PENDING') {
      return res.status(400).json({ error: `Change request has already been ${changeRequest.status.toLowerCase()}` });
    }

    // Strict Separation of Duties: Requester cannot approve their own request
    if (String(changeRequest.requestedBy) === String(req.user._id)) {
      return res.status(403).json({
        error: 'Separation of Duties Violation: You cannot approve a sensitive change request that you submitted yourself. Another administrator must review and approve it.'
      });
    }

    const finalDecision = decision.toUpperCase();
    changeRequest.status = finalDecision;
    changeRequest.reviewedBy = req.user._id;
    changeRequest.reviewedByName = req.user.name;
    changeRequest.reviewedByEmail = req.user.email;
    changeRequest.reviewComment = reviewComment;
    changeRequest.reviewedAt = new Date();
    await changeRequest.save();

    const project = await Project.findById(changeRequest.projectId);

    // If APPROVED, apply the change directly to the target project
    if (finalDecision === 'APPROVED' && project) {
      if (changeRequest.fieldName === 'budget' || changeRequest.changeType === 'BUDGET_INCREASE') {
        project.budget = Number(changeRequest.newValue);
        await project.save();
      } else if (changeRequest.fieldName === 'status' || changeRequest.changeType === 'STATUS_OVERRIDE') {
        project.status = String(changeRequest.newValue);
        await project.save();
      }
    }

    // Write comprehensive immutable audit log for the approval/rejection decision
    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: finalDecision === 'APPROVED' ? 'APPROVE' : 'REJECT',
      entityType: 'Approval',
      entityId: changeRequest._id.toString(),
      entityName: `Decision on: ${changeRequest.title}`,
      projectId: changeRequest.projectId,
      projectName: changeRequest.projectName,
      fieldName: changeRequest.fieldName,
      oldValue: changeRequest.oldValue,
      newValue: changeRequest.newValue,
      reason: `Requester: ${changeRequest.requestedByName} (${changeRequest.requestedByEmail}) | Reason: "${changeRequest.reason}" | Approver Note: "${reviewComment || 'Decision finalized'}"`,
      source: 'web',
      isRisky: finalDecision === 'APPROVED',
      riskLevel: finalDecision === 'APPROVED' ? 'high' : 'low',
      req
    });

    const updated = await ChangeRequest.findById(changeRequest._id)
      .populate('projectId', 'name code budget status')
      .populate('requestedBy', 'name email role department')
      .populate('reviewedBy', 'name email role');

    res.json({
      success: true,
      message: `Change request has been successfully ${finalDecision === 'APPROVED' ? 'approved and applied' : 'rejected'}. Audit ledger updated.`,
      data: updated
    });
  } catch (error) {
    console.error('Review change request error:', error);
    res.status(500).json({ error: 'Failed to process change request review' });
  }
};
