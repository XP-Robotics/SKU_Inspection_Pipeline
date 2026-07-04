import { NavLink } from "react-router-dom";

const link = ({ isActive }: { isActive: boolean }) =>
  isActive ? "subnav__link subnav__link--active" : "subnav__link";

/** Tab strip shared by the per-SKU build pages (SOP / Dataset / Metrics). */
export function SkuSubnav({ skuId }: { skuId: string }) {
  return (
    <nav className="subnav">
      <NavLink to={`/skus/${skuId}/sop`} className={link}>
        SOP
      </NavLink>
      <NavLink to={`/skus/${skuId}/dataset`} className={link}>
        Dataset
      </NavLink>
      <NavLink to={`/skus/${skuId}/metrics`} className={link}>
        Metrics
      </NavLink>
      <NavLink to={`/inspect?sku=${skuId}`} className="subnav__link subnav__link--run">
        Inspect →
      </NavLink>
    </nav>
  );
}
