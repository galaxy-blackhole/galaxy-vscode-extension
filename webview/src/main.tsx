import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { SettingsPage } from "./SettingsPage";
import "./styles.css";

declare global {
  interface Window {
    /** "chat" in the sidebar, "settings" in the settings tab; injected by the host. */
    __GALAXY_VIEW__?: string;
  }
}

const rootElement = document.getElementById("app");
if (!rootElement) throw new Error("Missing #app root element");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {window.__GALAXY_VIEW__ === "settings" || window.location.hash === "#settings" ? <SettingsPage /> : <App />}
  </React.StrictMode>,
);
