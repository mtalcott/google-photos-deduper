import "./ActiveTaskPage.css";
import { useContext } from "react";
import { useInterval } from "utils/useInterval";
import Button from "@mui/material/Button";
import { AppContext } from "utils/AppContext";
import SnackbarContent from "@mui/material/SnackbarContent";
import { css } from "@emotion/react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import { appApiUrl } from "utils";
import { useNavigate } from "react-router-dom";

export default function ActiveTaskPage() {
  const { activeTask, reloadActiveTask } = useContext(AppContext);
  const isRunning = ["SENT", "PROGRESS"].includes(activeTask?.status);
  const showViewResultsButton = activeTask?.status === "SUCCESS";
  const navigate = useNavigate();

  useInterval(async () => {
    if (!activeTask || isRunning) {
      reloadActiveTask();
    }
  }, 1000);

  const cancelActiveTask = async () => {
    if (activeTask) {
      const response = await fetch(appApiUrl("/api/active_task"), {
        method: "delete",
      });

      if (response.ok) {
        await reloadActiveTask();
        navigate("/task_options");
      }
    }
  };

  const styles = { pre: css({ margin: "0" }) };

  return (
    <>
      {activeTask?.meta?.logMessage && (
        <SnackbarContent
          sx={{ my: 2 }}
          message={<pre css={styles.pre}>{activeTask.meta.logMessage}</pre>}
        />
      )}
      {activeTask?.status === "FAILURE" && (
        <Alert severity="error" sx={{ mt: 1 }}>
          <AlertTitle>Error</AlertTitle>
          {activeTask?.error ||
            "Whoops! An unexpected error occurred. Check application logs."}
        </Alert>
      )}
      <p>
        {showViewResultsButton && (
          <Button to="/active_task/results" variant="contained">
            View Results
          </Button>
        )}
        {isRunning && (
          <Button onClick={cancelActiveTask} variant="outlined">
            Cancel
          </Button>
        )}
      </p>
    </>
  );
}
