import { useContext, useEffect, useState } from "react";
import { TaskResultsContext } from "utils/TaskResultsContext";

export default function ChromeExtensionIntegration() {
  const [isChromeExtensionFound, setIsChromeExtensionFound] = useState(false);
  useEffect(() => {
    let listener = window.addEventListener("message", (event) => {
      if (
        event.data?.app === "GooglePhotosDeduper" &&
        event.data?.action === "response" &&
        event.data?.originalMessage?.action === "healthCheck" &&
        event.data?.response?.success
      ) {
        setIsChromeExtensionFound(true);
      }
    });
    return () => {
      window.removeEventListener("message", listener);
    };
  }, []);
  useEffect(() => {
    // (async () => {
    pingCheckChromeExtension();
    // })();
  }, []);

  const { results, selectedGroups, selectedOriginals } =
    useContext(TaskResultsContext);
  const selectedCount = Object.values(selectedGroups).filter((v) => v).length;

  const [isProcessing, setIsProcessing] = useState(false);

  if (isChromeExtensionFound) {
    return (
      <>
        <p>
          <i>
            Click "Delete duplicates" to delete the selected duplicates. This
            will open up a new tab and delete the selected duplicate photos
            through the Google Photos web app. Deleted photos can be{" "}
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://support.google.com/photos/answer/6128858#restore-items"
            >
              restored
            </a>{" "}
            for up to 60 days after they are deleted.
          </i>
        </p>
        <p>
          <button
            className="processDuplicates"
            onClick={() =>
              processDuplicates({
                results,
                selectedGroups,
                selectedOriginals,
                setIsProcessing,
              })
            }
          >
            Delete {selectedCount} duplicate
            {selectedCount !== 1 && "s"}
          </button>
        </p>
      </>
    );
  } else {
    return (
      <>
        <p>
          <i>
            Install the{" "}
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://github.com/mtalcott/google-photos-deduper/tree/main/chrome_extension/README.md"
            >
              Chrome Extension
            </a>{" "}
            to delete duplicates.
          </i>
        </p>
      </>
    );
  }
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
  setIsProcessing,
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
        // We only need the productUrls to open the page with the Chrome extension
        productUrl: mediaItem.productUrl,
      };
    });

  console.debug("processDuplicates", selectedDuplicates);
  window.postMessage({
    app: "GooglePhotosDeduper",
    action: "startDeletionTask",
    duplicateMediaItems: selectedDuplicates,
  });
}
