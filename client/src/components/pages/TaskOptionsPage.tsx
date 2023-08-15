// import "./TaskOptionsPage.css";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import Input from "@mui/material/Input";
import InputAdornment from "@mui/material/InputAdornment";
import { useContext, useState } from "react";
import { useNavigate } from "react-router";
import { appApiUrl } from "utils";
import { AppContext } from "utils/AppContext";
import { useForm, Controller, SubmitHandler } from "react-hook-form";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import InfoIcon from "@mui/icons-material/Info";

interface FormData {
  refresh_media_items: boolean;
  resolution: string;
  similarity_threshold: string;
}

export default function TaskOptionsPage() {
  const navigate = useNavigate();
  const { activeTask, reloadActiveTask } = useContext(AppContext);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    mode: "onChange",
    defaultValues: {
      refresh_media_items: true,
      resolution: "250",
      similarity_threshold: "99.00",
    },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit: SubmitHandler<FormData> = async (
    data: FormData
  ): Promise<void> => {
    setIsSubmitting(true);

    const response = await fetch(appApiUrl("/api/task"), {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...data,
        resolution: parseInt(data.resolution),
        similarity_threshold: parseFloat(data.similarity_threshold) / 100.0,
      }),
    });

    if (response.ok) {
      setIsSubmitting(false);
      reloadActiveTask();
      navigate("/active_task");
    }
  };

  return (
    <form noValidate autoComplete="off" onSubmit={handleSubmit(onSubmit)}>
      <Stack direction="column" spacing={3} sx={{ mt: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <FormControlLabel
            label="Refresh media items"
            sx={{ mr: 0 }}
            control={
              <Controller
                name="refresh_media_items"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    onChange={(e) => field.onChange(e.target.checked)}
                    checked={field.value}
                  />
                )}
              />
            }
          />
          <Tooltip
            title="Refresh media items from the Google Photos API. This will
            happen automatically if no media items are present."
            placement="right"
            arrow
          >
            <InfoIcon sx={{ color: "text.secondary" }} />
          </Tooltip>
        </Stack>
        {watch("refresh_media_items") && (
          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <label htmlFor="resolution">Resolution</label>
              <Tooltip
                title="Resolution (width & height) to use when comparing images.
              Higher resolution is more accurate but uses more memory and
              takes longer."
                placement="right"
                arrow
              >
                <InfoIcon sx={{ color: "text.secondary" }} />
              </Tooltip>
            </Stack>
            <FormControl error={!!errors.resolution} variant="standard">
              <Controller
                name="resolution"
                control={control}
                rules={{
                  validate: (v) =>
                    parseInt(v) >= 100 || "Please enter a number >= 100",
                }}
                render={({ field }) => (
                  <Input
                    id="resolution"
                    sx={{ width: 70 }}
                    endAdornment={
                      <InputAdornment position="end">px</InputAdornment>
                    }
                    {...field}
                  />
                )}
              />
              <FormHelperText>
                {errors.resolution
                  ? errors.resolution.message
                  : "Default: 250px"}
              </FormHelperText>
            </FormControl>
          </Box>
        )}
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <label htmlFor="similarity_threshold">Similarity threshold</label>
            <Tooltip
              title="Percentage of similarity between images to be considered
              duplicates."
              placement="right"
              arrow
            >
              <InfoIcon sx={{ color: "text.secondary" }} />
            </Tooltip>
          </Stack>
          <FormControl error={!!errors.similarity_threshold} variant="standard">
            <Controller
              name="similarity_threshold"
              control={control}
              rules={{
                validate: (v) => {
                  const f = parseFloat(v);
                  return (
                    (f >= 90.0 && f < 100.0) ||
                    "Please enter a number >= 90 and < 100"
                  );
                },
              }}
              render={({ field }) => (
                <Input
                  id="similarity_threshold"
                  sx={{ width: 70 }}
                  endAdornment={
                    <InputAdornment position="end">%</InputAdornment>
                  }
                  {...field}
                />
              )}
            />
            <FormHelperText>
              {errors.similarity_threshold
                ? errors.similarity_threshold.message
                : "Default: 99.00%"}
            </FormHelperText>
          </FormControl>
        </Box>
        <Box>
          <FormControl>
            <Button type="submit" variant="contained" disabled={isSubmitting}>
              {activeTask ? "Restart" : "Start"}
            </Button>
          </FormControl>
        </Box>
      </Stack>
    </form>
  );
}
