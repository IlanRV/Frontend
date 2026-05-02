import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "@/App";
import "@/styles.css";

if (import.meta.env.DEV && window.location.hostname === "127.0.0.1") {
  window.location.replace(
    `http://localhost:${window.location.port}${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
