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
import { TaskResultsType, StartDeletionTaskMessageType } from "utils/types";
import { appApiUrl } from "utils";

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
  const { results, dispatch, selectedMediaItemIds } =
    useContext(TaskResultsContext);
  const [mediaItemIdsPendingDeletion, setMediaItemIdsPendingDeletion] =
    useState(new Set<string>());

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (
        event.data?.app === "GooglePhotosDeduper" &&
        event.data?.action === "healthCheck.result" &&
        event.data?.success
      ) {
        setIsChromeExtensionFound(true);
      }
    };
    window.addEventListener("message", listener);
    return () => {
      window.removeEventListener("message", listener);
    };
  }, []);
  useEffect(() => {
    pingCheckChromeExtension();
  }, []);

  useEffect(() => {
    const listener = async (event: MessageEvent) => {
      if (
        event.data?.app === "GooglePhotosDeduper" &&
        event.data?.action === "deletePhoto.result" &&
        event.data?.success
      ) {
        const { userUrl, deletedAt, mediaItemId } = event.data;
        const response = await fetch(
          appApiUrl(`/api/media_items/${mediaItemId}`),
          {
            method: "post",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ userUrl, deletedAt }),
          }
        );

        if (response.ok) {
          const json = await response.json();
          dispatch({
            type: "setMediaItem",
            mediaItemId: mediaItemId,
            attributes: json.media_item,
          });
        }
      }
    };
    window.addEventListener("message", listener);
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
      selectedMediaItemIds,
      setMediaItemIdsPendingDeletion,
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
              selectedMediaItemIds.size <= 0 ||
              mediaItemIdsPendingDeletion.size > 0
            }
            onClick={handleProcessDuplicates}
          >
            <DeleteIcon sx={{ mr: 1 }} />
            Delete {selectedMediaItemIds.size} duplicate
            {selectedMediaItemIds.size !== 1 && "s"}
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
        {...{
          mediaItemIdsPendingDeletion,
          setMediaItemIdsPendingDeletion,
        }}
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

interface ProcessDuplicatesArgs {
  results: TaskResultsType;
  selectedMediaItemIds: Set<string>;
  setMediaItemIdsPendingDeletion: (mediaItemIds: Set<string>) => void;
}

async function processDuplicates({
  results,
  selectedMediaItemIds,
  setMediaItemIdsPendingDeletion,
}: ProcessDuplicatesArgs) {
  const selectedMediaItems = Array.from(selectedMediaItemIds.values()).map(
    (mediaItemId) => {
      const mediaItem = results.mediaItems[mediaItemId];
      return {
        // We only need the productUrls to open the page with the Chrome
        // extension and the mediaItem.id to uniquely identify the photo
        id: mediaItem.id,
        productUrl: mediaItem.productUrl as unknown as string,
      };
    }
  );

  setMediaItemIdsPendingDeletion(selectedMediaItemIds);

  const message: StartDeletionTaskMessageType = {
    app: "GooglePhotosDeduper",
    action: "startDeletionTask",
    mediaItems: selectedMediaItems,
  };
  window.postMessage(message);
}

interface DuplicatesProcessingDialogProps {
  mediaItemIdsPendingDeletion: Set<string>;
  setMediaItemIdsPendingDeletion: (mediaItemIds: Set<string>) => void;
}

function DuplicatesProcessingDialog({
  mediaItemIdsPendingDeletion,
  setMediaItemIdsPendingDeletion,
}: DuplicatesProcessingDialogProps) {
  const { results } = useContext(TaskResultsContext);
  const numCompleted = Array.from(mediaItemIdsPendingDeletion.values())
    .map((mediaItemId) => results.mediaItems[mediaItemId])
    .filter((mediaItem) => mediaItem.deletedAt).length;
  const numTotal = mediaItemIdsPendingDeletion.size;
  const percent = numTotal > 0 ? (numCompleted / numTotal) * 100 : 0;

  const cancelDuplicatesProcessing = () => {
    // TODO: Cancel the current operation
    setMediaItemIdsPendingDeletion(new Set());
  };

  const dismissModal = () => {
    setMediaItemIdsPendingDeletion(new Set());
  };

  return (
    <Dialog
      open={mediaItemIdsPendingDeletion.size > 0}
      // Intentionally prevent close via backdrop clicks, escape key
      onClose={() => {}}
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
        {numCompleted === numTotal ? (
          <Button onClick={dismissModal}>Dismiss</Button>
        ) : (
          <Button disabled onClick={cancelDuplicatesProcessing}>
            Cancel
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
