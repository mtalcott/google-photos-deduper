import "./ActiveTaskPage.css";
import { appApiUrl } from "utils";
import TaskResults from "components/TaskResults";
import { useFetch } from "utils/useFetch";
import CircularProgress from "@mui/material/CircularProgress";
import { TaskResultsType } from "utils/types";
import { useContext } from "react";
import { AppContext } from "utils/AppContext";

export default function TaskResultsPage() {
  const { data: results, isLoading } = useFetch<TaskResultsType>(
    appApiUrl("/api/active_task/results")
  );
  const { activeTask } = useContext(AppContext);
  return (
    <>
      {isLoading ? (
        <CircularProgress size={"2rem"} sx={{ mt: 2 }} />
      ) : (
        activeTask?.status === "SUCCESS" &&
        results && <TaskResults results={results!} />
      )}
    </>
  );
}
