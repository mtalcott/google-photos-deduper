import "./TaskResults.css";
import { ChangeEvent, useContext } from "react";
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
import CheckCircleOutlineTwoToneIcon from "@mui/icons-material/CheckCircleOutlineTwoTone";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList as List } from "react-window";
import {
  MediaItemType,
  TaskResultsGroupType,
  TaskResultsType,
} from "utils/types";
import { useTaskResultsReducer } from "utils/useTaskResultsReducer";

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

interface TaskResultsProps {
  results: TaskResultsType;
}

export default function TaskResults(props: TaskResultsProps) {
  const [results, dispatch] = useTaskResultsReducer(props.results);
  const groups = Object.values(results.groups);
  const selectedMediaItemIds = Object.values(results.groups).reduce(
    (acc, group) => {
      if (group.isSelected) {
        group.mediaItemIds
          .filter((mediaItemId) => {
            return (
              // Select all mediaItems except the original
              group.originalMediaItemId !== mediaItemId &&
              // Filter out mediaItems that have already been deleted
              !results.mediaItems[mediaItemId].deletedAt
            );
          })
          .forEach((mediaItemId) => acc.add(mediaItemId));
      }

      return acc;
    },
    new Set<string>()
  );

  return (
    <TaskResultsContext.Provider
      value={{
        results,
        dispatch,
        selectedMediaItemIds,
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
                itemCount={groups.length}
                itemSize={276}
              >
                {({ index, style }) => (
                  <ResultRow group={groups[index]} {...{ style }} />
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

interface ResultRowProps {
  group: TaskResultsGroupType;
  style: React.CSSProperties;
}

function ResultRow({ group, style }: ResultRowProps) {
  const { dispatch } = useContext(TaskResultsContext);
  const handleGroupCheckboxChange = (event: ChangeEvent<HTMLInputElement>) => {
    dispatch({
      type: "setGroupSelected",
      groupId: group.id,
      isSelected: event.target.checked,
    });
  };
  const handleSelectedOriginalChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    dispatch({
      type: "setOriginalMediaItemId",
      groupId: group.id,
      mediaItemId: event.target.value,
    });
  };

  return (
    <Stack direction="row" spacing={2} sx={{ py: 2 }} style={style}>
      <Box css={styles.valignMiddle}>
        {group.hasDuplicates ? (
          <Checkbox
            checked={group.isSelected}
            name="groupSelected"
            onChange={handleGroupCheckboxChange}
          />
        ) : (
          <Checkbox disabled sx={{ opacity: 0 }} />
        )}
      </Box>
      {group.mediaItemIds.map((mediaItemId) => (
        <MediaItemCard
          key={mediaItemId}
          {...{
            group,
            mediaItemId,
            handleSelectedOriginalChange,
          }}
        />
      ))}
    </Stack>
  );
}

interface MediaItemCardProps {
  group: TaskResultsGroupType;
  mediaItemId: string;
  handleSelectedOriginalChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

function MediaItemCard({
  group,
  mediaItemId,
  handleSelectedOriginalChange,
}: MediaItemCardProps) {
  const { results } = useContext(TaskResultsContext);
  const mediaItem = results.mediaItems[mediaItemId];
  const isOriginal = mediaItem.id === group.originalMediaItemId;
  const originalMediaItem = results.mediaItems[group.originalMediaItemId];

  return (
    <Card
      sx={{
        width: 240,
        opacity: mediaItem.deletedAt ? 0.6 : 1,
      }}
      key={mediaItem.id}
    >
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
          {mediaItem.deletedAt ? (
            <MediaItemCardField
              field="deletedAt"
              {...{ mediaItem, isOriginal, originalMediaItem }}
            />
          ) : (
            group.isSelected && (
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
            )
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

interface MediaItemCardFieldProps {
  field: "similarity" | "filename" | "dimensions" | "deletedAt";
  mediaItem: MediaItemType;
  isOriginal: boolean;
  originalMediaItem: MediaItemType;
}

function MediaItemCardField({
  field,
  mediaItem,
  isOriginal,
  originalMediaItem,
}: MediaItemCardFieldProps) {
  const { results } = useContext(TaskResultsContext);
  let IconComponent = CompareIcon;
  let color = "text.primary";
  let tooltip = null;
  let text = "";

  if (field === "similarity") {
    if (isOriginal) {
      text = "Original";
    } else {
      const similarity =
        results?.similarityMap[mediaItem.id][originalMediaItem.id];
      const similarityAsPercent = similarity
        ? `${(similarity * 100).toFixed(2)}%`
        : "N/A";
      text = `Similarity: ${similarityAsPercent}`;
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
  } else if (field === "deletedAt") {
    IconComponent = CheckCircleOutlineTwoToneIcon;
    color = "success.main";
    tooltip = new Date(mediaItem.deletedAt!).toLocaleString();
    text = "Deleted";
  }

  return (
    <Box css={styles.valignMiddle} sx={{ color }}>
      <IconComponent css={styles.fieldIcon} />
      <Tooltip title={tooltip} placement="right" arrow>
        <Typography variant="body2">{text}</Typography>
      </Tooltip>
    </Box>
  );
}

function SelectAll() {
  const { results, dispatch } = useContext(TaskResultsContext);

  const selectedGroupsCount = Object.values(results.groups).filter(
    (g) => g.isSelected
  ).length;
  const allGroupsSelected =
    selectedGroupsCount ===
    Object.values(results.groups).filter((g) => g.hasDuplicates).length;
  const noGroupsSelected = selectedGroupsCount === 0;

  const handleCheckboxChange = () => {
    dispatch({
      type: "setAllGroupsSelected",
      isSelected: noGroupsSelected ? true : false,
    });
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
