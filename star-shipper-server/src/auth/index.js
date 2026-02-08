import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../db/index.js';

const SALT_ROUNDS = 12;

// ============================================
// PASSWORD HASHING
// ============================================

export const hashPassword = async (password) => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (password, hash) => {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
};

// ============================================
// JWT TOKENS
// ============================================

export const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user.id, 
      username: user.username,
      email: user.email 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// ============================================
// USER OPERATIONS
// ============================================

// Create user with email/password
export const createUser = async (username, email, password) => {
  const passwordHash = await hashPassword(password);
  
  const userResult = await query(
    `INSERT INTO users (username, email, password_hash, display_name, auth_provider)
     VALUES ($1, $2, $3, $1, 'local')
     RETURNING id, username, email, display_name, created_at`,
    [username, email, passwordHash]
  );
  
  const user = userResult.rows[0];
  
  // Create initial resources
  await query(
    `INSERT INTO player_resources (user_id) VALUES ($1)`,
    [user.id]
  );
  
  return user;
};

// Create or find user from OAuth provider
export const findOrCreateOAuthUser = async (provider, oauthId, email, displayName, avatarUrl) => {
  // First check if this OAuth account already exists
  let user = await queryOne(
    `SELECT id, username, email, display_name, avatar_url, created_at
     FROM users WHERE auth_provider = $1 AND oauth_id = $2`,
    [provider, oauthId]
  );

  if (user) {
    // Update avatar and display name in case they changed
    await query(
      `UPDATE users SET display_name = $1, avatar_url = $2 WHERE id = $3`,
      [displayName || user.display_name, avatarUrl || user.avatar_url, user.id]
    );
    return { user, isNew: false };
  }

  // Check if email already exists (user might have registered with email/password first)
  user = await queryOne(
    `SELECT id, username, email, display_name, avatar_url, created_at
     FROM users WHERE email = $1`,
    [email]
  );

  if (user) {
    // Link OAuth to existing account
    await query(
      `UPDATE users SET auth_provider = $1, oauth_id = $2, avatar_url = COALESCE($3, avatar_url)
       WHERE id = $4`,
      [provider, oauthId, avatarUrl, user.id]
    );
    return { user, isNew: false };
  }

  // Create new user — generate a username from email or display name
  let baseUsername = (displayName || email.split('@')[0])
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .substring(0, 24);
  
  // Make sure username is unique
  let username = baseUsername;
  let attempt = 0;
  while (true) {
    const existing = await queryOne(
      `SELECT id FROM users WHERE username = $1`,
      [username]
    );
    if (!existing) break;
    attempt++;
    username = `${baseUsername}_${attempt}`;
  }

  const userResult = await query(
    `INSERT INTO users (username, email, display_name, avatar_url, auth_provider, oauth_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, username, email, display_name, avatar_url, created_at`,
    [username, email, displayName || username, avatarUrl, provider, oauthId]
  );

  user = userResult.rows[0];

  // Create initial resources
  await query(
    `INSERT INTO player_resources (user_id) VALUES ($1)`,
    [user.id]
  );

  return { user, isNew: true };
};

export const findUserByEmail = async (email) => {
  return queryOne(
    `SELECT id, username, email, password_hash, display_name, avatar_url, auth_provider, created_at
     FROM users WHERE email = $1`,
    [email]
  );
};

export const findUserByUsername = async (username) => {
  return queryOne(
    `SELECT id, username, email, password_hash, display_name, avatar_url, created_at
     FROM users WHERE username = $1`,
    [username]
  );
};

export const findUserById = async (id) => {
  return queryOne(
    `SELECT id, username, email, display_name, avatar_url, credits, auth_provider, created_at
     FROM users WHERE id = $1`,
    [id]
  );
};

export const updateUserOnline = async (userId, isOnline) => {
  await query(
    `UPDATE users SET is_online = $1, last_seen_at = NOW() WHERE id = $2`,
    [isOnline, userId]
  );
};

// ============================================
// GOOGLE OAuth HELPERS
// ============================================

// Exchange Google auth code for tokens
export const getGoogleTokens = async (code) => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${process.env.SERVER_URL || 'http://localhost:3001'}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`Google token error: ${data.error_description || data.error}`);
  }
  return data;
};

// Get Google user profile from access token
export const getGoogleUserProfile = async (accessToken) => {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`Google profile error: ${data.error.message}`);
  }
  return data;
};

// ============================================
// AUTH MIDDLEWARE
// ============================================

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  const user = await findUserById(decoded.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  req.user = user;
  next();
};

// Socket.IO auth middleware
export const socketAuthMiddleware = async (socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication required'));
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new Error('Invalid token'));
  }
  
  const user = await findUserById(decoded.userId);
  if (!user) {
    return next(new Error('User not found'));
  }
  
  socket.user = user;
  next();
};
