import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { SettingsPage } from "./SettingsPage";
import "./styles.css";

const rootElement = document.getElementById("app");
if (!rootElement) throw new Error("Missing #app root element");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {window.location.hash === "#settings" ? <SettingsPage /> : <App />}
  </React.StrictMode>,
);
