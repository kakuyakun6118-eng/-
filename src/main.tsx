import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";

// `autoUpdate` swaps in a new build and reloads once the browser notices one.
// iOS standalone apps are lazy about checking, so ask explicitly at launch and
// whenever the app returns to the foreground.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const check = () => {
      if (document.visibilityState === "visible") registration.update().catch(() => {});
    };
    check();
    document.addEventListener("visibilitychange", check);
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
