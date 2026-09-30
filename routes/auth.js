const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth, requireRole, JWT_SECRET } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditEngine');

// Function to get guaranteed next unique user ID across all records
async function getNextUserId() {
  const users = await User.find({}).select('userId');
  let maxId = 0;
  for (const u of users) {
    if (u.userId) {
      const match = u.userId.match(/USR-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxId) maxId = num;
      }
    }
  }
  let nextIdNum = maxId + 1;
  let candidate = `USR-${String(nextIdNum).padStart(3, '0')}`;
  while (await User.findOne({ userId: candidate })) {
    nextIdNum++;
    candidate = `USR-${String(nextIdNum).padStart(3, '0')}`;
  }
  return candidate;
}

const defaultDemoAccounts = [
  {
    name: 'Capt. Rajesh Menon',
    email: 'admin@auditflow.com',
    role: 'admin',
    department: 'Fleet Governance & Cryptographic Security',
    assignedPort: 'Global Central Command',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80'
  },
  {
    name: 'Sunita Rao',
    email: 'portmanager@auditflow.com',
    role: 'port_manager',
    department: 'Mumbai Terminal Operations',
    assignedPort: 'Mumbai Port',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80'
  },
  {
    name: 'Capt. Vikram Sengupta',
    email: 'shipmanager@auditflow.com',
    role: 'ship_manager',
    department: 'Marine Vessel Operations',
    assignedPort: 'Singapore Port',
    assignedShipId: 'SH-101',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80'
  },
  {
    name: 'Rahul Sharma',
    email: 'inspector@auditflow.com',
    role: 'inspector',
    department: 'Customs & Safety Compliance',
    assignedPort: 'Mumbai Port',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80'
  },
  {
    name: 'Ananya Deshmukh',
    email: 'viewer@auditflow.com',
    role: 'viewer',
    department: 'Compliance & Audit Observer',
    assignedPort: 'Nhava Sheva (JNPT) Port',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
  }
];

async function ensureDemoUsers() {
  try {
    const salt = await bcrypt.genSalt(10);
    const defaultPassword = await bcrypt.hash('audit123', salt);
    for (const acc of defaultDemoAccounts) {
      const exists = await User.findOne({ email: acc.email.toLowerCase().trim() });
      if (!exists) {
        const uniqueUserId = await getNextUserId();
        await User.create({
          ...acc,
          userId: uniqueUserId,
          password: defaultPassword
        });
      }
    }
  } catch (err) {
    // Non-blocking
  }
}

// Automatically check and seed missing demo users
setTimeout(ensureDemoUsers, 1500);

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      // Record failed login audit log for unknown email
      await createAuditLog({
        userId: 'ANONYMOUS_ATTEMPT',
        username: 'Unknown User',
        userRole: 'unauthenticated',
        action: 'USER_LOGIN_FAILED',
        entityType: 'User',
        entityId: cleanEmail,
        location: 'External Gateway',
        ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
        newValue: { reason: 'User not found', attemptEmail: cleanEmail }
      });
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Increment failed login count
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      user.lastFailedLogin = new Date();
      user.lastFailedIp = req.ip || req.connection?.remoteAddress || '127.0.0.1';
      await user.save();

      // Log security violation audit event
      await createAuditLog({
        userId: user.userId,
        username: user.name,
        userRole: user.role,
        action: 'USER_LOGIN_FAILED',
        entityType: 'User',
        entityId: user.userId,
        location: user.assignedPort || 'Maritime Command Center',
        ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
        newValue: { reason: 'Password mismatch', failedAttempts: user.failedLoginAttempts }
      });

      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Check if account is deactivated
    if (user.isActive === false) {
      await createAuditLog({
        userId: user.userId,
        username: user.name,
        userRole: user.role,
        action: 'USER_LOGIN_BLOCKED_DEACTIVATED',
        entityType: 'User',
        entityId: user.userId,
        location: user.assignedPort || 'Maritime Command Center',
        ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
        newValue: { reason: 'Account suspended/deactivated by administrator' }
      });

      return res.status(403).json({
        error: 'Your account has been deactivated by the System Administrator. Please contact command administration.'
      });
    }

    // Check approval status for privileged roles
    if (user.approvalStatus === 'pending') {
      return res.status(403).json({
        error: `Your registration as ${user.role.replace('_', ' ').toUpperCase()} is pending approval by the System Administrator. You will be granted operational access once approved.`,
        approvalPending: true,
        userRole: user.role
      });
    }

    if (user.approvalStatus === 'rejected') {
      return res.status(403).json({
        error: 'Your officer registration request was rejected by the System Administrator. Please contact command administration.',
        approvalRejected: true
      });
    }

    // Reset failed login counter on successful authentication
    user.failedLoginAttempts = 0;
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user.userId, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Create login audit log
    await createAuditLog({
      userId: user.userId,
      username: user.name,
      userRole: user.role,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.userId,
      location: user.assignedPort || 'Maritime Command Center',
      ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
      newValue: { lastLogin: user.lastLogin }
    });

    res.json({
      token,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        assignedPort: user.assignedPort,
        assignedShipId: user.assignedShipId,
        avatar: user.avatar,
        approvalStatus: user.approvalStatus
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'viewer', department, assignedPort } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userId = await getNextUserId();
    const cleanRole = ['admin', 'port_manager', 'ship_manager', 'inspector', 'viewer'].includes(role) ? role : 'viewer';

    // Viewer gets instant access without approval. Privileged officer roles require Admin approval.
    const isInstantAccess = cleanRole === 'viewer' || cleanRole === 'admin';
    const approvalStatus = isInstantAccess ? 'approved' : 'pending';

    const user = new User({
      userId,
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      role: cleanRole,
      department: department ? department.trim() : (cleanRole === 'viewer' ? 'Compliance & Audit Observer' : 'Maritime Operations'),
      assignedPort: assignedPort ? assignedPort.trim() : 'Mumbai Port',
      avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80`,
      approvalStatus,
      approvedBy: isInstantAccess ? 'System Auto-Approval' : null,
      approvalDate: isInstantAccess ? new Date() : null
    });

    await user.save();

    await createAuditLog({
      userId: user.userId,
      username: user.name,
      userRole: user.role,
      action: isInstantAccess ? 'USER_REGISTERED_AUTO_APPROVED' : 'USER_REGISTRATION_PENDING_APPROVAL',
      entityType: 'User',
      entityId: user.userId,
      location: user.assignedPort,
      newValue: { email: user.email, role: user.role, approvalStatus }
    });

    if (!isInstantAccess) {
      return res.status(201).json({
        requiresApproval: true,
        message: `Your registration as ${cleanRole.replace('_', ' ').toUpperCase()} has been submitted. An Administrator must approve your account before you can log in.`,
        user: {
          userId: user.userId,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          assignedPort: user.assignedPort,
          approvalStatus: 'pending'
        }
      });
    }

    // Auto-login for approved roles (Viewer)
    const token = jwt.sign(
      { userId: user.userId, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      requiresApproval: false,
      message: 'Registration successful! Welcome to ContainerShip Audit Trail.',
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        assignedPort: user.assignedPort,
        avatar: user.avatar,
        approvalStatus: 'approved'
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message || 'Failed to register new user' });
  }
});

// Forgot Password Request
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ error: 'No account registered with this email address' });
    }

    // Generate 6-digit verification code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordCode = resetCode;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    await user.save();

    await createAuditLog({
      userId: user.userId,
      username: user.name,
      userRole: user.role,
      action: 'PASSWORD_RESET_CODE_ISSUED',
      entityType: 'User',
      entityId: user.userId,
      location: user.assignedPort,
      newValue: { email: user.email, expiresAt: user.resetPasswordExpires }
    });

    res.json({
      message: 'Password reset verification code generated.',
      resetCode, // provided directly for smooth simulation and UX
      expiresInMinutes: 15
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process forgot password request' });
  }
});

// Reset Password with Code
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, verification code, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    if (!user.resetPasswordCode || user.resetPasswordCode !== code.trim()) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    if (user.resetPasswordExpires && new Date() > user.resetPasswordExpires) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordCode = null;
    user.resetPasswordExpires = null;
    await user.save();

    await createAuditLog({
      userId: user.userId,
      username: user.name,
      userRole: user.role,
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'User',
      entityId: user.userId,
      location: user.assignedPort,
      newValue: { status: 'PASSWORD_CHANGED' }
    });

    res.json({
      message: 'Password has been reset successfully. You can now login with your new password.'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Get Current User Profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.userId }).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve user profile' });
  }
});

// Update Profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, department, assignedPort, avatar } = req.body;
    const user = await User.findOne({ userId: req.user.userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (name) user.name = name.trim();
    if (department) user.department = department.trim();
    if (assignedPort) user.assignedPort = assignedPort.trim();
    if (avatar) user.avatar = avatar;

    await user.save();

    await createAuditLog({
      userId: user.userId,
      username: user.name,
      userRole: user.role,
      action: 'USER_PROFILE_UPDATED',
      entityType: 'User',
      entityId: user.userId,
      location: user.assignedPort,
      newValue: { name: user.name, department: user.department, assignedPort: user.assignedPort }
    });

    res.json({
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      assignedPort: user.assignedPort,
      avatar: user.avatar
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// List all Demo Users for Quick-Switcher
router.get('/demo-users', async (req, res) => {
  try {
    const users = await User.find({ isActive: true }).select('userId name email role department assignedPort assignedShipId avatar');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch demo users' });
  }
});

// List all Pending Registration Requests (Admin only)
router.get('/pending-users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const pendingUsers = await User.find({ approvalStatus: 'pending' })
      .select('userId name email role department assignedPort assignedShipId avatar createdAt approvalStatus')
      .sort({ createdAt: -1 });
    res.json(pendingUsers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending officer requests' });
  }
});

// Approve or Reject Officer Registration Request (Admin only)
router.patch('/users/:userId/approval', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const rawAction = (req.body.action || req.body.status || '').toLowerCase().trim();
    let action = '';
    if (rawAction.startsWith('app') || rawAction === 'approve' || rawAction === 'approved' || rawAction === 'accept') {
      action = 'approve';
    } else if (rawAction.startsWith('rej') || rawAction.startsWith('dec') || rawAction === 'reject' || rawAction === 'rejected') {
      action = 'reject';
    } else {
      return res.status(400).json({ error: 'Action must be "approve" or "reject"' });
    }

    const userIdParam = req.params.userId;
    const userQuery = [{ userId: userIdParam }];
    if (mongoose.isValidObjectId(userIdParam)) {
      userQuery.push({ _id: userIdParam });
    }
    const targetUser = await User.findOne({ $or: userQuery });
    if (!targetUser) {
      return res.status(404).json({ error: 'Officer account not found' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    targetUser.approvalStatus = newStatus;
    targetUser.approvedBy = req.user.name;
    targetUser.approvalDate = new Date();
    await targetUser.save();

    await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: action === 'approve' ? 'OFFICER_REGISTRATION_APPROVED' : 'OFFICER_REGISTRATION_REJECTED',
      entityType: 'User',
      entityId: targetUser.userId,
      location: req.user.assignedPort || 'Global Central Command',
      newValue: {
        officerName: targetUser.name,
        officerRole: targetUser.role,
        approvalStatus: newStatus,
        approvedBy: req.user.name
      }
    });

    res.json({
      message: `Officer account for ${targetUser.name} (${targetUser.role}) has been ${newStatus}.`,
      user: targetUser
    });
  } catch (error) {
    console.error('Error updating approval status:', error);
    res.status(500).json({ error: 'Failed to update approval status' });
  }
});

// Update User Role (Admin only)
router.patch('/users/:userId/role', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    const targetUser = await User.findOne({ userId: req.params.userId });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const prevRole = targetUser.role;
    targetUser.role = role;
    await targetUser.save();

    await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'USER_ROLE_MODIFIED',
      entityType: 'User',
      entityId: targetUser.userId,
      previousValue: { role: prevRole },
      newValue: { role }
    });

    res.json({ message: 'User role updated successfully', user: targetUser });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// List All Users with Filtering (Admin only)
router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const query = {};

    if (role && role !== 'All' && role !== 'All Roles') {
      query.role = role;
    }
    if (status && status !== 'All') {
      if (status === 'active') query.isActive = true;
      if (status === 'inactive') query.isActive = false;
      if (status === 'pending') query.approvalStatus = 'pending';
    }
    if (search && search.trim()) {
      const cleanSearch = search.trim();
      query.$or = [
        { name: new RegExp(cleanSearch, 'i') },
        { email: new RegExp(cleanSearch, 'i') },
        { department: new RegExp(cleanSearch, 'i') },
        { assignedPort: new RegExp(cleanSearch, 'i') },
        { userId: new RegExp(cleanSearch, 'i') }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch user directory' });
  }
});

// Admin Create Officer Account Directly (Admin only)
router.post('/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role, department, assignedPort, assignedShipId } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const userId = await getNextUserId();

    const newUser = new User({
      userId,
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      role,
      department: department ? department.trim() : 'Maritime Operations',
      assignedPort: assignedPort ? assignedPort.trim() : 'Mumbai Port',
      assignedShipId: assignedShipId || null,
      avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80`,
      isActive: true,
      approvalStatus: 'approved',
      approvedBy: req.user.name,
      approvalDate: new Date(),
      createdBy: req.user.name
    });

    await newUser.save();

    await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'USER_CREATED_BY_ADMIN',
      entityType: 'User',
      entityId: newUser.userId,
      location: req.user.assignedPort || 'Global Central Command',
      ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
      newValue: {
        createdOfficer: newUser.name,
        email: newUser.email,
        role: newUser.role,
        department: newUser.department,
        assignedPort: newUser.assignedPort
      }
    });

    res.status(201).json({
      message: `Officer account for ${newUser.name} created and activated.`,
      user: {
        userId: newUser.userId,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        department: newUser.department,
        assignedPort: newUser.assignedPort,
        isActive: newUser.isActive,
        approvalStatus: newUser.approvalStatus
      }
    });
  } catch (error) {
    console.error('Error creating officer:', error);
    res.status(500).json({ error: 'Failed to create officer account' });
  }
});

// Admin Toggle User Status (Activate / Deactivate) (Admin only)
router.patch('/users/:userId/status', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { isActive } = req.body;
    const userIdParam = req.params.userId;

    const userQuery = [{ userId: userIdParam }];
    if (mongoose.isValidObjectId(userIdParam)) {
      userQuery.push({ _id: userIdParam });
    }
    const targetUser = await User.findOne({ $or: userQuery });
    if (!targetUser) {
      return res.status(404).json({ error: 'User account not found' });
    }

    if (targetUser.userId === req.user.userId) {
      return res.status(400).json({ error: 'Administrators cannot deactivate their own session.' });
    }

    const prevStatus = targetUser.isActive;
    targetUser.isActive = Boolean(isActive);
    await targetUser.save();

    await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: targetUser.isActive ? 'USER_ACCOUNT_ACTIVATED' : 'USER_ACCOUNT_DEACTIVATED',
      entityType: 'User',
      entityId: targetUser.userId,
      location: req.user.assignedPort || 'Global Central Command',
      ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
      previousValue: { isActive: prevStatus },
      newValue: { isActive: targetUser.isActive, officerName: targetUser.name }
    });

    res.json({
      message: `Account for ${targetUser.name} has been ${targetUser.isActive ? 'ACTIVATED' : 'DEACTIVATED'}.`,
      user: targetUser
    });
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({ error: 'Failed to toggle account status' });
  }
});

// Admin Reset Password for Officer Account (Admin only)
router.post('/users/:userId/reset-password', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { newPassword } = req.body;
    const passwordToSet = newPassword && newPassword.length >= 6 ? newPassword : 'password123';
    const userIdParam = req.params.userId;

    const userQuery = [{ userId: userIdParam }];
    if (mongoose.isValidObjectId(userIdParam)) {
      userQuery.push({ _id: userIdParam });
    }
    const targetUser = await User.findOne({ $or: userQuery });
    if (!targetUser) {
      return res.status(404).json({ error: 'User account not found' });
    }

    const salt = await bcrypt.genSalt(10);
    targetUser.password = await bcrypt.hash(passwordToSet, salt);
    targetUser.resetPasswordCode = null;
    targetUser.resetPasswordExpires = null;
    targetUser.failedLoginAttempts = 0;
    await targetUser.save();

    await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'USER_PASSWORD_RESET_BY_ADMIN',
      entityType: 'User',
      entityId: targetUser.userId,
      location: req.user.assignedPort || 'Global Central Command',
      ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
      newValue: { officerName: targetUser.name, email: targetUser.email, resetBy: req.user.name }
    });

    res.json({
      message: `Password reset successfully for ${targetUser.name}. Temporary credentials: "${passwordToSet}"`,
      temporaryPassword: passwordToSet
    });
  } catch (error) {
    console.error('Error resetting officer password:', error);
    res.status(500).json({ error: 'Failed to reset officer password' });
  }
});

// Admin Delete Officer Account (Admin only)
router.delete('/users/:userId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const userIdParam = req.params.userId;
    const userQuery = [{ userId: userIdParam }];
    if (mongoose.isValidObjectId(userIdParam)) {
      userQuery.push({ _id: userIdParam });
    }
    const targetUser = await User.findOne({ $or: userQuery });
    if (!targetUser) {
      return res.status(404).json({ error: 'User account not found' });
    }

    if (targetUser.userId === req.user.userId) {
      return res.status(400).json({ error: 'Administrators cannot delete their own account.' });
    }

    const deletedInfo = {
      userId: targetUser.userId,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      department: targetUser.department
    };

    await User.deleteOne({ _id: targetUser._id });

    await createAuditLog({
      userId: req.user.userId,
      username: req.user.name,
      userRole: req.user.role,
      action: 'USER_ACCOUNT_DELETED_BY_ADMIN',
      entityType: 'User',
      entityId: targetUser.userId,
      location: req.user.assignedPort || 'Global Central Command',
      ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
      previousValue: deletedInfo,
      newValue: { status: 'DELETED' }
    });

    res.json({
      message: `Officer account for ${deletedInfo.name} (${deletedInfo.email}) has been deleted.`,
      deletedUser: deletedInfo
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user account' });
  }
});

// Security KPI & Incident Statistics (Admin only)
router.get('/security-stats', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [totalUsers, activeUsers, inactiveUsers, pendingUsers, recentFailedLogins] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true, approvalStatus: 'approved' }),
      User.countDocuments({ isActive: false }),
      User.countDocuments({ approvalStatus: 'pending' }),
      User.find({ failedLoginAttempts: { $gt: 0 } }).select('userId name email role failedLoginAttempts lastFailedLogin lastFailedIp')
    ]);

    res.json({
      totalUsers,
      activeUsers,
      inactiveUsers,
      pendingUsers,
      suspiciousAccountsCount: recentFailedLogins.length,
      suspiciousAccounts: recentFailedLogins
    });
  } catch (error) {
    console.error('Error fetching security stats:', error);
    res.status(500).json({ error: 'Failed to fetch security stats' });
  }
});

module.exports = router;
