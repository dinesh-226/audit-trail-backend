const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// POST /api/webhooks/jira - Ingest external Jira Issue event
router.post('/jira', webhookController.ingestJiraWebhook);

// POST /api/webhooks/generic - Generic REST API audit ingestion
router.post('/generic', webhookController.ingestGenericWebhook);

module.exports = router;
