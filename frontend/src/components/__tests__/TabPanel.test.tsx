import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TabPanel from "../TabPanel";

describe("TabPanel", () => {
  it("renders children only when tab is active", () => {
    const { rerender } = render(
      <TabPanel value={0} index={1}>
        Hidden content
      </TabPanel>,
    );
    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();

    rerender(
      <TabPanel value={1} index={1}>
        Visible content
      </TabPanel>,
    );
    expect(screen.getByText("Visible content")).toBeInTheDocument();
  });
});
