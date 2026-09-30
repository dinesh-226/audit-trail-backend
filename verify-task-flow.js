const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Project = require('./models/Project');
const Task = require('./models/Task');
const AuditLog = require('./models/AuditLog');
require('dotenv').config();

async function testFullFlow() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB Atlas Trail database.');

  // Ensure known passwords for paur and malti
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('password123', salt);
  await User.updateOne({ email: 'paur@gmail.com' }, { passwordHash });
  await User.updateOne({ email: 'malti@gmail.com' }, { passwordHash });
  console.log('Updated passwordHash to "password123" for testing.');

  // Fetch admin and member
  const admin = await User.findOne({ email: 'paur@gmail.com' });
  const member = await User.findOne({ email: 'malti@gmail.com' });
  console.log(`Admin: ${admin.name} (${admin.email}), Member: ${member.name} (${member.email})`);

  // Fetch or create a project
  let project = await Project.findOne();
  if (!project) {
    project = await Project.create({
      name: 'Cloud Infrastructure Compliance',
      code: 'CIC-2026',
      description: 'Zero-trust infrastructure migration and ISO-27001 audit controls',
      budget: 185000,
      createdBy: admin._id,
      members: [admin._id, member._id]
    });
  }
  console.log(`Project: ${project.name} (${project.code})`);

  // Ensure member is in project.members list
  if (!project.members.map(String).includes(String(member._id))) {
    project.members.push(member._id);
    await project.save();
    console.log('Added member to project members.');
  }

  // Admin creates and assigns a task to member
  const task = await Task.create({
    title: 'Validate IAM Least-Privilege Policies',
    description: 'Audit AWS IAM role assumptions and revoke inactive service account keys.',
    status: 'Todo',
    priority: 'High',
    projectId: project._id,
    assignedTo: member._id,
    createdBy: admin._id
  });
  console.log(`Created Task: "${task.title}" (ID: ${task._id}) assigned to ${member.name} (ID: ${member._id})`);

  // Query tasks for member: matching req.user._id === member._id
  const memberTasks = await Task.find({ assignedTo: member._id })
    .populate('projectId', 'name code')
    .populate('assignedTo', 'name email role avatar department')
    .populate('createdBy', 'name email');

  console.log(`\n--- MEMBER'S ASSIGNED TASKS (Count: ${memberTasks.length}) ---`);
  memberTasks.forEach(t => {
    console.log(`- Task: "${t.title}" | Status: [${t.status}] | Project: ${t.projectId?.name} | Assignee: ${t.assignedTo?.name} (${t.assignedTo?.email})`);
  });

  // Verify that the task contains the member's details
  const found = memberTasks.find(t => String(t._id) === String(task._id));
  if (found && String(found.assignedTo._id) === String(member._id)) {
    console.log('\n SUCCESS: Assigned task is properly returned and populated for member!');
  } else {
    console.error('\n FAILED: Task not properly found or populated.');
  }

  // Member updates status
  found.status = 'In Progress';
  await found.save();
  console.log(`Member updated task status to: ${found.status}`);

  process.exit(0);
}

testFullFlow().catch(console.error);
