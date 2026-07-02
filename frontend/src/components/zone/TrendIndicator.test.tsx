import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TrendIndicator } from "./TrendIndicator";

describe("TrendIndicator", () => {
  it("shows rising when current exceeds previous", () => {
    render(<TrendIndicator current={50} previous={30} />);
    expect(screen.getByText(/rising/)).toBeInTheDocument();
  });

  it("shows falling when current is below previous", () => {
    render(<TrendIndicator current={20} previous={30} />);
    expect(screen.getByText(/falling/)).toBeInTheDocument();
  });

  it("shows steady when values are equal", () => {
    render(<TrendIndicator current={30} previous={30} />);
    expect(screen.getByText(/steady/)).toBeInTheDocument();
  });

  it("shows a placeholder when there is no previous value", () => {
    render(<TrendIndicator current={30} previous={undefined} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
