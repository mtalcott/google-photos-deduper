import { ThemeProvider } from "@mui/material/styles"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { RatingPromptDialog } from "../../components/RatingPromptDialog"
import theme from "../../lib/theme"

function renderDialog() {
  const props = {
    open: true,
    onReview: vi.fn(),
    onFeedback: vi.fn(),
    onLater: vi.fn(),
    onNever: vi.fn()
  }
  render(
    <ThemeProvider theme={theme}>
      <RatingPromptDialog {...props} />
    </ThemeProvider>
  )
  return props
}

describe("RatingPromptDialog", () => {
  it("asks for an honest review without sentiment gating", () => {
    renderDialog()

    expect(
      screen.getByText("How was your PhotoSweep scan?")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Leave an honest review" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Send feedback" })
    ).toBeInTheDocument()
    expect(screen.queryByText(/love|five star/i)).not.toBeInTheDocument()
  })

  it("offers review, defer, and permanent dismissal actions", () => {
    const props = renderDialog()

    fireEvent.click(
      screen.getByRole("button", { name: "Leave an honest review" })
    )
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }))
    fireEvent.click(screen.getByRole("button", { name: "Maybe later" }))
    fireEvent.click(screen.getByRole("button", { name: "Don't ask again" }))

    expect(props.onReview).toHaveBeenCalledOnce()
    expect(props.onFeedback).toHaveBeenCalledOnce()
    expect(props.onLater).toHaveBeenCalledOnce()
    expect(props.onNever).toHaveBeenCalledOnce()
  })
})
