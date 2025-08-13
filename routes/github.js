import express from "express";
import axios from "axios";

const router = express.Router();

router.get("/profile", async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const profileRes = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${req.session.access_token}`,
      },
    });

    res.json(profileRes.data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching profile");
  }
});

router.get("/repos", async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const reposRes = await axios.get("https://api.github.com/user/repos", {
      headers: {
        Authorization: `Bearer ${req.session.access_token}`,
      },
    });

    res.json(reposRes.data);
    console.log("Repos fetched successfully:", reposRes.data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching repositories");
  }
});

router.get("/repo-lines/:owner/:repo", async (req, res) => {
  const access_token = req.session.access_token;
  if (!access_token)
    return res.status(401).json({ error: "Not authenticated" });

  const { owner, repo } = req.params;

  try {
    // Get repo info for default branch
    const repoRes = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );
    const branch = repoRes.data.default_branch;

    // Get tree of all files
    const treeRes = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    const files = treeRes.data.tree.filter((item) => item.type === "blob");

    let totalLines = 0;

    // Loop through each file and count lines
    for (let file of files) {
      const fileRes = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`,
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            Accept: "application/vnd.github.v3.raw",
          },
        }
      );
      const content = fileRes.data;
      totalLines += content.split("\n").length;
    }

    res.json({ totalLines });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Failed to calculate lines" });
  }
});

export default router;
