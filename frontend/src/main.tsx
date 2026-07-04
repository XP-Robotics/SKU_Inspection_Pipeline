import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter, Navigate } from "react-router-dom";
import App from "./App";
import { SkuListPage } from "./features/skus/SkuListPage";
import { InspectPage } from "./features/inspect/InspectPage";
import { InspectionsPage } from "./features/inspect/InspectionsPage";
import { SopPage } from "./features/sop/SopPage";
import { DatasetPage } from "./features/dataset/DatasetPage";
import { MetricsPage } from "./features/metrics/MetricsPage";
import { ErrorPage } from "./components/ErrorPage";
import "./index.css";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Navigate to="/skus" replace /> },
      { path: "skus", element: <SkuListPage /> },
      { path: "skus/:skuId/sop", element: <SopPage /> },
      { path: "skus/:skuId/dataset", element: <DatasetPage /> },
      { path: "skus/:skuId/metrics", element: <MetricsPage /> },
      { path: "inspect", element: <InspectPage /> },
      { path: "inspections", element: <InspectionsPage /> },
    ],
  },
]);

async function bootstrap() {
  if (USE_MOCKS) {
    const { startMocks } = await import("./mocks/browser");
    await startMocks();
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
}

void bootstrap();
