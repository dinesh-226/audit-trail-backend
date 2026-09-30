const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { JWT_SECRET } = require('../middleware/auth');
const logAudit = require('../utils/auditLogger');

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Write audit log for login
    await logAudit({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user._id.toString(),
      entityName: user.name,
      fieldName: null,
      oldValue: null,
      newValue: { email: user.email, role: user.role },
      reason: 'User session authenticated successfully',
      source: 'web',
      ipAddress: req.ip || req.socket?.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'browser',
      status: 'SUCCESS',
      criticality: 'LOW'
    }).catch(err => console.error('Login audit log failed:', err));

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
};

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password, role = 'member', department = 'General' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      passwordHash,
      role,
      department
    });

    // Write audit log for user creation
    await logAudit({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      action: 'CREATE',
      entityType: 'User',
      entityId: user._id.toString(),
      entityName: user.name,
      fieldName: null,
      oldValue: null,
      newValue: { name: user.name, email: user.email, role: user.role, department: user.department },
      reason: 'New user account registered',
      source: 'web',
      ipAddress: req.ip || req.socket?.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'browser',
      status: 'SUCCESS',
      criticality: 'MEDIUM'
    }).catch(err => console.error('Register audit log failed:', err));

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to create user account' });
  }
};

// POST /api/auth/demo-switch
exports.demoSwitch = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ error: 'Demo user not found' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        avatar: user.avatar
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Demo switch failed' });
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      department: req.user.department,
      avatar: req.user.avatar
    }
  });
};

// GET /api/auth/personas
exports.getPersonas = async (req, res) => {
  try {
    const users = await User.find().select('_id name email role department avatar createdAt');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch personas' });
  }
};

// GET /api/auth/users
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select('_id name email role department avatar createdAt');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// PUT /api/auth/users/:userId/role - Change user role (Admin only)
exports.updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, reason } = req.body;

    const validRoles = ['admin', 'manager', 'lead', 'auditor', 'member', 'developer', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of [${validRoles.join(', ')}]` });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldRole = targetUser.role;
    targetUser.role = role;
    await targetUser.save();

    // Log immutable permission change in audit ledger
    await logAudit({
      userId: req.user._id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'PERMISSION_CHANGE',
      entityType: 'User',
      entityId: userId,
      entityName: `${targetUser.name} (${targetUser.email})`,
      fieldName: 'role',
      oldValue: oldRole,
      newValue: role,
      reason: reason || `Administrator changed role from ${oldRole} to ${role}`,
      source: 'web',
      isRisky: role === 'admin' || oldRole === 'admin',
      riskLevel: role === 'admin' ? 'high' : 'medium',
      req
    });

    res.json({
      success: true,
      message: `Role for ${targetUser.name} updated to ${role}. Audit log recorded.`,
      user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        department: targetUser.department
      }
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
};

// PUT /api/auth/profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, department, avatar, reason } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldValues = {
      name: user.name,
      department: user.department,
      avatar: user.avatar
    };

    if (name) user.name = name.trim();
    if (department) user.department = department.trim();
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

    // Log audit event for profile modification
    await logAudit({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      action: 'UPDATE',
      entityType: 'User',
      entityId: user._id.toString(),
      entityName: user.name,
      fieldName: 'profile',
      oldValue: oldValues,
      newValue: {
        name: user.name,
        department: user.department,
        avatar: user.avatar
      },
      reason: reason || 'User updated personal profile details',
      source: 'web',
      ipAddress: req.ip || req.socket?.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'browser',
      status: 'SUCCESS',
      criticality: 'LOW'
    }).catch(err => console.error('Profile audit log error:', err));

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        avatar: user.avatar,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// PUT /api/auth/change-password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    // Log audit event for password credential update
    await logAudit({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      action: 'UPDATE',
      entityType: 'Security',
      entityId: user._id.toString(),
      entityName: `Credential Update for ${user.name}`,
      fieldName: 'password',
      oldValue: '********',
      newValue: '********',
      reason: 'User successfully modified account authentication credentials',
      source: 'web',
      ipAddress: req.ip || req.socket?.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'browser',
      status: 'SUCCESS',
      criticality: 'MEDIUM'
    }).catch(err => console.error('Password audit log error:', err));

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// GET /api/auth/my-activity
exports.getMyActivity = async (req, res) => {
  try {
    const logs = await AuditLog.find({
      $or: [
        { userId: req.user._id },
        { userEmail: req.user.email }
      ]
    })
      .sort({ timestamp: -1 })
      .limit(50);

    res.json(logs);
  } catch (error) {
    console.error('Fetch my activity error:', error);
    res.status(500).json({ error: 'Failed to fetch personal activity' });
  }
};
