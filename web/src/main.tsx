import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/orbitron";
import "@fontsource-variable/montserrat";
import "./styles.css";
import { App } from "./App";

// App instalable: el service worker solo se registra en la web publicada, no mientras se desarrolla.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
