/** Item 9 (visual polish) - a shimmering skeleton in place of a bare
 * "Loading..." string, since `QueryResult` renders this for every
 * page in the app. The `role="status"` and visible label are
 * unchanged so existing behavior (and the one test that checks for
 * it) still holds - this only changes what it looks like. */
export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="state state-loading" role="status">
      <span className="visually-hidden">{label}</span>
      <div className="skeleton-grid" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton-line skeleton-line-short" />
            <div className="skeleton-line skeleton-line-long" />
            <div className="skeleton-line skeleton-line-medium" />
          </div>
        ))}
      </div>
    </div>
  );
}
