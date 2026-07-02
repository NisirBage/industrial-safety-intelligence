import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiError } from "../../api/client";
import { ErrorState } from "./ErrorState";

describe("ErrorState", () => {
  it("renders the backend's own error code and message directly", () => {
    render(<ErrorState error={new ApiError("bad status value", "INVALID_STATUS", 400)} />);

    expect(screen.getByText("INVALID_STATUS")).toBeInTheDocument();
    expect(screen.getByText("bad status value")).toBeInTheDocument();
    expect(screen.getByText("HTTP 400")).toBeInTheDocument();
  });

  it("omits the HTTP status line for client-side failures with no response", () => {
    render(<ErrorState error={new ApiError("Could not reach the backend.", "NETWORK_ERROR", null)} />);

    expect(screen.getByText("NETWORK_ERROR")).toBeInTheDocument();
    expect(screen.queryByText(/HTTP/)).not.toBeInTheDocument();
  });

  it("falls back to a generic message for a non-ApiError", () => {
    render(<ErrorState error={new Error("boom")} />);
    expect(screen.getByText("UNKNOWN_ERROR")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});
