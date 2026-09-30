const express = require('express');
const router = express.Router();
const changeRequestController = require('../controllers/changeRequestController');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /api/change-requests - View change requests
router.get('/', authMiddleware, changeRequestController.getChangeRequests);

// GET /api/change-requests/stats - Metric counts
router.get('/stats', authMiddleware, changeRequestController.getChangeRequestStats);

// POST /api/change-requests - Submit sensitive change request (Developer/Member/Manager/Admin)
router.post('/', authMiddleware, changeRequestController.createChangeRequest);

// PUT /api/change-requests/:id/review - Approve or Reject (Admin or Manager)
router.put('/:id/review', authMiddleware, requireRole('admin', 'manager'), changeRequestController.reviewChangeRequest);

module.exports = router;
