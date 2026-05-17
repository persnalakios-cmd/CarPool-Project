import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "CarPool API is running" });
  });

  app.get("/api/directions", async (req, res) => {
    const { fromLat, fromLng, toLat, toLng } = req.query;
    const apiKey = process.env.GEOAPIFY_API_KEY || '4fc750f47ef0466db11b146cad9415df';
    
    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/routing?waypoints=${fromLat},${fromLng}|${toLat},${toLng}&mode=drive&results=3&alternatives=true&apiKey=${apiKey}`
      );
      const data = await response.json();
      // Ensure we always have features even if empty
      res.json(data);
    } catch (error) {
      console.error("Geoapify Error:", error);
      res.status(500).json({ error: "Failed to fetch directions" });
    }
  });

  // Example API endpoint for complex ride matching (optional if using client-side Firestore)
  app.post("/api/rides/match", (req, res) => {
    // Logic for matching could go here if it's too complex for client
    res.json({ message: "Matching logic would be implemented here if needed" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
