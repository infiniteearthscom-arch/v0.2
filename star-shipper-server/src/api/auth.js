import { Router } from 'express';
import { 
  createUser, 
  findUserByEmail, 
  findUserByUsername,
  verifyPassword, 
  generateToken,
  authMiddleware 
} from '../auth/index.js';
import { queryOne } from '../db/index.js';

const router = Router();

// ============================================
// REGISTER
// ============================================
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    
    if (username.length < 3 || username.length > 32) {
      return res.status(400).json({ error: 'Username must be 3-32 characters' });
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    // Check if user exists
    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const existingUsername = await findUserByUsername(username);
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    
    // Create user
    const user = await createUser(username, email, password);
    const token = generateToken(user);
    
    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// ============================================
// LOGIN
// ============================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Verify password
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Generate token
    const token = generateToken(user);
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============================================
// GET CURRENT USER
// ============================================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    // Get resources too
    const resources = await queryOne(
      `SELECT * FROM player_resources WHERE user_id = $1`,
      [req.user.id]
    );
    
    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        displayName: req.user.display_name,
        avatarUrl: req.user.avatar_url,
        createdAt: req.user.created_at,
      },
      resources: resources ? {
        credits: resources.credits,
        metals: resources.metals,
        crystals: resources.crystals,
        gases: resources.gases,
        rareEarth: resources.rare_earth,
        fuel: resources.fuel,
        food: resources.food,
        electronics: resources.electronics,
        components: resources.components,
      } : null,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

// ============================================
// REFRESH TOKEN
// ============================================
router.post('/refresh', authMiddleware, (req, res) => {
  const token = generateToken(req.user);
  res.json({ token });
});

export default router;
