const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const logAudit = require('../utils/auditLogger');

// GET /api/projects - List projects with status and role filtering
exports.getAllProjects = async (req, res) => {
  try {
    const { status = 'all', assignedTo } = req.query;
    const filter = {};

    if (status === 'active') {
      filter.status = { $ne: 'Archived' };
    } else if (status === 'archived') {
      filter.status = 'Archived';
    } else if (status && status !== 'all') {
      filter.status = status;
    }

    if (assignedTo === 'me' && req.user) {
      filter.members = req.user._id;
    } else if (assignedTo && assignedTo !== 'all') {
      filter.members = assignedTo;
    }

    const projects = await Project.find(filter)
      .populate('members', 'name email role department avatar')
      .populate('createdBy', 'name email')
      .populate('archivedBy', 'name email')
      .sort({ updatedAt: -1 });

    // Attach task count and metrics
    const projectList = await Promise.all(
      projects.map(async (p) => {
        const totalTasks = await Task.countDocuments({ projectId: p._id });
        const completedTasks = await Task.countDocuments({ projectId: p._id, status: 'Done' });
        return {
          ...p.toObject(),
          totalTasks,
          completedTasks
        };
      })
    );

    res.json(projectList);
  } catch (error) {
    console.error('Fetch projects error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

// GET /api/projects/:projectId - Get single project details
exports.getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId)
      .populate('members', 'name email role department avatar')
      .populate('createdBy', 'name email')
      .populate('archivedBy', 'name email');

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const totalTasks = await Task.countDocuments({ projectId: project._id });
    const completedTasks = await Task.countDocuments({ projectId: project._id, status: 'Done' });

    res.json({
      ...project.toObject(),
      totalTasks,
      completedTasks
    });
  } catch (error) {
    console.error('Fetch project detail error:', error);
    res.status(500).json({ error: 'Failed to fetch project details' });
  }
};

// POST /api/projects - Create new project (Admin / Manager)
exports.createProject = async (req, res) => {
  try {
    const { name, code, description, budget, category, members = [], reason } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const project = await Project.create({
      name,
      code: code || undefined,
      description: description || '',
      budget: Number(budget) || 0,
      category: category || 'Software Development',
      members: members.length > 0 ? members : [req.user._id],
      createdBy: req.user._id,
      status: 'Active'
    });

    // Write Audit Log
    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE',
      entityType: 'Project',
      entityId: project._id.toString(),
      entityName: project.name,
      projectId: project._id,
      projectName: project.name,
      fieldName: null,
      oldValue: null,
      newValue: {
        name: project.name,
        code: project.code,
        budget: project.budget,
        category: project.category
      },
      reason: reason || 'Project creation in workspace',
      source: 'web',
      req
    });

    const populated = await Project.findById(project._id)
      .populate('members', 'name email role department avatar')
      .populate('createdBy', 'name email');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
};

// PUT /api/projects/:projectId - Update project metadata (Admin / Manager)
exports.updateProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, description, category, status, reason } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const oldData = {
      name: project.name,
      description: project.description,
      status: project.status,
      category: project.category
    };

    if (name) project.name = name;
    if (description !== undefined) project.description = description;
    if (category) project.category = category;
    if (status) project.status = status;

    await project.save();

    const newData = {
      name: project.name,
      description: project.description,
      status: project.status,
      category: project.category
    };

    // Audit Log for project update
    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE',
      entityType: 'Project',
      entityId: project._id.toString(),
      entityName: project.name,
      projectId: project._id,
      projectName: project.name,
      fieldName: 'general_info',
      oldValue: oldData,
      newValue: newData,
      reason: reason || 'Project metadata modified',
      source: 'web',
      req
    });

    const updated = await Project.findById(project._id)
      .populate('members', 'name email role department avatar')
      .populate('createdBy', 'name email');

    res.json(updated);
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
};

// PUT /api/projects/:projectId/archive - Archive project (Admin only)
exports.archiveProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { reason } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.status === 'Archived') {
      return res.status(400).json({ error: 'Project is already archived' });
    }

    const previousStatus = project.status;
    project.status = 'Archived';
    project.archivedAt = new Date();
    project.archivedBy = req.user._id;
    project.archiveReason = reason || 'Project archived by administrator';
    await project.save();

    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE',
      entityType: 'Project',
      entityId: project._id.toString(),
      entityName: project.name,
      projectId: project._id,
      projectName: project.name,
      fieldName: 'status',
      oldValue: previousStatus,
      newValue: 'Archived',
      reason: reason || 'Project moved to archive vault; all tasks & audit history preserved.',
      source: 'web',
      isRisky: true,
      riskLevel: 'medium',
      req
    });

    const updated = await Project.findById(project._id)
      .populate('members', 'name email role department avatar')
      .populate('createdBy', 'name email')
      .populate('archivedBy', 'name email');

    res.json({
      success: true,
      message: 'Project successfully archived. All tasks and audit history remain accessible.',
      data: updated
    });
  } catch (error) {
    console.error('Archive project error:', error);
    res.status(500).json({ error: 'Failed to archive project' });
  }
};

// PUT /api/projects/:projectId/unarchive - Unarchive / Restore project (Admin only)
exports.unarchiveProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { reason } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    project.status = 'Active';
    project.archivedAt = null;
    project.archivedBy = null;
    project.archiveReason = '';
    await project.save();

    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE',
      entityType: 'Project',
      entityId: project._id.toString(),
      entityName: project.name,
      projectId: project._id,
      projectName: project.name,
      fieldName: 'status',
      oldValue: 'Archived',
      newValue: 'Active',
      reason: reason || 'Project restored from archive to active backlog',
      source: 'web',
      req
    });

    const updated = await Project.findById(project._id)
      .populate('members', 'name email role department avatar')
      .populate('createdBy', 'name email');

    res.json({
      success: true,
      message: 'Project restored to active state.',
      data: updated
    });
  } catch (error) {
    console.error('Unarchive project error:', error);
    res.status(500).json({ error: 'Failed to unarchive project' });
  }
};

// PUT /api/projects/:projectId/budget - Direct budget update (Admin only)
exports.updateBudget = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { amount, reason } = req.body;
    const user = req.user;

    if (amount === undefined || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'Valid numeric budget amount is required' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const oldAmount = project.budget;
    const newAmount = Number(amount);

    project.budget = newAmount;
    await project.save();

    // Log Audit Entry
    await logAudit({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      action: 'UPDATE',
      entityType: 'Budget',
      entityId: projectId,
      entityName: `${project.name} Budget`,
      projectId: project._id,
      projectName: project.name,
      fieldName: 'amount',
      oldValue: oldAmount,
      newValue: newAmount,
      reason: reason || 'Direct budget allocation adjustment by administrator',
      source: 'web',
      req
    });

    res.json({
      success: true,
      message: 'Budget updated and audit log recorded successfully',
      project: {
        _id: project._id,
        name: project.name,
        budget: project.budget
      }
    });
  } catch (error) {
    console.error('Update budget error:', error);
    res.status(500).json({ error: 'Failed to update budget' });
  }
};

// POST /api/projects/:projectId/members - Add member / Assign developer (Admin only)
exports.addMember = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { userId, reason } = req.body;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (project.members.includes(userId)) {
      return res.status(400).json({ error: 'User is already assigned to this project' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ error: 'Target user not found' });

    project.members.push(userId);
    await project.save();

    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE',
      entityType: 'Member',
      entityId: userId,
      entityName: `${targetUser.name} (${targetUser.role})`,
      projectId: project._id,
      projectName: project.name,
      fieldName: 'members',
      oldValue: 'Not Assigned',
      newValue: `Assigned as ${targetUser.role}`,
      reason: reason || `Assigned ${targetUser.name} to project team`,
      source: 'web',
      req
    });

    const updated = await Project.findById(projectId).populate('members', 'name email role department avatar');
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add member' });
  }
};

// DELETE /api/projects/:projectId/members/:userId - Remove member from project (Admin only)
exports.removeMember = async (req, res) => {
  try {
    const { projectId, userId } = req.params;
    const { reason } = req.body || {};

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const targetUser = await User.findById(userId);
    const targetUserName = targetUser?.name || 'Team Member';

    project.members = project.members.filter(m => String(m) !== String(userId));
    await project.save();

    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE',
      entityType: 'Member',
      entityId: userId,
      entityName: `${targetUserName}`,
      projectId: project._id,
      projectName: project.name,
      fieldName: 'members',
      oldValue: `Assigned Member`,
      newValue: 'Removed from Project',
      reason: reason || `Removed ${targetUserName} from project team`,
      source: 'web',
      req
    });

    const updated = await Project.findById(projectId).populate('members', 'name email role department avatar');
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

// POST /api/projects/:projectId/documents - Upload / Attach document to project (Developer / Admin)
exports.addDocument = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, url, size = '1.5 MB', category = 'Specification', reason } = req.body;

    if (!name) return res.status(400).json({ error: 'Document name is required' });

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const doc = {
      name,
      url: url || `https://docs.auditflow.io/${project.code}/${encodeURIComponent(name)}`,
      size,
      category,
      uploadedBy: req.user.name,
      uploadedAt: new Date()
    };

    project.documents.push(doc);
    await project.save();

    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'IMPORT',
      entityType: 'Document',
      entityId: project._id.toString(),
      entityName: name,
      projectId: project._id,
      projectName: project.name,
      fieldName: 'documents',
      oldValue: null,
      newValue: name,
      reason: reason || `Uploaded project document: ${name} (${category})`,
      source: 'web',
      req
    });

    res.status(201).json({ success: true, documents: project.documents });
  } catch (error) {
    console.error('Add document error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

// DELETE /api/projects/:projectId - Permanent removal (Restricted Admin only; Archive is recommended)
exports.deleteProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { reason } = req.body || {};

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const deletedProjectData = {
      name: project.name,
      code: project.code,
      budget: project.budget,
      status: project.status
    };

    await Project.findByIdAndDelete(projectId);
    await Task.deleteMany({ projectId });

    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DELETE',
      entityType: 'Project',
      entityId: projectId,
      entityName: project.name,
      projectId: null,
      projectName: project.name,
      fieldName: null,
      oldValue: deletedProjectData,
      newValue: null,
      reason: reason || 'CRITICAL: Project permanently purged by administrator',
      source: 'web',
      isRisky: true,
      riskLevel: 'critical',
      req
    });

    res.json({ success: true, message: 'Project permanently removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
};
