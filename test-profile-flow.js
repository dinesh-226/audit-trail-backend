async function testProfileApi() {
  const API = 'http://localhost:5000/api';
  console.log('Testing Profile API & MongoDB Atlas Auditing...');

  try {
    // 1. Login Admin
    const loginRes = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dinesh@auditflow.internal',
        password: 'SecurePassword123!'
      })
    });
    const loginData = await loginRes.json();
    console.log('✅ Logged In:', loginData.user.name);
    const token = loginData.token;

    // 2. Update Profile
    const updateRes = await fetch(`${API}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Dinesh Paur (Chief Auditor)',
        department: 'Global Governance & Compliance',
        reason: 'Title update following executive promotion'
      })
    });
    const updateData = await updateRes.json();
    console.log('✅ Updated Profile in Atlas:', updateData.user.name, '|', updateData.user.department);

    // 3. Fetch My Activity
    const activityRes = await fetch(`${API}/auth/my-activity`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const activityData = await activityRes.json();
    console.log(`✅ Fetched Personal Activity from Atlas: ${activityData.length} records`);
    console.log('Latest Action:', activityData[0]?.action, 'on', activityData[0]?.entityType, '| Reason:', activityData[0]?.reason);

  } catch (err) {
    console.error('Profile test error:', err.message);
  }
}

testProfileApi();
