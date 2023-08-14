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
    defaultValues: { refresh_media_items: true, resolution: "250" },
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
      body: JSON.stringify({ ...data, resolution: parseInt(data.resolution) }),
    });

    if (response.ok) {
      setIsSubmitting(false);
      reloadActiveTask();
      navigate("/active_task");
    }
  };
  return (
    <form noValidate autoComplete="off" onSubmit={handleSubmit(onSubmit)}>
      <FormGroup>
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
      <Box>
        <FormControl error={!!errors.resolution} variant="standard">
          <InputLabel htmlFor="resolution">Resolution</InputLabel>
          <Controller
            name="resolution"
            control={control}
            rules={{ required: true, pattern: /^[0-9]+$/, min: 100 }}
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
          {errors.resolution && (
            <FormHelperText>{"Please enter a number >= 100"}</FormHelperText>
          )}
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
