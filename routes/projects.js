const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /api/projects - List projects (active/archived/all)
router.get('/', authMiddleware, projectController.getAllProjects);

// GET /api/projects/:projectId - Get single project details
router.get('/:projectId', authMiddleware, projectController.getProjectById);

// POST /api/projects - Create new project (Admin only)
router.post('/', authMiddleware, requireRole('admin', 'manager'), projectController.createProject);

// PUT /api/projects/:projectId - Update project metadata (Admin & Manager)
router.put('/:projectId', authMiddleware, requireRole('admin', 'manager'), projectController.updateProject);

// PUT /api/projects/:projectId/archive - Archive project (Admin only)
router.put('/:projectId/archive', authMiddleware, requireRole('admin'), projectController.archiveProject);

// PUT /api/projects/:projectId/unarchive - Restore project from archive (Admin only)
router.put('/:projectId/unarchive', authMiddleware, requireRole('admin'), projectController.unarchiveProject);

// PUT /api/projects/:projectId/budget - Update budget directly (Admin only)
router.put('/:projectId/budget', authMiddleware, requireRole('admin'), projectController.updateBudget);

// POST /api/projects/:projectId/members - Assign member/developer (Admin only)
router.post('/:projectId/members', authMiddleware, requireRole('admin', 'manager'), projectController.addMember);

// DELETE /api/projects/:projectId/members/:userId - Remove member (Admin only)
router.delete('/:projectId/members/:userId', authMiddleware, requireRole('admin', 'manager'), projectController.removeMember);

// POST /api/projects/:projectId/documents - Upload/Attach document (Developer & Admin)
router.post('/:projectId/documents', authMiddleware, projectController.addDocument);

// DELETE /api/projects/:projectId - Permanent removal (Restricted Admin only)
router.delete('/:projectId', authMiddleware, requireRole('admin'), projectController.deleteProject);

module.exports = router;
