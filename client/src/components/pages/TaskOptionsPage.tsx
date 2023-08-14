// import "./TaskOptionsPage.css";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormHelperText from "@mui/material/FormHelperText";
import Input from "@mui/material/Input";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import { useContext, useState } from "react";
import { useNavigate } from "react-router";
import { appApiUrl } from "utils";
import { AppContext } from "utils/AppContext";
import { useForm, Controller, SubmitHandler } from "react-hook-form";

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
    formState: { errors },
  } = useForm<FormData>({
    mode: "onChange",
    defaultValues: {
      refresh_media_items: true,
      resolution: "250",
      similarity_threshold: "99",
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
      <FormGroup sx={{ mt: 1 }}>
        <FormControlLabel
          label="Refresh media items"
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
      </FormGroup>
      <Box sx={{ mt: 1 }}>
        <FormControl error={!!errors.resolution} variant="standard">
          <InputLabel htmlFor="resolution">Resolution</InputLabel>
          <Controller
            name="resolution"
            control={control}
            rules={{
              validate: (v) => {
                const invalidMessage = "Please enter a number >= 100";
                try {
                  return parseInt(v) >= 100 || invalidMessage;
                } catch (e) {
                  return invalidMessage;
                }
              },
            }}
            render={({ field }) => (
              <Input
                id="resolution"
                endAdornment={
                  <InputAdornment position="end">px</InputAdornment>
                }
                {...field}
              />
            )}
          />
          <FormHelperText>
            {errors.resolution ? errors.resolution.message : "Default: 250px"}
          </FormHelperText>
        </FormControl>
      </Box>
      <Box sx={{ mt: 1 }}>
        <FormControl error={!!errors.similarity_threshold} variant="standard">
          <InputLabel htmlFor="similarity_threshold">
            Similarity threshold
          </InputLabel>
          <Controller
            name="similarity_threshold"
            control={control}
            rules={{
              validate: (v) => {
                const invalidMessage = "Please enter a number >= 90 and < 100";
                try {
                  const f = parseFloat(v);
                  return (f >= 90.0 && f < 100.0) || invalidMessage;
                } catch (e) {
                  return invalidMessage;
                }
              },
            }}
            render={({ field }) => (
              <Input
                id="similarity_threshold"
                endAdornment={<InputAdornment position="end">%</InputAdornment>}
                {...field}
              />
            )}
          />
          <FormHelperText>
            {errors.similarity_threshold
              ? errors.similarity_threshold.message
              : "Default: 99%"}
          </FormHelperText>
        </FormControl>
      </Box>
      <Box>
        <FormControl>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
            sx={{ mt: 2 }}
          >
            {activeTask ? "Restart" : "Start"}
          </Button>
        </FormControl>
      </Box>
    </form>
  );
}
