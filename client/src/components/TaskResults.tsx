import "./TaskResults.css";
import { useState, useContext } from "react";
import { TaskResultsContext } from "utils/TaskResultsContext";
import ChromeExtensionIntegration from "./ChromeExtensionIntegration";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardMedia from "@mui/material/CardMedia";
import Typography from "@mui/material/Typography";
import CardActionArea from "@mui/material/CardActionArea";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import { css } from "@emotion/react";
import { truncateString } from "utils";
import AspectRatioIcon from "@mui/icons-material/AspectRatio";
import CompareIcon from "@mui/icons-material/Compare";
import RenameIcon from "@mui/icons-material/DriveFileRenameOutline";
import CardActions from "@mui/material/CardActions";
import Button from "@mui/material/Button";

const styles = {
  valignMiddle: css({
    display: "flex",
    alignItems: "center",
  }),
  fieldIcon: css({
    fontSize: "1rem",
    marginRight: "11px",
  }),
};

export default function TaskResults({ results }) {
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
      <Box sx={{ flexGrow: 1 }}>
        {results.groups.map((group) => (
          <ResultRow
            key={group.id}
            {...{
              group,
            }}
          ></ResultRow>
        ))}
      </Box>
      <ChromeExtensionIntegration />
    </TaskResultsContext.Provider>
  );
}

function ResultRow({ group }) {
  const { selectedGroups, setSelectedGroups, setSelectedOriginals } =
    useContext(TaskResultsContext);
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

  return (
    <>
      <Stack direction="row" spacing={2} sx={{ py: 2 }}>
        <Box css={styles.valignMiddle}>
          <Checkbox
            checked={selectedGroups[group.id]}
            name="groupSelected"
            onChange={handleGroupCheckboxChange}
          />
        </Box>
        {group.mediaItems.map((mediaItem) => (
          <MediaItemCard
            key={mediaItem.id}
            showOriginalSelector={!!selectedGroups[group.id]}
            {...{
              group,
              mediaItem,
              handleSelectedOriginalChange,
            }}
          />
        ))}
      </Stack>
    </>
  );
}

function MediaItemCard({
  group,
  mediaItem,
  showOriginalSelector,
  handleSelectedOriginalChange,
}) {
  const { selectedOriginals } = useContext(TaskResultsContext);
  const originalMediaItem = group.mediaItems.find(
    (m) => selectedOriginals[group.id] === m.id
  );
  const isOriginal = mediaItem.id === originalMediaItem.id;

  return (
    <Card sx={{ width: 240 }} key={mediaItem.id}>
      <CardActionArea
        href={mediaItem.productUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <CardMedia
          component="img"
          height="100"
          image={mediaItem.imageUrl}
          alt={mediaItem.filename}
        />
      </CardActionArea>
      <CardContent sx={{ pb: 0 }}>
        <MediaItemCardField
          field="similarity"
          {...{ mediaItem, isOriginal, originalMediaItem }}
        />
        <MediaItemCardField
          field="filename"
          {...{ mediaItem, isOriginal, originalMediaItem }}
        />
        <MediaItemCardField
          field="dimensions"
          {...{ mediaItem, isOriginal, originalMediaItem }}
        />
        {showOriginalSelector && (
          <Typography variant="body2" gutterBottom>
            <FormControlLabel
              value={mediaItem.id}
              control={<Radio size="small" />}
              label="Original"
              checked={isOriginal}
              onChange={handleSelectedOriginalChange}
              disableTypography={true}
            />
          </Typography>
        )}
      </CardContent>
      {!isOriginal && (
        <CardActions>
          <Button size="small" color="primary">
            Delete
          </Button>
        </CardActions>
      )}
    </Card>
  );
}

function MediaItemCardField({
  field,
  mediaItem,
  isOriginal,
  originalMediaItem,
}) {
  const { results } = useContext(TaskResultsContext);
  let IconComponent = CompareIcon;
  let tooltip = null;
  let text = "";

  if (field === "similarity") {
    if (isOriginal) {
      text = "Original";
    } else {
      const similarity =
        results?.similarityMap[mediaItem.id][originalMediaItem.id];
      const similarityAsPercent = (similarity * 100).toFixed(4);
      text = `Similarity: ${similarityAsPercent}%`;
    }
  } else if (field === "filename") {
    IconComponent = RenameIcon;
    tooltip = mediaItem.filename;
    if (isOriginal || mediaItem.filename !== originalMediaItem.filename) {
      text = truncateString(mediaItem.filename, 24);
    } else {
      text = "Same filename";
    }
  } else if (field === "dimensions") {
    IconComponent = AspectRatioIcon;
    tooltip = mediaItem.dimensions;
    if (isOriginal || mediaItem.dimensions !== originalMediaItem.dimensions) {
      text = mediaItem.dimensions;
    } else {
      text = "Same dimensions";
    }
  }

  return (
    <Box css={styles.valignMiddle} sx={{ mb: 1 }}>
      <IconComponent css={styles.fieldIcon} />
      <Tooltip title={tooltip} placement="right" arrow>
        <Typography variant="body2">{text}</Typography>
      </Tooltip>
    </Box>
  );
}

// function mediaItemField(field, mediaItem) {
//   switch (field) {
//     case "filename":
//       return (
//         <a
//           target="_blank"
//           rel="noopener noreferrer"
//           href={mediaItem["filenameSearchUrl"]}
//         >
//           {mediaItem["filename"]}
//         </a>
//       );
//     default:
//       return mediaItem[field];
//   }
// }
