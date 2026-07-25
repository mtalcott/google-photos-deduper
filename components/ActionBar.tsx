import Button from "@mui/material/Button"
import Divider from "@mui/material/Divider"
import Paper from "@mui/material/Paper"
import Stack from "@mui/material/Stack"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import FormControl from "@mui/material/FormControl"
import Select from "@mui/material/Select"
import MenuItem from "@mui/material/MenuItem"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined"
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank"
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded"
import SortIcon from "@mui/icons-material/Sort"
import PhotoSizeSelectLargeIcon from "@mui/icons-material/PhotoSizeSelectLarge"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"

const SORT_LABELS: Record<string, string> = {
  sizeDesc: "Largest Groups First",
  dateDesc: "Date (Newest First)",
  dateAsc: "Date (Oldest First)",
}

const SIZE_LABELS: Record<string, string> = {
  "1x": "Small (1x)",
  "1.5x": "Medium (1.5x)",
  "2x": "Large (2x)",
  "3x": "Extra Large (3x)",
}

interface ActionBarProps {
  totalItems: number
  groupCount: number
  selectedGroupCount: number
  duplicateCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onTrash: () => void
  onRescan: () => void
  sortMode?: string
  onSortModeChange?: (mode: "sizeDesc" | "dateDesc" | "dateAsc") => void
  previewSize?: "1x" | "1.5x" | "2x" | "3x"
  onPreviewSizeChange?: (size: "1x" | "1.5x" | "2x" | "3x") => void
  doNotCrop?: boolean
  onDoNotCropChange?: (doNotCrop: boolean) => void
  hideMetadata?: boolean
  onHideMetadataChange?: (hideMetadata: boolean) => void
}

export function ActionBar({
  totalItems,
  groupCount,
  selectedGroupCount,
  duplicateCount,
  onSelectAll,
  onDeselectAll,
  onTrash,
  onRescan,
  sortMode = "sizeDesc",
  onSortModeChange,
  previewSize = "1x",
  onPreviewSizeChange,
  doNotCrop = false,
  onDoNotCropChange,
  hideMetadata = false,
  onHideMetadataChange,
}: ActionBarProps) {
  return (
    <Paper
      elevation={1}
      sx={{
        position: "sticky",
        top: 64, // below the AppBar (64px standard Toolbar height)
        zIndex: 9,
        px: 3,
        py: 1,
        borderRadius: 0,
        borderBottom: "1px solid",
        borderColor: "divider",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 1.5,
      }}>
      <Stack direction="row" alignItems="center" divider={<Divider orientation="vertical" flexItem />} spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          {totalItems.toLocaleString()} items scanned
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {groupCount} duplicate group{groupCount !== 1 ? "s" : ""}
        </Typography>
      </Stack>

      {groupCount > 0 && (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexGrow: 1 }}>
          <Button
            size="small"
            startIcon={<RefreshRoundedIcon />}
            onClick={onRescan}
            sx={{ height: 30.75 }}
          >
            Re-scan
          </Button>

          {onDoNotCropChange && (
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={doNotCrop}
                  onChange={(e) => onDoNotCropChange(e.target.checked)}
                  sx={{ py: 0, color: "primary.main", "&.Mui-checked": { color: "primary.main" } }}
                />
              }
              label={<Typography variant="body2" sx={{ fontSize: "0.8125rem", color: "primary.main" }}>Do not crop</Typography>}
              sx={{ m: 0, height: 30.75 }}
            />
          )}

          {onHideMetadataChange && (
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={hideMetadata}
                  onChange={(e) => onHideMetadataChange(e.target.checked)}
                  sx={{ py: 0, color: "primary.main", "&.Mui-checked": { color: "primary.main" } }}
                />
              }
              label={<Typography variant="body2" sx={{ fontSize: "0.8125rem", color: "primary.main" }}>Hide metadata</Typography>}
              sx={{ m: 0, height: 30.75 }}
            />
          )}

          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={groupCount > 0 && selectedGroupCount === groupCount}
                indeterminate={selectedGroupCount > 0 && selectedGroupCount < groupCount}
                onChange={(e) => (e.target.checked ? onSelectAll() : onDeselectAll())}
                sx={{ py: 0, color: "primary.main", "&.Mui-checked, &.MuiCheckbox-indeterminate": { color: "primary.main" } }}
              />
            }
            label={<Typography variant="body2" sx={{ fontSize: "0.8125rem", color: "primary.main" }}>Select All</Typography>}
            sx={{ m: 0, height: 30.75 }}
          />

          {onSortModeChange && (
            <FormControl size="small" variant="standard" sx={{ m: 0 }}>
              <Select
                value={sortMode}
                onChange={(e) => onSortModeChange(e.target.value as any)}
                disableUnderline
                renderValue={(val) => (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <SortIcon sx={{ fontSize: 18, color: "primary.main" }} />
                    <Box>{SORT_LABELS[val]}</Box>
                  </Box>
                )}
                sx={{
                  fontSize: "0.8125rem",
                  color: "primary.main",
                  "& .MuiSelect-select": { py: 0, display: "flex", alignItems: "center", height: "30.75px" },
                  "& .MuiSelect-icon": { color: "primary.main", fontSize: 18 }
                }}
              >
                <MenuItem value="sizeDesc" sx={{ fontSize: "0.8125rem" }}>{SORT_LABELS.sizeDesc}</MenuItem>
                <MenuItem value="dateDesc" sx={{ fontSize: "0.8125rem" }}>{SORT_LABELS.dateDesc}</MenuItem>
                <MenuItem value="dateAsc" sx={{ fontSize: "0.8125rem" }}>{SORT_LABELS.dateAsc}</MenuItem>
              </Select>
            </FormControl>
          )}

          {onPreviewSizeChange && (
            <FormControl size="small" variant="standard" sx={{ m: 0 }}>
              <Select
                value={previewSize}
                onChange={(e) => onPreviewSizeChange(e.target.value as any)}
                disableUnderline
                renderValue={(val) => (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <PhotoSizeSelectLargeIcon sx={{ fontSize: 18, color: "primary.main" }} />
                    <Box>{SIZE_LABELS[val]}</Box>
                  </Box>
                )}
                sx={{
                  fontSize: "0.8125rem",
                  color: "primary.main",
                  "& .MuiSelect-select": { py: 0, display: "flex", alignItems: "center", height: "30.75px" },
                  "& .MuiSelect-icon": { color: "primary.main", fontSize: 18 }
                }}
              >
                <MenuItem value="1x" sx={{ fontSize: "0.8125rem" }}>{SIZE_LABELS["1x"]}</MenuItem>
                <MenuItem value="1.5x" sx={{ fontSize: "0.8125rem" }}>{SIZE_LABELS["1.5x"]}</MenuItem>
                <MenuItem value="2x" sx={{ fontSize: "0.8125rem" }}>{SIZE_LABELS["2x"]}</MenuItem>
                <MenuItem value="3x" sx={{ fontSize: "0.8125rem" }}>{SIZE_LABELS["3x"]}</MenuItem>
              </Select>
            </FormControl>
          )}

          <Box sx={{ flexGrow: 1 }} />
          <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />
          <Button
            variant="contained"
            color="error"
            size="small"
            startIcon={<DeleteOutlineRoundedIcon />}
            disabled={duplicateCount === 0}
            onClick={onTrash}>
            Move {duplicateCount} Duplicate{duplicateCount !== 1 ? "s" : ""} to Trash
          </Button>
        </Stack>
      )}
    </Paper>
  )
}
