import { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router";
import { AppShell, RequireAuth } from "@/components/layout/AppShell";
import { Spinner } from "@/components/ui";

const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Discover = lazy(() => import("@/pages/Discover"));
const QuizDetail = lazy(() => import("@/pages/QuizDetail"));
const QuizEditor = lazy(() => import("@/pages/QuizEditor"));
const Reports = lazy(() => import("@/pages/Reports"));
const ReportDetail = lazy(() => import("@/pages/ReportDetail"));
const AssignmentReport = lazy(() => import("@/pages/AssignmentReport"));
const Settings = lazy(() => import("@/pages/Settings"));
const Admin = lazy(() => import("@/pages/Admin"));
const Join = lazy(() => import("@/pages/Join"));
const Play = lazy(() => import("@/pages/Play"));
const Host = lazy(() => import("@/pages/Host"));
const Assignment = lazy(() => import("@/pages/Assignment"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function Fallback() {
  return <Spinner className="min-h-[60dvh]" />;
}

function SuspenseOutlet() {
  return (
    <Suspense fallback={<Fallback />}>
      <Outlet />
    </Suspense>
  );
}

const authed = (el: React.ReactNode) => <RequireAuth>{el}</RequireAuth>;

const router = createBrowserRouter([
  {
    element: <SuspenseOutlet />,
    children: [
      // Full-screen game experiences (no app chrome)
      { path: "/join", element: <Join /> },
      { path: "/play/:pin", element: <Play /> },
      { path: "/host/:pin", element: <Host /> },
      { path: "/a/:code", element: <Assignment /> },
      { path: "/quiz/:id/edit", element: authed(<QuizEditor />) },
      { path: "/quiz/new", element: authed(<QuizEditor />) },
      {
        element: <AppShell />,
        children: [
          {
            element: <SuspenseOutlet />,
            children: [
              { path: "/", element: <Landing /> },
              { path: "/login", element: <Login /> },
              { path: "/register", element: <Register /> },
              { path: "/discover", element: <Discover /> },
              { path: "/quiz/:id", element: <QuizDetail /> },
              { path: "/dashboard", element: authed(<Dashboard />) },
              { path: "/reports", element: authed(<Reports />) },
              { path: "/reports/:id", element: authed(<ReportDetail />) },
              { path: "/assignments/:id", element: authed(<AssignmentReport />) },
              { path: "/settings", element: authed(<Settings />) },
              { path: "/admin", element: authed(<Admin />) },
              { path: "*", element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
