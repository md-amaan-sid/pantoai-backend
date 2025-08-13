import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import session from "express-session";

import authRoutes from "./routes/auth.js";
import githubRoutes from "./routes/github.js";
import providerRoutes from "./routes/provider.js";
import { netlifyFrontendUrl } from "./util/util.js";

const app = express();

app.use(
  cors({
    origin: netlifyFrontendUrl,
    credentials: true,
  })
);

// Use express-session
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // change to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);

// Routes
app.use("/auth", authRoutes);
app.use("/github", githubRoutes);
app.use("/provider", providerRoutes);

app.listen(4000, () => {
  console.log("Backend running on http://localhost:4000");
});
