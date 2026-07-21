import RateReviewRoundedIcon from "@mui/icons-material/RateReviewRounded"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import Typography from "@mui/material/Typography"

import { photoSweepColors } from "../lib/theme"

export type RatingPromptDialogProps = {
  open: boolean
  onReview: () => void
  onFeedback: () => void
  onLater: () => void
  onNever: () => void
}

export function RatingPromptDialog({
  open,
  onReview,
  onFeedback,
  onLater,
  onNever
}: RatingPromptDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onLater}
      fullWidth
      maxWidth="xs"
      aria-labelledby="rating-prompt-title"
      slotProps={{
        backdrop: {
          sx: {
            bgcolor: "rgba(23, 32, 28, 0.34)",
            backdropFilter: "blur(3px)"
          }
        },
        paper: {
          sx: {
            borderRadius: 2.5,
            border: "1px solid",
            borderColor: photoSweepColors.border,
            bgcolor: photoSweepColors.surface,
            boxShadow: "0 24px 70px rgba(23, 32, 28, 0.22)"
          }
        }
      }}>
      <DialogTitle id="rating-prompt-title">
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <RateReviewRoundedIcon color="primary" />
          How was your PhotoSweep scan?
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography color="text.secondary">
          Whether everything worked well or something could be better, we would
          like to hear about it. You can leave an honest public review or send
          feedback directly to the PhotoSweep team.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, flexWrap: "wrap" }}>
        <Button onClick={onNever} color="inherit">
          Don&apos;t ask again
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onLater}>Maybe later</Button>
        <Button onClick={onFeedback} variant="outlined">
          Send feedback
        </Button>
        <Button onClick={onReview} variant="contained">
          Leave an honest review
        </Button>
      </DialogActions>
    </Dialog>
  )
}
