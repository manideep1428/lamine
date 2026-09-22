import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";

// Keep existing app HTTP routes at their current root URLs.
const app = defineApp();
app.use(staticHosting);

export default app;
