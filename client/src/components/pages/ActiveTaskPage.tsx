import "./ActiveTaskPage.css";

import { useContext, useEffect } from "react";
import { useInterval } from "utils/useInterval";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import { AppContext } from "utils/AppContext";

export default function ActiveTaskPage() {
  const { activeTask, reloadActiveTask } = useContext(AppContext);
  const isRunning =
    !activeTask || ["PENDING", "PROGRESS"].includes(activeTask?.status);

  useInterval(async () => {
    if (isRunning) {
      reloadActiveTask();
    }
  }, 1000);

  return (
    <>
      <p>
        <span>Status: {activeTask?.status || ""}</span>{" "}
        {isRunning && <CircularProgress size={"1rem"} />}
      </p>
      {activeTask?.meta?.logMessage && <pre>{activeTask.meta.logMessage}</pre>}
      {activeTask?.status === "SUCCESS" && (
        <Button to="/active_task/results" variant="contained">
          View Results
        </Button>
      )}
    </>
  );
}
