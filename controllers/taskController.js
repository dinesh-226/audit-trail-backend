const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const logAudit = require('../utils/auditLogger');

// GET /api/tasks?projectId=...&assignedTo=...
exports.getAllTasks = async (req, res) => {
  try {
    const { projectId, assignedTo } = req.query;
    const filter = {};
    if (projectId && projectId !== 'all') filter.projectId = projectId;
    if (assignedTo === 'me' && req.user) {
      filter.assignedTo = req.user._id;
    } else if (assignedTo && assignedTo !== 'all') {
      filter.assignedTo = assignedTo;
    }

    const tasks = await Task.find(filter)
      .populate('projectId', 'name code budget')
      .populate('assignedTo', 'name email role avatar department')
      .populate('createdBy', 'name email')
      .populate('comments.user', 'name email avatar')
      .sort({ updatedAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error('Fetch tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
};

// POST /api/tasks - Create new task (Developer / Member / Admin)
exports.createTask = async (req, res) => {
  try {
    // Auditors have strictly read-only access
    if (req.user.role === 'auditor') {
      return res.status(403).json({ error: 'Auditors have read-only access and cannot create tasks.' });
    }

    const { title, description, status = 'Todo', priority = 'Medium', projectId, assignedTo, dueDate, reason } = req.body;

    if (!title || !projectId) {
      return res.status(400).json({ error: 'Task title and projectId are required' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Associated project not found' });
    }

    const task = await Task.create({
      title,
      description: description || '',
      status,
      priority,
      projectId,
      assignedTo: assignedTo || null,
      createdBy: req.user._id,
      dueDate: dueDate || null
    });

    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE',
      entityType: 'Task',
      entityId: task._id.toString(),
      entityName: task.title,
      projectId: project._id,
      projectName: project.name,
      fieldName: 'status',
      oldValue: null,
      newValue: task.status,
      reason: reason || 'Task created in project backlog',
      source: 'web',
      req
    });

    const populated = await Task.findById(task._id)
      .populate('projectId', 'name code')
      .populate('assignedTo', 'name email role avatar')
      .populate('createdBy', 'name email');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

// PUT /api/tasks/:taskId - Update task status / priority / assignee (Developer / Admin)
exports.updateTask = async (req, res) => {
  try {
    // Auditors have strictly read-only access
    if (req.user.role === 'auditor') {
      return res.status(403).json({ error: 'Auditors have read-only access and cannot edit tasks.' });
    }

    const { taskId } = req.params;
    const { title, description, status, priority, assignedTo, dueDate, reason } = req.body;

    const task = await Task.findById(taskId).populate('assignedTo', 'name email');
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const project = await Project.findById(task.projectId);
    const oldStatus = task.status;
    const oldPriority = task.priority;
    const oldAssignedToName = task.assignedTo?.name || 'Unassigned';

    let fieldChanged = 'details';
    let oldValue = {};
    let newValue = {};

    if (status && status !== task.status) {
      fieldChanged = 'status';
      oldValue.status = oldStatus;
      newValue.status = status;
      task.status = status;
    }

    if (priority && priority !== task.priority) {
      fieldChanged = fieldChanged === 'details' ? 'priority' : `${fieldChanged} & priority`;
      oldValue.priority = oldPriority;
      newValue.priority = priority;
      task.priority = priority;
    }

    if (assignedTo !== undefined) {
      const currentAssigneeId = String(task.assignedTo?._id || task.assignedTo || '');
      const newAssigneeId = String(assignedTo || '');
      if (currentAssigneeId !== newAssigneeId) {
        fieldChanged = fieldChanged === 'details' ? 'assignedTo' : `${fieldChanged} & assignedTo`;
        const newAssigneeUser = assignedTo ? await User.findById(assignedTo).select('name') : null;
        oldValue.assignedTo = oldAssignedToName;
        newValue.assignedTo = newAssigneeUser ? newAssigneeUser.name : 'Unassigned';
      }
      task.assignedTo = assignedTo || null;
    }

    if (title) task.title = title;
    if (description !== undefined) task.description = description;
    if (dueDate !== undefined) task.dueDate = dueDate || null;

    await task.save();

    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE',
      entityType: 'Task',
      entityId: task._id.toString(),
      entityName: task.title,
      projectId: project?._id || task.projectId,
      projectName: project?.name || 'Project',
      fieldName: fieldChanged,
      oldValue: oldValue,
      newValue: newValue,
      reason: reason || `Updated task ${fieldChanged}`,
      source: 'web',
      req
    });

    const updated = await Task.findById(task._id)
      .populate('projectId', 'name code')
      .populate('assignedTo', 'name email role avatar')
      .populate('createdBy', 'name email')
      .populate('comments.user', 'name email avatar');

    res.json(updated);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
};

// POST /api/tasks/:taskId/comments - Add comment to task (Developer / Admin)
exports.addComment = async (req, res) => {
  try {
    if (req.user.role === 'auditor') {
      return res.status(403).json({ error: 'Auditors have read-only access.' });
    }

    const { taskId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const comment = {
      user: req.user._id,
      userName: req.user.name,
      userAvatar: req.user.avatar || '',
      text: text.trim(),
      createdAt: new Date()
    };

    task.comments.push(comment);
    await task.save();

    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE',
      entityType: 'Task',
      entityId: taskId,
      entityName: task.title,
      projectId: task.projectId,
      fieldName: 'comments',
      oldValue: null,
      newValue: text.trim().substring(0, 50) + '...',
      reason: `Comment added by ${req.user.name}: "${text.trim().substring(0, 100)}"`,
      source: 'web',
      req
    });

    const populated = await Task.findById(taskId)
      .populate('projectId', 'name code')
      .populate('assignedTo', 'name email role avatar')
      .populate('createdBy', 'name email')
      .populate('comments.user', 'name email avatar');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to post comment' });
  }
};

// POST /api/tasks/:taskId/documents - Upload document attachment to task
exports.addDocument = async (req, res) => {
  try {
    if (req.user.role === 'auditor') {
      return res.status(403).json({ error: 'Auditors have read-only access.' });
    }

    const { taskId } = req.params;
    const { name, url, size = '500 KB' } = req.body;

    if (!name) return res.status(400).json({ error: 'Document name is required' });

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const doc = {
      name,
      url: url || `https://docs.auditflow.io/tasks/${taskId}/${encodeURIComponent(name)}`,
      size,
      uploadedBy: req.user.name,
      uploadedAt: new Date()
    };

    task.documents.push(doc);
    await task.save();

    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'IMPORT',
      entityType: 'Document',
      entityId: taskId,
      entityName: name,
      projectId: task.projectId,
      fieldName: 'documents',
      oldValue: null,
      newValue: name,
      reason: `Uploaded document to task "${task.title}": ${name}`,
      source: 'web',
      req
    });

    res.status(201).json({ success: true, documents: task.documents });
  } catch (error) {
    console.error('Task add document error:', error);
    res.status(500).json({ error: 'Failed to attach document' });
  }
};

// DELETE /api/tasks/:taskId - Delete task (Admin / Manager only)
exports.deleteTask = async (req, res) => {
  try {
    // Developers cannot delete tasks unless authorized; Auditors cannot delete
    if (['auditor', 'viewer'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized to delete tasks' });
    }

    const { taskId } = req.params;
    const { reason } = req.body || {};

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const project = await Project.findById(task.projectId);
    const taskName = task.title;

    await Task.findByIdAndDelete(taskId);

    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DELETE',
      entityType: 'Task',
      entityId: taskId,
      entityName: taskName,
      projectId: task.projectId,
      projectName: project?.name || '',
      fieldName: null,
      oldValue: { title: task.title, status: task.status },
      newValue: null,
      reason: reason || 'Task removed from project backlog',
      source: 'web',
      req
    });

    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
};
