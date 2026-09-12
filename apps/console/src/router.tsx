import { createBrowserRouter } from "react-router";

import { AuthenticatedLayout } from "./routes/AuthenticatedLayout.js";
import { LightDetailPage } from "./routes/LightDetailPage.js";
import { LightListPage } from "./routes/LightListPage.js";
import { LoginPage } from "./routes/LoginPage.js";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <AuthenticatedLayout />,
    children: [
      { path: "/", element: <LightListPage /> },
      { path: "/lights/:id", element: <LightDetailPage /> },
    ],
  },
]);
