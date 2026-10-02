const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const { requireAuth } = require('../middleware/auth');

// List Alerts
router.get('/', async (req, res) => {
  try {
    const { severity, category, isRead, limit = 50 } = req.query;
    const query = {};
    if (severity) query.severity = severity;
    if (category) query.category = category;
    if (isRead !== undefined) query.isRead = isRead === 'true';

    const alerts = await Alert.find(query).sort({ createdAt: -1 }).limit(Number(limit));
    const unreadCount = await Alert.countDocuments({ isRead: false });

    res.json({
      unreadCount,
      alerts
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve alerts' });
  }
});

// Mark all alerts as read
const handleMarkAllRead = async (req, res) => {
  try {
    await Alert.updateMany({ isRead: false }, { isRead: true });
    res.json({ message: 'All alerts marked as read', unreadCount: 0 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all alerts as read' });
  }
};
router.patch('/mark-all-read', handleMarkAllRead);
router.post('/mark-all-read', handleMarkAllRead);

// Mark single alert as read
const handleMarkSingleRead = async (req, res) => {
  try {
    const alertIdParam = req.params.alertId;
    const query = {
      $or: [
        { alertId: alertIdParam },
        ...(alertIdParam.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: alertIdParam }] : [])
      ]
    };
    const alert = await Alert.findOneAndUpdate(
      query,
      { isRead: true },
      { new: true }
    );
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update alert' });
  }
};
router.patch('/:alertId/read', handleMarkSingleRead);
router.post('/:alertId/read', handleMarkSingleRead);

// Create / Raise Alert Issue
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, message, severity = 'medium', category = 'general', entityType = 'Container', entityId, metadata } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const alertId = `ALT-${Date.now()}`;
    const alert = new Alert({
      alertId,
      title,
      message,
      severity,
      category,
      entityType,
      entityId: entityId || null,
      metadata: {
        ...metadata,
        raisedBy: req.user.name,
        userRole: req.user.role
      }
    });

    await alert.save();
    res.status(201).json(alert);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create alert issue' });
  }
});

module.exports = router;
