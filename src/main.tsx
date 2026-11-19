import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/orbitron";
import "@fontsource-variable/montserrat";
import "./styles.css";
import { App } from "./App";
import { SecondBack, SecondBar, SecondPicker } from "./components/Second";
import { ToastWindow } from "./components/ToastWindow";
import { windowLabel } from "./lib/api";

// Una interfaz de consola no tiene menú de navegador ni selección de texto accidental.
window.addEventListener("contextmenu", (event) => event.preventDefault());

// La misma interfaz sirve a tres ventanas: la principal y las dos del segundo monitor (barra y fondo).
const label = windowLabel();

createRoot(document.getElementById("root")!).render(
  <StrictMode>{label === "second-bar" ? <SecondBar /> : label === "second-back" ? <SecondBack /> : label === "second-picker" ? <SecondPicker /> : label === "toast" ? <ToastWindow /> : <App />}</StrictMode>,
);
