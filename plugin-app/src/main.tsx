import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const el = document.getElementById("seo-agent-root");
if (el) {
  createRoot(el).render(<StrictMode><App /></StrictMode>);
}
