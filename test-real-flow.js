async function testRealAtlasFlow() {
  const API = 'http://localhost:5000/api';
  console.log('Testing Real MongoDB Atlas Flow...');

  async function api(path, method = 'GET', data = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method, headers };
    if (data) opts.body = JSON.stringify(data);
    const res = await fetch(`${API}${path}`, opts);
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`[${res.status}] ${json.error || JSON.stringify(json)}`);
    }
    return json;
  }

  try {
    // 1. Register or Login Admin user
    let adminToken;
    try {
      const adminRes = await api('/auth/register', 'POST', {
        name: 'Dinesh Paur',
        email: 'dinesh@auditflow.internal',
        password: 'SecurePassword123!',
        role: 'admin',
        department: 'Executive Governance'
      });
      console.log('✅ Registered Real Admin User in Atlas:', adminRes.user.name);
      adminToken = adminRes.token;
    } catch (e) {
      const loginRes = await api('/auth/login', 'POST', {
        email: 'dinesh@auditflow.internal',
        password: 'SecurePassword123!'
      });
      console.log('✅ Logged In Real Admin User in Atlas:', loginRes.user.name);
      adminToken = loginRes.token;
    }

    // 2. Register or Login Auditor User
    try {
      const auditorRes = await api('/auth/register', 'POST', {
        name: 'Sarah Connor',
        email: 'sarah.auditor@auditflow.internal',
        password: 'SecurePassword123!',
        role: 'auditor',
        department: 'Global Compliance'
      });
      console.log('✅ Registered Real Auditor User in Atlas:', auditorRes.user.name);
    } catch (e) {
      console.log('ℹ️ Auditor user already registered in Atlas.');
    }

    // 3. Register or Login Project Manager
    let managerUser;
    try {
      const managerRes = await api('/auth/register', 'POST', {
        name: 'Alex Vance',
        email: 'alex.pm@auditflow.internal',
        password: 'SecurePassword123!',
        role: 'manager',
        department: 'Engineering'
      });
      console.log('✅ Registered Real Project Manager in Atlas:', managerRes.user.name);
      managerUser = managerRes.user;
    } catch (e) {
      const loginRes = await api('/auth/login', 'POST', {
        email: 'alex.pm@auditflow.internal',
        password: 'SecurePassword123!'
      });
      console.log('✅ Logged In Real Project Manager:', loginRes.user.name);
      managerUser = loginRes.user;
    }

    // 4. Create a Real Project as Admin
    const projectRes = await api(
      '/projects',
      'POST',
      {
        name: 'Enterprise Cloud Migration 2026',
        code: 'ECM-2026',
        description: 'Multi-region AWS cloud infrastructure upgrade with SOC-2 compliance.',
        budget: 150000,
        category: 'Infrastructure',
        reason: 'Q3 Enterprise Modernization Initiative'
      },
      adminToken
    );
    console.log('✅ Created Real Project:', projectRes.name, 'Budget:', projectRes.budget);

    // 5. Update Project Budget (trigger high criticality audit log)
    const updateRes = await api(
      `/projects/${projectRes._id}`,
      'PUT',
      {
        budget: 185000,
        reason: 'Board-approved expansion for APAC disaster recovery region'
      },
      adminToken
    );
    console.log('✅ Updated Project Budget to:', updateRes.budget);

    // 6. Create a Task under the project
    const taskRes = await api(
      '/tasks',
      'POST',
      {
        title: 'Configure Zero-Trust IAM Policies',
        description: 'Deploy role-based access control and MFA enforcement.',
        projectId: projectRes._id,
        priority: 'High',
        status: 'In Progress',
        assignedTo: managerUser.id,
        dueDate: new Date(Date.now() + 86400000 * 7),
        reason: 'SOC-2 Type II mandatory compliance control'
      },
      adminToken
    );
    console.log('✅ Created Real Task in Atlas:', taskRes.title);

    // 7. Fetch all audit logs
    const auditLogs = await api('/audit-logs/public-recent');
    console.log(`\n🎉 Total Audit Logs Stored in MongoDB Atlas: ${auditLogs.length}`);
    auditLogs.forEach((log, idx) => {
      console.log(`  [${idx + 1}] ${log.timestamp} | ${log.userName} (${log.userRole}) | ${log.action} on ${log.entityType} (${log.entityName || ''}) | ${log.status}`);
    });

  } catch (error) {
    console.error('Flow test error:', error.message);
  }
}

testRealAtlasFlow();
