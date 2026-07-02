import type { PermitStatus } from "../../api/types";
import { usePermits } from "../../hooks/usePermits";
import { QueryResult } from "../common/QueryResult";
import { PermitCard } from "./PermitCard";

export function PermitGroup({
  title,
  status,
  zoneId,
}: {
  title: string;
  status: PermitStatus;
  zoneId: string | undefined;
}) {
  const { data, isLoading, error } = usePermits({ status, zone_id: zoneId });
  const items = data?.items ?? [];

  return (
    <section>
      <h2>
        {title} ({data?.count ?? 0})
      </h2>
      <QueryResult
        isLoading={isLoading}
        error={error}
        isEmpty={items.length === 0}
        emptyLabel={`No ${title.toLowerCase()} permits.`}
      >
        <div className="card-grid">
          {items.map((permit) => (
            <PermitCard key={permit.permit_id} permit={permit} />
          ))}
        </div>
      </QueryResult>
    </section>
  );
}
