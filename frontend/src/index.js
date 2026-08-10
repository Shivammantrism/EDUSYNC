import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

// Suppress benign ResizeObserver loop errors (triggered by Recharts) and the dev overlay they cause
const roMsgs = ["ResizeObserver loop limit exceeded", "ResizeObserver loop completed with undelivered notifications."];
window.addEventListener("error", (e) => {
  if (e.message && roMsgs.some((m) => e.message.includes(m))) {
    e.stopImmediatePropagation();
    const ov = document.getElementById("webpack-dev-server-client-overlay");
    if (ov) ov.style.display = "none";
  }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
