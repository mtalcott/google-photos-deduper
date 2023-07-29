// import "./HomePage.css";

import { Link } from "react-router-dom";
import { useContext } from "react";
import { AppContext } from "utils/AppContext";

export default function HomePage() {
  const { user, isLoggedIn, hasActiveTask } = useContext(AppContext);

  if (isLoggedIn) {
    return <AuthedHome name={user.given_name} hasActiveTask={hasActiveTask} />;
  }
  return <UnauthedHome />;
}

function UnauthedHome() {
  return (
    <>
      <Link reloadDocument to="/auth/google">
        Get started
      </Link>
    </>
  );
}

function AuthedHome({ name, hasActiveTask }) {
  return (
    <>
      <p>Welcome, {name}!</p>
      <h1 className="text-3xl font-bold underline">Hello world!</h1>
      <p>
        {hasActiveTask ? (
          <Link to="/active_task">Active task</Link>
        ) : (
          <Link to="/task_options">Start new task</Link>
        )}
      </p>
    </>
  );
}
