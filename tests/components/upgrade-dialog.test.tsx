import { ThemeProvider } from "@mui/material/styles"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { UpgradeDialog } from "../../components/UpgradeDialog"
import theme from "../../lib/theme"

function renderDialog(
  props: Partial<Parameters<typeof UpgradeDialog>[0]> = {}
) {
  const defaults: Parameters<typeof UpgradeDialog>[0] = {
    open: true,
    reason: "scan",
    onClose: vi.fn(),
    onChoosePlan: vi.fn(),
    onRefreshLicense: vi.fn(),
    onRecoverLicense: vi.fn()
  }
  const merged = { ...defaults, ...props }
  return {
    ...render(
      <ThemeProvider theme={theme}>
        <UpgradeDialog {...merged} />
      </ThemeProvider>
    ),
    props: merged
  }
}

describe("UpgradeDialog", () => {
  it("shows the paid contract, USD prices, and restore-purchase controls", () => {
    renderDialog()

    expect(screen.getByText("Mini Cleanup")).toBeInTheDocument()
    expect(screen.getByText("$2.99 USD")).toBeInTheDocument()
    expect(screen.getByText(/permanent limited unlock/i)).toBeInTheDocument()
    expect(screen.getByText("Cleanup Pass")).toBeInTheDocument()
    expect(screen.getByText("$4.99 USD")).toBeInTheDocument()
    expect(screen.getByText(/seven days/i)).toBeInTheDocument()
    expect(screen.getByText("Lifetime Early Access")).toBeInTheDocument()
    expect(screen.getByText("$14.99 USD")).toBeInTheDocument()
    expect(
      screen.getByText(/one-time payments through Stripe/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/7-day refund policy/i)).toBeInTheDocument()
    expect(screen.getByLabelText("Purchase email")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Recover" })).toBeDisabled()
  })

  it("requests license recovery with the entered purchase email", async () => {
    const onRecoverLicense = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onRecoverLicense })

    fireEvent.change(screen.getByLabelText("Purchase email"), {
      target: { value: "buyer@example.com" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Recover" }))

    await waitFor(() => {
      expect(onRecoverLicense).toHaveBeenCalledWith("buyer@example.com")
    })
    expect(
      await screen.findByText(/recovery instructions have been requested/i)
    ).toBeInTheDocument()
  })
})
