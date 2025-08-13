// backend/routes/provider.js
import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import {
  getProviderFromSession,
  renderBackendApiUrl,
  netlifyFrontendUrl,
} from "../util/util.js";

const router = express.Router();
dotenv.config();

const PROVIDERS = {
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    apiBase: "https://api.github.com",
    scopes: "read:user repo",
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    redirectPath: "/provider/github/callback",
  },
  gitlab: {
    authUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    apiBase: "https://gitlab.com/api/v4",
    scopes: "read_user read_api",
    clientId: process.env.GITLAB_CLIENT_ID,
    clientSecret: process.env.GITLAB_CLIENT_SECRET,
    redirectPath: "/provider/gitlab/callback",
  },
};

// 1️⃣ Login redirect
router.get("/:provider/login", (req, res) => {
  const provider = PROVIDERS[req.params.provider];
  if (!provider) return res.status(400).send("Invalid provider");

  const redirectUri = `${renderBackendApiUrl}${provider.redirectPath}`;
  const authUrl =
    `${provider.authUrl}?client_id=${provider.clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(provider.scopes)}` +
    `&response_type=code`;

  res.redirect(authUrl);
});

// 2️⃣ OAuth callback
router.get("/:provider/callback", async (req, res) => {
  const providerName = req.params.provider;
  const provider = PROVIDERS[providerName];
  const { code } = req.query;
  if (!code) return res.status(400).send("No code provided");

  try {
    let tokenData;

    if (providerName === "github") {
      const tokenRes = await axios.post(
        provider.tokenUrl,
        {
          client_id: provider.clientId,
          client_secret: provider.clientSecret,
          code,
        },
        { headers: { Accept: "application/json" } }
      );
      tokenData = tokenRes.data;
    } else if (providerName === "gitlab") {
      const tokenRes = await axios.post(
        provider.tokenUrl,
        {
          client_id: provider.clientId,
          client_secret: provider.clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: `${renderBackendApiUrl}${provider.redirectPath}`,
        },
        { headers: { "Content-Type": "application/json" } }
      );
      tokenData = tokenRes.data;
    }

    const access_token = tokenData.access_token;
    if (!access_token) throw new Error("No access token");

    // Fetch user info
    let user;
    if (providerName === "github") {
      const userRes = await axios.get(`${provider.apiBase}/user`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      user = {
        username: userRes.data.login,
        name: userRes.data.name,
        avatar: userRes.data.avatar_url,
        publicRepos: userRes.data.public_repos,
      };
    } else if (providerName === "gitlab") {
      const userRes = await axios.get(`${provider.apiBase}/user`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      user = {
        username: userRes.data.username,
        name: userRes.data.name,
        avatar: userRes.data.avatar_url,
        publicRepos: userRes.data.public_projects_count,
      };
    }

    // Save in session
    req.session[`${providerName}_user`] = user;
    req.session[`${providerName}_token`] = access_token;
    req.session.provider = providerName;

    const userData = encodeURIComponent(
      JSON.stringify(req.session[`${providerName}_user`])
    );
    console.log(`User`, req.session.provider);
    console.log(`User`, req.session[`${providerName}_user`]);
    console.log(`Access token`, req.session[`${providerName}_token`]);
    res.redirect(`${netlifyFrontendUrl}/repos?user=${userData}`);
  } catch (err) {
    console.error(
      `${providerName} OAuth Error:`,
      err.response?.data || err.message
    );
    res.status(500).send("OAuth Error");
  }
});

// 3️⃣ Get user info
router.get("/me", (req, res) => {
  const providerName = getProviderFromSession(req);
  const user = req.session[`${providerName}_user`];
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  res.json(user);
});

// 4️⃣ Get repos
router.get("/repos", async (req, res) => {
  const providerName = getProviderFromSession(req);
  const token = req.session[`${providerName}_token`];
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    let url;
    if (providerName === "github") {
      url = `${PROVIDERS.github.apiBase}/user/repos`;
    } else {
      url = `${PROVIDERS.gitlab.apiBase}/projects?membership=true`;
    }

    const reposRes = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    res.json(reposRes.data);
  } catch (err) {
    res.status(500).send("Failed to fetch repos");
  }
});

// 5️⃣ Get repo lines
router.get("/repo-lines/:ownerOrId/:repoName", async (req, res) => {
  const provider = getProviderFromSession(req);
  const { ownerOrId, repoName } = req.params;
  console.log(`Calculating lines for ${provider} repo:`, ownerOrId, repoName);
  const token = req.session[`${provider}_token`];
  console.log(`Token for ${provider}:`, token);
  console.log(`session provider:`, req.session[`${provider}_token`]);
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    let totalLines = 0;

    if (provider === "github") {
      const contentsRes = await axios.get(
        `${PROVIDERS.github.apiBase}/repos/${ownerOrId}/${repoName}/contents`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      for (const file of contentsRes.data) {
        if (file.type === "file") {
          const fileRes = await axios.get(file.download_url);
          totalLines += fileRes.data.split("\n").length;
        }
      }
    } else if (provider === "gitlab") {
      const treeRes = await axios.get(
        `${PROVIDERS.gitlab.apiBase}/projects/${encodeURIComponent(
          ownerOrId
        )}/repository/tree?recursive=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      for (const file of treeRes.data) {
        if (file.type === "blob") {
          const fileRes = await axios.get(
            `${PROVIDERS.gitlab.apiBase}/projects/${encodeURIComponent(
              ownerOrId
            )}/repository/files/${encodeURIComponent(file.path)}/raw?ref=main`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          totalLines += fileRes.data.split("\n").length;
        }
      }
    }

    res.json({ totalLines });
  } catch (err) {
    console.error(
      `${provider} repo lines error:`,
      err.response?.data || err.message
    );
    res.status(500).send("Failed to calculate lines");
  }
});

// 6️⃣ Logout
router.post("/logout", (req, res) => {
  const providerName = getProviderFromSession(req);
  req.session[`${providerName}_user`] = null;
  req.session[`${providerName}_token`] = null;
  res.json({ message: `Logged out from ${providerName}` });
});

router.get("/profile", async (req, res) => {
  try {
    const provider = req.session.provider; // "github" or "gitlab"
    const accessToken = req.session[`${provider}_token`];

    if (!provider || !accessToken) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    let apiUrl;
    let headers = {};
    let profile;
    let publicRepoCount = 0;

    if (provider === "github") {
      // Fetch GitHub profile
      apiUrl = "https://api.github.com/user";
      headers = {
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github+json",
      };

      const userRes = await fetch(apiUrl, { headers });
      if (!userRes.ok) throw new Error("Failed to fetch GitHub profile");
      const userData = await userRes.json();

      // Public repo count is directly available
      publicRepoCount = userData.public_repos || 0;

      profile = {
        id: userData.id,
        username: userData.login,
        name: userData.name,
        avatar_url: userData.avatar_url,
        email: userData.email || null,
      };
    } else if (provider === "gitlab") {
      // Fetch GitLab profile
      apiUrl = "https://gitlab.com/api/v4/user";
      headers = { Authorization: `Bearer ${accessToken}` };

      const userRes = await fetch(apiUrl, { headers });
      if (!userRes.ok) throw new Error("Failed to fetch GitLab profile");
      const userData = await userRes.json();

      // Fetch public projects count from GitLab
      const projectsRes = await fetch(
        `https://gitlab.com/api/v4/users/${userData.id}/projects?visibility=public`,
        { headers }
      );
      if (!projectsRes.ok) throw new Error("Failed to fetch GitLab projects");
      const projects = await projectsRes.json();
      publicRepoCount = projects.length;

      profile = {
        id: userData.id,
        username: userData.username,
        name: userData.name,
        avatar_url: userData.avatar_url,
        email: userData.email || null,
      };
    } else {
      return res.status(400).json({ error: "Unsupported provider" });
    }

    res.json({ ...profile, public_repos: publicRepoCount });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

export default router;
