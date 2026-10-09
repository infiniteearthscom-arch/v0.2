import { Router } from 'express';
import { 
  createUser, 
  findUserByEmail, 
  findUserByUsername,
  findOrCreateOAuthUser,
  verifyPassword, 
  generateToken,
  authMiddleware,
  getGoogleTokens,
  getGoogleUserProfile,
  isDevAccount,
} from '../auth/index.js';
import { queryOne, transaction } from '../db/index.js';

// One-time rename (097): users.name_changed_at. Probed once so the code is
// safe to deploy before the migration runs (no column = feature off).
let _nameChangeLive = null;
async function nameChangeLive() {
  if (_nameChangeLive == null) {
    const r = await queryOne(`SELECT 1 AS ok FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'name_changed_at'`);
    _nameChangeLive = !!r;
  }
  return _nameChangeLive;
}
const NAME_RE = /^[a-zA-Z0-9_]+$/;

const router = Router();

// ============================================
// EMAIL/PASSWORD REGISTER
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
// EMAIL/PASSWORD LOGIN
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

    // Check if this is an OAuth-only account
    if (user.auth_provider !== 'local' && !user.password_hash) {
      return res.status(401).json({ 
        error: `This account uses ${user.auth_provider} login. Please sign in with ${user.auth_provider}.` 
      });
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
// GOOGLE OAUTH
// ============================================

// Step 1: Redirect user to Google
router.get('/google', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.SERVER_URL || 'http://localhost:3001'}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Step 2: Google redirects back with a code
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      console.error('Google OAuth error:', error);
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?auth_error=${error}`);
    }

    if (!code) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?auth_error=no_code`);
    }

    // Exchange code for tokens
    const tokens = await getGoogleTokens(code);

    // Get user profile
    const profile = await getGoogleUserProfile(tokens.access_token);

    // Find or create user
    const { user, isNew } = await findOrCreateOAuthUser(
      'google',
      profile.id,
      profile.email,
      profile.name,
      profile.picture
    );

    // Generate JWT
    const token = generateToken(user);

    // Redirect to frontend with token
    // Frontend will pick up the token from the URL and store it
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}?token=${token}&provider=google&isNew=${isNew}`);

  } catch (error) {
    console.error('Google callback error:', error);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}?auth_error=google_failed`);
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
    
    // One-time rename (097): offered on the launch screen until used.
    let nameChangeAvailable = false;
    if (await nameChangeLive()) {
      const nc = await queryOne(`SELECT name_changed_at FROM users WHERE id = $1`, [req.user.id]);
      nameChangeAvailable = !nc?.name_changed_at;
    }

    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        displayName: req.user.display_name,
        avatarUrl: req.user.avatar_url,
        authProvider: req.user.auth_provider,
        createdAt: req.user.created_at,
        is_dev: isDevAccount(req.user),
        nameChangeAvailable,
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
// ONE-TIME RENAME (097)
// ============================================
// Same rules as registration and `npm run db:rename`: 3-32 chars,
// [A-Za-z0-9_], unique, case-sensitive. Changes username + display_name
// and the two denormalised copies in one transaction, stamps
// name_changed_at so it can happen once, and returns a fresh JWT (the
// token carries the username).
router.post('/rename', authMiddleware, async (req, res) => {
  try {
    if (!(await nameChangeLive())) return res.status(503).json({ error: 'Name changes are not available yet' });
    const username = String(req.body?.username || '').trim();
    if (username.length < 3 || username.length > 32) return res.status(400).json({ error: 'Name must be 3-32 characters' });
    if (!NAME_RE.test(username)) return res.status(400).json({ error: 'Letters, numbers and underscores only' });
    if (username === req.user.username) return res.status(400).json({ error: 'That is already your name' });

    const taken = await findUserByUsername(username);
    if (taken) return res.status(400).json({ error: 'That name is already taken' });

    const out = await transaction(async (client) => {
      const u = await client.query(
        `UPDATE users SET username = $2, display_name = $2, name_changed_at = NOW()
          WHERE id = $1 AND name_changed_at IS NULL
          RETURNING id, username, email, display_name, avatar_url, auth_provider, created_at`,
        [req.user.id, username]);
      if (!u.rows[0]) throw Object.assign(new Error('You have already used your one name change'), { statusCode: 409 });
      await client.query(`UPDATE chat_messages SET sender_name = $2 WHERE sender_id = $1`, [req.user.id, username]);
      await client.query(`UPDATE activity_events SET sender_name = $2 WHERE user_id = $1`, [req.user.id, username]);
      return u.rows[0];
    });

    res.json({
      success: true,
      token: generateToken(out),
      user: {
        id: out.id, username: out.username, email: out.email, displayName: out.display_name,
        avatarUrl: out.avatar_url, authProvider: out.auth_provider, createdAt: out.created_at,
        is_dev: isDevAccount(out), nameChangeAvailable: false,
      },
    });
  } catch (error) {
    if (error?.code === '23505') return res.status(400).json({ error: 'That name is already taken' });
    if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Rename error:', error);
    res.status(500).json({ error: 'Failed to change name' });
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
