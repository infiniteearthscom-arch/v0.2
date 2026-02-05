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

export const createUser = async (username, email, password) => {
  const passwordHash = await hashPassword(password);
  
  // Create user
  const userResult = await query(
    `INSERT INTO users (username, email, password_hash, display_name)
     VALUES ($1, $2, $3, $1)
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

export const findUserByEmail = async (email) => {
  return queryOne(
    `SELECT id, username, email, password_hash, display_name, avatar_url, created_at
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
    `SELECT id, username, email, display_name, avatar_url, credits, created_at
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
