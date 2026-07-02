import type { ReactNode } from "react";

import { NavBar } from "./NavBar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard-layout">
      <NavBar />
      <main className="dashboard-content">{children}</main>
    </div>
  );
}
