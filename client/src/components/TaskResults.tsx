import "./TaskResults.css";
import { useState } from "react";
import { TaskResultsContext } from "utils/TaskResultsContext";
import { useContext } from "react";
import ChromeExtensionIntegration from "./ChromeExtensionIntegration";

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
