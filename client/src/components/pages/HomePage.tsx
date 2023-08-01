// import "./HomePage.css";

import { Link } from "react-router-dom";
import { useContext } from "react";
import { AppContext } from "utils/AppContext";
import Button from "@mui/material/Button";

export default function HomePage() {
  const { user, isLoggedIn, activeTask } = useContext(AppContext);

  if (isLoggedIn) {
    return <AuthedHome name={user.given_name} hasActiveTask={!!activeTask} />;
  }
  return <UnauthedHome />;
}

function UnauthedHome() {
  return (
    <p>
      <Button variant="contained" size="large" reloadDocument to="/auth/google">
        Get Started
      </Button>
    </p>
  );
}

function AuthedHome({ name, hasActiveTask }) {
  return (
    <>
      <p>Welcome, {name}</p>
      <p>
        {hasActiveTask ? (
          <Button variant="contained" size="large" to="/active_task">
            Resume
          </Button>
        ) : (
          <Button variant="contained" size="large" to="/task_options">
            Get Started
          </Button>
        )}
      </p>
    </>
  );
}
