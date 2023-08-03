import "./ActiveTaskPage.css";
import { useContext } from "react";
import { useInterval } from "utils/useInterval";
import Button from "@mui/material/Button";
import { AppContext } from "utils/AppContext";
import SnackbarContent from "@mui/material/SnackbarContent";
import { css } from "@emotion/react";

export default function ActiveTaskPage() {
  const { activeTask, reloadActiveTask } = useContext(AppContext);
  const isRunning =
    !activeTask || ["PENDING", "PROGRESS"].includes(activeTask?.status);

  useInterval(async () => {
    if (isRunning) {
      reloadActiveTask();
    }
  }, 1000);

  const styles = { pre: css({ margin: "0" }) };

  return (
    <>
      {activeTask?.meta?.logMessage && (
        <SnackbarContent
          sx={{
            my: 2,
          }}
          message={<pre css={styles.pre}>{activeTask.meta.logMessage}</pre>}
        />
      )}
      {activeTask?.status === "SUCCESS" && (
        <Button to="/active_task/results" variant="contained">
          View Results
        </Button>
      )}
    </>
  );
}
