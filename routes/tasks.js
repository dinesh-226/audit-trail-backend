const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /api/tasks - List tasks
router.get('/', authMiddleware, taskController.getAllTasks);

// POST /api/tasks - Create task
router.post('/', authMiddleware, taskController.createTask);

// PUT /api/tasks/:taskId - Update task
router.put('/:taskId', authMiddleware, taskController.updateTask);

// POST /api/tasks/:taskId/comments - Add comment
router.post('/:taskId/comments', authMiddleware, taskController.addComment);

// POST /api/tasks/:taskId/documents - Attach document
router.post('/:taskId/documents', authMiddleware, taskController.addDocument);

// DELETE /api/tasks/:taskId - Delete task (Admin & Manager)
router.delete('/:taskId', authMiddleware, requireRole('admin', 'manager'), taskController.deleteTask);

module.exports = router;
