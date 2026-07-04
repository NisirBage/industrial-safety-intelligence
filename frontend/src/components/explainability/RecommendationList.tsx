import type { Recommendation } from "../../lib/recommendations";

export function RecommendationList({ recommendations }: { recommendations: Recommendation[] }) {
  if (recommendations.length === 0) {
    return <p>No recommended actions for this assessment.</p>;
  }
  return (
    <ul className="recommendation-list">
      {recommendations.map((recommendation) => (
        <li key={recommendation.id} className={`recommendation recommendation-${recommendation.severity}`}>
          {recommendation.text}
        </li>
      ))}
    </ul>
  );
}
