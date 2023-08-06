import "./TaskResults.css";
import { useState, useContext } from "react";
import { TaskResultsContext } from "utils/TaskResultsContext";
import TaskResultsActionBar from "components/TaskResultsActionBar";
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
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList as List } from "react-window";

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
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
        <SelectAll />
        <Box sx={{ flexGrow: 1 }}>
          <AutoSizer>
            {({ height, width }) => (
              <List
                className="react-window-list"
                height={height}
                width={width}
                itemCount={results.groups.length}
                itemSize={276}
              >
                {({ index, style }) => (
                  <ResultRow group={results.groups[index]} {...{ style }} />
                )}
              </List>
            )}
          </AutoSizer>
        </Box>
        <TaskResultsActionBar />
      </Box>
    </TaskResultsContext.Provider>
  );
}

function ResultRow({ group, style }) {
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
    <Stack direction="row" spacing={2} sx={{ py: 2 }} style={style}>
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
        <Stack spacing={1}>
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
            <Typography variant="body2">
              <FormControlLabel
                value={mediaItem.id}
                control={<Radio size="small" disableRipple sx={{ py: 0 }} />}
                label="Original"
                checked={isOriginal}
                onChange={handleSelectedOriginalChange}
                disableTypography={true}
              />
            </Typography>
          )}
        </Stack>
      </CardContent>
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
    <Box css={styles.valignMiddle}>
      <IconComponent css={styles.fieldIcon} />
      <Tooltip title={tooltip} placement="right" arrow>
        <Typography variant="body2">{text}</Typography>
      </Tooltip>
    </Box>
  );
}

function SelectAll() {
  const { results, selectedGroups, setSelectedGroups } =
    useContext(TaskResultsContext);

  const selectedGroupsCount =
    Object.values(selectedGroups).filter(Boolean).length;
  const allGroupsSelected = selectedGroupsCount === results.groups.length;
  const noGroupsSelected = selectedGroupsCount === 0;

  const handleCheckboxChange = (event) => {
    const val = noGroupsSelected ? true : false;
    const groups = Object.fromEntries(results.groups.map((g) => [g.id, val]));
    setSelectedGroups(groups);
  };

  return (
    <Box sx={{ pt: 1 }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={allGroupsSelected}
            indeterminate={!allGroupsSelected && !noGroupsSelected}
            onChange={handleCheckboxChange}
            name="selectAll"
          />
        }
        sx={{ ml: 0 }}
        label="Select all"
      />
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
