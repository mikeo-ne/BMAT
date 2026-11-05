import { describe, expect, it } from "vitest";

import { friendlyAuthError } from "@/lib/auth-context";

describe("sign-in and sign-up messages", () => {
  it("tells someone with an existing account to sign in instead", () => {
    expect(friendlyAuthError("User already registered", "signup")).toMatch(/already has an account.*Sign in/);
  });
  it("explains a failed login without jargon", () => {
    expect(friendlyAuthError("Invalid login credentials", "signin")).toMatch(/Wrong email or password/);
    expect(friendlyAuthError("Email not confirmed", "signin")).toMatch(/Confirm your email/);
    expect(friendlyAuthError("email rate limit exceeded", "signup")).toMatch(/Too many attempts/);
    expect(friendlyAuthError("Failed to fetch", "signin")).toMatch(/Can't reach the server/);
  });
  it("passes through anything it doesn't recognise, with a fallback", () => {
    expect(friendlyAuthError("Something odd", "signin")).toBe("Something odd");
    expect(friendlyAuthError(undefined, "signup")).toBe("Sign-up failed.");
  });
});
