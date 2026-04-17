/**
 * Unit tests for lib/scan-results.ts — areScanResultsValid().
 *
 * This function is exercised indirectly by app-reducer.test.ts but
 * a direct test makes the invalidation contract explicit and catches
 * future condition additions without relying on reducer state boilerplate.
 */
import { describe, it, expect } from "vitest"
import { areScanResultsValid } from "../../lib/scan-results"

describe("areScanResultsValid", () => {
  it("returns true when both account emails match", () => {
    expect(
      areScanResultsValid(
        { accountEmail: "user@example.com" },
        { accountEmail: "user@example.com" }
      )
    ).toBe(true)
  })

  it("returns false when account emails differ", () => {
    expect(
      areScanResultsValid(
        { accountEmail: "alice@example.com" },
        { accountEmail: "bob@example.com" }
      )
    ).toBe(false)
  })

  it("returns true when stored email is undefined (legacy results without email)", () => {
    expect(
      areScanResultsValid(
        { accountEmail: undefined },
        { accountEmail: "user@example.com" }
      )
    ).toBe(true)
  })

  it("returns true when context email is undefined (health check did not return email)", () => {
    expect(
      areScanResultsValid(
        { accountEmail: "user@example.com" },
        { accountEmail: undefined }
      )
    ).toBe(true)
  })

  it("returns true when both emails are undefined", () => {
    expect(
      areScanResultsValid(
        { accountEmail: undefined },
        { accountEmail: undefined }
      )
    ).toBe(true)
  })
})
