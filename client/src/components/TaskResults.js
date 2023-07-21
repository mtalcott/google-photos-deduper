import "./TaskResults.css";

export default function TaskResults({ results }) {
    if (!results) {
        return null;
    }

    const fields = ["preview_with_link", "filename", "width", "height"];

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
                    {results.groups.map((group, index) => (
                        <ResultRow
                            key={index}
                            {...{ fields, group }}
                        ></ResultRow>
                    ))}
                </tbody>
            </table>

            <p>
                <i>
                    Click "Delete duplicates" to delete the selected duplicates.
                    Assuming you have the Chrome extension installed, this will
                    open up a new tab and delete the selected duplicate photos
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
                    onClick={processDuplicates}
                >
                    Delete duplicates
                </button>
            </p>
        </>
    );
}

function ResultRow({ fields, group }) {
    return fields.map((field, index) => (
        <tr key={field}>
            {index === 0 && (
                <td
                    className="group-name"
                    key="group-name"
                    rowSpan={fields.length}
                ></td>
            )}
            <td className="field-name" key="field-name">
                {prettyFieldName(field)}
            </td>
            {group.map((mediaItem) => (
                <td key={mediaItem.id} className={[field, mediaItem["type"]]}>
                    {mediaItemField(field, mediaItem)}
                </td>
            ))}
        </tr>
    ));
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
                    <img src={`${mediaItem["baseUrl"]}=w100-h100`} />
                </a>
            );
        case "width":
        case "height":
            return mediaItem["mediaMetadata"][field];
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

function processDuplicates(event) {
    console.log("processDuplicates", event);
    window.postMessage({
        action: "startDeletionTask",
        duplicateMediaItems: [
            {
                productUrl:
                    "https://photos.google.com/lr/photo/AE-vYs5HuL4Zq0oJTIcklVdIGa9ylN7wcW0p86fHMQSxlS8wOtkmvFM5bLiV8idUx5zcsM-ftX45Oiojo3Pms0sabovI3X6Exg",
            },
        ],
    });
}
