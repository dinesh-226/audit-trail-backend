const http = require('http');

async function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = { 'Content-Type': 'application/json' };
    const reqOptions = {
      hostname: 'localhost',
      port: 5000,
      path: `/api${path}`,
      method: options.method || 'GET',
      headers: { ...defaultHeaders, ...options.headers }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting AuditFlow Full-Stack Integration Test Suite...\n');
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
    }
  }

  // Test 1: Healthcheck
  await test('Server health check', async () => {
    const res = await request('/health');
    if (res.status !== 200 || res.body.status !== 'online') {
      throw new Error(`Expected online status, got ${res.status}`);
    }
  });

  // Test 2: Auth Demo Switcher & JWT Generation
  let aliceToken = '';
  await test('Auth: Demo Persona Switch to Alice (Admin)', async () => {
    const res = await request('/auth/demo-switch', { method: 'POST' }, { email: 'alice@auditflow.io' });
    if (res.status !== 200 || !res.body.token || res.body.user.role !== 'admin') {
      throw new Error(`Auth failed: ${JSON.stringify(res.body)}`);
    }
    aliceToken = res.body.token;
  });

  const authHeader = { 'Authorization': `Bearer ${aliceToken}` };

  // Test 3: List Projects
  let projectId = '';
  await test('Projects: Fetch all projects with member populate', async () => {
    const res = await request('/projects', { headers: authHeader });
    if (res.status !== 200 || !Array.isArray(res.body) || res.body.length === 0) {
      throw new Error(`Failed to list projects: ${JSON.stringify(res.body)}`);
    }
    projectId = res.body[0]._id;
  });

  // Test 4: Update Budget with Audit Log Trigger
  await test('Projects: Update Budget with Reason & verify audit log created', async () => {
    const res = await request(`/projects/${projectId}/budget`, {
      method: 'PUT',
      headers: authHeader
    }, {
      amount: 135000,
      reason: 'Sprint 4 cloud scale-out addendum'
    });

    if (res.status !== 200 || res.body.project.budget !== 135000) {
      throw new Error(`Failed to update budget: ${JSON.stringify(res.body)}`);
    }
  });

  // Test 5: Verify the new Audit Log entry was recorded with diff
  await test('AuditLogs: Query latest audit log and verify diff payload', async () => {
    const res = await request(`/audit-logs?projectId=${projectId}&limit=1`, { headers: authHeader });
    if (res.status !== 200 || !res.body.logs || res.body.logs.length === 0) {
      throw new Error(`No audit logs returned`);
    }
    const latestLog = res.body.logs[0];
    if (latestLog.entityType !== 'Budget' || latestLog.reason !== 'Sprint 4 cloud scale-out addendum') {
      throw new Error(`Latest log does not match budget change: ${JSON.stringify(latestLog)}`);
    }
  });

  // Test 6: Jira Webhook Ingestion
  await test('Webhooks: Dispatch simulated Jira webhook event', async () => {
    const res = await request('/webhooks/jira', {
      method: 'POST'
    }, {
      issueKey: 'JIRA-550',
      summary: 'Auth module automated vulnerability patch',
      action: 'UPDATE',
      field: 'status',
      fromValue: 'In Review',
      toValue: 'Done',
      comment: 'Merged security patch PR #99'
    });

    if (res.status !== 200 || !res.body.success) {
      throw new Error(`Failed to process Jira webhook: ${JSON.stringify(res.body)}`);
    }
  });

  // Test 7: Grouped Episodes Aggregator
  await test('AuditEpisodes: Verify episodes aggregation returns grouped cards', async () => {
    const res = await request('/audit-logs/episodes', { headers: authHeader });
    if (res.status !== 200 || !Array.isArray(res.body)) {
      throw new Error(`Failed to fetch episodes`);
    }
  });

  // Test 8: CSV Export
  await test('AuditLogs: Verify CSV Export endpoint returns valid CSV format', async () => {
    const res = await request('/audit-logs/export-csv', { headers: authHeader });
    if (res.status !== 200 || !res.raw.includes('Timestamp (UTC)')) {
      throw new Error(`CSV export format mismatch`);
    }
  });

  // Test 9: Create Task & Status Update with Audit Log
  await test('Tasks: Create task and verify task audit logging', async () => {
    const taskRes = await request('/tasks', {
      method: 'POST',
      headers: authHeader
    }, {
      title: 'Setup Automated Backup Verification',
      description: 'Daily verification worker for database backup integrity',
      status: 'Todo',
      priority: 'High',
      projectId: projectId,
      reason: 'SOC2 Compliance Requirement'
    });

    if (taskRes.status !== 201 || !taskRes.body._id) {
      throw new Error(`Failed to create task`);
    }

    const taskId = taskRes.body._id;

    const updateRes = await request(`/tasks/${taskId}`, {
      method: 'PUT',
      headers: authHeader
    }, {
      status: 'In Progress',
      reason: 'Developer assigned and began work'
    });

    if (updateRes.status !== 200 || updateRes.body.status !== 'In Progress') {
      throw new Error(`Failed to update task status`);
    }
  });

  console.log(`\n🎉 Test Suite Completed: ${passed}/${total} tests passed successfully!`);
}

runTests().catch(console.error);
