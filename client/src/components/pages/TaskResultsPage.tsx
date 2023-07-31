import "./ActiveTaskPage.css";
import { appApiUrl } from "utils";
import { Link } from "react-router-dom";
import TaskResults from "components/TaskResults";
import { useFetch } from "utils/useFetch";
import CircularProgress from "@mui/material/CircularProgress";

export default function TaskResultsPage() {
  const { data, isLoading } = useFetch(appApiUrl("/api/active_task/results"));
  return (
    <>
      <p>{isLoading && <CircularProgress size={"1rem"} />}</p>
      <Link to="/task_options">Start over</Link>
      {data?.results && <TaskResults results={data.results} />}
    </>
  );
}
