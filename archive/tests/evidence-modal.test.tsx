// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvidenceModal } from "@/components/evidence-modal";
import { verifyCapturedEvidence } from "@/lib/evidence-client";
import { capturedSpin } from "@/tests/fixtures/captured";

vi.mock("@/lib/evidence-client", () => ({ verifyCapturedEvidence: vi.fn() }));
const verify = vi.mocked(verifyCapturedEvidence);
const createObjectURL = vi.fn(() => "blob:qa-verified-bytes");
const revokeObjectURL = vi.fn();
const evidence = {
  url: "https://evidence.example.com/qa-ten-second.wav",
  sha256: "a".repeat(64),
};

beforeEach(() => {
  verify.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function view() {
  const rendered = render(
    <EvidenceModal spin={capturedSpin({ evidence })} onClose={() => {}} />,
  );
  const audio = screen.getByLabelText(
    /^10-second broadcast evidence from/,
  ) as HTMLAudioElement;
  Object.defineProperty(audio, "duration", { value: 10, configurable: true });
  return { ...rendered, audio };
}

describe("capture evidence player boundaries", () => {
  it("never substitutes generated audio for a capture without an attached asset", () => {
    render(<EvidenceModal spin={capturedSpin()} onClose={() => {}} />);
    expect(
      screen.queryByLabelText(/^10-second broadcast evidence from/),
    ).toBeNull();
    expect(
      screen.getByText(/will not substitute generated audio/),
    ).toBeTruthy();
    expect(verify).not.toHaveBeenCalled();
  });

  it("blocks non-ten-second assets and caps playback and seeking at ten seconds", () => {
    const { audio } = view();
    fireEvent.loadedMetadata(audio);
    fireEvent.play(audio);
    expect(audio.pause).not.toHaveBeenCalled();
    audio.currentTime = 10;
    fireEvent.timeUpdate(audio);
    expect(audio.pause).toHaveBeenCalledOnce();
    audio.currentTime = 12;
    fireEvent.seeking(audio);
    expect(audio.currentTime).toBe(10);
    Object.defineProperty(audio, "duration", { value: 60, configurable: true });
    fireEvent.loadedMetadata(audio);
    expect(screen.getByRole("alert").textContent).toContain(
      "not a ten-second excerpt",
    );
    expect(audio.pause).toHaveBeenCalledTimes(2);
  });

  it("immediately pauses an already playing asset when downloaded bytes mismatch", async () => {
    verify.mockResolvedValue({ status: "mismatch" });
    const { audio } = view();
    fireEvent.play(audio);
    expect(audio.pause).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Verify downloaded SHA-256" }),
    );
    await screen.findByText(/Digest mismatch\. Playback is blocked/);
    expect(audio.pause).toHaveBeenCalledOnce();
    fireEvent.play(audio);
    expect(audio.pause).toHaveBeenCalledTimes(2);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(verify).toHaveBeenCalledWith(
      evidence.url,
      evidence.sha256,
      expect.any(AbortSignal),
    );
  });

  it("plays only the verified Blob after explicit success and revokes it on close", async () => {
    const blob = new Blob(["QA asset bytes, not a real master"], {
      type: "audio/wav",
    });
    verify.mockResolvedValue({ status: "verified", blob });
    const { audio, unmount } = view();
    expect(verify).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Verify downloaded SHA-256" }),
    );
    const result = await screen.findByRole("button", {
      name: "Downloaded bytes match SHA-256",
    });
    expect((result as HTMLButtonElement).disabled).toBe(true);
    expect(audio.getAttribute("src")).toBe("blob:qa-verified-bytes");
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:qa-verified-bytes");
  });
});
