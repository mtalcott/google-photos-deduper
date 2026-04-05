import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Divider from "@mui/material/Divider"
import Paper from "@mui/material/Paper"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded"

interface ActionBarProps {
  totalItems: number
  groupCount: number
  duplicateCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onTrash: () => void
  onRescan: () => void
}

export function ActionBar({
  totalItems,
  groupCount,
  duplicateCount,
  onSelectAll,
  onDeselectAll,
  onTrash,
  onRescan,
}: ActionBarProps) {
  return (
    <Paper
      elevation={2}
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        px: 3,
        py: 1.5,
        borderRadius: 0,
        borderBottom: "1px solid",
        borderColor: "divider",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 1.5,
      }}>
      <Stack direction="row" alignItems="center" spacing={0} sx={{ color: "text.secondary" }}>
        <Typography variant="body2">
          {totalItems.toLocaleString()} items scanned
        </Typography>
        <Divider orientation="vertical" flexItem sx={{ mx: 1.5, my: 0.5 }} />
        <Typography variant="body2">
          {groupCount} duplicate group{groupCount !== 1 ? "s" : ""}
        </Typography>
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          size="small"
          startIcon={<RefreshRoundedIcon />}
          onClick={onRescan}>
          Re-scan
        </Button>

        {groupCount > 0 && (
          <>
            <Button size="small" onClick={onSelectAll}>
              Select All
            </Button>
            <Button size="small" onClick={onDeselectAll}>
              Deselect All
            </Button>
            <Box sx={{ width: 1, bgcolor: "divider", alignSelf: "stretch" }} />
            <Button
              variant="contained"
              color="error"
              size="medium"
              startIcon={<DeleteOutlineRoundedIcon />}
              disabled={duplicateCount === 0}
              onClick={onTrash}>
              Move {duplicateCount} Duplicate
              {duplicateCount !== 1 ? "s" : ""} to Trash
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  )
}
