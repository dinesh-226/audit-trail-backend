const express = require('express');
const router = express.Router();
const { processAuditQuery } = require('../services/aiAssistantEngine');
const { requireAuth } = require('../middleware/auth');

// AI Maritime Audit Assistant Query Endpoint
router.post('/query', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Query prompt is required' });
    }

    const response = await processAuditQuery(prompt, req.user);
    res.json(response);
  } catch (error) {
    console.error('Error in AI Assistant query:', error);
    res.status(500).json({
      answer: 'An error occurred while analyzing the maritime ledger.',
      relevantAudits: [],
      insights: ['Please verify database connectivity and retry your query.'],
      suggestedFollowUps: ['Show me the history of container C102', 'Verify audit trail integrity']
    });
  }
});

module.exports = router;
