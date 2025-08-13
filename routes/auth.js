import express from "express";
import axios from "axios";

const router = express.Router();

// Redirect to GitHub OAuth
router.get("/github", (req, res) => {
  console.log("GET /auth/github → Redirecting to GitHub OAuth...");

  const redirect_uri = "http://localhost:4000/auth/github/callback";
  const client_id = process.env.GITHUB_CLIENT_ID;

  console.log("Using client_id:", client_id);
  console.log("Redirect URI:", redirect_uri);

  res.redirect(
    `https://github.com/login/oauth/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&scope=read:user repo`
  );
});

// GitHub redirects back here with ?code=...
router.get("/github/callback", async (req, res) => {
  console.log("GET /auth/github/callback hit");
  console.log("Query params received:", req.query);

  const { code } = req.query;

  if (!code) {
    console.error(" No code received from GitHub");
    return res.status(400).send("No code provided");
  }

  console.log(" Received code:", code);

  try {
    console.log("Requesting GitHub access token...");

    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: "application/json" } }
    );

    console.log("GitHub token response:", tokenRes.data);

    const access_token = tokenRes.data.access_token;
    if (!access_token) {
      console.error("No access token returned from GitHub");
      return res.status(500).send("Failed to get access token");
    }

    // Fetch user profile from GitHub
    const userRes = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    // Save in backend session
    req.session.user = {
      username: userRes.data.login,
      name: userRes.data.name,
      avatar: userRes.data.avatar_url,
      publicRepos: userRes.data.public_repos,
    };
    const userData = encodeURIComponent(JSON.stringify(req.session.user));

    console.log(" Access token received, saving in session...");
    req.session.access_token = access_token;

    res.redirect(`http://localhost:5173/repos?user=${userData}`); // Redirect to frontend
  } catch (err) {
    console.error(" OAuth Error:", err.response?.data || err.message);
    res.status(500).send("OAuth Error");
  }
});

// Check auth status
router.get("/status", (req, res) => {
  console.log("GET /auth/status → Authenticated?", !!req.session.access_token);
  console.log("session token", req.session.access_token);
  res.json({ authenticated: !!req.session.access_token });
});

// Get logged-in user from session
router.get("/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json(req.session.user);
});

router.post("/logout", (req, res) => {
  try {
    if (req.session) {
      axios.delete(
        `https://api.github.com/applications/${process.env.GITHUB_CLIENT_ID}/token`,
        {
          auth: {
            username: process.env.GITHUB_CLIENT_ID,
            password: process.env.GITHUB_CLIENT_SECRET,
          },
          data: {
            access_token: req.session.access_token,
          },
        }
      );
    }

    // Destroy local session
    req.session.destroy((err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Logout failed");
      }
      res.clearCookie("connect.sid");
      res.send("Logged out and token revoked successfully");
    });
  } catch (err) {
    console.error("Error revoking token:", err.response?.data || err.message);
    res.status(500).send("Failed to revoke token");
  }
});

export default router;
