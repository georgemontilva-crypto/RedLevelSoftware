import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/orbitron";
import "@fontsource-variable/montserrat";
import "./styles.css";
import { App } from "./App";

// Una interfaz de consola no tiene menú de navegador ni selección de texto accidental.
window.addEventListener("contextmenu", (event) => event.preventDefault());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
