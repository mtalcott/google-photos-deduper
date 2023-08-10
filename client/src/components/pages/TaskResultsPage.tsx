import "./ActiveTaskPage.css";
import { appApiUrl } from "utils";
import TaskResults from "components/TaskResults";
import { useFetch } from "utils/useFetch";
import CircularProgress from "@mui/material/CircularProgress";
import { TaskResultsType } from "utils/types";

export default function TaskResultsPage() {
  const { data: results, isLoading } = useFetch<TaskResultsType>(
    appApiUrl("/api/active_task/results")
  );
  return (
    <>
      {isLoading && <CircularProgress size={"2rem"} sx={{ mt: 2 }} />}
      {results && <TaskResults results={results!} />}
    </>
  );
}
