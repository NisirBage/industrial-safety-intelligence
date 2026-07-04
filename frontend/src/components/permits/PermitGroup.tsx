import type { PermitStatus, Zone } from "../../api/types";
import { usePermits } from "../../hooks/usePermits";
import { QueryResult } from "../common/QueryResult";
import { PermitCard } from "./PermitCard";

export function PermitGroup({
  title,
  status,
  zoneId,
  zones,
}: {
  title: string;
  status: PermitStatus;
  zoneId: string | undefined;
  zones?: Zone[];
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
            <PermitCard key={permit.permit_id} permit={permit} zones={zones} />
          ))}
        </div>
      </QueryResult>
    </section>
  );
}
