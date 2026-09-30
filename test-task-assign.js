async function testTaskAssignmentFlow() {
  const API = 'http://localhost:5000/api';
  console.log('Testing Task Assignment & Member Visibility Flow...');

  try {
    // 1. Admin login
    const adminLogin = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dinesh@auditflow.internal', password: 'SecurePassword123!' })
    });
    const adminData = await adminLogin.json();
    console.log('✅ Admin Logged In:', adminData.user.name);

    // 2. Member login
    const memberLogin = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alex.pm@auditflow.internal', password: 'SecurePassword123!' })
    });
    const memberData = await memberLogin.json();
    console.log('✅ Member Logged In:', memberData.user.name, 'ID:', memberData.user.id);

    // 3. Get first project
    const projRes = await fetch(`${API}/projects`, {
      headers: { 'Authorization': `Bearer ${adminData.token}` }
    });
    const projects = await projRes.json();
    const targetProj = projects[0];
    console.log('✅ Target Project:', targetProj.name);

    // 4. Admin creates task and assigns to Member
    const createTaskRes = await fetch(`${API}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminData.token}`
      },
      body: JSON.stringify({
        title: 'Review SOC-2 Access Control Policy Implementation',
        description: 'Verify role-based access rules and ensure least-privilege enforcement across cloud microservices.',
        status: 'Todo',
        priority: 'High',
        projectId: targetProj._id,
        assignedTo: memberData.user.id,
        reason: 'Assigned to engineering team lead for compliance verification'
      })
    });
    const task = await createTaskRes.json();
    console.log('✅ Admin Assigned Task to Member:', task.title, '| Assignee:', task.assignedTo?.name);

    // 5. Member fetches their assigned tasks
    const memberTasksRes = await fetch(`${API}/tasks?assignedTo=me`, {
      headers: { 'Authorization': `Bearer ${memberData.token}` }
    });
    const memberTasks = await memberTasksRes.json();
    console.log(`✅ Member Fetched Assigned Tasks (${memberTasks.length} tasks found):`);
    memberTasks.forEach(t => {
      console.log(`   - [${t.status}] ${t.title} (Project: ${t.projectId?.name || 'Project'}) -> Assigned: ${t.assignedTo?.name}`);
    });

    // 6. Member transitions task status to In Progress
    const updateTaskRes = await fetch(`${API}/tasks/${task._id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${memberData.token}`
      },
      body: JSON.stringify({
        status: 'In Progress',
        reason: 'Member began technical review of access controls'
      })
    });
    const updatedTask = await updateTaskRes.json();
    console.log('✅ Member Updated Status to:', updatedTask.status);

  } catch (err) {
    console.error('Task assignment flow test error:', err.message);
  }
}

testTaskAssignmentFlow();
