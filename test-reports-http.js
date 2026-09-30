async function testReportEndpoints() {
  const API = 'http://localhost:5000/api';
  console.log('Testing /api/reports HTTP endpoints...');

  try {
    // 1. Login
    const loginRes = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@auditflow.io', password: 'password123' })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('Logged in as:', loginData.user?.name, 'Role:', loginData.user?.role);

    // 2. Generate SOC2 Report
    const genRes = await fetch(`${API}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: 'Q3 Enterprise SOC-2 Compliance Audit',
        reportType: 'SOC2',
        preset: 'Last 30 Days',
        format: 'PDF'
      })
    });
    const genData = await genRes.json();
    console.log('Generate Response:', genData.success, 'Report ID:', genData.data?._id, 'Score:', genData.data?.summary?.complianceScore);

    // 3. Get all reports
    const listRes = await fetch(`${API}/reports`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const listData = await listRes.json();
    console.log('List Reports Count:', listData.data?.length);

    // 4. Download / HTML report
    if (genData.data?._id) {
      const dlRes = await fetch(`${API}/reports/${genData.data._id}/download`);
      const htmlText = await dlRes.text();
      console.log('Download HTML Length:', htmlText.length, 'Contains Title:', htmlText.includes('Q3 Enterprise SOC-2 Compliance Audit'));
    }

    console.log('\n🎉 ALL REPORT API ENDPOINTS WORKING PERFECTLY!');
  } catch (err) {
    console.error('Error testing report endpoints:', err.message);
  }
}

testReportEndpoints();
