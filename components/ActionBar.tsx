import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined"
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank"
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded"
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded"
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded"
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded"
import TuneRoundedIcon from "@mui/icons-material/TuneRounded"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Divider from "@mui/material/Divider"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Paper from "@mui/material/Paper"
import Stack from "@mui/material/Stack"
import ToggleButton from "@mui/material/ToggleButton"
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import Typography from "@mui/material/Typography"
import { useState } from "react"

import { KEEP_STRATEGY_LABELS, type KeepStrategy } from "../lib/keep-strategy"
import { photoSweepColors } from "../lib/theme"

export type ReviewFilter = "all" | "exact" | "similar"

interface ActionBarProps {
  totalItems: number
  groupCount: number
  totalGroupCount: number
  reviewedGroupCount: number
  exactGroupCount: number
  similarGroupCount: number
  reviewFilter: ReviewFilter
  onReviewFilterChange: (filter: ReviewFilter) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onRescan: () => void
  onExportJson: () => void
  onExportCsv: () => void
  onApplyKeepStrategy: (strategy: KeepStrategy) => void
  compact?: boolean
}

export function ActionBar({
  totalItems,
  groupCount,
  totalGroupCount,
  reviewedGroupCount,
  exactGroupCount,
  similarGroupCount,
  reviewFilter,
  onReviewFilterChange,
  onSelectAll,
  onDeselectAll,
  onRescan,
  onExportJson,
  onExportCsv,
  onApplyKeepStrategy,
  compact = false
}: ActionBarProps) {
  const [keepMenuAnchor, setKeepMenuAnchor] = useState<HTMLElement | null>(null)
  const keepMenuOpen = Boolean(keepMenuAnchor)
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<HTMLElement | null>(null)
  const moreMenuOpen = Boolean(moreMenuAnchor)

  return (
    <Paper
      elevation={0}
      sx={{
        position: compact ? "static" : "sticky",
        top: compact ? undefined : 80,
        zIndex: 9,
        px: compact ? 1 : { xs: 1.5, md: 2 },
        py: compact ? 1 : 1.25,
        mb: compact ? 1 : 2,
        borderRadius: compact ? 2.25 : 3,
        border: "1px solid",
        borderColor: compact
          ? photoSweepColors.border
          : "rgba(214,226,221,0.86)",
        bgcolor: compact
          ? photoSweepColors.surface
          : photoSweepColors.surfaceTint,
        backdropFilter: compact ? "none" : "saturate(180%) blur(24px)",
        boxShadow: compact ? "none" : `0 18px 52px ${photoSweepColors.shadow}`,
        display: "flex",
        justifyContent: compact ? "space-between" : "flex-start",
        alignItems: compact ? "center" : "stretch",
        flexWrap: "wrap",
        gap: compact ? 1 : 1.5
      }}>
      <Box
        sx={{
          minWidth: compact ? "100%" : "100%",
          display: compact ? "grid" : "block",
          gridTemplateColumns: compact ? "36px minmax(0, 1fr)" : undefined,
          gap: compact ? 1 : undefined,
          alignItems: compact ? "center" : undefined
        }}>
        {compact && (
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              bgcolor: photoSweepColors.primarySoft,
              color: photoSweepColors.primary
            }}>
            <ArticleOutlinedIcon sx={{ fontSize: 19 }} />
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            fontWeight={800}
            sx={{ lineHeight: 1.2 }}>
            {groupCount.toLocaleString()} duplicate set
            {groupCount !== 1 ? "s" : ""} to review
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.2, lineHeight: 1.25 }}>
            {reviewedGroupCount.toLocaleString()} of{" "}
            {groupCount.toLocaleString()} visible sets reviewed
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", lineHeight: 1.25 }}>
            {totalItems.toLocaleString()} photos and videos checked
            {groupCount !== totalGroupCount ? " · " : ""}
            {groupCount !== totalGroupCount && (
              <Box component="span">
                {totalGroupCount.toLocaleString()} sets total
              </Box>
            )}
          </Typography>
        </Box>
      </Box>

      {totalGroupCount > 0 && compact && (
        <Box
          sx={{
            width: "100%",
            display: "grid",
            gap: 0.8
          }}>
          <ToggleButtonGroup
            value={reviewFilter}
            exclusive
            size="small"
            fullWidth
            aria-label="Review filter"
            sx={{
              bgcolor: photoSweepColors.surfaceSoft,
              borderRadius: 1.75,
              p: 0.25,
              "& .MuiToggleButton-root": {
                borderColor: "transparent",
                minHeight: 38,
                px: 1,
                fontSize: 12.5,
                fontWeight: 700
              }
            }}
            onChange={(_, value) => {
              if (value !== null) onReviewFilterChange(value)
            }}>
            <ToggleButton value="all">
              All ({totalGroupCount.toLocaleString()})
            </ToggleButton>
            <ToggleButton value="exact">
              Exact ({exactGroupCount.toLocaleString()})
            </ToggleButton>
            <ToggleButton value="similar">
              Similar ({similarGroupCount.toLocaleString()})
            </ToggleButton>
          </ToggleButtonGroup>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 0.75
            }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<TuneRoundedIcon />}
              disabled={groupCount === 0}
              onClick={(event) => setKeepMenuAnchor(event.currentTarget)}
              aria-controls={keepMenuOpen ? "keep-strategy-menu" : undefined}
              aria-haspopup="menu"
              aria-expanded={keepMenuOpen ? "true" : undefined}
              sx={{ minHeight: 40, fontWeight: 800 }}>
              Selection
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<MoreHorizRoundedIcon />}
              onClick={(event) => setMoreMenuAnchor(event.currentTarget)}
              aria-controls={moreMenuOpen ? "review-more-menu" : undefined}
              aria-haspopup="menu"
              aria-expanded={moreMenuOpen ? "true" : undefined}
              sx={{ minHeight: 40, fontWeight: 800 }}>
              More
            </Button>
          </Box>

          <Menu
            id="keep-strategy-menu"
            anchorEl={keepMenuAnchor}
            open={keepMenuOpen}
            onClose={() => setKeepMenuAnchor(null)}>
            {(Object.keys(KEEP_STRATEGY_LABELS) as KeepStrategy[]).map(
              (strategy) => (
                <MenuItem
                  key={strategy}
                  onClick={() => {
                    onApplyKeepStrategy(strategy)
                    setKeepMenuAnchor(null)
                  }}>
                  {KEEP_STRATEGY_LABELS[strategy]}
                </MenuItem>
              )
            )}
            <Divider />
            <MenuItem
              disabled={groupCount === 0}
              onClick={() => {
                onSelectAll()
                setKeepMenuAnchor(null)
              }}>
              Include all sets
            </MenuItem>
            <MenuItem
              disabled={groupCount === 0}
              onClick={() => {
                onDeselectAll()
                setKeepMenuAnchor(null)
              }}>
              Skip all sets
            </MenuItem>
          </Menu>
          <Menu
            id="review-more-menu"
            anchorEl={moreMenuAnchor}
            open={moreMenuOpen}
            onClose={() => setMoreMenuAnchor(null)}>
            <MenuItem
              onClick={() => {
                onRescan()
                setMoreMenuAnchor(null)
              }}>
              Scan again
            </MenuItem>
            <MenuItem
              onClick={() => {
                onExportJson()
                setMoreMenuAnchor(null)
              }}>
              Export audit report
            </MenuItem>
            <MenuItem
              onClick={() => {
                onExportCsv()
                setMoreMenuAnchor(null)
              }}>
              Export spreadsheet
            </MenuItem>
          </Menu>
        </Box>
      )}

      {totalGroupCount > 0 && !compact && (
        <Stack
          direction="row"
          spacing={0.6}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{
            width: "100%",
            "& .MuiButton-root": {
              minHeight: 36,
              px: 1,
              fontWeight: 750,
              whiteSpace: "nowrap"
            }
          }}>
          <ToggleButtonGroup
            value={reviewFilter}
            exclusive
            size="small"
            fullWidth={compact}
            aria-label="Review filter"
            sx={{
              bgcolor: photoSweepColors.surfaceSoft,
              borderRadius: 2,
              p: 0.25,
              "& .MuiToggleButton-root": {
                borderColor: "transparent",
                px: compact ? 1 : 1.25
              }
            }}
            onChange={(_, value) => {
              if (value !== null) onReviewFilterChange(value)
            }}>
            <ToggleButton value="all">
              All sets ({totalGroupCount.toLocaleString()})
            </ToggleButton>
            <ToggleButton value="exact">
              Identical ({exactGroupCount.toLocaleString()})
            </ToggleButton>
            <ToggleButton value="similar">
              Similar ({similarGroupCount.toLocaleString()})
            </ToggleButton>
          </ToggleButtonGroup>
          {!compact && (
            <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />
          )}
          <Button
            size="small"
            startIcon={<RefreshRoundedIcon />}
            onClick={onRescan}>
            Scan again
          </Button>
          <Button
            size="small"
            startIcon={<DownloadRoundedIcon />}
            onClick={onExportJson}>
            Export report
          </Button>
          <Button
            size="small"
            startIcon={<DownloadRoundedIcon />}
            onClick={onExportCsv}>
            Spreadsheet
          </Button>
          {!compact && (
            <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />
          )}
          <Button
            size="small"
            startIcon={<TuneRoundedIcon />}
            onClick={(event) => setKeepMenuAnchor(event.currentTarget)}
            disabled={groupCount === 0}
            aria-controls={keepMenuOpen ? "keep-strategy-menu" : undefined}
            aria-haspopup="menu"
            aria-expanded={keepMenuOpen ? "true" : undefined}>
            Auto Keep
          </Button>
          <Menu
            id="keep-strategy-menu"
            anchorEl={keepMenuAnchor}
            open={keepMenuOpen}
            onClose={() => setKeepMenuAnchor(null)}>
            {(Object.keys(KEEP_STRATEGY_LABELS) as KeepStrategy[]).map(
              (strategy) => (
                <MenuItem
                  key={strategy}
                  onClick={() => {
                    onApplyKeepStrategy(strategy)
                    setKeepMenuAnchor(null)
                  }}>
                  {KEEP_STRATEGY_LABELS[strategy]}
                </MenuItem>
              )
            )}
          </Menu>
          {!compact && (
            <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />
          )}
          <Button
            size="small"
            startIcon={<CheckBoxOutlinedIcon />}
            disabled={groupCount === 0}
            onClick={onSelectAll}>
            Include all
          </Button>
          <Button
            size="small"
            startIcon={<CheckBoxOutlineBlankIcon />}
            disabled={groupCount === 0}
            onClick={onDeselectAll}>
            Skip all
          </Button>
        </Stack>
      )}
    </Paper>
  )
}

interface CleanupBarProps {
  duplicateCount: number
  reviewedGroupCount: number
  totalGroupCount: number
  onTrash: () => void
  compact?: boolean
}

export function CleanupBar({
  duplicateCount,
  reviewedGroupCount,
  totalGroupCount,
  onTrash,
  compact = false
}: CleanupBarProps) {
  const reviewComplete =
    totalGroupCount > 0 && reviewedGroupCount === totalGroupCount
  const hasSelection = reviewComplete && duplicateCount > 0
  const remainingCount = Math.max(0, totalGroupCount - reviewedGroupCount)

  return (
    <Paper
      component="section"
      aria-label="Cleanup summary"
      elevation={0}
      sx={{
        position: "sticky",
        bottom: compact ? 8 : 16,
        zIndex: 10,
        mt: compact ? 1 : 1.5,
        p: compact ? 1 : 1.5,
        border: "1px solid",
        borderColor: hasSelection
          ? photoSweepColors.primaryBorder
          : photoSweepColors.border,
        borderRadius: compact ? 2.25 : 3,
        bgcolor: photoSweepColors.surfaceTint,
        backdropFilter: "saturate(180%) blur(24px)",
        boxShadow: `0 18px 52px ${photoSweepColors.shadow}`,
        display: "grid",
        gridTemplateColumns: compact
          ? "1fr"
          : { xs: "1fr", sm: "minmax(0, 1fr) auto" },
        alignItems: "center",
        gap: 1
      }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" fontWeight={850}>
          {hasSelection
            ? `${duplicateCount.toLocaleString()} item${duplicateCount === 1 ? "" : "s"} ready`
            : reviewComplete
              ? "No duplicates selected"
              : `${remainingCount.toLocaleString()} set${remainingCount === 1 ? "" : "s"} left to review`}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", lineHeight: 1.35 }}>
          Audit report saved before cleanup · Undo is available after supported
          trash actions.
        </Typography>
      </Box>
      <Button
        variant="contained"
        color="error"
        startIcon={<DeleteOutlineRoundedIcon />}
        disabled={!hasSelection}
        onClick={onTrash}
        sx={{
          minHeight: 42,
          minWidth: compact ? 0 : 210,
          width: compact ? "100%" : "auto",
          fontWeight: 850
        }}>
        {hasSelection
          ? `Review & move ${duplicateCount.toLocaleString()} to Trash`
          : reviewComplete
            ? "No duplicates selected"
            : `Review ${remainingCount.toLocaleString()} more to continue`}
      </Button>
    </Paper>
  )
}
