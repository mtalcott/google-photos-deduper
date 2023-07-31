import "./TaskResults.css";
import { useState, useEffect } from "react";
import { TaskResultsContext } from "utils/TaskResultsContext";
import { useContext } from "react";

export default function TaskResults({ results }) {
  const fields = ["previewWithLink", "similarity", "filename", "dimensions"];
  const [selectedGroups, setSelectedGroups] = useState(() =>
    // Initialize selected groups with an object with every {<id>: true}
    Object.fromEntries(results.groups.map((g) => [g.id, true]))
  );
  const [selectedOriginals, setSelectedOriginals] = useState(() =>
    Object.fromEntries(
      results.groups.map((g) => [
        // Key: group ID
        g.id,
        // Value: selected original media item ID
        g.mediaItems.find((mi) => mi.isOriginal).id,
      ])
    )
  );

  if (!results) {
    return null;
  }

  return (
    <TaskResultsContext.Provider
      value={{
        results,
        selectedGroups,
        setSelectedGroups,
        selectedOriginals,
        setSelectedOriginals,
      }}
    >
      <table className="results">
        <thead>
          <tr>
            <th>Group</th>
            <th>Attribute</th>
            <th>Original</th>
            <th>Duplicates</th>
          </tr>
        </thead>
        <tbody>
          {results.groups.map((group) => (
            <ResultRow
              key={group.id}
              {...{
                fields,
                group,
                selectedGroups,
                setSelectedGroups,
                selectedOriginals,
                setSelectedOriginals,
              }}
            ></ResultRow>
          ))}
        </tbody>
      </table>
      <ChromeExtensionIntegration {...{ selectedGroups, selectedOriginals }} />
    </TaskResultsContext.Provider>
  );
}

function ResultRow({
  fields,
  group,
  selectedGroups,
  setSelectedGroups,
  selectedOriginals,
  setSelectedOriginals,
}) {
  const { results } = useContext(TaskResultsContext);
  const handleGroupCheckboxChange = (event) => {
    setSelectedGroups((prev) => ({
      ...prev,
      [group.id]: event.target.checked,
    }));
  };
  const handleSelectedOriginalChange = (event) => {
    setSelectedOriginals((prev) => ({
      ...prev,
      [group.id]: event.target.value,
    }));
  };

  if (selectedGroups[group.id]) {
    fields.push("selectedOriginal");
  }

  return (
    <>
      {fields.map((field, index) => (
        <tr key={field}>
          {index === 0 && (
            <td
              className="group-name"
              key="group-name"
              rowSpan={fields.length + 1}
            >
              <input
                type="checkbox"
                checked={selectedGroups[group.id]}
                name="groupSelected"
                onChange={handleGroupCheckboxChange}
              />
            </td>
          )}
          <td className="field-name" key="field-name">
            {prettyFieldName(field)}
          </td>
          {group.mediaItems.map((mediaItem) => (
            <td
              key={mediaItem.id}
              className={[
                field,
                mediaItem.isOriginal ? "original" : "duplicate",
              ]}
            >
              {field === "selectedOriginal" ? (
                <input
                  type="radio"
                  checked={selectedOriginals[group.id] === mediaItem.id}
                  onChange={handleSelectedOriginalChange}
                  // name={`selectedOriginal-${group.id}`}
                  value={mediaItem.id}
                />
              ) : field === "similarity" ? (
                <>Test</>
              ) : (
                mediaItemField(field, mediaItem)
              )}
            </td>
          ))}
        </tr>
      ))}
      <tr></tr>
    </>
  );
}

function prettyFieldName(field) {
  return field;
}

function mediaItemField(field, mediaItem) {
  switch (field) {
    case "previewWithLink":
      return (
        <a
          target="_blank"
          rel="noopener noreferrer"
          href={mediaItem["productUrl"]}
        >
          <img src={mediaItem["imageUrl"]} alt={mediaItem["filename"]} />
        </a>
      );
    case "filename":
      return (
        <a
          target="_blank"
          rel="noopener noreferrer"
          href={mediaItem["filenameSearchUrl"]}
        >
          {mediaItem["filename"]}
        </a>
      );
    default:
      return mediaItem[field];
  }
}

function ChromeExtensionIntegration() {
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
