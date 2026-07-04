/** The exact, deduplicated `rules_fired` list Justification Builder
 * assembled (agent rules, then Fusion's, then the one derived
 * tier-transition rule) - rendered in that same order, nothing
 * resorted or grouped, since the order itself is part of what the
 * backend already decided. */
export function RulesFiredList({ rules }: { rules: string[] }) {
  if (rules.length === 0) {
    return <p>No rules fired for this assessment.</p>;
  }
  return (
    <ul className="rules-fired-list">
      {rules.map((rule) => (
        <li key={rule} className="rule-tag">
          {rule}
        </li>
      ))}
    </ul>
  );
}
