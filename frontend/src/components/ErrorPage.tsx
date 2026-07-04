import { useRouteError, Link, isRouteErrorResponse } from "react-router-dom";

export function ErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Unknown error";
  return (
    <div className="state state--error" style={{ margin: 48 }} role="alert">
      <div className="state__title">Page failed to load</div>
      <div className="state__msg">{message}</div>
      <Link className="btn" to="/">
        Back to start
      </Link>
    </div>
  );
}
