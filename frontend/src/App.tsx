import { NavLink, Outlet } from "react-router-dom";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

const navLink = ({ isActive }: { isActive: boolean }) =>
  isActive ? "nav-link nav-link--active" : "nav-link";

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark">◈</span>
          <div>
            <div className="brand__title">SKU Inspection</div>
            <div className="brand__sub">Multi-SKU visual QA</div>
          </div>
        </div>

        <nav className="nav">
          <div className="nav__group">Runtime</div>
          <NavLink to="/inspect" className={navLink}>
            Run inspection
          </NavLink>
          <NavLink to="/inspections" className={navLink}>
            Inspection log
          </NavLink>

          <div className="nav__group">Build</div>
          <NavLink to="/skus" className={navLink}>
            SKU bundles
          </NavLink>
        </nav>

        <div className="sidebar__foot">
          <span className={`mode-pill ${USE_MOCKS ? "mode-pill--mock" : "mode-pill--live"}`}>
            {USE_MOCKS ? "MOCK API" : "LIVE API"}
          </span>
          <div className="sidebar__hint">
            Contract: <code>openapi/openapi.yaml</code>
          </div>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
