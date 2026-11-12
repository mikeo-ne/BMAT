// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CopyrightReportForm } from "@/components/legal/CopyrightReportForm";
import { TERMS_VERSION } from "@/lib/legal";
import sitemap from "@/app/sitemap";

describe("legal and compliance", () => {
  it("uses a dated terms version", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("lists the copyright policy in the sitemap", () => {
    expect(sitemap().some((e) => e.url.endsWith("/legal/copyright"))).toBe(true);
  });

  it("will not send a copyright report without the good-faith statement", async () => {
    render(<CopyrightReportForm />);
    fireEvent.change(screen.getByLabelText("Your full name"), { target: { value: "Grace Lamaro" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "grace@example.com" } });
    fireEvent.change(screen.getByLabelText("Song title and artist"), { target: { value: "Kampala Nights" } });
    fireEvent.change(screen.getByLabelText("Where you saw it on East Sound"), { target: { value: "proof link" } });
    fireEvent.change(screen.getByLabelText("What is wrong, and how you hold the rights"), { target: { value: "I wrote this song and did not authorise this upload." } });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/confirm the statement/);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/report has been received/);
  });
});
