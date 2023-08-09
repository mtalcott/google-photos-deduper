import { css } from "@emotion/react";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import Grow from "@mui/material/Grow";
import InfoIcon from "@mui/icons-material/Info";
import DeleteIcon from "@mui/icons-material/Delete";
import { useContext, useEffect, useState } from "react";
import { TaskResultsContext } from "utils/TaskResultsContext";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";

const styles = {
  fabContainer: css({
    position: "sticky",
    bottom: 0,
    right: 0,
    padding: "16px",
    paddingRight: 0,
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  }),
};

export default function TaskResultsActionBar() {
  const [isChromeExtensionFound, setIsChromeExtensionFound] = useState(false);
  useEffect(() => {
    let listener = window.addEventListener("message", (event) => {
      if (
        event.data?.app === "GooglePhotosDeduper" &&
        event.data?.action === "healthCheck.result" &&
        event.data?.success
      ) {
        setIsChromeExtensionFound(true);
      }
    });
    return () => {
      window.removeEventListener("message", listener);
    };
  }, []);
  useEffect(() => {
    pingCheckChromeExtension();
  }, []);

  const { results, selectedGroups, selectedOriginals } =
    useContext(TaskResultsContext);
  const selectedCount = Object.values(selectedGroups).filter((v) => v).length;

  const [duplicatesProcessing, setDuplicatesProcessing] = useState({});
  useEffect(() => {
    let listener = window.addEventListener("message", (event) => {
      if (
        event.data?.app === "GooglePhotosDeduper" &&
        event.data?.action === "deletePhoto.result" &&
        event.data?.success
      ) {
        const { userUrl, deletedAt, mediaItemId, originalMessage } = event.data;
      }
    });
    return () => {
      window.removeEventListener("message", listener);
    };
  }, []);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const handleDialogOpen = () => {
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
  };

  const handleProcessDuplicates = () => {
    processDuplicates({
      results,
      selectedGroups,
      selectedOriginals,
      setDuplicatesProcessing,
    });
  };

  return (
    <>
      <Box css={styles.fabContainer}>
        <Grow in>
          <IconButton
            aria-label="info"
            sx={{ mr: 1 }}
            onClick={handleDialogOpen}
          >
            <InfoIcon />
          </IconButton>
        </Grow>
        <Grow in>
          <Fab
            variant="extended"
            color="primary"
            disabled={
              !isChromeExtensionFound ||
              selectedCount <= 0 ||
              duplicatesProcessing.length > 0
            }
            onClick={handleProcessDuplicates}
          >
            <DeleteIcon sx={{ mr: 1 }} />
            {/* TODO: "Delete X duplicates" should count actual dupes, not groups */}
            Delete {selectedCount} duplicate
            {selectedCount !== 1 && "s"}
          </Fab>
        </Grow>
      </Box>
      {isChromeExtensionFound ? (
        <Dialog open={isDialogOpen} onClose={handleDialogClose}>
          <DialogTitle>Deleting duplicates</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Clicking the button will open up a new window and delete the
              selected duplicate photos through the Google Photos web app.
              Deleted photos can be{" "}
              <Link
                target="_blank"
                rel="noopener noreferrer"
                href="https://support.google.com/photos/answer/6128858#restore-items"
              >
                restored
              </Link>{" "}
              for up to 60 days after they are deleted.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleDialogClose}>Okay</Button>
          </DialogActions>
        </Dialog>
      ) : (
        <Dialog open={isDialogOpen} onClose={handleDialogClose}>
          <DialogTitle>Install Chrome Extension</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Install the{" "}
              <Link
                target="_blank"
                rel="noopener noreferrer"
                href="https://github.com/mtalcott/google-photos-deduper/tree/main/chrome_extension/README.md"
              >
                Chrome Extension
              </Link>{" "}
              to delete duplicates.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleDialogClose}>Okay</Button>
          </DialogActions>
        </Dialog>
      )}
      <DuplicatesProcessingDialog
        {...{ duplicatesProcessing, setDuplicatesProcessing }}
      />
    </>
  );
}

async function pingCheckChromeExtension() {
  window.postMessage({
    app: "GooglePhotosDeduper",
    action: "healthCheck",
  });
}

async function processDuplicates({
  results,
  selectedGroups,
  selectedOriginals,
  setDuplicatesProcessing,
}) {
  const selectedDuplicates = results.groups
    .reduce((acc, group) => {
      if (selectedGroups[group.id]) {
        const groupDuplicates = group.mediaItems.filter((mediaItem) => {
          // Select all duplicates except the selected original
          return selectedOriginals[group.id] !== mediaItem.id;
        });

        acc.push(...groupDuplicates);
      }
      return acc;
    }, [])
    .map((mediaItem) => {
      return {
        // We only need the productUrls to open the page with the Chrome
        // extension and the mediaItem.id to uniquely identify the photo
        id: mediaItem.id,
        productUrl: mediaItem.productUrl,
      };
    });

  setDuplicatesProcessing(selectedDuplicates);

  console.debug("processDuplicates", selectedDuplicates);
  window.postMessage({
    app: "GooglePhotosDeduper",
    action: "startDeletionTask",
    duplicateMediaItems: selectedDuplicates,
  });
}

function DuplicatesProcessingDialog({
  duplicatesProcessing,
  setDuplicatesProcessing,
}) {
  const isProcessing = duplicatesProcessing.length > 0;
  const numCompleted = Object.entries(duplicatesProcessing).filter(
    (id, d) => d.deletedAt
  ).length;
  const numTotal = duplicatesProcessing.length;
  const percent = numTotal > 0 ? (numCompleted / numTotal) * 100 : 0;

  const cancelDuplicatesProcessing = () => {
    // TODO: Cancel the current operation
    // setDuplicatesProcessing([]);
  };

  // TODO: clear on done

  return (
    <Dialog
      open={isProcessing}
      onClose={cancelDuplicatesProcessing}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Deleting duplicates...</DialogTitle>
      <DialogContent>
        <LinearProgress
          variant={numCompleted > 0 ? "determinate" : "indeterminate"}
          value={percent}
          sx={{ mb: 2 }}
        />
        <DialogContentText>
          Deleted {numCompleted} of {numTotal} duplicates.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={cancelDuplicatesProcessing}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
