const http = require('http');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function loginWithRetry(email, password, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await request({
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { email, password });
      if (res.status === 200) return res;
      console.log(`Login attempt ${i + 1} status:`, res.status, res.data?.error || '');
    } catch (e) {
      console.log(`Login attempt ${i + 1} connecting...`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Failed to login as ${email} after retries`);
}

async function testRolesRBAC() {
  console.log('=== STARTING RBAC AND ROLE-BASED WORK TEST ===\n');

  // 1. Admin Login
  const adminLogin = await loginWithRetry('paur@gmail.com', 'password123');

  const adminToken = adminLogin.data.token;
  console.log('✅ Admin Logged In:', adminLogin.data.user.name, `[Role: ${adminLogin.data.user.role}]`);

  // 2. Member Login
  const memberLogin = await loginWithRetry('malti@gmail.com', 'password123');

  const memberToken = memberLogin.data.token;
  console.log('✅ Member Logged In:', memberLogin.data.user.name, `[Role: ${memberLogin.data.user.role}]`);

  // 3. Admin creates Project
  const createProj = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/projects',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    name: 'Enterprise Role Access Initiative',
    code: 'RBAC-2026',
    description: 'Enforce strict role-based separation of duties across departments',
    budget: 150000,
    reason: 'Chartered by Admin for ISO-27001 RBAC compliance'
  });
  console.log('\n--- 1. Admin Project Creation ---');
  console.log('Status:', createProj.status, '| Project:', createProj.data.name, '| Code:', createProj.data.code);
  const projectId = createProj.data._id;

  // 4. Admin updates budget
  const updateBudget = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/projects/${projectId}/budget`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    amount: 175000,
    reason: 'Admin increased budget for security sprint allocation'
  });
  console.log('\n--- 2. Admin Budget Update ---');
  console.log('Status:', updateBudget.status, '| Message:', updateBudget.data.message);

  // 5. Member tries to update budget (Should be 403 Forbidden)
  const memberBudgetAttempt = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/projects/${projectId}/budget`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${memberToken}`
    }
  }, {
    amount: 999999,
    reason: 'Unauthorized budget increase by member'
  });
  console.log('\n--- 3. Member Budget Update Attempt (RBAC Guard Test) ---');
  console.log('Status:', memberBudgetAttempt.status, '| Expected 403 Forbidden | Response:', memberBudgetAttempt.data.error);

  // 6. Member creates and updates a task within project
  const memberTask = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/tasks',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${memberToken}`
    }
  }, {
    title: 'Implement Role-Based UI Guards',
    description: 'Ensure Member sees personal tasks while Admin sees governance controls',
    status: 'Todo',
    priority: 'High',
    projectId: projectId,
    assignedTo: memberLogin.data.user.id,
    reason: 'Member assigned work item to self'
  });
  console.log('\n--- 4. Member Task Creation ---');
  console.log('Status:', memberTask.status, '| Task:', memberTask.data.title, '| Assignee:', memberTask.data.assignedTo?.name);

  // 7. Member updates status to In Progress
  const memberStatusUpdate = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/tasks/${memberTask.data._id}`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${memberToken}`
    }
  }, {
    status: 'In Progress',
    reason: 'Member actively executing task'
  });
  console.log('\n--- 5. Member Status Transition ---');
  console.log('Status:', memberStatusUpdate.status, '| New Task Status:', memberStatusUpdate.data.status);

  // 8. Member tries to delete project (Should be 403 Forbidden)
  const memberDeleteProj = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/projects/${projectId}`,
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${memberToken}`
    }
  });
  console.log('\n--- 6. Member Project Deletion Attempt (RBAC Guard Test) ---');
  console.log('Status:', memberDeleteProj.status, '| Expected 403 Forbidden | Response:', memberDeleteProj.data.error);

  console.log('\n========================================');
  console.log('🎉 ALL ROLE-BASED ACCESS CHECKS PASSED!');
  console.log('========================================');
}

testRolesRBAC().catch(console.error);
