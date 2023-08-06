// import "./HomePage.css";

import { Link } from "react-router-dom";
import { useContext } from "react";
import { AppContext } from "utils/AppContext";
import Button from "@mui/material/Button";
import { Typography } from "@mui/material";

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
      <Typography variant="h5" component="h1">
        Welcome, {name}!
      </Typography>
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
