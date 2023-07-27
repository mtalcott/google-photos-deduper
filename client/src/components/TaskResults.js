import "./TaskResults.css";
import { useState, useEffect } from "react";

export default function TaskResults({ results }) {
    const fields = ["preview_with_link", "filename", "dimensions"];
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
                g.media_items.find((mi) => mi.type === "original").id,
            ])
        )
    );

    console.debug("selectedGroups", selectedGroups);
    console.debug("selectedOriginals", selectedOriginals);

    if (!results) {
        return null;
    }

    return (
        <>
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
            <ChromeExtensionIntegration {...{ selectedGroups }} />
        </>
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
    const handleGroupCheckboxChange = (event) => {
        setSelectedGroups((prev) => ({
            ...prev,
            [group.id]: event.target.checked,
        }));
    };
    const handleSelectedOriginalChange = (event) => {
        console.debug("selectedOriginal change", event, event.target.checked);
        setSelectedOriginals((prev) => ({
            ...prev,
            [group.id]: event.target.value,
        }));
    };

    return (
        <>
            {[...fields, "selectedOriginal"].map((field, index) => (
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
                    {group.media_items.map((mediaItem) => (
                        <td
                            key={mediaItem.id}
                            className={[field, mediaItem["type"]]}
                        >
                            {field === "selectedOriginal" ? (
                                <input
                                    type="radio"
                                    checked={
                                        selectedOriginals[group.id] ===
                                        mediaItem.id
                                    }
                                    onChange={handleSelectedOriginalChange}
                                    // name={`selectedOriginal-${group.id}`}
                                    value={mediaItem.id}
                                />
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
        case "preview_with_link":
            return (
                <a
                    target="_blank"
                    rel="noopener noreferrer"
                    href={mediaItem["productUrl"]}
                >
                    <img
                        src={mediaItem["imageUrl"]}
                        alt={mediaItem["filename"]}
                    />
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

function ChromeExtensionIntegration({ selectedGroups }) {
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
        (async () => {
            pingCheckChromeExtension();
        })();
    }, []);
    const selectedCount = Object.values(selectedGroups).filter((v) => v).length;

    if (isChromeExtensionFound) {
        return (
            <>
                <p>
                    <i>
                        Click "Delete duplicates" to delete the selected
                        duplicates. This will open up a new tab and delete the
                        selected duplicate photos through the Google Photos web
                        app. Deleted photos can be{" "}
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
                        onClick={processDuplicates}
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

async function processDuplicates(event) {
    console.debug("processDuplicates", event);
    // window.postMessage({
    //     app: "GooglePhotosDeduper",
    //     action: "startDeletionTask",
    //     duplicateMediaItems: [
    //         {
    //             productUrl:
    //                 "https://photos.google.com/lr/photo/AE-vYs5HuL4Zq0oJTIcklVdIGa9ylN7wcW0p86fHMQSxlS8wOtkmvFM5bLiV8idUx5zcsM-ftX45Oiojo3Pms0sabovI3X6Exg",
    //         },
    //     ],
    // });
}
