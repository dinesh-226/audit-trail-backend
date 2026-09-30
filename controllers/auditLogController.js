const AuditLog = require('../models/AuditLog');

// GET /api/audit-logs - Multi-facet query and filtering (PDF Section 4.4)
exports.getAuditLogs = async (req, res) => {
  try {
    const {
      projectId,
      from,
      to,
      userId,
      action,
      entityType,
      source,
      isRisky,
      search,
      page = 1,
      limit = 50,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    // 1. Filter by Project
    if (projectId && projectId !== 'all') {
      query.projectId = projectId;
    }

    // 2. Filter by Date Range
    if (from || to) {
      query.timestamp = {};
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate)) query.timestamp.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate)) {
          // If date string has no time, include the full end of that day
          if (to.length === 10) toDate.setHours(23, 59, 59, 999);
          query.timestamp.$lte = toDate;
        }
      }
      if (Object.keys(query.timestamp).length === 0) {
        delete query.timestamp;
      }
    }

    // 3. Filter by User
    if (userId && userId !== 'all') {
      query.userId = userId;
    }

    // 4. Filter by Action
    if (action && action !== 'all') {
      query.action = action.toUpperCase();
    }

    // 5. Filter by Entity Type
    if (entityType && entityType !== 'all') {
      query.entityType = entityType;
    }

    // 6. Filter by Source
    if (source && source !== 'all') {
      query.source = source;
    }

    // 7. Filter by Risk flag
    if (isRisky === 'true' || isRisky === true) {
      query.isRisky = true;
    }

    // 8. Keyword Search
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { reason: regex },
        { entityName: regex },
        { userName: regex },
        { userEmail: regex },
        { fieldName: regex },
        { projectName: regex },
        { action: regex },
        { entityType: regex }
      ];
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .populate('userId', 'name email role department avatar')
        .populate('projectId', 'name code'),
      AuditLog.countDocuments(query)
    ]);

    res.json({
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error) {
    console.error('Audit logs query error:', error);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
};

// GET /api/audit-logs/stats - Aggregate metrics for dashboards and auditor badges
exports.getAuditStats = async (req, res) => {
  try {
    const { projectId } = req.query;
    const filter = {};
    if (projectId && projectId !== 'all') filter.projectId = projectId;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      total,
      todayCount,
      weekCount,
      riskyCount,
      actionBreakdown,
      entityBreakdown,
      sourceBreakdown
    ] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.countDocuments({ ...filter, timestamp: { $gte: oneDayAgo } }),
      AuditLog.countDocuments({ ...filter, timestamp: { $gte: sevenDaysAgo } }),
      AuditLog.countDocuments({ ...filter, isRisky: true }),
      AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: '$action', count: { $sum: 1 } } }
      ]),
      AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: '$entityType', count: { $sum: 1 } } }
      ]),
      AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: '$source', count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      total,
      todayCount,
      weekCount,
      riskyCount,
      actionBreakdown: actionBreakdown.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
      entityBreakdown: entityBreakdown.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
      sourceBreakdown: sourceBreakdown.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {})
    });
  } catch (error) {
    console.error('Stats aggregation error:', error);
    res.status(500).json({ error: 'Failed to calculate audit statistics' });
  }
};

// GET /api/audit-logs/episodes - Group related logs into story episodes
exports.getEpisodes = async (req, res) => {
  try {
    const { projectId } = req.query;
    const filter = {};
    if (projectId && projectId !== 'all') filter.projectId = projectId;

    const logs = await AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .populate('userId', 'name email role avatar');

    // Group logs by episodeId if set, or by day/entity clusters
    const episodeMap = new Map();

    logs.forEach((log) => {
      let epKey = log.episodeId;
      let epTitle = log.episodeTitle;

      if (!epKey) {
        // Group by Date (YYYY-MM-DD) + Project/Entity
        const dateStr = new Date(log.timestamp).toISOString().split('T')[0];
        epKey = `day_${dateStr}_${log.projectId || 'global'}`;
        epTitle = `${log.projectName || 'System'} Activity (${dateStr})`;
      }

      if (!episodeMap.has(epKey)) {
        episodeMap.set(epKey, {
          episodeId: epKey,
          title: epTitle,
          projectName: log.projectName,
          projectId: log.projectId,
          startTime: log.timestamp,
          endTime: log.timestamp,
          isRisky: log.isRisky,
          events: []
        });
      }

      const ep = episodeMap.get(epKey);
      ep.events.push(log);
      if (log.isRisky) ep.isRisky = true;
      if (new Date(log.timestamp) > new Date(ep.endTime)) ep.endTime = log.timestamp;
      if (new Date(log.timestamp) < new Date(ep.startTime)) ep.startTime = log.timestamp;
    });

    const episodes = Array.from(episodeMap.values()).map(ep => ({
      ...ep,
      eventCount: ep.events.length,
      primaryActor: ep.events[0]?.userName || 'System'
    }));

    res.json(episodes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to aggregate episodes' });
  }
};

// GET /api/audit-logs/export-csv - Generate CSV export
exports.exportCsv = async (req, res) => {
  try {
    const { projectId, from, to, action, entityType, search } = req.query;
    const query = {};

    if (projectId && projectId !== 'all') query.projectId = projectId;
    if (action && action !== 'all') query.action = action.toUpperCase();
    if (entityType && entityType !== 'all') query.entityType = entityType;
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        if (to.length === 10) toDate.setHours(23, 59, 59, 999);
        query.timestamp.$lte = toDate;
      }
    }
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ reason: regex }, { entityName: regex }, { userName: regex }];
    }

    const logs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(1000);

    // Build CSV Content
    const headers = [
      'Timestamp (UTC)',
      'User Name',
      'User Email',
      'User Role',
      'Action',
      'Entity Type',
      'Entity Name / ID',
      'Project',
      'Field Changed',
      'Old Value',
      'New Value',
      'Reason / Justification',
      'Source',
      'IP Address',
      'Is Risky'
    ];

    const formatCsvField = (val) => {
      if (val === null || val === undefined) return '""';
      if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      return `"${String(val).replace(/"/g, '""')}"`;
    };

    const rows = logs.map(l => [
      formatCsvField(new Date(l.timestamp).toISOString()),
      formatCsvField(l.userName),
      formatCsvField(l.userEmail),
      formatCsvField(l.userRole),
      formatCsvField(l.action),
      formatCsvField(l.entityType),
      formatCsvField(l.entityName || l.entityId),
      formatCsvField(l.projectName),
      formatCsvField(l.fieldName || 'N/A'),
      formatCsvField(l.oldValue),
      formatCsvField(l.newValue),
      formatCsvField(l.reason || 'N/A'),
      formatCsvField(l.source),
      formatCsvField(l.ipAddress),
      formatCsvField(l.isRisky ? 'YES' : 'NO')
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit_trail_report_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('CSV Export error:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
};

// GET /api/audit-logs/public-recent
exports.getPublicRecentLogs = async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .sort({ timestamp: -1 })
      .limit(6)
      .select('timestamp userName userRole action entityType entityName fieldName oldValue newValue reason source isRisky');
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recent audit logs' });
  }
};

// GET /api/audit-logs/public-stats
exports.getPublicStats = async (req, res) => {
  try {
    const [total, riskyCount] = await Promise.all([
      AuditLog.countDocuments(),
      AuditLog.countDocuments({ isRisky: true })
    ]);
    res.json({ total, riskyCount });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate stats' });
  }
};
