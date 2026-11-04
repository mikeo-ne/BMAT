// @vitest-environment jsdom
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { AirtimeAlerts } from "@/components/airtime-alerts";
import {
  buildCampaigns,
  buildSlots,
  buildAirtimeAlerts,
} from "@/lib/advertising";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DeliverySplitEditor } from "@/components/delivery-split-editor";
import { EvidenceModal } from "@/components/evidence-modal";
import { HelpTip } from "@/components/help-tip";
import { UgandaAirplayMap } from "@/components/uganda-airplay-map";
import { WeightingControls } from "@/components/weighting-controls";
import { buildFixtureTracks as buildSeedTracks } from "@/tests/fixtures/catalogue";
import { createDeliveryParties } from "@/lib/delivery-splits";
import { buildBroadcastLog } from "@/lib/playout";
import { DEFAULT_WEIGHTING } from "@/lib/dayparts";
import { isWorkspace, workspaceForPath, WORKSPACES } from "@/lib/workspaces";
const NOW = new Date("2026-11-01T12:00:00Z");
const log = buildBroadcastLog(buildSeedTracks(NOW), NOW);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("metadata onboarding", () => {
  it("keeps focused help open while scrolling or moving the pointer away", () => {
    vi.useFakeTimers();
    try {
      render(<HelpTip topic="isrc" />);
      const button = screen.getByRole("button");
      act(() => button.focus());
      fireEvent.scroll(window);
      fireEvent.mouseLeave(button.parentElement!);
      act(() => vi.advanceTimersByTime(200));
      expect(screen.getByRole("tooltip")).toBeTruthy();
      fireEvent.keyDown(button, { key: "Escape" });
      expect(screen.queryByRole("tooltip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps an explanation near the left edge inside a narrow viewport", () => {
    vi.stubGlobal("innerWidth", 320);
    render(<HelpTip topic="isrc" />);
    const button = screen.getByRole("button");
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 124,
      left: 16,
      right: 40,
      width: 24,
      height: 24,
      x: 16,
      y: 100,
      toJSON() {},
    });
    fireEvent.focus(button);
    const tooltip = screen.getByRole("tooltip");
    expect(Number.parseFloat(tooltip.style.left)).toBeGreaterThanOrEqual(16);
    expect(
      Number.parseFloat(tooltip.style.left) +
        Number.parseFloat(tooltip.style.width),
    ).toBeLessThanOrEqual(304);
  });
  it("provides a keyboard-discoverable explanation of ISRC vs composition rights", () => {
    render(<HelpTip topic="isrc" />);
    fireEvent.focus(screen.getByRole("button", { name: "What is ISRC?" }));
    expect(screen.getByRole("tooltip").textContent).toContain(
      "does not identify the underlying song",
    );
    fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });
  it("adds a public view while retaining all specialized workspaces", () => {
    expect(WORKSPACES).toHaveLength(7);
    expect(isWorkspace("public")).toBe(true);
    expect(workspaceForPath("/dashboard/charts")).toBe("public");
    expect(
      WORKSPACES.some(
        (workspace) => workspace.label === "Broadcaster Playout Log",
      ),
    ).toBe(true);
    expect(workspaceForPath("/dashboard/cmo")).toBe("cmo");
    expect(workspaceForPath("/dashboard/playout")).toBe("broadcaster");
    expect(isWorkspace("advertiser")).toBe(true);
    expect(isWorkspace("label")).toBe(true);
    expect(isWorkspace("venue")).toBe(true);
    expect(isWorkspace("admin-root")).toBe(false);
  });
});

describe("Uganda regional map", () => {
  it("server-renders SVG titles as one text node for safe hydration", () => {
    const html = renderToString(
      <UgandaAirplayMap
        events={log}
        focusRegion="All"
        onFocusRegion={() => {}}
      />,
    );
    const titles = html.match(/<title>.*?<\/title>/g) ?? [];
    expect(titles).toHaveLength(4);
    expect(titles.every((title) => !title.includes("<!--"))).toBe(true);
  });
  it("supports mouse and keyboard filtering for all four regions", () => {
    const onFocusRegion = vi.fn();
    render(
      <UgandaAirplayMap
        events={log}
        focusRegion="All"
        onFocusRegion={onFocusRegion}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Filter to Central region/ }),
    );
    expect(onFocusRegion).toHaveBeenLastCalledWith("Central");
    fireEvent.keyDown(
      screen.getByRole("button", { name: /Filter to Northern region/ }),
      { key: "Enter" },
    );
    expect(onFocusRegion).toHaveBeenLastCalledWith("Northern");
    expect(
      screen.getByText(/Schematic · not administrative boundaries/),
    ).toBeTruthy();
  });
  it("can clear an active selection and renders a safe empty state", () => {
    const onFocusRegion = vi.fn();
    render(
      <UgandaAirplayMap
        events={[]}
        focusRegion="Western"
        onFocusRegion={onFocusRegion}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset map" }));
    expect(onFocusRegion).toHaveBeenCalledWith("All");
    expect(screen.getByText("Western selected · 0 matched spins")).toBeTruthy();
  });
});

describe("local split-sheet approvals", () => {
  function Editor() {
    const [parties, setParties] = useState(
      createDeliveryParties("QA Artist Alpha"),
    );
    return (
      <DeliverySplitEditor
        parties={parties}
        onChange={setParties}
        recordingReady
      />
    );
  }
  it("requires matching typed-name consent, records approval, then invalidates it on edit", () => {
    render(<Editor />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Record approval for QA Artist Alpha",
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog)
        .getByRole("button", { name: "Record local approval" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Type the collaborator/), {
      target: { value: "QA Artist Alpha" },
    });
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Record local approval" }),
    );
    expect(screen.getByText("1/1 approvals")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add co-writer" }));
    expect(screen.getByText("0/2 approvals")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Record approval for QA Artist Alpha" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("keeps the three rights allocations independent", () => {
    render(<Editor />);
    fireEvent.change(
      screen.getByLabelText("QA Artist Alpha Master ownership percentage"),
      { target: { value: "80" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Performance rights100%/ }),
    );
    expect(
      (
        screen.getByLabelText(
          "QA Artist Alpha Performance rights percentage",
        ) as HTMLInputElement
      ).value,
    ).toBe("100");
    expect(
      screen.getByText(/Master ownership must total exactly 100%/),
    ).toBeTruthy();
  });
});

describe("audible evidence and weights", () => {
  it("exposes a ten-second audio player without misrepresenting demo audio as a capture", () => {
    render(<EvidenceModal spin={log[0]} onClose={() => {}} />);
    expect(
      screen.getByRole("dialog", { name: "Audible Evidence Snippet" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Demonstration audio, not captured evidence/),
    ).toBeTruthy();
    const audio = screen.getByLabelText(
      /10-second synthesized demo/,
    ) as HTMLAudioElement;
    expect(audio.controls).toBe(true);
    expect(audio.src.startsWith("data:audio/wav;base64,")).toBe(true);
    expect(screen.getByText(/cannot independently verify/)).toBeTruthy();
  });
  it("updates prime-time weights and supports flat-rate mode", () => {
    const onChange = vi.fn(),
      onEnabled = vi.fn();
    render(
      <WeightingControls
        policy={DEFAULT_WEIGHTING}
        enabled
        onChange={onChange}
        onEnabled={onEnabled}
      />,
    );
    fireEvent.change(screen.getByLabelText("Prime time multiplier"), {
      target: { value: "2" },
    });
    expect(onChange).toHaveBeenCalledWith({
      prime: 2,
      standard: 1,
      night: 0.8,
    });
    fireEvent.click(screen.getByRole("switch"));
    expect(onEnabled).toHaveBeenCalledWith(false);
  });
});

describe("advertiser breach queue", () => {
  it("shows a manageable first page, reveals remaining records and resets on filtering", () => {
    const campaigns = buildCampaigns();
    const slots = Object.fromEntries(
      campaigns.map((campaign) => [campaign.id, buildSlots(campaign)]),
    );
    const alerts = buildAirtimeAlerts(campaigns, slots);
    render(<AirtimeAlerts alerts={alerts} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Show more breaches" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(16);
    fireEvent.click(screen.getByRole("button", { name: /Never aired/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(
      Math.min(
        8,
        alerts.filter((alert) => alert.severity === "critical").length,
      ),
    );
  });
});
