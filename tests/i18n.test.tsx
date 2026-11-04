// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18nProvider, LANGS, useI18n } from "@/lib/i18n";

/** The site ships English, Luganda and Kiswahili side by side, and the
 *  language choice has to survive a reload without flashing the wrong copy. */
const Probe = () => {
  const { lang, setLang, t } = useI18n();
  return (
    <div>
      <p data-testid="lang">{lang}</p>
      <p data-testid="solutions">{t("solutions")}</p>
      <p data-testid="live">{t("liveTpl").replace("{s}", "32").replace("{v}", "150")}</p>
      <button type="button" onClick={() => setLang("lg")}>
        Luganda
      </button>
      <button type="button" onClick={() => setLang("sw")}>
        Kiswahili
      </button>
    </div>
  );
};

const read = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = "";
});

afterEach(cleanup);

describe("i18n", () => {
  it("offers exactly three languages", () => {
    expect(LANGS.map((l) => l.code)).toEqual(["en", "lg", "sw"]);
  });

  it("translates every key in every language", async () => {
    const seen: Record<string, string[]> = {};
    for (const lang of LANGS) {
      cleanup();
      localStorage.setItem("est_lang", JSON.stringify(lang.code));
      render(
        <I18nProvider>
          <Probe />
        </I18nProvider>,
      );
      await waitFor(() => expect(read("lang")).toBe(lang.code));
      expect(read("solutions")?.length ?? 0).toBeGreaterThan(0);
    }
    // every language resolves the sample key to a different word
    for (const lang of LANGS) {
      cleanup();
      localStorage.setItem("est_lang", JSON.stringify(lang.code));
      render(
        <I18nProvider>
          <Probe />
        </I18nProvider>,
      );
      await waitFor(() => expect(read("lang")).toBe(lang.code));
      seen[lang.code] = [read("solutions") ?? ""];
    }
    expect(new Set(Object.values(seen).flat()).size).toBe(LANGS.length);
  });

  it("speaks English outside a provider instead of crashing", () => {
    render(<Probe />);
    expect(read("lang")).toBe("en");
    expect(read("solutions")).toBe("Solutions");
  });

  it("switches language, stores the choice and tags the document", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(document.documentElement.lang).toBe("en");

    await user.click(screen.getByRole("button", { name: "Luganda" }));
    expect(read("lang")).toBe("lg");
    expect(read("solutions")).toBe("Eby'okugonjoola");
    expect(JSON.parse(localStorage.getItem("est_lang") ?? "null")).toBe("lg");

    await user.click(screen.getByRole("button", { name: "Kiswahili" }));
    expect(read("lang")).toBe("sw");
    expect(read("solutions")).toBe("Suluhisho");
    expect(JSON.parse(localStorage.getItem("est_lang") ?? "null")).toBe("sw");
  });

  it("fills the live-stats template per language", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(read("live")).toBe("32 Streams & 150 Venues Active");
    await user.click(screen.getByRole("button", { name: "Kiswahili" }));
    expect(read("live")).toBe("Vituo 32 na Kumbi 150 Hai");
  });

  it("restores a saved language on mount", async () => {
    localStorage.setItem("est_lang", JSON.stringify("sw"));
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    // effects flush inside render() here, so the saved copy is already applied
    await waitFor(() => expect(read("solutions")).toBe("Suluhisho"));
    expect(read("lang")).toBe("sw");
  });

  it("ignores a stale or unsupported saved language", () => {
    localStorage.setItem("est_lang", JSON.stringify("fr"));
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(read("lang")).toBe("en");
    expect(read("solutions")).toBe("Solutions");
  });

  it("survives unavailable storage", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage disabled");
      },
    });
    try {
      render(
        <I18nProvider>
          <Probe />
        </I18nProvider>,
      );
      expect(read("solutions")).toBe("Solutions");
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});
