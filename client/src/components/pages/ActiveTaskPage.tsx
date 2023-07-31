import "./ActiveTaskPage.css";

import { useState } from "react";
import { useInterval } from "utils/useInterval";
import { fetchAppJson } from "utils";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";

export default function ActiveTaskPage() {
  const [task, setTask] = useState(null); // TODO: set all the way up in app context.
  const [isRunning, setIsRunning] = useState(true);

  useInterval(async () => {
    if (isRunning) {
      const taskJson = await fetchAppJson("/api/active_task");
      setTask(taskJson);
      setIsRunning(
        !taskJson || ["PENDING", "PROGRESS"].includes(taskJson?.status)
      );
    }
  }, 1000);

  return (
    <>
      <p>
        <span>Status: {task?.status || ""}</span>{" "}
        {isRunning && <CircularProgress size={"1rem"} />}
      </p>
      {task?.meta?.logMessage && <pre>{task.meta.logMessage}</pre>}
      {task?.status === "SUCCESS" && (
        <Button to="/active_task/results">View Results</Button>
      )}
    </>
  );
}
