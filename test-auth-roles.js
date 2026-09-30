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
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function testRoles() {
  console.log('🧪 Testing Multi-Role Registration & Login...\n');

  // Test 1: Register as Administrator
  const adminEmail = `admin_${Date.now()}@test.io`;
  const adminRes = await request('/auth/register', { method: 'POST' }, {
    name: 'Sarah Connor',
    email: adminEmail,
    password: 'password123',
    role: 'admin',
    department: 'Enterprise Security'
  });
  console.log('1. Admin Registration:', adminRes.status === 201 && adminRes.body.user.role === 'admin' ? '✅ PASS' : '❌ FAIL');

  // Test 2: Register as Team Member
  const memberEmail = `member_${Date.now()}@test.io`;
  const memberRes = await request('/auth/register', { method: 'POST' }, {
    name: 'David Miller',
    email: memberEmail,
    password: 'password123',
    role: 'member',
    department: 'Frontend Engineering'
  });
  console.log('2. Member Registration:', memberRes.status === 201 && memberRes.body.user.role === 'member' ? '✅ PASS' : '❌ FAIL');

  // Test 3: Register as Auditor
  const auditorEmail = `auditor_${Date.now()}@test.io`;
  const auditorRes = await request('/auth/register', { method: 'POST' }, {
    name: 'Elena Rostova',
    email: auditorEmail,
    password: 'password123',
    role: 'auditor',
    department: 'Regulatory Compliance'
  });
  console.log('3. Auditor Registration:', auditorRes.status === 201 && auditorRes.body.user.role === 'auditor' ? '✅ PASS' : '❌ FAIL');

  // Test 4: Login with newly created Auditor
  const loginRes = await request('/auth/login', { method: 'POST' }, {
    email: auditorEmail,
    password: 'password123'
  });
  console.log('4. Auditor Login:', loginRes.status === 200 && loginRes.body.user.role === 'auditor' ? '✅ PASS' : '❌ FAIL');

  console.log('\n🎉 Multi-Role Auth Verification Complete!');
}

testRoles().catch(console.error);
